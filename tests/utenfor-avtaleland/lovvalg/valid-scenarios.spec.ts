import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../../pages/behandling/medlemskap.page';
import { ArbeidsforholdPage } from '../../pages/behandling/arbeidsforhold.page';
import { LovvalgPage } from '../../pages/behandling/lovvalg.page';
import { USER_ID_VALID } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { Page } from '@playwright/test';

/**
 * Helper function to set up behandling to Lovvalg page
 * Creates a new case, fills Medlemskap and Arbeidsforhold, navigates to Lovvalg
 *
 * @param page - Playwright Page object
 * @returns LovvalgPage instance ready for testing
 */
async function setupBehandlingToLovvalg(page: Page): Promise<LovvalgPage> {
  const auth = new AuthHelper(page);
  await auth.login();

  const hovedside = new HovedsidePage(page);
  const opprettSak = new OpprettNySakPage(page);
  const medlemskap = new MedlemskapPage(page);
  const arbeidsforhold = new ArbeidsforholdPage(page);
  const lovvalg = new LovvalgPage(page);

  // Create case
  console.log('📝 Setting up case...');
  await hovedside.gotoOgOpprettNySak();
  await opprettSak.opprettStandardSak(USER_ID_VALID);
  await opprettSak.assertions.verifiserBehandlingOpprettet();

  // Navigate to behandling
  console.log('📝 Opening behandling...');
  await waitForProcessInstances(page.request, 30);
  await hovedside.goto();
  await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

  // Fill Medlemskap
  console.log('📝 Filling medlemskap...');
  await medlemskap.velgPeriode('01.01.2023', '01.07.2024');
  await medlemskap.velgLand('Afghanistan');
  await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
  await medlemskap.klikkBekreftOgFortsett();

  // Fill Arbeidsforhold
  console.log('📝 Filling arbeidsforhold...');
  await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

  // Now at Lovvalg page (Bestemmelse step)
  console.log('📝 Ready at Lovvalg page');

  return lovvalg;
}

test.describe('Lovvalg - Gyldige scenarioer', () => {
  test('§ 2-8 a (arbeidstaker): Alle Ja-svar skal tillate å gå videre', async ({ page }) => {
    const lovvalg = await setupBehandlingToLovvalg(page);

    console.log('📝 Testing: § 2-8 a with all Ja answers (SHOULD ALLOW PROCEEDING)');

    // Select bestemmelse
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');

    // Answer all three questions with "Ja"
    console.log('📝 Answering question 1: Ja');
    await lovvalg.svarJaPaaFørsteSpørsmål();

    console.log('📝 Answering question 2: Ja');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');

    console.log('📝 Answering question 3: Ja');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');

    // Verify no warnings and button is enabled
    console.log('📝 Verifying no warnings present');
    await lovvalg.assertions.verifiserIngenAdvarsler();

    console.log('📝 Verifying button is enabled');
    await lovvalg.assertions.verifiserBekreftKnappAktiv();

    console.log('✅ Scenario 1 PASSED: Can proceed - no warnings, button enabled');
  });

  test('§ 2-8 b (student): Alle Ja-svar skal tillate å gå videre', async ({ page }) => {
    const lovvalg = await setupBehandlingToLovvalg(page);

    console.log('📝 Testing: § 2-8 b (student) with all Ja answers (SHOULD ALLOW PROCEEDING)');

    // Select bestemmelse
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_B');

    // Answer all four questions with "Ja"
    console.log('📝 Answering question 1: Ja');
    await lovvalg.svarJaPaaFørsteSpørsmål();

    console.log('📝 Answering question 2: Ja');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Er søker student ved universitet');

    console.log('📝 Answering question 3: Ja');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');

    console.log('📝 Answering question 4: Ja');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');

    // Verify no warnings and button is enabled
    console.log('📝 Verifying no warnings present');
    await lovvalg.assertions.verifiserIngenAdvarsler();

    console.log('📝 Verifying button is enabled');
    await lovvalg.assertions.verifiserBekreftKnappAktiv();

    console.log('✅ Scenario 2 PASSED: Can proceed - no warnings, button enabled');
  });

  test('§ 2-8 andre ledd: Alle Ja + Multinasjonalt konsern skal tillate å gå videre', async ({ page }) => {
    const lovvalg = await setupBehandlingToLovvalg(page);

    console.log('📝 Testing: § 2-8 andre ledd with all Ja + first dropdown option (SHOULD ALLOW PROCEEDING)');

    // Select bestemmelse
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_ANDRE_LEDD');

    // Answer all three questions with "Ja"
    console.log('📝 Answering question 1: Ja');
    await lovvalg.svarJaPaaFørsteSpørsmål();

    console.log('📝 Answering question 2: Ja');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');

    console.log('📝 Answering question 3: Ja');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');

    // Select "Særlig grunn" dropdown option
    console.log('📝 Selecting Særlig grunn: Arbeid i mor- eller søsterselskap i multinasjonalt konsern');
    await lovvalg.velgSærligGrunn('Arbeid i mor- eller søsterselskap i multinasjonalt konsern');

    // Verify no warnings and button is enabled
    console.log('📝 Verifying no warnings present');
    await lovvalg.assertions.verifiserIngenAdvarsler();

    console.log('📝 Verifying button is enabled');
    await lovvalg.assertions.verifiserBekreftKnappAktiv();

    console.log('✅ Scenario 3 PASSED: Can proceed - no warnings, button enabled');
  });

  test('§ 2-8 andre ledd: Alle Ja + Annen grunn skal tillate å gå videre', async ({ page }) => {
    const lovvalg = await setupBehandlingToLovvalg(page);

    console.log('📝 Testing: § 2-8 andre ledd with all Ja + last dropdown option (SHOULD ALLOW PROCEEDING)');

    // Select bestemmelse
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_ANDRE_LEDD');

    // Answer all three questions with "Ja"
    console.log('📝 Answering question 1: Ja');
    await lovvalg.svarJaPaaFørsteSpørsmål();

    console.log('📝 Answering question 2: Ja');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');

    console.log('📝 Answering question 3: Ja');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');

    // Select "Særlig grunn" dropdown option - last option
    console.log('📝 Selecting Særlig grunn: Annen grunn (fritekst)');
    await lovvalg.velgSærligGrunn('Annen grunn (fritekst)');

    // Verify no warnings and button is enabled
    console.log('📝 Verifying no warnings present');
    await lovvalg.assertions.verifiserIngenAdvarsler();

    console.log('📝 Verifying button is enabled');
    await lovvalg.assertions.verifiserBekreftKnappAktiv();

    console.log('✅ Scenario 4 PASSED: Can proceed - no warnings, button enabled');
  });
});
