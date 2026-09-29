import {APIRequestContext, test as base} from '@playwright/test';
import {DatabaseHelper} from '../helpers/db-helper';
import {PgDatabaseHelper} from '../helpers/pg-db-helper';
import {clearMockDataSilent} from '../helpers/mock-helper';
import { clearApiCaches, getProcessMarker, waitForNewProcessInstances, waitForProcessInstances } from '../helpers/api-helper';
import {UnleashHelper} from '../helpers/unleash-helper';

/**
 * Cleanup fixture - automatically cleans database, mock data, and Unleash toggles
 * This ensures test isolation and prevents leftover data from affecting other tests
 *
 * Before each test:
 * - Cleans database (removes all test data)
 * - Clears mock service data
 * - Resets Unleash toggles changed since the last reset (all defaults on the first test in a
 *   worker process), and waits until melosys-api sees the new state
 *
 * After each test:
 * - Waits for async processes to complete
 * - Resets Unleash toggles the test changed — also when the process wait fails
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

    // Clean Oracle database. Retry/backoff på ORA-00054 ("resource busy"): melosys-api kan holde
    // DML-lås mens den prosesserer en nylig mottatt digital søknad (skjema-mottak) akkurat når
    // cleanup kjører. db-helper setter også DDL_LOCK_TIMEOUT, så låsen rekker som regel å slippe;
    // denne loopen dekker tilfeller der den holdes litt lenger.
    const db = new DatabaseHelper();
    try {
        await db.connect();
        const maxAttempts = 3;
        for (let attempt = 1; ; attempt++) {
            try {
                const result = await db.cleanDatabase(true); // silent = true
                if (result.cleanedCount > 0 || result.totalRowsDeleted > 0) {
                    console.log(`   ✅ Oracle: ${result.cleanedCount} tables cleaned (${result.totalRowsDeleted} rows)`);
                }
                break;
            } catch (error: any) {
                const msg = error?.message || String(error);
                if (msg.includes('ORA-00054') && attempt < maxAttempts) {
                    const waitMs = 2000 * attempt;
                    console.log(`   ⏳ Oracle opptatt (ORA-00054) — venter ${waitMs}ms og prøver cleanup igjen (forsøk ${attempt}/${maxAttempts})`);
                    await new Promise((r) => setTimeout(r, waitMs));
                    continue;
                }
                throw error;
            }
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

    // Normalt tomt: resetten etter forrige test har allerede satt tilbake det den endret.
    // Venter på at melosys-api ser tilstanden, så ingen fast søvn trengs etterpå.
    await resetUnleash(page.request, 'før test');
}

async function resetUnleash(request: APIRequestContext, når: string, bareUnleash = false): Promise<void> {
    try {
        const antall = await new UnleashHelper(request).resetChangedToggles(true, bareUnleash);
        if (antall > 0) {
            console.log(`   ✅ Unleash: ${antall} toggles satt til standard (${når})`);
        }
    } catch (error: any) {
        console.log(`   ⚠️  Unleash reset failed (${når}): ${error.message || error}`);
    }
}

export const cleanupFixture = base.extend<{ autoCleanup: void }>({
    autoCleanup: [async ({page, request}, use) => {
        // BEFORE test: clean for fresh start
        console.log('\n🧹 Cleaning test data before test...');
        await cleanupTestData(page, false); // Don't wait for processes
        console.log('');

        // Markør tatt før testen kjører: tømmingen etterpå dekker da alt testen har rukket å
        // registrere, ikke bare det som ligger innenfor serverens 60-sekundersvindu. En lang test
        // lekket før uferdige prosesser videre til neste test. Merk at en prosess som ennå ikke er
        // registrert når tømmingen starter, fortsatt bare dekkes av serverens settling-forsinkelse
        // — markøren hjelper ikke der, siden en tømming per definisjon ikke vet hva den venter på.
        //
        // Ingen fallback hvis markøren ikke kan hentes. Et api uten endepunktet skal stoppe suiten,
        // ikke la hver test tømme med den racy kontrakten og late som alt er i orden — og en
        // catch her ville også svelget et api som nettopp har dødt.
        const markør = await getProcessMarker(page.request);

        // Run the test
        await use();

        // AFTER test: wait for processes to complete
        let prosessventFeilet = false;
        try {
            // expectedNew: 0 — en tømming vet per definisjon ikke hvor mange prosesser testen
            // startet, men alt som er registrert etter markøren må være ferdig før vi rydder.
            await waitForNewProcessInstances(page.request, markør, {expectedNew: 0, timeoutSeconds: 30});
        } catch (error: any) {
            const errorMessage = error.message || String(error);
            console.log(`   ⚠️  Process instance check failed: ${errorMessage}`);
            prosessventFeilet = true;

            // FAIL THE TEST - Process failures should not be ignored
            throw new Error(
                `Test failed due to process instance errors: ${errorMessage}`
            );
        } finally {
            // AFTER test: reset toggles the test changed (unless debugging locally), also when
            // the process wait threw. Next test's before-reset catches what is left.
            // Feilet prosessventen, har den brukt 30 s av teardown-budsjettet (60 s). Da venter vi
            // ikke på melosys-api: testen feiler, og neste worker gjør full reset med venting.
            if (process.env.SKIP_UNLEASH_CLEANUP_AFTER === 'true') {
                console.log(`   ⏭️  Unleash: Skipping cleanup after test (SKIP_UNLEASH_CLEANUP_AFTER=true)`);
            } else {
                await resetUnleash(request, 'etter test', prosessventFeilet);
            }
        }
    }, {auto: true}]
});
