import { test, expect } from '../fixtures';
import { AuthHelper } from '../helpers/auth-helper';
import { HovedsidePage } from '../pages/hovedside.page';
import { OpprettNySakPage } from '../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../pages/behandling/medlemskap.page';
import { ArbeidsforholdPage } from '../pages/behandling/arbeidsforhold.page';
import { LovvalgPage } from '../pages/behandling/lovvalg.page';
import { TrygdeavgiftPage } from '../pages/trygdeavgift/trygdeavgift.page';
import { VedtakPage } from '../pages/vedtak/vedtak.page';
import { USER_ID_VALID } from '../pages/shared/constants';

/**
 * Example E2E test using Page Object Model pattern
 *
 * This demonstrates the complete workflow from case creation to decision:
 * 1. Create new case (Opprett ny sak)
 * 2. Fill medlemskap information
 * 3. Select arbeidsforhold (employers)
 * 4. Answer lovvalg questions
 * 5. Calculate trygdeavgift
 * 6. Make decision (Fatt vedtak)
 *
 * Compare with: tests/example-workflow.spec.ts (old style with 183 lines)
 * This version: ~60 lines (67% reduction!)
 */

test.describe('Melosys Complete Workflow - POM', () => {
  test('should complete entire workflow from creation to vedtak', async ({ page }) => {
    // Setup: Authentication
    const auth = new AuthHelper(page);
    await auth.login();

    // Setup: Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);

    // Step 1: Create new case
    console.log('📝 Step 1: Creating new case...');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Step 2: Navigate to behandling
    console.log('📝 Step 2: Opening behandling...');
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

    // Step 3: Fill Medlemskap
    console.log('📝 Step 3: Filling medlemskap information...');
    await medlemskap.velgPeriode('01.01.2024', '01.04.2024');
    await medlemskap.velgLand('Afghanistan');
    await medlemskap.velgTrygdedekning('FULL_DEKNING_FTRL');
    await medlemskap.klikkBekreftOgFortsett();

    // Step 4: Select Arbeidsforhold
    console.log('📝 Step 4: Selecting arbeidsforhold...');
    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    // Step 5: Answer Lovvalg questions
    console.log('📝 Step 5: Answering lovvalg questions...');
    await lovvalg.fyllUtLovvalg();

    // Step 6: Calculate Trygdeavgift
    console.log('📝 Step 6: Calculating trygdeavgift...');
    await trygdeavgift.fyllUtTrygdeavgift(false, 'ARBEIDSINNTEKT', '100000');

    // Step 7: Make Decision (Fatt vedtak)
    console.log('📝 Step 7: Making decision...');
    await vedtak.fattVedtak('fritekst', 'begrunnelse', 'trygdeavgift');

    console.log('✅ Complete workflow finished successfully!');
  });

  test('should complete workflow with custom values', async ({ page }) => {
    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);

    // Custom workflow with different values
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();

    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgOpprettNySak();
    await opprettSak.velgSakstype('FTRL');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('YRKESAKTIV');
    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    await opprettSak.assertions.verifiserBehandlingOpprettet();

    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

    // Custom period and country
    await medlemskap.fyllInnFraOgMed('15.03.2024');
    await medlemskap.fyllInnTilOgMed('15.09.2024');
    await medlemskap.velgLand('Afghanistan');
    await medlemskap.velgTrygdedekning('FULL_DEKNING_FTRL');
    await medlemskap.klikkBekreftOgFortsett();

    await arbeidsforhold.velgArbeidsgiver('Ståles Stål AS');
    await arbeidsforhold.klikkBekreftOgFortsett();

    // Custom lovvalg
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_1');
    await lovvalg.velgBrukersSituasjon('MIDLERTIDIG_ARBEID_2_1_FJERDE_LEDD');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmålIGruppe('Er søkers arbeidsoppdrag i');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Plikter arbeidsgiver å betale');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker lovlig opphold i');
    await lovvalg.klikkBekreftOgFortsettMedVent();
    await lovvalg.klikkBekreftOgFortsettMedVent();

    // Custom trygdeavgift
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('250000');
    await trygdeavgift.klikkBekreftOgFortsett();

    // Custom vedtak text
    await vedtak.fyllInnFritekst('Custom fritekst for this case');
    await vedtak.fyllInnBegrunnelse('Detailed reasoning for approval');
    await vedtak.fyllInnTrygdeavgiftBegrunnelse('Tax calculation justification');
    await vedtak.klikkFattVedtak();

    console.log('✅ Custom workflow completed successfully!');
  });
});
