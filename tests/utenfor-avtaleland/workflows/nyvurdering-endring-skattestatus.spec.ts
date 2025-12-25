import {test} from '../../../fixtures';
import {AuthHelper} from '../../../helpers/auth-helper';
import {HovedsidePage} from '../../../pages/hovedside.page';
import {OpprettNySakPage} from '../../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {MedlemskapPage} from '../../../pages/behandling/medlemskap.page';
import {ArbeidsforholdPage} from '../../../pages/behandling/arbeidsforhold.page';
import {LovvalgPage} from '../../../pages/behandling/lovvalg.page';
import {ResultatPeriodePage} from '../../../pages/behandling/resultat-periode.page';
import {BehandlingPage} from '../../../pages/behandling/behandling.page';
import {TrygdeavgiftPage} from '../../../pages/trygdeavgift/trygdeavgift.page';
import {VedtakPage} from '../../../pages/vedtak/vedtak.page';
import {USER_ID_VALID} from '../../../pages/shared/constants';
import {UnleashHelper} from "../../../helpers/unleash-helper";
import {
    AdminApiHelper,
    extractBehandlingIdFromUrl,
    waitForProcessInstances,
    waitForSagaCompletion
} from '../../../helpers/api-helper';
import {withDatabase} from '../../../helpers/db-helper';
import {expect} from "@playwright/test";

// Enable CI timing simulation to reproduce race conditions locally
// Set SIMULATE_CI_DELAY=true to add delays that stress the race condition
const SIMULATE_CI_DELAY = process.env.SIMULATE_CI_DELAY === 'true';
const CI_DELAY_MS = parseInt(process.env.CI_DELAY_MS || '500', 10);

/**
 * Helper function to add delay when simulating CI timing
 */
async function simulateCiDelay(description: string): Promise<void> {
    if (SIMULATE_CI_DELAY) {
        console.log(`⏳ SIMULATE_CI_DELAY: ${description} - waiting ${CI_DELAY_MS}ms...`);
        await new Promise(resolve => setTimeout(resolve, CI_DELAY_MS));
    }
}

/**
 * Helper to log detailed database state for debugging race conditions
 */
async function logDatabaseState(label: string, behandlingId?: number): Promise<void> {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`📊 DATABASE STATE: ${label}`);
    console.log(`${'═'.repeat(70)}`);

    await withDatabase(async (db) => {
        // Get all behandlinger with their resultat
        const query = behandlingId
            ? `SELECT b.ID, b.STATUS, br.RESULTAT_TYPE
               FROM BEHANDLING b
               LEFT JOIN BEHANDLINGSRESULTAT br ON br.BEHANDLING_ID = b.ID
               WHERE b.ID = :behandlingId
               ORDER BY b.ID DESC`
            : `SELECT b.ID, b.STATUS, br.RESULTAT_TYPE
               FROM BEHANDLING b
               LEFT JOIN BEHANDLINGSRESULTAT br ON br.BEHANDLING_ID = b.ID
               ORDER BY b.ID DESC`;

        const params = behandlingId ? { behandlingId } : {};
        const behandlinger = await db.query(query, params);

        console.log(`   Found ${behandlinger.length} behandling(er):`);
        behandlinger.forEach((b: any) => {
            const statusIcon = b.STATUS === 'AVSLUTTET' ? '✅' : '⏳';
            const typeIcon = b.RESULTAT_TYPE === 'MEDLEM_I_FOLKETRYGDEN' ? '✅' :
                b.RESULTAT_TYPE === 'IKKE_FASTSATT' ? '⚠️' : '❓';
            console.log(`   ${statusIcon} Behandling ${b.ID}: status=${b.STATUS}, RESULTAT_TYPE=${typeIcon} ${b.RESULTAT_TYPE}`);
        });

        // Note: Prosessinstans logging removed - column names uncertain
    });
    console.log(`${'═'.repeat(70)}\n`);
}


test.describe('Nyvurdering - Endring av skattestatus', () => {
    test('skal endre skattestatus fra ikke-skattepliktig til skattepliktig via nyvurdering', async (
        {
            page,
            request
        }) => {
        // Setup: Authentication
        const auth = new AuthHelper(page);
        const unleash = new UnleashHelper(request);
        await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        await auth.login();

        // Setup: Page Objects
        const hovedside = new HovedsidePage(page);
        const opprettSak = new OpprettNySakPage(page);
        const medlemskap = new MedlemskapPage(page);
        const arbeidsforhold = new ArbeidsforholdPage(page);
        const lovvalg = new LovvalgPage(page);
        const resultatPeriode = new ResultatPeriodePage(page);
        const behandling = new BehandlingPage(page);
        const trygdeavgift = new TrygdeavgiftPage(page);
        const vedtak = new VedtakPage(page);

        // Step 1: Create new case
        console.log('📝 Step 1: Creating new case...');
        await hovedside.gotoOgOpprettNySak();
        await opprettSak.opprettStandardSak(USER_ID_VALID);
        await opprettSak.assertions.verifiserBehandlingOpprettet();

        // Step 2: Navigate to behandling
        console.log('📝 Step 2: Opening behandling...');
        console.log('📝 waitForProcessInstances...');
        await waitForProcessInstances(page.request, 30);
        await hovedside.goto()

        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();

        // Extract behandlingId from URL for saga-specific wait later
        const behandlingId = extractBehandlingIdFromUrl(page.url());
        if (!behandlingId) {
            throw new Error(`Could not extract behandlingId from URL: ${page.url()}`);
        }
        console.log(`📝 Extracted behandlingId: ${behandlingId}`);

        // Step 3: Fill Medlemskap (2024-only dates for MELOSYS-7689)
        console.log('📝 Step 3: Filling medlemskap information...');
        await medlemskap.velgPeriode('01.01.2024', '01.07.2024');
        await medlemskap.velgLand('Afghanistan');
        await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
        await medlemskap.klikkBekreftOgFortsett();

        // Step 4: Select Arbeidsforhold
        console.log('📝 Step 4: Selecting arbeidsforhold...');
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        // Step 5: Answer Lovvalg questions
        console.log('📝 Step 5: Answering lovvalg questions...');
        await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
        await lovvalg.svarJaPaaFørsteSpørsmål();
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
        await lovvalg.klikkBekreftOgFortsett();

        // Wait for Medlemskapsperioder page to load
        await page.waitForTimeout(3000);

        // Log what the frontend API returns (for debugging)
        console.log('📊 Logging all frontend toggle states:');
        await unleash.logFrontendToggleStates();

        // Step 6: Accept default Resultat Periode values (split periods)
        console.log('📝 Step 6: Accepting default resultat periode values...');

        // Step 6: Select Resultat Periode
        console.log('📝 Step 6: Selecting resultat periode...');
        // await resultatPeriode.fyllUtResultatPeriode('INNVILGET');
        await resultatPeriode.klikkBekreftOgFortsett()

        // Step 7: Fill Trygdeavgift with special options
        console.log('📝 Step 7: Filling trygdeavgift...');
        await trygdeavgift.ventPåSideLastet();
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
        await trygdeavgift.velgBetalesAga(false);
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
        await trygdeavgift.klikkBekreftOgFortsett();

        // Step 8: Fatt vedtak (without filling text fields)
        console.log('📝 Step 8: Making decision...');
        await vedtak.klikkFattVedtak();

        console.log('📝 Step 9: Wait for process instances after first vedtak...');
        await waitForProcessInstances(page.request, 30);

        // Step 10: Navigate and search for case
        console.log('📝 Step 10: Search for case and verify...');
        await hovedside.goto();
        await hovedside.søkEtterBruker(USER_ID_VALID);
        await hovedside.klikkVisBehandling();
        await hovedside.gåTilForsiden();

        // Step 11: Create ny vurdering
        console.log('📝 Step 11: Creating ny vurdering...');
        await hovedside.klikkOpprettNySak();
        await opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD');

        console.log('📝 Step 12: Wait for behandling creation...');
        await waitForProcessInstances(page.request, 30);

        // Step 13: Open the NEW active behandling immediately (before it auto-completes)
        console.log('📝 Step 13: Opening active behandling BEFORE it completes...');
        await hovedside.goto();
        // Click on the FIRST link (the new active behandling)
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).first().click();

        // Navigate to Trygdeavgift immediately
        await behandling.gåTilTrygdeavgift();

        // Step 14: Update Skattepliktig to 'Ja' and complete the form
        // The velgSkattepliktig method now waits for the PUT API call to complete
        console.log('📝 Step 14: Updating Skattepliktig to Ja...');
        await trygdeavgift.velgSkattepliktig(true);

        // For ny vurdering with skattepliktig=true, we need to fill in all income fields
        await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
        await trygdeavgift.velgBetalesAga(false);
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
        await trygdeavgift.klikkBekreftOgFortsett();

        // Wait for navigation to vedtak page and all API calls to complete
        // This ensures behandlingsresultat.type is properly set before submitting vedtak
        console.log('📝 Waiting for vedtak page to load and API calls to complete...');
        await page.waitForLoadState('networkidle');

        // Step 15: Submit vedtak for ny vurdering
        console.log('📝 Step 15: Submitting vedtak for ny vurdering...');
        await vedtak.fattVedtakForNyVurdering('FEIL_I_BEHANDLING');

        // Note: Toggle will be reset to default (enabled) before next test runs

        console.log('✅ Workflow completed successfully!');
    });

    test('skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering', async (
        {
            page,
            request
        }) => {
        // 🔍 DEBUG: Log environment info
        console.log('\n' + '═'.repeat(70));
        console.log('🔍 DEBUG: ENVIRONMENT INFO');
        console.log('═'.repeat(70));
        console.log(`   CI: ${process.env.CI || 'false'}`);
        console.log(`   SIMULATE_CI_DELAY: ${SIMULATE_CI_DELAY} (${CI_DELAY_MS}ms)`);
        console.log(`   MELOSYS_API_TAG: ${process.env.MELOSYS_API_TAG || 'not set'}`);
        console.log(`   Test start time: ${new Date().toISOString()}`);

        // Check melosys-api health endpoint for version info
        try {
            const healthResponse = await request.get('http://localhost:8080/internal/health');
            console.log(`   melosys-api health status: ${healthResponse.status()}`);
        } catch (e) {
            console.log(`   melosys-api health check failed: ${e}`);
        }
        console.log('═'.repeat(70) + '\n');

        // Setup: Authentication
        const auth = new AuthHelper(page);
        const unleash = new UnleashHelper(request);
        await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        await auth.login();

        // Setup: Page Objects
        const hovedside = new HovedsidePage(page);
        const opprettSak = new OpprettNySakPage(page);
        const medlemskap = new MedlemskapPage(page);
        const arbeidsforhold = new ArbeidsforholdPage(page);
        const lovvalg = new LovvalgPage(page);
        const resultatPeriode = new ResultatPeriodePage(page);
        const behandling = new BehandlingPage(page);
        const trygdeavgift = new TrygdeavgiftPage(page);
        const vedtak = new VedtakPage(page);
        const adminApi = new AdminApiHelper();

        // Step 1: Create new case
        console.log('📝 Step 1: Creating new case...');
        await hovedside.gotoOgOpprettNySak();
        await opprettSak.opprettStandardSak(USER_ID_VALID);
        await opprettSak.assertions.verifiserBehandlingOpprettet();

        // Step 2: Navigate to behandling
        console.log('📝 Step 2: Opening behandling...');
        console.log('📝 waitForProcessInstances...');
        await waitForProcessInstances(page.request, 30);
        await hovedside.goto()

        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();

        // Extract behandlingId from URL for saga-specific wait later
        const behandlingId = extractBehandlingIdFromUrl(page.url());
        if (!behandlingId) {
            throw new Error(`Could not extract behandlingId from URL: ${page.url()}`);
        }
        console.log(`📝 Extracted behandlingId: ${behandlingId}`);

        // Step 3: Fill Medlemskap (2024-only dates for MELOSYS-7689)
        console.log('📝 Step 3: Filling medlemskap information...');
        await medlemskap.velgPeriode('01.01.2024', '01.07.2024');
        await medlemskap.velgLand('Afghanistan');
        await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
        await medlemskap.klikkBekreftOgFortsett();

        // Step 4: Select Arbeidsforhold
        console.log('📝 Step 4: Selecting arbeidsforhold...');
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        // Step 5: Answer Lovvalg questions
        console.log('📝 Step 5: Answering lovvalg questions...');
        await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
        await lovvalg.svarJaPaaFørsteSpørsmål();
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
        await lovvalg.klikkBekreftOgFortsett();

        // Wait for Medlemskapsperioder page to load
        await page.waitForTimeout(3000);

        // Log what the frontend API returns (for debugging)
        console.log('📊 Logging all frontend toggle states:');
        await unleash.logFrontendToggleStates();

        // Step 6: Accept default Resultat Periode values (split periods)
        console.log('📝 Step 6: Accepting default resultat periode values...');
        await resultatPeriode.klikkBekreftOgFortsett();

        // Step 7: Fill Trygdeavgift with special options
        console.log('📝 Step 7: Filling trygdeavgift...');
        await trygdeavgift.ventPåSideLastet();
        await trygdeavgift.velgSkattepliktig(true);

        await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
        await trygdeavgift.velgBetalesAga(false);
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
        await trygdeavgift.klikkBekreftOgFortsett();

        // Step 8: Fatt vedtak (without filling text fields)
        console.log('📝 Step 8: Making decision...');
        await vedtak.klikkFattVedtak();

        console.log('📝 Step 9: Wait for process instances after first vedtak...');
        await waitForProcessInstances(page.request, 30);

        // Step 10: Navigate and search for case
        console.log('📝 Step 10: Search for case and verify...');
        await hovedside.goto();
        await hovedside.søkEtterBruker(USER_ID_VALID);
        await hovedside.klikkVisBehandling();
        await hovedside.gåTilForsiden();

        // Step 11: Create ny vurdering
        console.log('📝 Step 11: Creating ny vurdering...');
        await hovedside.klikkOpprettNySak();
        await opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD');

        console.log('📝 Step 12: Wait for behandling creation...');
        await waitForProcessInstances(page.request, 30);

        // Step 13: Open the NEW active behandling immediately (before it auto-completes)
        console.log('📝 Step 13: Opening active behandling BEFORE it completes...');
        await hovedside.goto();
        // Click on the FIRST link (the new active behandling)
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).first().click();

        // Extract the NY VURDERING behandlingId from URL (this is different from the first behandling!)
        const nyVurderingBehandlingId = extractBehandlingIdFromUrl(page.url());
        if (!nyVurderingBehandlingId) {
            throw new Error(`Could not extract ny vurdering behandlingId from URL: ${page.url()}`);
        }
        console.log(`📝 Extracted ny vurdering behandlingId: ${nyVurderingBehandlingId} (first was: ${behandlingId})`);

        // Navigate to Trygdeavgift immediately
        await behandling.gåTilTrygdeavgift();

        // 🔍 DEBUG: Check behandlingsresultat BEFORE changing skattepliktig
        await logDatabaseState('BEFORE changing skattepliktig (in ny vurdering)');

        // Step 14: Update Skattepliktig to 'Nei' and complete the form
        // The velgSkattepliktig method now waits for the PUT API call to complete
        console.log('📝 Step 14: Updating Skattepliktig to Nei...');

        // 🔍 DEBUG: Capture the API response when changing skattepliktig
        const [apiResponse] = await Promise.all([
            page.waitForResponse(resp =>
                resp.url().includes('/api/') &&
                resp.url().includes('trygdeavgift') &&
                resp.request().method() === 'PUT'
            ).catch(() => null),
            trygdeavgift.velgSkattepliktig(false)
        ]);

        if (apiResponse) {
            console.log(`🔍 DEBUG: Trygdeavgift API response status: ${apiResponse.status()}`);
            try {
                const responseBody = await apiResponse.json();
                console.log(`🔍 DEBUG: Trygdeavgift API response body: ${JSON.stringify(responseBody, null, 2)}`);
            } catch (e) {
                console.log(`🔍 DEBUG: Could not parse API response as JSON`);
            }
        } else {
            console.log('⚠️  DEBUG: No trygdeavgift API response captured');
        }

        // 🔍 DEBUG: Check behandlingsresultat AFTER changing skattepliktig
        await logDatabaseState('AFTER changing skattepliktig');

        // For ny vurdering, we need to fill in ALL required fields even when skattepliktig=false
        await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
        await trygdeavgift.velgBetalesAga(false);
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
        await trygdeavgift.klikkBekreftOgFortsett();

        // Wait for navigation to vedtak page and all API calls to complete
        // This ensures behandlingsresultat.type is properly set before submitting vedtak
        console.log('📝 Waiting for vedtak page to load and API calls to complete...');
        await page.waitForLoadState('networkidle');

        // 🔍 DEBUG: Check behandlingsresultat BEFORE submitting vedtak
        await logDatabaseState('BEFORE submitting vedtak');

        // 🔍 CI SIMULATION: Add delay before vedtak to stress race condition
        await simulateCiDelay('Before vedtak submission');

        // Step 15: Submit vedtak for ny vurdering
        console.log('📝 Step 15: Submitting vedtak for ny vurdering...');
        await vedtak.fattVedtakForNyVurdering('FEIL_I_BEHANDLING');

        // 🔍 DEBUG: Check behandlingsresultat IMMEDIATELY after submitting vedtak (before waiting)
        // This is the CRITICAL point - the deferred pattern should be running now
        console.log('\n' + '🚨'.repeat(35));
        console.log('🚨 CRITICAL TIMING POINT: Immediately after vedtak submission');
        console.log('🚨 The deferred IVERKSETT_VEDTAK_FTRL process should be starting...');
        console.log('🚨'.repeat(35) + '\n');

        await logDatabaseState('IMMEDIATELY after vedtak (deferred process starting)');

        // Step 16: Wait for IVERKSETT_VEDTAK_FTRL process to complete and commit to database
        // This ensures behandling.status = 'AVSLUTTET' is committed before the job queries
        console.log('📝 Step 16: Wait for vedtak process to complete...');
        await waitForProcessInstances(page.request, 30);

        // Step 16: Wait for IVERKSETT_VEDTAK_FTRL saga to complete for this specific behandling
        // This is more precise than waitForProcessInstances() - it ensures the saga has fully
        // committed all changes (including RESULTAT_TYPE) before the årsavregning job queries the database
        // IMPORTANT: Use nyVurderingBehandlingId (not behandlingId which is the first behandling!)
        console.log('📝 Step 16: Wait for saga completion...');
        await waitForSagaCompletion(page.request, nyVurderingBehandlingId, 30000);


        // 🔍 DEBUG: Check what's actually in the database AFTER process completion
        await logDatabaseState('AFTER process completion (waitForProcessInstances done)');

        // 🔍 DEBUG: Detailed comparison of first vedtak vs ny vurdering
        console.log('\n' + '═'.repeat(70));
        console.log('📊 DETAILED COMPARISON: First Vedtak vs Ny Vurdering');
        console.log('═'.repeat(70));

        await withDatabase(async (db) => {
            const result = await db.query(`
                SELECT
                    b.ID as BEHANDLING_ID,
                    b.STATUS,
                    br.RESULTAT_TYPE
                FROM BEHANDLING b
                JOIN BEHANDLINGSRESULTAT br ON br.BEHANDLING_ID = b.ID
                ORDER BY b.ID
            `);

            if (result.length >= 2) {
                const firstBehandling = result[0];
                const nyVurderingBehandling = result[result.length - 1];

                const firstType = firstBehandling.RESULTAT_TYPE;
                const nyType = nyVurderingBehandling.RESULTAT_TYPE;

                console.log(`   First vedtak (behandling ${firstBehandling.BEHANDLING_ID}):`);
                console.log(`      Status: ${firstBehandling.STATUS}`);
                console.log(`      RESULTAT_TYPE: ${firstType}`);
                console.log('');
                console.log(`   Ny vurdering (behandling ${nyVurderingBehandling.BEHANDLING_ID}):`);
                console.log(`      Status: ${nyVurderingBehandling.STATUS}`);
                console.log(`      RESULTAT_TYPE: ${nyType}`);
                console.log('');

                if (nyType === 'IKKE_FASTSATT') {
                    console.log('   ' + '❌'.repeat(30));
                    console.log('   ❌ BUG CONFIRMED: RESULTAT_TYPE=IKKE_FASTSATT');
                    console.log('   ❌ Expected: MEDLEM_I_FOLKETRYGDEN');
                    console.log('   ❌ This is the race condition bug!');
                    console.log('   ' + '❌'.repeat(30));
                } else if (nyType === 'MEDLEM_I_FOLKETRYGDEN') {
                    console.log('   ' + '✅'.repeat(30));
                    console.log('   ✅ CORRECT: RESULTAT_TYPE=MEDLEM_I_FOLKETRYGDEN');
                    console.log('   ' + '✅'.repeat(30));
                } else {
                    console.log(`   ⚠️  UNEXPECTED: RESULTAT_TYPE=${nyType}`);
                }
            }
        });
        console.log('═'.repeat(70) + '\n');

        // 🔍 DEBUG: Check additional context for the årsavregning job
        console.log('\n' + '═'.repeat(70));
        console.log('📊 ÅRSAVREGNING JOB CONTEXT');
        console.log('═'.repeat(70));
        console.log('   The årsavregning job queries for:');
        console.log('   - behandlingsresultat.RESULTAT_TYPE = MEDLEM_I_FOLKETRYGDEN');
        console.log('   - behandling.status = AVSLUTTET');
        console.log('   - medlemskapsperiode exists with relevant period');
        console.log('');

        await withDatabase(async (db) => {
            // Check VedtakMetadata
            const vedtakMetadata = await db.query(`
                SELECT vm.BEHANDLINGSRESULTAT_ID, vm.VEDTAK_TYPE
                FROM VEDTAK_METADATA vm
                ORDER BY vm.BEHANDLINGSRESULTAT_ID DESC
            `);

            console.log('   VedtakMetadata records:');
            vedtakMetadata.forEach((vm: any) => {
                console.log(`      Behandling ${vm.BEHANDLINGSRESULTAT_ID}: vedtak_type=${vm.VEDTAK_TYPE}`);
            });

            // Note: TRYGDEAVGIFT table query removed - table name uncertain
        });
        console.log('═'.repeat(70) + '\n');

        await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        // 🔍 DEBUG: Log before running the årsavregning job
        console.log('\n' + '═'.repeat(70));
        console.log('🚀 RUNNING ÅRSAVREGNING JOB');
        console.log('═'.repeat(70));
        console.log(`   Time: ${new Date().toISOString()}`);

        await adminApi.finnIkkeSkattepliktigeSaker(
            request,
            '2024-01-01',
            '2024-12-31',
            true // lagProsessinstanser
        );
        const response = await adminApi.waitForIkkeSkattepliktigeSakerJob(
            request,
            70, // 70 seconds timeout
            1000 // Poll every 1 second
        );

        // 🔍 DEBUG: Log the job result
        console.log('\n   📊 Årsavregning Job Result:');
        console.log(`      antallFunnet: ${response.antallFunnet}`);
        console.log(`      antallProsessert: ${response.antallProsessert}`);
        console.log(`      antallFeilet: ${response.antallFeilet}`);

        if (response.antallProsessert === 0) {
            console.log('\n   ' + '❌'.repeat(30));
            console.log('   ❌ JOB FOUND 0 CASES!');
            console.log('   ❌ This is the race condition bug manifestation!');
            console.log('   ❌ The RESULTAT_TYPE was IKKE_FASTSATT when Kafka published.');
            console.log('   ' + '❌'.repeat(30));
        } else {
            console.log('\n   ' + '✅'.repeat(30));
            console.log('   ✅ JOB FOUND CASES - Bug did not manifest this time!');
            console.log('   ' + '✅'.repeat(30));
        }
        console.log('═'.repeat(70) + '\n');

        expect(response.antallProsessert).toBe(1);

        console.log('✅ Workflow completed successfully!');
    });
});
