import {test} from '../../../fixtures/unleash-cleanup';
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
import {expect} from "@playwright/test";


test.describe('Årsavregning - Ikke-skattepliktige saker', () => {
    test('skal opprette årsavregning for ikke-skattepliktig bruker', async ({page, request}) => {
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

        // Step 3: Fill Medlemskap
        console.log('📝 Step 3: Filling medlemskap information...');
        await medlemskap.velgPeriode('03.01.2024', '01.04.2024');
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

        // Step 6: Accept default Resultat Periode values
        console.log('📝 Step 6: Accepting resultat periode defaults...');
        // System creates 2 periods for split coverage (Helse + Pensjon)
        // Period 1: Helsedel - Avslått (default)
        // Period 2: Pensjonsdel - Innvilget (default)
        // Accept these defaults by just clicking continue
        await resultatPeriode.klikkBekreftOgFortsett();

        // Step 7: Fill Trygdeavgift with special options
        console.log('📝 Step 7: Filling trygdeavgift...');
        await trygdeavgift.ventPåSideLastet();
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgSkattepliktig(false);

        await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
        await trygdeavgift.velgBetalesAga(false);
        await trygdeavgift.fyllInnBruttoinntekt('100000');
        await trygdeavgift.klikkBekreftOgFortsett();

        // Step 8: Fatt vedtak (without filling text fields)
        console.log('📝 Step 8: Making decision...');
        await vedtak.klikkFattVedtak();

        console.log('📝 Step 9: Wait for process instances after first vedtak...');
        await waitForProcessInstances(page.request, 30);

        await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');
        await adminApi.finnIkkeSkattepliktigeSaker(
            request,
            '2024-01-01',
            '2024-12-31',
            true // lagProsessinstanser
        );
        const response = await adminApi.waitForIkkeSkattepliktigeSakerJob(
            request,
            60, // 60 seconds timeout
            1000 // Poll every 1 second
        );

        expect(response.antallProsessert).toBe(1);

        console.log('✅ Workflow completed successfully!');
    });
});
