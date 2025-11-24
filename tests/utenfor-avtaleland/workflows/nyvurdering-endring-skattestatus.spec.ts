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

        // Step 14: Update Skattepliktig to 'Nei' and complete the form
        // The velgSkattepliktig method now waits for the PUT API call to complete
        console.log('📝 Step 14: Updating Skattepliktig to Nei...');
        await trygdeavgift.velgSkattepliktig(false);

        // For ny vurdering, we need to fill in ALL required fields even when skattepliktig=false
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

        // Step 16: Wait for IVERKSETT_VEDTAK_FTRL process to complete and commit to database
        // This ensures behandling.status = 'AVSLUTTET' is committed before the job queries
        console.log('📝 Step 16: Wait for vedtak process to complete...');
        await waitForProcessInstances(page.request, 30);

        // 🔍 DEBUG: Check what's actually in the database
        console.log('🔍 DEBUG: Checking database for behandlingsresultat.type...');
        await withDatabase(async (db) => {
            // Query tables separately (like showAllData does)
            console.log('   🔍 Getting behandlinger...');
            const behandlinger = await db.query(`SELECT * FROM BEHANDLING ORDER BY ID`);
            console.log(`   📊 Found ${behandlinger.length} behandlinger`);

            console.log('   🔍 Getting behandlingsresultater...');
            const behandlingsresultater = await db.query(`SELECT * FROM BEHANDLINGSRESULTAT`);
            console.log(`   📊 Found ${behandlingsresultater.length} behandlingsresultater`);

            if (behandlingsresultater.length > 0) {
                console.log('   📋 BEHANDLINGSRESULTAT columns:', Object.keys(behandlingsresultater[0]).join(', '));
            }

            // Find the foreign key column (linking behandlingsresultat to behandling)
            const behandlingIdCol = Object.keys(behandlingsresultater[0] || {}).find(col =>
                col.toUpperCase().includes('BEHANDLING') && col.toUpperCase().includes('ID') && col !== 'ID'
            ) || 'BEHANDLING_ID';

            console.log(`   🔗 Foreign key column: ${behandlingIdCol}`);

            // Match up behandlinger with their behandlingsresultat
            console.log(`\n   📊 Behandlinger with their behandlingsresultat:`);
            behandlinger.forEach((b: any, idx: number) => {
                const resultat = behandlingsresultater.find((br: any) => br[behandlingIdCol] === b.ID);

                console.log(`   ${idx + 1}. Behandling ID: ${b.ID}`);
                console.log(`      Status: ${b.STATUS}`);

                if (resultat) {
                    // Find the type column
                    const typeColumn = Object.keys(resultat).find(col =>
                        col.toUpperCase().includes('TYPE') && !col.toUpperCase().includes('TEMA') && col !== 'ID'
                    );

                    if (typeColumn) {
                        console.log(`      Behandlingsresultat type (${typeColumn}): ${resultat[typeColumn]}`);
                    } else {
                        console.log(`      Behandlingsresultat: ${JSON.stringify(resultat)}`);
                    }
                } else {
                    console.log(`      ⚠️  No behandlingsresultat found!`);
                }
                console.log('');
            });

            // Compare first vedtak and ny vurdering
            if (behandlinger.length >= 2 && behandlingsresultater.length >= 2) {
                const firstBehandling = behandlinger[0];
                const nyVurderingBehandling = behandlinger[behandlinger.length - 1];

                const firstResultat = behandlingsresultater.find((br: any) => br[behandlingIdCol] === firstBehandling.ID);
                const nyVurderingResultat = behandlingsresultater.find((br: any) => br[behandlingIdCol] === nyVurderingBehandling.ID);

                console.log(`\n   ═══════════════════════════════════════`);
                console.log(`   COMPARISON:`);
                console.log(`   ═══════════════════════════════════════`);

                if (firstResultat && nyVurderingResultat) {
                    const typeColumn = Object.keys(firstResultat).find(col =>
                        col.toUpperCase().includes('TYPE') && !col.toUpperCase().includes('TEMA') && col !== 'ID'
                    );

                    if (typeColumn) {
                        const firstType = firstResultat[typeColumn];
                        const nyType = nyVurderingResultat[typeColumn];

                        console.log(`\n   Type column: ${typeColumn}`);
                        console.log(`   ✅ First vedtak (behandling ${firstBehandling.ID}): ${firstType}`);
                        console.log(`   ❓ Ny vurdering (behandling ${nyVurderingBehandling.ID}): ${nyType}`);

                        if (nyType === 'IKKE_FASTSATT') {
                            console.log(`\n   ❌ BUG CONFIRMED: Ny vurdering has type=IKKE_FASTSATT instead of MEDLEM_I_FOLKETRYGDEN!`);
                        } else if (nyType === 'MEDLEM_I_FOLKETRYGDEN') {
                            console.log(`\n   ✅ CORRECT: Ny vurdering has type=MEDLEM_I_FOLKETRYGDEN`);
                        } else {
                            console.log(`\n   ⚠️  UNEXPECTED: Ny vurdering has type=${nyType}`);
                        }
                    }
                }
            }
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
