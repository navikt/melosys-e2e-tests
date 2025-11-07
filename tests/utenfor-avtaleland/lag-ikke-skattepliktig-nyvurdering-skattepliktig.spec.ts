import {expect, test} from '../../fixtures';
import {AuthHelper} from '../../helpers/auth-helper';
import {HovedsidePage} from '../../pages/hovedside.page';
import {OpprettNySakPage} from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {MedlemskapPage} from '../../pages/behandling/medlemskap.page';
import {ArbeidsforholdPage} from '../../pages/behandling/arbeidsforhold.page';
import {LovvalgPage} from '../../pages/behandling/lovvalg.page';
import {ResultatPeriodePage} from '../../pages/behandling/resultat-periode.page';
import {TrygdeavgiftPage} from '../../pages/trygdeavgift/trygdeavgift.page';
import {VedtakPage} from '../../pages/vedtak/vedtak.page';
import {USER_ID_VALID} from '../../pages/shared/constants';
import {UnleashHelper} from "../../helpers/unleash-helper";
import { waitForProcessInstances } from '../../helpers/api-helper';
import {json} from "node:stream/consumers";


test.describe('Yrkesaktiv - Førstegangsbehandling', () => {
    test('2-8 forste ledd bokstav a (arbeidstaker)', async ({page, request}) => {
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

        // Step 3: Fill Medlemskap
        console.log('📝 Step 3: Filling medlemskap information...');
        await medlemskap.velgPeriode('01.01.2023', '01.07.2024');
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

        // Step 6: Select Resultat Periode
        console.log('📝 Step 6: Selecting resultat periode...');
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
        await vedtak.klikkFattVedtak();

        console.log('📝 Step 9: waitForProcessInstances...');
        await waitForProcessInstances(page.request, 30);


        await page.goto('http://localhost:3000/melosys/');
        await page.getByPlaceholder('F.nr./d-nr./saksnr.').click();
        await page.getByPlaceholder('F.nr./d-nr./saksnr.').fill('30056928150');
        await page.getByRole('button', { name: 'Søk' }).click();
        await page.getByRole('button', { name: 'Vis behandling' }).click();
        await page.getByRole('link', { name: 'Gå til forsiden' }).click();
        await page.getByRole('button', { name: 'Opprett ny sak/behandling' }).click();
        await page.getByRole('textbox', { name: 'Brukers f.nr. eller d-nr.:' }).click();
        await page.getByRole('textbox', { name: 'Brukers f.nr. eller d-nr.:' }).fill('30056928150');

        await page.getByLabel('', { exact: true }).check();
        await page.getByRole('radio', { name: 'Ny vurdering' }).check();
        await page.getByLabel('Årsak', { exact: true }).selectOption('SØKNAD');
        await opprettSak.leggBehandlingIMine();
        await opprettSak.klikkOpprettNyBehandling();

        console.log('📝 waitForProcessInstances...');
        await waitForProcessInstances(page.request, 30);

        await page.goto('http://localhost:3000/melosys/');
        console.log('✅ behandling opprettet');

        await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
        await page.locator('button').filter({ hasText: 'Trygdeavgift' }).click();

        await page.getByRole('group', { name: 'Skattepliktig' }).getByLabel('Ja').check();
        await page.getByRole('group', { name: 'Skattepliktig' }).getByLabel('Ja').check();

        await page.locator('button').filter({ hasText: 'Vedtak' }).click();
        await page.getByLabel('Oppgi grunn for nytt vedtak (Obligatorisk)Oppgi grunn for nytt vedtak (').selectOption('FEIL_I_BEHANDLING');
        await page.getByRole('button', { name: 'Fatt vedtak' }).click();

        await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        console.log('✅ Workflow completed');
    });
});
