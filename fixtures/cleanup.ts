import {test as base} from '@playwright/test';
import {DatabaseHelper} from '../helpers/db-helper';
import {clearMockDataSilent} from '../helpers/mock-helper';
import {clearApiCaches, waitForProcessInstances} from '../helpers/api-helper';
import {UnleashHelper} from '../helpers/unleash-helper';

/**
 * Cleanup fixture - automatically cleans database, mock data, and Unleash toggles before each test
 * This ensures test isolation and prevents leftover data from affecting other tests
 *
 * Before each test:
 * - Cleans database (removes all test data)
 * - Clears mock service data
 * - Resets ALL Unleash feature toggles to default state
 *
 * After each test:
 * - Waits for async processes to complete
 * - Leaves data intact for debugging (no cleanup after test)
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

    // Clean database
    const db = new DatabaseHelper();
    try {
        await db.connect();
        const result = await db.cleanDatabase(true); // silent = true

        if (result.cleanedCount > 0 || result.totalRowsDeleted > 0) {
            console.log(`   ✅ Database: ${result.cleanedCount} tables cleaned (${result.totalRowsDeleted} rows)`);
        }
    } catch (error: any) {
        console.log(`   ⚠️  Database cleanup failed: ${error.message || error}`);
    } finally {
        await db.close();
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
    autoCleanup: [async ({page}, use) => {
        // BEFORE test: clean for fresh start
        console.log('\n🧹 Cleaning test data before test...');
        await cleanupTestData(page, false); // Don't wait for processes
        console.log('');

        // Run the test
        await use();

        // AFTER test: wait for processes to complete, but leave data so we can inspect it
        try {
            await waitForProcessInstances(page.request, 30);
        } catch (error: any) {
            console.log(`   ⚠️  Process instance check failed: ${error.message || error}`);
            // Non-critical - continue anyway
        }
    }, {auto: true}]
});
