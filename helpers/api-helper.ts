import { APIRequestContext } from '@playwright/test';

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
        result.failedInstances.forEach((failure: any) => {
          console.log(`      - ${failure.type}: ${failure.error?.melding || 'No error message'}`);
        });
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

  } catch (error: any) {
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('connect')) {
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
  } catch (error: any) {
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('connect')) {
      console.log(`   ⚠️  Could not connect to cache endpoint - may not be available`);
    } else {
      console.log(`   ⚠️  Cache clearing error: ${error.message || error}`);
    }
    return false;
  }
}

/**
 * Restart melosys-api container to force cache clearing
 * This is a heavy-handed approach but guaranteed to work
 */
export async function restartApiContainer(): Promise<void> {
  const { execSync } = require('child_process');

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
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('   ⚠️  API restarted but health check timed out');
  } catch (error) {
    console.log(`   ⚠️  Failed to restart API: ${error.message || error}`);
  }
}
