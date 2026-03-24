import {test as base} from '@playwright/test';
import {DatabaseHelper} from '../helpers/db-helper';
import {PgDatabaseHelper} from '../helpers/pg-db-helper';
import {clearMockDataSilent} from '../helpers/mock-helper';
import {clearApiCaches, waitForProcessInstances} from '../helpers/api-helper';
import {UnleashHelper} from '../helpers/unleash-helper';

/**
 * Cleanup fixture - automatically cleans database, mock data, and Unleash toggles
 * This ensures test isolation and prevents leftover data from affecting other tests
 *
 * Before each test:
 * - Cleans database (removes all test data)
 * - Clears mock service data
 * - Resets ALL Unleash feature toggles to default state
 * - Adds 2s delay for melosys-api cache propagation
 *
 * After each test:
 * - Waits for async processes to complete
 * - Resets Unleash toggles (ensures next test gets clean state)
 * - Leaves data intact for debugging
 *
 * Environment variables:
 * - SKIP_UNLEASH_CLEANUP_AFTER=true - Skip Unleash cleanup after test (for local debugging)
 */

async function cleanupTestData(page: any, waitForProcesses: boolean = false): Promise<void> {
    // Wait for async process instances to complete (after test only)
    if (waitForProcesses) {
        try {
            await waitForProcessInstances(page.request, 30);
        } catch (error: any) {
            console.log(`   ⚠️  Process instance check failed: ${error.message || error}`);
            // Continue with cleanup even if processes failed
        }
    }

    // Clean Oracle database
    const db = new DatabaseHelper();
    try {
        await db.connect();
        const result = await db.cleanDatabase(true); // silent = true

        if (result.cleanedCount > 0 || result.totalRowsDeleted > 0) {
            console.log(`   ✅ Oracle: ${result.cleanedCount} tables cleaned (${result.totalRowsDeleted} rows)`);
        }
    } catch (error: any) {
        console.log(`   ⚠️  Oracle cleanup failed: ${error.message || error}`);
    } finally {
        await db.close();
    }

    // Clean PostgreSQL databases (faktureringskomponenten)
    const pgSchemas = ['faktureringskomponenten'];
    for (const schema of pgSchemas) {
        const pgDb = new PgDatabaseHelper(schema);
        try {
            await pgDb.connect();
            const result = await pgDb.cleanDatabase(true);

            if (result.cleanedCount > 0 || result.totalRowsDeleted > 0) {
                console.log(`   ✅ PostgreSQL (${schema}): ${result.cleanedCount} tables cleaned (${result.totalRowsDeleted} rows)`);
            }
        } catch (error: any) {
            console.log(`   ⚠️  PostgreSQL (${schema}) cleanup failed: ${error.message || error}`);
        } finally {
            await pgDb.close();
        }
    }

    // Clear API caches to prevent JPA errors
    try {
        await clearApiCaches(page.request);
    } catch (error: any) {
        console.log(`   ⚠️  clearApiCaches failed: ${error.message || error}`);
    }

    // Clean mock data
    try {
        const mockResult = await clearMockDataSilent(page.request);
        const totalCleared = (Number(mockResult.journalpostCleared) || 0) + (Number(mockResult.oppgaveCleared) || 0);
        if (totalCleared > 0) {
            console.log(`   ✅ Mock data: ${totalCleared} items cleared`);
        }
    } catch (error: any) {
        console.log(`   ⚠️  Mock cleanup failed: ${error.message || error}`);
    }

    // Reset Unleash feature toggles to default state
    // This ensures all tests start with consistent toggle state
    try {
        const unleash = new UnleashHelper(page.request);
        await unleash.resetToDefaults(true, true); // silent mode, skip frontend check
        console.log(`   ✅ Unleash: All toggles reset to defaults`);

        // Give melosys-api extra time to poll Unleash and update its cache
        // melosys-api polls every ~10 seconds, so we wait a bit to ensure cache refresh
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second safety buffer
    } catch (error: any) {
        console.log(`   ⚠️  Unleash reset failed: ${error.message || error}`);
    }
}

export const cleanupFixture = base.extend<{ autoCleanup: void }>({
    autoCleanup: [async ({page, request}, use) => {
        // BEFORE test: clean for fresh start
        console.log('\n🧹 Cleaning test data before test...');
        await cleanupTestData(page, false); // Don't wait for processes
        console.log('');

        // Run the test
        await use();

        // AFTER test: wait for processes to complete
        try {
            await waitForProcessInstances(page.request, 30);
        } catch (error: any) {
            const errorMessage = error.message || String(error);
            console.log(`   ⚠️  Process instance check failed: ${errorMessage}`);

            // FAIL THE TEST - Process failures should not be ignored
            throw new Error(
                `Test failed due to process instance errors: ${errorMessage}`
            );
        }

        // AFTER test: Reset Unleash toggles (unless debugging locally)
        // This ensures next test gets clean state without race conditions
        const skipCleanupAfter = process.env.SKIP_UNLEASH_CLEANUP_AFTER === 'true';
        if (!skipCleanupAfter) {
            try {
                const unleash = new UnleashHelper(request);
                await unleash.resetToDefaults(true, false); // silent mode, check frontend API
                console.log(`   ✅ Unleash: Toggles reset after test (cleanup for next test)`);
            } catch (error: any) {
                console.log(`   ⚠️  Unleash cleanup after test failed: ${error.message || error}`);
            }
        } else {
            console.log(`   ⏭️  Unleash: Skipping cleanup after test (SKIP_UNLEASH_CLEANUP_AFTER=true)`);
        }
    }, {auto: true}]
});
