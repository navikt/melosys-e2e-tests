import { test, expect } from '@playwright/test';
import { withDatabase } from '../helpers/db-helper';
import { clearMockData } from '../helpers/mock-helper';

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

    test('show all data', async ({page}) => {
        await withDatabase(async (db) => {
            console.log('\n🔍 Analyzing database contents...\n');

            // Get all tables
            const tables = await db.query<{TABLE_NAME: string}>(`
                SELECT table_name
                FROM user_tables
                ORDER BY table_name
            `);

            console.log(`Found ${tables.length} total tables\n`);

            // Filter out lookup tables and check which have data
            const tablesWithData: {name: string, count: number}[] = [];

            for (const table of tables) {
                const tableName = table.TABLE_NAME;

                // Skip lookup tables
                if (tableName.endsWith('_TYPE') ||
                    tableName.endsWith('_TEMA') ||
                    tableName.endsWith('_STATUS')) {
                    continue;
                }

                // Count rows in table
                try {
                    const countResult = await db.query(`SELECT COUNT(*) as cnt FROM ${tableName}`, {}, true);
                    const count = countResult[0]?.CNT || 0;

                    if (count > 0) {
                        tablesWithData.push({ name: tableName, count: count });
                    }
                } catch (error) {
                    console.log(`⚠️  Could not query ${tableName}: ${error.message || error}`);
                }
            }

            // Display results
            console.log(`\n📊 Tables with data (${tablesWithData.length} tables):\n`);
            console.log('─'.repeat(60));

            for (const table of tablesWithData) {
                console.log(`📋 ${table.name.padEnd(40)} ${String(table.count).padStart(6)} rows`);

                // Show sample data from the table
                try {
                    const sample = await db.query(`SELECT * FROM ${table.name} WHERE ROWNUM <= 1`, {}, true);
                    if (sample.length > 0) {
                        const columns = Object.keys(sample[0]).slice(0, 5); // First 5 columns
                        console.log(`   Columns: ${columns.join(', ')}${columns.length < Object.keys(sample[0]).length ? ', ...' : ''}`);
                    }
                } catch (error) {
                    // Ignore errors in sample query
                }
                console.log('');
            }

            console.log('─'.repeat(60));
            console.log(`\nTotal rows across all tables: ${tablesWithData.reduce((sum, t) => sum + t.count, 0)}`);
        });
    });
});
