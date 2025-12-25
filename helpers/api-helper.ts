import { APIRequestContext } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'node:path';

// Load .env (required, checked in with dev config)
dotenv.config({ path: path.resolve(__dirname, '../.env') });
// Load .env.local (optional, for local overrides - not on CI/CD)
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });

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
   * Get status of ikke-skattepliktige saker job (single check)
   *
   * @param request - Playwright API request context
   * @returns API response with job status
   */
  async getIkkeSkattepliktigeSakerStatus(request: APIRequestContext) {
    return await this.callAdminEndpoint(
      request,
      'GET',
      '/admin/aarsavregninger/saker/ikke-skattepliktige/status'
    );
  }

  /**
   * Wait for ikke-skattepliktige saker job to complete
   *
   * Polls the status endpoint until the job is done (isRunning becomes false)
   *
   * @param request - Playwright API request context
   * @param timeoutSeconds - Maximum time to wait (default: 10 seconds)
   * @param pollIntervalMs - Time between polls (default: 100ms)
   * @returns Final job status data
   */
  async waitForIkkeSkattepliktigeSakerJob(
    request: APIRequestContext,
    timeoutSeconds: number = 10,
    pollIntervalMs: number = 100
  ) {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    console.log(`\n⏳ Waiting for ikke-skattepliktige saker job to complete (timeout: ${timeoutSeconds}s)...`);

    while (true) {
      const response = await this.getIkkeSkattepliktigeSakerStatus(request);
      const data = await response.json();

      if (!response.ok()) {
        throw new Error(`Failed to get job status: HTTP ${response.status()}`);
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);

      if (!data.isRunning && (data.antallProsessert > 0 || elapsed > 2)) {
        console.log(`✅ Job completed after ${elapsed}s`);
        console.log(`   - Funnet: ${data.antallFunnet || 0}`);
        console.log(`   - Prosessert: ${data.antallProsessert || 0}`);
        console.log(`   - Errors: ${data.errorCount || 0}`);
        return data;
      }

      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        console.log(`\n❌ Timeout after ${elapsed}s - job still running`);
        console.log(`   - Funnet: ${data.antallFunnet || 0}`);
        console.log(`   - Prosessert: ${data.antallProsessert || 0}`);
        throw new Error(`Job did not complete within ${timeoutSeconds} seconds`);
      }

      // Log progress
      if (elapsed % 10 === 0 && elapsed > 0) { // Log every 10 seconds
        console.log(`   Still running... ${elapsed}s elapsed (funnet: ${data.antallFunnet || 0}, prosessert: ${data.antallProsessert || 0})`);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
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
      let errorDetails = '';
      if (result.failedInstances) {
        for (const failure of result.failedInstances) {
          const errorMsg = failure.error?.melding || 'No error message';
          const stackTrace = failure.error?.stackTrace || '';
          console.log(`      - ${failure.type}: ${errorMsg}`);
          errorDetails += `\n  - ${failure.type}: ${errorMsg}`;
          if (stackTrace) {
            // Show first few lines of stack trace
            const stackLines = stackTrace.split('\n').slice(0, 5).join('\n');
            console.log(`        ${stackLines.substring(0, 200)}...`);
            errorDetails += `\n    ${stackLines}`;
          }
        }
      }
      throw new Error(`Found ${result.failedInstances?.length || 0} failed process instance(s)${errorDetails}`);
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
 * Wait for saga completion for a specific behandling
 *
 * This calls the melosys-api E2E endpoint that checks if all saga steps
 * for the given behandling have completed. This is more precise than
 * waitForProcessInstances() because it waits for the specific behandling's
 * saga to complete, including all async steps like LAGRE_PERSONOPPLYSNINGER.
 *
 * Use this after fattVedtak() when you need to ensure the saga has fully
 * completed before executing follow-up operations like årsavregning jobs.
 *
 * @param request - Playwright API request context
 * @param behandlingId - The ID of the behandling to wait for
 * @param timeoutMs - Maximum time to wait (default: 30000ms)
 * @returns Promise<void> - Resolves when saga is complete
 * @throws Error if saga doesn't complete within timeout
 */
export async function waitForSagaCompletion(
  request: APIRequestContext,
  behandlingId: number,
  timeoutMs: number = 30000
): Promise<void> {
  const startTime = Date.now();
  const pollIntervalMs = 500;

  console.log(`\n⏳ Waiting for saga completion for behandling ${behandlingId} (timeout: ${timeoutMs / 1000}s)...`);

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await request.get(
        `http://localhost:8080/internal/e2e/behandlinger/${behandlingId}/saga/ferdig`,
        {
          failOnStatusCode: false,
          timeout: 5000
        }
      );

      if (response.ok()) {
        const data = await response.json();
        if (data.ferdig === true) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log(`✅ Saga completed for behandling ${behandlingId} after ${elapsed}s`);
          return;
        }
      } else if (response.status() === 404) {
        // Behandling not found - wait and retry
        console.log(`   ⚠️  Behandling ${behandlingId} not found, retrying...`);
      } else {
        console.log(`   ⚠️  Unexpected response: HTTP ${response.status()}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connect')) {
        console.log(`   ⚠️  Could not connect to API - endpoint may not be available`);
        return; // Don't fail if endpoint doesn't exist
      }
      // Log other errors but continue polling
      console.log(`   ⚠️  Poll error: ${errorMessage}`);
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  throw new Error(`Saga for behandling ${behandlingId} did not complete within ${elapsed}s`);
}

/**
 * Extract behandlingId from the current page URL
 *
 * Supports multiple URL formats:
 * - Query parameter: /melosys/FTRL/saksbehandling/MEL-22/?behandlingID=22
 * - Path segment: /melosys/behandling/123/...
 *
 * @param url - The current page URL
 * @returns The behandlingId as a number, or null if not found
 */
export function extractBehandlingIdFromUrl(url: string): number | null {
  // Try query parameter first (e.g., ?behandlingID=22)
  const urlObj = new URL(url);
  const behandlingIdParam = urlObj.searchParams.get('behandlingID');
  if (behandlingIdParam) {
    return parseInt(behandlingIdParam, 10);
  }

  // Fallback to path segment (e.g., /behandling/123/)
  const match = url.match(/\/behandling\/(\d+)/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }

  return null;
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
