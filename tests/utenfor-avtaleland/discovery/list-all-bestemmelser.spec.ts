import { test } from '../../../fixtures';
import { AuthHelper } from '../../../helpers/auth-helper';
import { HovedsidePage } from '../../../pages/hovedside.page';
import { OpprettNySakPage } from '../../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../../../pages/behandling/medlemskap.page';
import { ArbeidsforholdPage } from '../../../pages/behandling/arbeidsforhold.page';
import { LovvalgPage } from '../../../pages/behandling/lovvalg.page';
import { USER_ID_VALID } from '../../../pages/shared/constants';
import { waitForProcessInstances } from '../../../helpers/api-helper';
import { Page } from '@playwright/test';

/**
 * Discovery script to systematically test all bestemmelse options
 * This will help us understand which questions appear for each bestemmelse
 * and which combinations block progression
 */

async function setupBehandlingToLovvalg(page: Page): Promise<LovvalgPage> {
  const auth = new AuthHelper(page);
  await auth.login();

  const hovedside = new HovedsidePage(page);
  const opprettSak = new OpprettNySakPage(page);
  const medlemskap = new MedlemskapPage(page);
  const arbeidsforhold = new ArbeidsforholdPage(page);
  const lovvalg = new LovvalgPage(page);

  await hovedside.gotoOgOpprettNySak();
  await opprettSak.opprettStandardSak(USER_ID_VALID);
  await opprettSak.assertions.verifiserBehandlingOpprettet();

  await waitForProcessInstances(page.request, 30);
  await hovedside.goto();
  await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

  await medlemskap.velgPeriode('01.01.2023', '01.07.2024');
  await medlemskap.velgLand('Afghanistan');
  await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
  await medlemskap.klikkBekreftOgFortsett();

  await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

  return lovvalg;
}

test.describe('Bestemmelse Discovery - All Options', () => {
  test('Discover all bestemmelse options and their questions', async ({ page }) => {
    const lovvalg = await setupBehandlingToLovvalg(page);

    // Get all bestemmelse options
    const bestemmelseDropdown = page.getByLabel('Hvilken bestemmelse skal sø');
    await bestemmelseDropdown.click();

    const options = await bestemmelseDropdown.locator('option').allTextContents();
    console.log('\n📋 DISCOVERED BESTEMMELSE OPTIONS:');
    console.log('==================================');

    const bestemmelser: Array<{text: string; value: string}> = [];
    const optionElements = await bestemmelseDropdown.locator('option').all();

    for (const option of optionElements) {
      const text = await option.textContent();
      const value = await option.getAttribute('value');
      if (text && value && text !== 'Velg...') {
        bestemmelser.push({ text: text.trim(), value });
        console.log(`${bestemmelser.length}. ${text.trim()} (${value})`);
      }
    }

    console.log(`\n✅ Total bestemmelser found: ${bestemmelser.length}`);
    console.log('\n📝 To test each bestemmelse, we would need to:');
    console.log('1. Select the bestemmelse');
    console.log('2. Identify all questions that appear');
    console.log('3. Test all Ja/Nei combinations');
    console.log('4. Document blocking vs. valid scenarios');

    // For demonstration, let's test a few key ones
    console.log('\n🎯 PRIORITY BESTEMMELSER TO TEST:');
    console.log('=================================');
    const priorityBestemmelser = bestemmelser.filter(b =>
      b.text.includes('§ 2-8') ||
      b.text.includes('§ 2-1') ||
      b.text.includes('§ 2-2') ||
      b.text.includes('§ 2-7')
    );

    priorityBestemmelser.forEach((b, idx) => {
      console.log(`${idx + 1}. ${b.text} (${b.value})`);
    });
  });
});
