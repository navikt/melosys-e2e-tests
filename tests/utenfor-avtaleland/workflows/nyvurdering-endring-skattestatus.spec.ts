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
import {AdminApiHelper, waitForProcessInstances} from '../../../helpers/api-helper';
import {withDatabase} from '../../../helpers/db-helper';
import {expect} from "@playwright/test";


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
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('🔍 DEBUG: ENVIRONMENT INFO');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`   CI: ${process.env.CI || 'false'}`);
        console.log(`   MELOSYS_API_TAG: ${process.env.MELOSYS_API_TAG || 'not set'}`);

        // Check melosys-api health endpoint for version info
        try {
            const healthResponse = await request.get('http://localhost:8080/internal/health');
            console.log(`   melosys-api health status: ${healthResponse.status()}`);
        } catch (e) {
            console.log(`   melosys-api health check failed: ${e}`);
        }

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

        // Navigate to Trygdeavgift immediately
        await behandling.gåTilTrygdeavgift();

        // 🔍 DEBUG: Check behandlingsresultat BEFORE changing skattepliktig
        console.log('🔍 DEBUG: Checking behandlingsresultat BEFORE changing skattepliktig...');
        await withDatabase(async (db) => {
            const result = await db.query(`
                SELECT br.BEHANDLING_ID, br.RESULTAT_TYPE, b.STATUS
                FROM BEHANDLINGSRESULTAT br
                JOIN BEHANDLING b ON br.BEHANDLING_ID = b.ID
                ORDER BY b.ID DESC
            `);
            console.log('   📊 Current behandlingsresultater:');
            result.forEach((r: any) => {
                console.log(`      Behandling ${r.BEHANDLING_ID}: type=${r.RESULTAT_TYPE}, status=${r.STATUS}`);
            });
        });

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
        console.log('🔍 DEBUG: Checking behandlingsresultat AFTER changing skattepliktig...');
        await withDatabase(async (db) => {
            const result = await db.query(`
                SELECT br.BEHANDLING_ID, br.RESULTAT_TYPE, b.STATUS
                FROM BEHANDLINGSRESULTAT br
                JOIN BEHANDLING b ON br.BEHANDLING_ID = b.ID
                ORDER BY b.ID DESC
            `);
            console.log('   📊 Current behandlingsresultater:');
            result.forEach((r: any) => {
                console.log(`      Behandling ${r.BEHANDLING_ID}: type=${r.RESULTAT_TYPE}, status=${r.STATUS}`);
            });
        });

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
        console.log('🔍 DEBUG: Checking behandlingsresultat BEFORE submitting vedtak...');
        await withDatabase(async (db) => {
            const result = await db.query(`
                SELECT br.BEHANDLING_ID, br.RESULTAT_TYPE, b.STATUS
                FROM BEHANDLINGSRESULTAT br
                JOIN BEHANDLING b ON br.BEHANDLING_ID = b.ID
                ORDER BY b.ID DESC
            `);
            console.log('   📊 Current behandlingsresultater:');
            result.forEach((r: any) => {
                console.log(`      Behandling ${r.BEHANDLING_ID}: type=${r.RESULTAT_TYPE}, status=${r.STATUS}`);
            });
        });

        // Step 15: Submit vedtak for ny vurdering
        console.log('📝 Step 15: Submitting vedtak for ny vurdering...');
        await vedtak.fattVedtakForNyVurdering('FEIL_I_BEHANDLING');

        // 🔍 DEBUG: Check behandlingsresultat IMMEDIATELY after submitting vedtak (before waiting)
        console.log('🔍 DEBUG: Checking behandlingsresultat IMMEDIATELY after vedtak...');
        await withDatabase(async (db) => {
            const result = await db.query(`
                SELECT br.BEHANDLING_ID, br.RESULTAT_TYPE, b.STATUS
                FROM BEHANDLINGSRESULTAT br
                JOIN BEHANDLING b ON br.BEHANDLING_ID = b.ID
                ORDER BY b.ID DESC
            `);
            console.log('   📊 Current behandlingsresultater:');
            result.forEach((r: any) => {
                console.log(`      Behandling ${r.BEHANDLING_ID}: type=${r.RESULTAT_TYPE}, status=${r.STATUS}`);
            });
        });

        // Step 16: Wait for IVERKSETT_VEDTAK_FTRL process to complete and commit to database
        // This ensures behandling.status = 'AVSLUTTET' is committed before the job queries
        console.log('📝 Step 16: Wait for vedtak process to complete...');
        await waitForProcessInstances(page.request, 30);

        // 🔍 DEBUG: Check what's actually in the database
        console.log('🔍 DEBUG: Checking database for behandlingsresultat.type...');
        await withDatabase(async (db) => {
            // Query with proper column names
            const result = await db.query(`
                SELECT
                    b.ID as BEHANDLING_ID,
                    b.STATUS,
                    br.RESULTAT_TYPE
                FROM BEHANDLING b
                JOIN BEHANDLINGSRESULTAT br ON br.BEHANDLING_ID = b.ID
                ORDER BY b.ID
            `);

            console.log(`   📊 Found ${result.length} behandlinger with behandlingsresultat`);
            console.log(`\n   📊 Behandlinger with their behandlingsresultat:`);

            result.forEach((r: any, idx: number) => {
                console.log(`   ${idx + 1}. Behandling ID: ${r.BEHANDLING_ID}`);
                console.log(`      Status: ${r.STATUS}`);
                console.log(`      Behandlingsresultat RESULTAT_TYPE: ${r.RESULTAT_TYPE}`);
                console.log('');
            });

            // Compare first vedtak and ny vurdering
            if (result.length >= 2) {
                const firstBehandling = result[0];
                const nyVurderingBehandling = result[result.length - 1];

                console.log(`\n   ═══════════════════════════════════════`);
                console.log(`   COMPARISON:`);
                console.log(`   ═══════════════════════════════════════`);

                const firstType = firstBehandling.RESULTAT_TYPE;
                const nyType = nyVurderingBehandling.RESULTAT_TYPE;

                console.log(`\n   ✅ First vedtak (behandling ${firstBehandling.BEHANDLING_ID}): ${firstType}`);
                console.log(`   ❓ Ny vurdering (behandling ${nyVurderingBehandling.BEHANDLING_ID}): ${nyType}`);

                if (nyType === 'IKKE_FASTSATT') {
                    console.log(`\n   ❌ BUG CONFIRMED: Ny vurdering has RESULTAT_TYPE=IKKE_FASTSATT instead of MEDLEM_I_FOLKETRYGDEN!`);
                } else if (nyType === 'MEDLEM_I_FOLKETRYGDEN') {
                    console.log(`\n   ✅ CORRECT: Ny vurdering has RESULTAT_TYPE=MEDLEM_I_FOLKETRYGDEN`);
                } else {
                    console.log(`\n   ⚠️  UNEXPECTED: Ny vurdering has RESULTAT_TYPE=${nyType}`);
                }
            }
        });

        // 🔍 DEBUG: Check the full database state that the årsavregning job will see
        console.log('🔍 DEBUG: Checking FULL database state for årsavregning query...');
        await withDatabase(async (db) => {
            // Check behandlingsresultat with vedtakMetadata using correct column names
            const resultatMedVedtak = await db.query(`
                SELECT
                    br.BEHANDLING_ID,
                    br.RESULTAT_TYPE,
                    b.STATUS,
                    vm.BEHANDLINGSRESULTAT_ID as VM_BR_ID,
                    vm.VEDTAK_TYPE
                FROM BEHANDLINGSRESULTAT br
                JOIN BEHANDLING b ON br.BEHANDLING_ID = b.ID
                LEFT JOIN VEDTAK_METADATA vm ON vm.BEHANDLINGSRESULTAT_ID = br.BEHANDLING_ID
                ORDER BY b.ID DESC
            `);

            console.log('   📊 Behandlingsresultat with VedtakMetadata:');
            resultatMedVedtak.forEach((r: any) => {
                const hasVedtakMetadata = r.VM_BR_ID ? '✅' : '❌ NULL';
                console.log(`      Behandling ${r.BEHANDLING_ID}: RESULTAT_TYPE=${r.RESULTAT_TYPE}, status=${r.STATUS}`);
                console.log(`         VedtakMetadata: ${hasVedtakMetadata}, vedtak_type=${r.VEDTAK_TYPE}`);
            });

            // Check medlemskapsperioder
            const medlemskapsPerioder = await db.query(`
                SELECT
                    mp.ID,
                    mp.BEHANDLINGSRESULTAT_ID,
                    mp.INNVILGELSE_RESULTAT,
                    br.RESULTAT_TYPE as BR_TYPE,
                    b.ID as BEHANDLING_ID
                FROM MEDLEMSKAPSPERIODE mp
                JOIN BEHANDLINGSRESULTAT br ON mp.BEHANDLINGSRESULTAT_ID = br.BEHANDLING_ID
                JOIN BEHANDLING b ON br.BEHANDLING_ID = b.ID
                ORDER BY b.ID DESC, mp.ID DESC
            `);

            console.log('\n   📊 Medlemskapsperioder:');
            medlemskapsPerioder.forEach((mp: any) => {
                console.log(`      Behandling ${mp.BEHANDLING_ID}: resultat=${mp.INNVILGELSE_RESULTAT}, br_type=${mp.BR_TYPE}`);
            });

            // The actual query criteria for årsavregning ikke-skattepliktig
            console.log('\n   📊 Checking årsavregning query criteria:');
            console.log('   Query requires:');
            console.log('   - behandlingsresultat.RESULTAT_TYPE = MEDLEM_I_FOLKETRYGDEN');
            console.log('   - behandling.status = AVSLUTTET');
            console.log('   - medlemskapsperiode exists with relevant period');
        });

        await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

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

        expect(response.antallProsessert).toBe(1);

        console.log('✅ Workflow completed successfully!');
    });
});
