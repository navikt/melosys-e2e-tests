import { test as base } from '@playwright/test';
import { DatabaseHelper } from '../helpers/db-helper';
import { clearMockDataSilent } from '../helpers/mock-helper';
import { clearApiCaches } from '../helpers/api-helper';

/**
 * Cleanup fixture - automatically cleans database and mock data before and after each test
 * This ensures test isolation and prevents leftover data from affecting other tests
 */

async function cleanupTestData(page: any): Promise<void> {
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
    // Not critical if this fails
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
}

export const cleanupFixture = base.extend<{ autoCleanup: void }>({
  autoCleanup: [async ({ page }, use) => {
    // BEFORE test: clean for fresh start
    console.log('\n🧹 Cleaning test data before test...');
    await cleanupTestData(page);
    console.log('');

    // Run the test
    await use();

    // AFTER test: clean up created data
    console.log('\n🧹 Cleaning up test data after test...');
    await cleanupTestData(page);
    console.log('');
  }, { auto: true }]
});
