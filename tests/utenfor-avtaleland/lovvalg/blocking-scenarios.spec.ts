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

test.describe('Lovvalg - Blocking Scenarios (§ 2-8 a arbeidstaker)', () => {
  test('§ 2-8 a: Question 1 = Nei should block progression', async ({ page }) => {
    const lovvalg = await setupBehandlingToLovvalg(page);

    console.log('📝 Testing: § 2-8 a with Nei on first question (SHOULD BLOCK)');

    // Select bestemmelse
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');

    // Answer first question with "Nei"
    console.log('📝 Answering question 1: Nei');
    await lovvalg.svarNeiPaaFørsteSpørsmål();

    // Should show warning and disable button
    console.log('📝 Verifying warning message appears');
    await lovvalg.assertions.verifiserAdvarselsmelding('Du kan ikke gå videre');

    console.log('📝 Verifying alternative action messages');
    await lovvalg.assertions.verifiserAlternativeHandlinger();

    console.log('📝 Verifying button is disabled');
    await lovvalg.assertions.verifiserBekreftKnappDeaktivert();

    console.log('✅ Scenario 1 PASSED: Correctly blocked - warning shown, button disabled');
  });

  test('BLOCKED: Question 1 = Ja, Question 2 = Nei - Blocks progression', async ({ page }) => {
    const lovvalg = await setupBehandlingToLovvalg(page);

    console.log('📝 Testing: § 2-8 a with Ja on Q1, Nei on Q2 (SHOULD BLOCK)');

    // Select bestemmelse
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');

    // Answer first question with "Ja"
    console.log('📝 Answering question 1: Ja');
    await lovvalg.svarJaPaaFørsteSpørsmål();

    // Answer second question with "Nei"
    console.log('📝 Answering question 2: Nei');
    await lovvalg.svarNeiPaaSpørsmålIGruppe('Har søker vært medlem i minst');

    // Should show warning and disable button
    console.log('📝 Verifying warning message appears');
    await lovvalg.assertions.verifiserAdvarselsmelding('Du kan ikke gå videre');

    console.log('📝 Verifying alternative action messages');
    await lovvalg.assertions.verifiserAlternativeHandlinger();

    console.log('📝 Verifying button is disabled');
    await lovvalg.assertions.verifiserBekreftKnappDeaktivert();

    console.log('✅ Scenario 2 PASSED: Correctly blocked - warning shown, button disabled');
  });

  test('BLOCKED: Questions 1 & 2 = Ja, Question 3 = Nei - Blocks progression', async ({ page }) => {
    const lovvalg = await setupBehandlingToLovvalg(page);

    console.log('📝 Testing: § 2-8 a with Ja on Q1 & Q2, Nei on Q3 (SHOULD BLOCK)');

    // Select bestemmelse
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');

    // Answer first question with "Ja"
    console.log('📝 Answering question 1: Ja');
    await lovvalg.svarJaPaaFørsteSpørsmål();

    // Answer second question with "Ja"
    console.log('📝 Answering question 2: Ja');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');

    // Answer third question with "Nei"
    console.log('📝 Answering question 3: Nei');
    await lovvalg.svarNeiPaaSpørsmålIGruppe('Har søker nær tilknytning til');

    // Should show warning and disable button
    console.log('📝 Verifying warning message appears');
    await lovvalg.assertions.verifiserAdvarselsmelding('Du kan ikke gå videre');

    console.log('📝 Verifying alternative action messages');
    await lovvalg.assertions.verifiserAlternativeHandlinger();

    console.log('📝 Verifying button is disabled');
    await lovvalg.assertions.verifiserBekreftKnappDeaktivert();

    console.log('✅ Scenario 3 PASSED: Correctly blocked - warning shown, button disabled');
  });
});

test.describe('Lovvalg Blocking Scenarios - § 2-8 første ledd bokstav b (student)', () => {
  test('BLOCKED: Question 1 = Nei - Blocks progression', async ({ page }) => {
    const lovvalg = await setupBehandlingToLovvalg(page);

    console.log('📝 Testing: § 2-8 b with Nei on first question (SHOULD BLOCK)');

    // Select bestemmelse
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_B');

    // Answer first question with "Nei"
    console.log('📝 Answering question 1: Nei');
    await lovvalg.svarNeiPaaFørsteSpørsmål();

    // Should show warning and disable button
    console.log('📝 Verifying warning message appears');
    await lovvalg.assertions.verifiserAdvarselsmelding('Du kan ikke gå videre');

    console.log('📝 Verifying alternative action messages');
    await lovvalg.assertions.verifiserAlternativeHandlinger();

    console.log('📝 Verifying button is disabled');
    await lovvalg.assertions.verifiserBekreftKnappDeaktivert();

    console.log('✅ Scenario 1 PASSED: Correctly blocked - warning shown, button disabled');
  });

  test('BLOCKED: Question 1 = Ja, Question 2 = Nei - Blocks progression', async ({ page }) => {
    const lovvalg = await setupBehandlingToLovvalg(page);

    console.log('📝 Testing: § 2-8 b with Ja on Q1, Nei on Q2 (SHOULD BLOCK)');

    // Select bestemmelse
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_B');

    // Answer first question with "Ja"
    console.log('📝 Answering question 1: Ja');
    await lovvalg.svarJaPaaFørsteSpørsmål();

    // Answer second question with "Nei"
    console.log('📝 Answering question 2: Nei');
    await lovvalg.svarNeiPaaSpørsmålIGruppe('Er søker student ved universitet');

    // Should show warning and disable button
    console.log('📝 Verifying warning message appears');
    await lovvalg.assertions.verifiserAdvarselsmelding('Du kan ikke gå videre');

    console.log('📝 Verifying alternative action messages');
    await lovvalg.assertions.verifiserAlternativeHandlinger();

    console.log('📝 Verifying button is disabled');
    await lovvalg.assertions.verifiserBekreftKnappDeaktivert();

    console.log('✅ Scenario 2 PASSED: Correctly blocked - warning shown, button disabled');
  });

  test('BLOCKED: Questions 1 & 2 = Ja, Question 3 = Nei - Blocks progression', async ({ page }) => {
    const lovvalg = await setupBehandlingToLovvalg(page);

    console.log('📝 Testing: § 2-8 b with Ja on Q1 & Q2, Nei on Q3 (SHOULD BLOCK)');

    // Select bestemmelse
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_B');

    // Answer first question with "Ja"
    console.log('📝 Answering question 1: Ja');
    await lovvalg.svarJaPaaFørsteSpørsmål();

    // Answer second question with "Ja"
    console.log('📝 Answering question 2: Ja');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Er søker student ved universitet');

    // Answer third question with "Nei"
    console.log('📝 Answering question 3: Nei');
    await lovvalg.svarNeiPaaSpørsmålIGruppe('Har søker vært medlem i minst');

    // Should show warning and disable button
    console.log('📝 Verifying warning message appears');
    await lovvalg.assertions.verifiserAdvarselsmelding('Du kan ikke gå videre');

    console.log('📝 Verifying alternative action messages');
    await lovvalg.assertions.verifiserAlternativeHandlinger();

    console.log('📝 Verifying button is disabled');
    await lovvalg.assertions.verifiserBekreftKnappDeaktivert();

    console.log('✅ Scenario 3 PASSED: Correctly blocked - warning shown, button disabled');
  });

  test('BLOCKED: Questions 1, 2 & 3 = Ja, Question 4 = Nei - Blocks progression', async ({ page }) => {
    const lovvalg = await setupBehandlingToLovvalg(page);

    console.log('📝 Testing: § 2-8 b with Ja on Q1, Q2 & Q3, Nei on Q4 (SHOULD BLOCK)');

    // Select bestemmelse
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_B');

    // Answer first question with "Ja"
    console.log('📝 Answering question 1: Ja');
    await lovvalg.svarJaPaaFørsteSpørsmål();

    // Answer second question with "Ja"
    console.log('📝 Answering question 2: Ja');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Er søker student ved universitet');

    // Answer third question with "Ja"
    console.log('📝 Answering question 3: Ja');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');

    // Answer fourth question with "Nei"
    console.log('📝 Answering question 4: Nei');
    await lovvalg.svarNeiPaaSpørsmålIGruppe('Har søker nær tilknytning til');

    // Should show warning and disable button
    console.log('📝 Verifying warning message appears');
    await lovvalg.assertions.verifiserAdvarselsmelding('Du kan ikke gå videre');

    console.log('📝 Verifying alternative action messages');
    await lovvalg.assertions.verifiserAlternativeHandlinger();

    console.log('📝 Verifying button is disabled');
    await lovvalg.assertions.verifiserBekreftKnappDeaktivert();

    console.log('✅ Scenario 4 PASSED: Correctly blocked - warning shown, button disabled');
  });
});

test.describe('Lovvalg Blocking Scenarios - § 2-8 andre ledd (særlig grunn)', () => {
  test('BLOCKED: Question 1 = Nei - Blocks progression', async ({ page }) => {
    const lovvalg = await setupBehandlingToLovvalg(page);

    console.log('📝 Testing: § 2-8 andre ledd with Nei on first question (SHOULD BLOCK)');

    // Select bestemmelse
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_ANDRE_LEDD');

    // Answer first question with "Nei"
    console.log('📝 Answering question 1: Nei');
    await lovvalg.svarNeiPaaFørsteSpørsmål();

    // Should show warning and disable button
    console.log('📝 Verifying warning message appears');
    await lovvalg.assertions.verifiserAdvarselsmelding('Du kan ikke gå videre');

    console.log('📝 Verifying alternative action messages');
    await lovvalg.assertions.verifiserAlternativeHandlinger();

    console.log('📝 Verifying button is disabled');
    await lovvalg.assertions.verifiserBekreftKnappDeaktivert();

    console.log('✅ Scenario 1 PASSED: Correctly blocked - warning shown, button disabled');
  });

  test('BLOCKED: Question 1 = Ja, Question 2 = Nei - Blocks progression', async ({ page }) => {
    const lovvalg = await setupBehandlingToLovvalg(page);

    console.log('📝 Testing: § 2-8 andre ledd with Ja on Q1, Nei on Q2 (SHOULD BLOCK)');

    // Select bestemmelse
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_ANDRE_LEDD');

    // Answer first question with "Ja"
    console.log('📝 Answering question 1: Ja');
    await lovvalg.svarJaPaaFørsteSpørsmål();

    // Answer second question with "Nei"
    console.log('📝 Answering question 2: Nei');
    await lovvalg.svarNeiPaaSpørsmålIGruppe('Har søker vært medlem i minst');

    // Should show warning and disable button
    console.log('📝 Verifying warning message appears');
    await lovvalg.assertions.verifiserAdvarselsmelding('Du kan ikke gå videre');

    console.log('📝 Verifying alternative action messages');
    await lovvalg.assertions.verifiserAlternativeHandlinger();

    console.log('📝 Verifying button is disabled');
    await lovvalg.assertions.verifiserBekreftKnappDeaktivert();

    console.log('✅ Scenario 2 PASSED: Correctly blocked - warning shown, button disabled');
  });

  test('BLOCKED: Questions 1 & 2 = Ja, Question 3 = Nei - Blocks progression', async ({ page }) => {
    const lovvalg = await setupBehandlingToLovvalg(page);

    console.log('📝 Testing: § 2-8 andre ledd with Ja on Q1 & Q2, Nei on Q3 (SHOULD BLOCK)');

    // Select bestemmelse
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_ANDRE_LEDD');

    // Answer first question with "Ja"
    console.log('📝 Answering question 1: Ja');
    await lovvalg.svarJaPaaFørsteSpørsmål();

    // Answer second question with "Ja"
    console.log('📝 Answering question 2: Ja');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');

    // Answer third question with "Nei"
    console.log('📝 Answering question 3: Nei');
    await lovvalg.svarNeiPaaSpørsmålIGruppe('Har søker nær tilknytning til');

    // Should show warning and disable button
    console.log('📝 Verifying warning message appears');
    await lovvalg.assertions.verifiserAdvarselsmelding('Du kan ikke gå videre');

    console.log('📝 Verifying alternative action messages');
    await lovvalg.assertions.verifiserAlternativeHandlinger();

    console.log('📝 Verifying button is disabled');
    await lovvalg.assertions.verifiserBekreftKnappDeaktivert();

    console.log('✅ Scenario 3 PASSED: Correctly blocked - warning shown, button disabled');
  });
});
