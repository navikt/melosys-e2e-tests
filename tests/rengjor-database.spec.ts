import {test, expect} from '@playwright/test';
import {withDatabase} from '../helpers/db-helper';
import {clearMockData} from '../helpers/mock-helper';

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

test.describe('Rengjør database', () => {
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

    // Create test here

    test('skal vise VEDTAK_METADATA kolonner', async () => {
        await withDatabase(async (db) => {
            console.log('\n🔍 Discovering VEDTAK_METADATA columns...\n');

            const vmSample = await db.query(`SELECT * FROM VEDTAK_METADATA WHERE ROWNUM <= 1`);
            if (vmSample.length > 0) {
                console.log(`   📋 VEDTAK_METADATA columns: ${Object.keys(vmSample[0]).join(', ')}`);
                console.log('\n   📊 Sample row:');
                Object.entries(vmSample[0]).forEach(([key, value]) => {
                    console.log(`      ${key}: ${value}`);
                });
            } else {
                console.log('   ⚠️  No VEDTAK_METADATA rows found');
            }

            console.log('\n🔍 Discovering MEDLEMSKAPSPERIODE columns...\n');
            const mpSample = await db.query(`SELECT * FROM MEDLEMSKAPSPERIODE WHERE ROWNUM <= 1`);
            if (mpSample.length > 0) {
                console.log(`   📋 MEDLEMSKAPSPERIODE columns: ${Object.keys(mpSample[0]).join(', ')}`);
            } else {
                console.log('   ⚠️  No MEDLEMSKAPSPERIODE rows found');
            }
        });
    });

    test('skal lese behandlingsresultat.type fra database', async () => {
        await withDatabase(async (db) => {
            console.log('\n🔍 DEBUG: Leser behandlingsresultat.type fra database...\n');

            // Get all behandlinger
            console.log('   🔍 Henter behandlinger...');
            const behandlinger = await db.query('SELECT * FROM BEHANDLING');
            console.log(`   📊 Fant ${behandlinger.length} behandlinger\n`);

            // Get all behandlingsresultater
            console.log('   🔍 Henter behandlingsresultater...');
            const behandlingsresultater = await db.query('SELECT * FROM BEHANDLINGSRESULTAT');
            console.log(`   📊 Fant ${behandlingsresultater.length} behandlingsresultater\n`);

            if (behandlingsresultater.length === 0) {
                console.log('   ⚠️  Ingen behandlingsresultater funnet i database');
                console.log('   💡 Kjør en test først for å lage data, deretter kjør denne testen igjen\n');
                return;
            }

            // Show all columns in BEHANDLINGSRESULTAT table
            const firstRow = behandlingsresultater[0];
            const columnNames = Object.keys(firstRow);
            console.log(`   📋 BEHANDLINGSRESULTAT kolonner: ${columnNames.join(', ')}\n`);

            // Find the foreign key column (likely BEHANDLING_ID or BEHANDLINGID)
            const fkColumn = columnNames.find(col =>
                col === 'BEHANDLING_ID' || col === 'BEHANDLINGID'
            );
            console.log(`   🔗 Foreign key kolonne: ${fkColumn}\n`);

            // Find the type column (could be TYPE, BEHANDLINGSRESULTATTYPE, etc.)
            const typeColumn = columnNames.find(col =>
                col === 'TYPE' ||
                col === 'BEHANDLINGSRESULTATTYPE' ||
                col.includes('TYPE')
            );
            console.log(`   📝 Type kolonne: ${typeColumn}\n`);

            if (!fkColumn || !typeColumn) {
                console.log('   ❌ Kunne ikke finne foreign key eller type kolonne');
                console.log(`   📋 Tilgjengelige kolonner: ${columnNames.join(', ')}\n`);
                throw new Error('Kunne ikke finne nødvendige kolonner');
            }

            // Match behandlinger with their behandlingsresultat
            console.log('   📊 Behandlinger med deres behandlingsresultat:\n');

            for (const behandling of behandlinger) {
                const behandlingId = behandling.ID;
                const status = behandling.STATUS;

                const behandlingsresultat = behandlingsresultater.find(
                    br => br[fkColumn] === behandlingId
                );

                if (behandlingsresultat) {
                    const type = behandlingsresultat[typeColumn];
                    console.log(`   ${behandlingId}. Behandling ID: ${behandlingId}`);
                    console.log(`      Status: ${status}`);
                    console.log(`      Behandlingsresultat type (${typeColumn}): ${type}\n`);
                }
            }

            // Verify we found at least one behandlingsresultat
            expect(behandlingsresultater.length).toBeGreaterThan(0);
            console.log('   ✅ Database lesing fungerer!\n');
        });
    });

});
