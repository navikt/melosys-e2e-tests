import {test, expect} from '@playwright/test';
import {withDatabase} from '../../helpers/db-helper';
import {clearMockData} from '../../helpers/mock-helper';

/**
 * Database og mock data administrasjon tester
 *
 * rengjør database og mock data - Manuell opprydding av all testdata
 * vis alle data - Viser alle tabeller med data (nyttig for debugging)
 *
 * Bruk i dine tester:
 *
 * // Vis database innhold før opprydding (for debugging)
 * await withDatabase(async (db) => {
 *   await db.showAllData();
 * });
 */

// @manual: rene vedlikeholds-/debug-verktøy (rydd DB, vis alle tabeller) — ingen assertion,
// skal ikke telle som regresjonsdekning. Kjør ved behov med MANUAL_TESTS=true.
test.describe('Rengjør database @manual', () => {
    test('skal rengjøre database og mock data', async ({page}) => {
        // Rengjør database
        await withDatabase(async (db) => {
            await db.cleanDatabase();
        });

        // Rengjør mock service data
        console.log('\n🧹 Rengjører mock service data...\n');
        try {
            await clearMockData(page.request);
        } catch (error) {
            // Feil allerede logget av helper
        }
    });

    test('skal vise alle data', async () => {
        await withDatabase(async (db) => {
            await db.showAllData();
        });
    });
});
