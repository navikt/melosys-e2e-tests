import {test} from '../../fixtures';
import {AuthHelper} from '../../helpers/auth-helper';
import {HovedsidePage} from '../../pages/hovedside.page';
import {OpprettNySakPage} from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {MedlemskapPage} from '../../pages/behandling/medlemskap.page';
import {ArbeidsforholdPage} from '../../pages/behandling/arbeidsforhold.page';
import {LovvalgPage} from '../../pages/behandling/lovvalg.page';
import {ResultatPeriodePage} from '../../pages/behandling/resultat-periode.page';
import {BehandlingPage} from '../../pages/behandling/behandling.page';
import {TrygdeavgiftPage} from '../../pages/trygdeavgift/trygdeavgift.page';
import {VedtakPage} from '../../pages/vedtak/vedtak.page';
import {USER_ID_VALID} from '../../pages/shared/constants';
import {UnleashHelper} from "../../helpers/unleash-helper";
import { runAndWaitForProcessInstances, AdminApiHelper, waitForProcessInstances } from '../../helpers/api-helper';
import {expect} from "@playwright/test";
import {TestPeriods, TestPeriodsISO} from '../../helpers/date-helper';


test.describe('Nyvurdering - Endring av skattestatus', () => {
    test('skal endre skattestatus fra ikke-skattepliktig til skattepliktig via nyvurdering', async (
        {
            page,
            request
        }) => {
        // Tung NV-skattestatus-flyt: to fulle vedtak + nyvurdering + faktura +
        // flere prosessinstans-venter ligger nær 60s-taket og tipper over på en
        // lastet CI-runner (tyngre full-stack etter at skjema ble en del av
        // full-run). Scoped hev til 120s — global timeout beholdes på 60s.
        test.setTimeout(120000);

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

        // Step 3: Fill Medlemskap (using dynamic dates to avoid year-boundary issues)
        const period = TestPeriods.standardPeriod;
        console.log(`📝 Step 3: Filling medlemskap information (${period.start} - ${period.end})...`);
        await medlemskap.velgPeriode(period.start, period.end);
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

        // Wait for Resultat periode-steget to render after the step transition
        await resultatPeriode.ventPåSideLastet();

        // Log what the frontend API returns (for debugging)
        console.log('📊 Logging all frontend toggle states:');
        await unleash.logFrontendToggleStates();

        // Step 6: Select Resultat Periode - explicitly set INNVILGET to avoid default "Avslått"
        console.log('📝 Step 6: Setting resultat periode to INNVILGET...');
        await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

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
        await runAndWaitForProcessInstances(
          page.request,
          () => vedtak.klikkFattVedtak(),
          { timeoutSeconds: 30 }
        );

        // Step 10: Navigate and search for case
        console.log('📝 Step 10: Search for case and verify...');
        await hovedside.goto();
        await hovedside.søkEtterBruker(USER_ID_VALID);
        await hovedside.klikkVisBehandling();
        await hovedside.gåTilForsiden();

        // Step 11: Create ny vurdering
        console.log('📝 Step 11: Creating ny vurdering...');
        await hovedside.klikkOpprettNySak();
        await runAndWaitForProcessInstances(
          page.request,
          () => opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD'),
          { timeoutSeconds: 30 }
        );

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

        // Capture NV-behandlingId from URL for DB end-state assertions (before vedtak navigates away)
        const nvBehandlingId = new URL(page.url()).searchParams.get('behandlingID');
        expect(nvBehandlingId, 'behandlingID skal finnes i URL').not.toBeNull();

        // Step 15: Submit vedtak for ny vurdering
        console.log('📝 Step 15: Submitting vedtak for ny vurdering...');
        // Step 16: Hard sluttilstand - vent på NV-iverksetting + verifiser DB end-state
        // (NV-behandlingen skal være AVSLUTTET med alle prosessinstanser FERDIG)
        await runAndWaitForProcessInstances(
          page.request,
          () => vedtak.fattVedtakForNyVurdering('FEIL_I_BEHANDLING'),
          { timeoutSeconds: 60 }
        );
        await vedtak.assertions.verifiserBehandlingAvsluttet({ behandlingId: nvBehandlingId });

        // Note: Toggle will be reset to default (enabled) before next test runs

        console.log('✅ Workflow completed successfully!');
    });

    test('skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering', async (
        {
            page,
            request
        }) => {
        // Tung NV-skattestatus-flyt: to fulle vedtak + nyvurdering + faktura +
        // flere prosessinstans-venter ligger nær 60s-taket og tipper over på en
        // lastet CI-runner (tyngre full-stack etter at skjema ble en del av
        // full-run). Scoped hev til 120s — global timeout beholdes på 60s.
        test.setTimeout(120000);

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

        // Step 3: Fill Medlemskap (using dynamic dates to avoid year-boundary issues)
        const period = TestPeriods.standardPeriod;
        console.log(`📝 Step 3: Filling medlemskap information (${period.start} - ${period.end})...`);
        await medlemskap.velgPeriode(period.start, period.end);
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

        // Wait for Resultat periode-steget to render after the step transition
        await resultatPeriode.ventPåSideLastet();

        // Log what the frontend API returns (for debugging)
        console.log('📊 Logging all frontend toggle states:');
        await unleash.logFrontendToggleStates();

        // Step 6: Select Resultat Periode - explicitly set INNVILGET to avoid default "Avslått"
        console.log('📝 Step 6: Setting resultat periode to INNVILGET...');
        await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

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
        await runAndWaitForProcessInstances(
          page.request,
          () => vedtak.klikkFattVedtak(),
          { timeoutSeconds: 30 }
        );

        // Step 10: Navigate and search for case
        console.log('📝 Step 10: Search for case and verify...');
        await hovedside.goto();
        await hovedside.søkEtterBruker(USER_ID_VALID);
        await hovedside.klikkVisBehandling();
        await hovedside.gåTilForsiden();

        // Step 11: Create ny vurdering
        console.log('📝 Step 11: Creating ny vurdering...');
        await hovedside.klikkOpprettNySak();
        await runAndWaitForProcessInstances(
          page.request,
          () => opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD'),
          { timeoutSeconds: 30 }
        );

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

        // Capture NV-behandlingId from URL for DB end-state assertions (before vedtak navigates away)
        const nvBehandlingId = new URL(page.url()).searchParams.get('behandlingID');
        expect(nvBehandlingId, 'behandlingID skal finnes i URL').not.toBeNull();

        // Step 15: Submit vedtak for ny vurdering
        console.log('📝 Step 15: Submitting vedtak for ny vurdering...');
        // Step 16: Wait for IVERKSETT_VEDTAK_FTRL process to complete and commit to database
        // This ensures behandling.status = 'AVSLUTTET' is committed before the job queries
        await runAndWaitForProcessInstances(
          page.request,
          () => vedtak.fattVedtakForNyVurdering('FEIL_I_BEHANDLING'),
          { timeoutSeconds: 30 }
        );

        // Hard sluttilstand: NV-behandlingen skal være AVSLUTTET med alle prosessinstanser FERDIG
        await vedtak.assertions.verifiserBehandlingAvsluttet({ behandlingId: nvBehandlingId });

        await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        // Use full current year (Jan 1 - Dec 31) for the API call. currentYearPeriod ender
        // på "første i måneden +6 mnd", som i andre halvår ruller inn i neste kalenderår
        // (f.eks. 2027-01-01). Backend krever fom/tom i samme år
        // (ÅrsavregningIkkeSkattepliktigeProsessGenerator), så den async-jobben feilet stille
        // og antallProsessert ble 0. fullCurrentYearPeriod holder seg innenfor året.
        const apiPeriod = TestPeriodsISO.fullCurrentYearPeriod;
        await adminApi.finnIkkeSkattepliktigeSaker(
            request,
            apiPeriod.start,
            apiPeriod.end,
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
