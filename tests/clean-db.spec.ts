import {test, expect} from '@playwright/test';
import {withDatabase} from '../helpers/db-helper';
import {clearMockData} from '../helpers/mock-helper';

/**
 * Database and mock data management tests
 *
 * clean database and mock data - Manual cleanup of all test data
 * show all data - Display all tables with data (useful for debugging)
 *
 * Usage in your tests:
 *
 * // Show database contents before cleanup (for debugging)
 * await withDatabase(async (db) => {
 *   await db.showAllData();
 * });
 */

test.describe('Clean db', () => {
    test('clean database and mock data', async ({page}) => {
        // Clear database
        await withDatabase(async (db) => {
            await db.cleanDatabase();
        });

        // Clear mock service data
        console.log('\n🧹 Clearing mock service data...\n');
        try {
            await clearMockData(page.request);
        } catch (error) {
            // Error already logged by helper
        }
    });

    test('show all data', async () => {
        await withDatabase(async (db) => {
            await db.showAllData();
        });
    });
});
