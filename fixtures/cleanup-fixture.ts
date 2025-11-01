import { test as base } from '@playwright/test';
import { DatabaseHelper } from '../helpers/db-helper';
import { clearMockDataSilent } from '../helpers/mock-helper';

/**
 * Custom fixture that automatically cleans database and mock data after each test
 * Import this in your tests instead of @playwright/test for automatic cleanup
 */

export const test = base.extend<{ autoCleanup: void }>({
  // Auto-fixture that runs for every test
  autoCleanup: [async ({ page }, use) => {
    // Run the test first
    await use();

    // After test: clean database and mock data
    console.log('\n🧹 Cleaning up test data...');

    // Clean database
    const db = new DatabaseHelper();
    try {
      await db.connect();
      const result = await db.cleanDatabase(true); // silent = true

      if (result.cleanedCount > 0 || result.totalRowsDeleted > 0) {
        console.log(`   ✅ Database: ${result.cleanedCount} tables cleaned (${result.totalRowsDeleted} rows)`);
      }
    } catch (error) {
      console.log(`   ⚠️  Database cleanup failed: ${error.message || error}`);
    } finally {
      await db.close();
    }

    // Clean mock data
    try {
      const mockResult = await clearMockDataSilent(page.request);
      const totalCleared = (Number(mockResult.journalpostCleared) || 0) + (Number(mockResult.oppgaveCleared) || 0);
      if (totalCleared > 0) {
        console.log(`   ✅ Mock data: ${totalCleared} items cleared`);
      }
    } catch (error) {
      console.log(`   ⚠️  Mock cleanup failed: ${error.message || error}`);
    }

    console.log('');
  }, { auto: true }], // auto: true means this runs for every test automatically
});

export { expect } from '@playwright/test';
