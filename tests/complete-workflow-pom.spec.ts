import { test } from '../fixtures';
import { AuthHelper } from '../helpers/auth-helper';
import { HovedsidePage } from '../pages/hovedside.page';
import { OpprettNySakPage } from '../pages/opprett-ny-sak/opprett-ny-sak.page';
import { BehandlingPage } from '../pages/behandling/behandling.page';
import { MedlemskapPage } from '../pages/behandling/medlemskap.page';
import { ArbeidsforholdPage } from '../pages/behandling/arbeidsforhold.page';
import { LovvalgPage } from '../pages/behandling/lovvalg.page';
import { TrygdeavgiftPage } from '../pages/trygdeavgift/trygdeavgift.page';
import { VedtakPage } from '../pages/vedtak/vedtak.page';
import {UnleashHelper} from "../helpers/unleash-helper";

/**
 * Complete workflow test using Page Object Model pattern
 *
 * This test demonstrates the COMPLETE workflow from your recorded test:
 * 1. Create new case (FTRL / MEDLEMSKAP_LOVVALG)
 * 2. Edit case date using date picker
 * 3. Fill Medlemskap section (period, multiple countries, trygdedekning)
 * 4. Select Arbeidsforhold
 * 5. Complete Lovvalg section
 * 6. Fill Trygdeavgift with MULTIPLE income sources
 * 7. Submit Vedtak
 *
 * All actions use POMs - no direct selectors!
 */

test.describe('Complete Workflow - POM Pattern', () => {
  test('should complete entire workflow from case creation to vedtak', async ({ page, request }) => {
    // ===== SETUP: Authentication =====
    const auth = new AuthHelper(page);
    await auth.login();
      const unleash = new UnleashHelper(request);
      await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

    // ===== SETUP: Page Objects =====
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new BehandlingPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);

    console.log('🎯 Starting complete workflow test...');

    // ===== STEP 1: Create New Case =====
    console.log('\n📝 Step 1: Creating new case...');
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();

    await opprettSak.fyllInnBrukerID('30056928150');
    await opprettSak.velgSakstype('FTRL');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('YRKESAKTIV');
    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    await opprettSak.assertions.verifiserBehandlingOpprettet();
    console.log('✅ Case created successfully');

    // ===== STEP 2: Navigate to case and edit date =====
    console.log('\n📅 Step 2: Editing case date...');
    // Click on the case link (using the recorded selector)
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

    // Edit date using the new BehandlingPage methods
    await behandling.endreDatoMedDatovelger('2024', 'fredag 1');
    console.log('✅ Date edited successfully');

    // ===== STEP 3: Fill Medlemskap Section =====
    console.log('\n🌍 Step 3: Filling Medlemskap section...');
    // Fill period dates
    await medlemskap.velgPeriode('01.11.2024', '14.11.2024');

    // Select "Flere land, ikke kjent hvilke" (NEW method!)
    await medlemskap.velgFlereLandIkkeKjentHvilke();

    // Select trygdedekning
    await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');

    await medlemskap.klikkBekreftOgFortsett();
    console.log('✅ Medlemskap section completed');

    // ===== STEP 4: Select Arbeidsforhold =====
    console.log('\n💼 Step 4: Selecting arbeidsforhold...');
    await arbeidsforhold.velgArbeidsgiver('Ståles Stål AS');
    await arbeidsforhold.klikkBekreftOgFortsett();
    console.log('✅ Arbeidsforhold selected');

    // ===== STEP 5: Complete Lovvalg Section =====
    console.log('\n⚖️  Step 5: Completing Lovvalg section...');
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');

    // Answer first question (Ja)
    await lovvalg.svarJaPaaFørsteSpørsmål();

    // Answer two group questions
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');

    await lovvalg.klikkBekreftOgFortsettMedVent();
    await lovvalg.klikkBekreftOgFortsettMedVent();
    console.log('✅ Lovvalg section completed');

    // ===== STEP 6: Navigate to Trygdeavgift =====
    console.log('\n💰 Step 6: Filling Trygdeavgift section...');
    await behandling.gåTilTrygdeavgift();

    // Wait for page to load
    await trygdeavgift.ventPåSideLastet();

    // Select "Ja" for skattepliktig
    await trygdeavgift.velgSkattepliktig(true);

    // ===== STEP 6a: First Income Source =====
    console.log('   Adding first income source...');
    await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');

    // ===== STEP 6b: Add Second Income Source (NEW functionality!) =====
    console.log('   Adding second income source...');
    await trygdeavgift.klikkLeggTilInntekt();
    await trygdeavgift.velgInntektskildeForIndeks(1, 'NÆRINGSINNTEKT_FRA_NORGE');
    await trygdeavgift.fyllInnBruttoinntektForIndeks(1, '100000');

    await trygdeavgift.klikkBekreftOgFortsett();
    console.log('✅ Trygdeavgift section completed with multiple income sources');

    // ===== STEP 7: Submit Vedtak =====
    console.log('\n🎯 Step 7: Submitting vedtak...');
    await vedtak.fyllInnAlleTekstfelt('fritekst', 'begrunnelse', 'trygdeavgift');
    await vedtak.klikkFattVedtak();
    console.log('✅ Vedtak submitted successfully');

    console.log('\n🎉 Complete workflow finished successfully!');
  });

  /**
   * Simplified version using convenience methods where available
   */
  test('should complete workflow using convenience methods', async ({ page }) => {
    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new BehandlingPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);

    console.log('🎯 Starting simplified workflow...');

    // Step 1: Create case with convenience method
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak('30056928150');

    // Step 2: Navigate to case and edit date
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    await behandling.endreDatoMedDatovelger('2024', 'fredag 1');

    // Step 3: Fill Medlemskap
    await medlemskap.velgPeriode('01.11.2024', '14.11.2024');
    await medlemskap.velgFlereLandIkkeKjentHvilke();
    await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
    await medlemskap.klikkBekreftOgFortsett();

    // Step 4: Arbeidsforhold
    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    // Step 5: Lovvalg
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmål(['Har søker vært medlem i minst', 'Har søker nær tilknytning til']);
    await lovvalg.klikkBekreftOgFortsettMedVent();
    await lovvalg.klikkBekreftOgFortsettMedVent();

    // Step 6: Trygdeavgift
    await behandling.gåTilTrygdeavgift();
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(true);
    await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');
    await trygdeavgift.klikkLeggTilInntekt();
    await trygdeavgift.velgInntektskildeForIndeks(1, 'NÆRINGSINNTEKT_FRA_NORGE');
    await trygdeavgift.fyllInnBruttoinntektForIndeks(1, '100000');
    await trygdeavgift.klikkBekreftOgFortsett();

    // Step 7: Vedtak
    await vedtak.fattVedtak('fritekst', 'begrunnelse', 'trygdeavgift');

    console.log('✅ Simplified workflow completed');
  });
});
