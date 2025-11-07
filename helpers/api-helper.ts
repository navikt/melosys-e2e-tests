import { APIRequestContext } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'node:path';

// Load .local.env file
dotenv.config({ path: path.resolve(__dirname, '../.local.env') });

/**
 * Helper for managing melosys-api application state
 *
 * When we clean the database, the Spring Boot application's JPA/Hibernate
 * caches may still have references to deleted entities. This can cause
 * errors like "ORA-02291: parent key not found".
 *
 * Solutions:
 * 1. Clear JPA caches via API endpoint (if available)
 * 2. Restart the API container
 * 3. Use TRUNCATE instead of DELETE (already implemented)
 */

/**
 * Admin API Helper
 *
 * Provides authenticated access to melosys-api admin endpoints.
 * Requires both admin API key and JWT token for authentication.
 */
export class AdminApiHelper {
  private readonly apiKey: string;
  private readonly authToken: string;
  private readonly baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8080') {
    this.baseUrl = baseUrl;
    this.apiKey = process.env.ADMIN_API_KEY || 'dummy';
    this.authToken = process.env.LOCAL_AUTH_TOKEN || '';

    if (!this.authToken) {
      throw new Error('LOCAL_AUTH_TOKEN not found in environment');
    }
  }

  /**
   * Call an admin API endpoint with proper authentication headers
   */
  private async callAdminEndpoint(
    request: APIRequestContext,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    params?: Record<string, string | boolean>,
    body?: any
  ) {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    // Add query parameters if provided
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.append(key, String(value));
      }
    }

    const options: any = {
      headers: {
        'X-MELOSYS-ADMIN-APIKEY': this.apiKey,
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      }
    };

    // Add body for POST/PUT requests
    if (body && (method === 'POST' || method === 'PUT')) {
      options.data = body;
    }

    // Make the request based on method
    switch (method) {
      case 'GET':
        return await request.get(url.toString(), options);
      case 'POST':
        return await request.post(url.toString(), options);
      case 'PUT':
        return await request.put(url.toString(), options);
      case 'DELETE':
        return await request.delete(url.toString(), options);
    }
  }

  /**
   * Find ikke-skattepliktige saker (non-taxable cases) for annual settlement
   *
   * @param request - Playwright API request context
   * @param fomDato - Start date (YYYY-MM-DD)
   * @param tomDato - End date (YYYY-MM-DD)
   * @param lagProsessinstanser - Whether to create process instances (default: false)
   * @returns API response with job details
   */
  async finnIkkeSkattepliktigeSaker(
    request: APIRequestContext,
    fomDato: string,
    tomDato: string,
    lagProsessinstanser: boolean = false
  ) {
    return await this.callAdminEndpoint(
      request,
      'POST',
      '/admin/aarsavregninger/saker/ikke-skattepliktige/finn',
      {
        lagProsessinstanser: lagProsessinstanser,
        fomDato: fomDato,
        tomDato: tomDato
      }
    );
  }

  /**
   * Add more admin API methods here following this pattern:
   *
   * @example
   * async someOtherAdminEndpoint(request: APIRequestContext, param1: string) {
   *   return await this.callAdminEndpoint(
   *     request,
   *     'GET',  // or 'POST', 'PUT', 'DELETE'
   *     '/admin/some/endpoint',
   *     { param1 }  // query parameters
   *   );
   * }
   */
}

/**
 * Wait for all process instances to complete
 *
 * This calls the melosys-api test endpoint that monitors async process instances.
 * It ensures all background processes complete before we clean up the database.
 *
 * Returns:
 * - COMPLETED: All processes finished successfully
 * - FAILED: Some processes failed (details included)
 * - TIMEOUT: Processes didn't complete in time
 * - ERROR: Unexpected error occurred
 */
export async function waitForProcessInstances(request: APIRequestContext, timeoutSeconds: number = 30): Promise<void> {
  try {
    const response = await request.get('http://localhost:8080/internal/e2e/process-instances/await', {
      failOnStatusCode: false,
      timeout: (timeoutSeconds + 5) * 1000 // Add 5s buffer
    });

    const result = await response.json();

    if (result.status === 'COMPLETED') {
      if (result.totalInstances > 0) {
        console.log(`   ✅ Process instances: ${result.totalInstances} completed in ${result.elapsedSeconds}s`);
      }
      return;
    }

    if (result.status === 'FAILED') {
      console.log(`   ❌ Process instances: ${result.failedInstances?.length || 0} FAILED`);
      if (result.failedInstances) {
        for (const failure of result.failedInstances) {
          console.log(`      - ${failure.type}: ${failure.error?.melding || 'No error message'}`);
        }
      }
      throw new Error(`Process instances failed: ${result.message}`);
    }

    if (result.status === 'TIMEOUT') {
      console.log(`   ⚠️  Process instances: TIMEOUT after ${timeoutSeconds}s`);
      console.log(`      Not finished: ${result.notFinished}/${result.totalInstances}`);
      console.log(`      Active threads: ${result.activeThreads}, Queue: ${result.queueSize}`);
      throw new Error(`Process instances timed out: ${result.message}`);
    }

    // ERROR or other status
    console.log(`   ❌ Process instances: ${result.status} - ${result.message}`);
    throw new Error(`Process instance check failed: ${result.message}`);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connect')) {
      console.log(`   ⚠️  Could not connect to API - endpoint may not be available`);
      return; // Don't fail if endpoint doesn't exist
    }
    throw error;
  }
}

/**
 * Attempt to clear JPA/Hibernate caches in melosys-api
 *
 * Calls the POST /internal/e2e/caches/clear endpoint which clears:
 * - JPA first-level cache (EntityManager)
 * - JPA second-level cache (Hibernate)
 * - Spring caches
 */
export async function clearApiCaches(request: APIRequestContext): Promise<boolean> {
  try {
    const response = await request.post('http://localhost:8080/internal/e2e/caches/clear', {
      failOnStatusCode: false,
      timeout: 5000
    });

    if (response.ok()) {
      console.log(`   ✅ API caches cleared: JPA + Hibernate + Spring`);
      return true;
    }

    console.log(`   ⚠️  Cache clearing failed: HTTP ${response.status()}`);
    return false;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connect')) {
      console.log(`   ⚠️  Could not connect to cache endpoint - may not be available`);
    } else {
      console.log(`   ⚠️  Cache clearing error: ${errorMessage}`);
    }
    return false;
  }
}

/**
 * Restart melosys-api container to force cache clearing
 * This is a heavy-handed approach but guaranteed to work
 */
export async function restartApiContainer(): Promise<void> {
  const { execSync } = require('node:child_process');

  try {
    console.log('   🔄 Restarting melosys-api container...');
    execSync('docker restart melosys-api', { encoding: 'utf-8' });

    // Wait for API to be healthy
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        execSync('curl -s http://localhost:8080/actuator/health > /dev/null 2>&1');
        console.log('   ✅ API restarted and healthy');
        return;
      } catch {
        // Ignore health check errors, continue waiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('   ⚠️  API restarted but health check timed out');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`   ⚠️  Failed to restart API: ${errorMessage}`);
  }
}
