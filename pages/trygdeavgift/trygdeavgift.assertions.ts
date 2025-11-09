import { Page, expect } from '@playwright/test';
import { assertErrors } from '../../utils/assertions';

/**
 * Assertion methods for TrygdeavgiftPage
 *
 * Responsibilities:
 * - Verify page is loaded correctly
 * - Verify form fields are visible
 * - Verify no errors on the page
 * - Verify button states
 */
export class TrygdeavgiftAssertions {
  constructor(readonly page: Page) {}

  /**
   * Verify Trygdeavgift page has loaded
   * Checks that the Skattepliktig field is visible
   */
  async verifiserSideLastet(): Promise<void> {
    const skattepliktigField = this.page.getByRole('radio', { name: 'Nei' }).first();
    await expect(skattepliktigField).toBeVisible({ timeout: 10000 });
  }

  /**
   * Verify Inntektskilde dropdown is visible
   */
  async verifiserInntektskildeDropdown(): Promise<void> {
    const dropdown = this.page.getByLabel('Inntektskilde');
    await expect(dropdown).toBeVisible();
  }

  /**
   * Verify Bruttoinntekt field is visible
   */
  async verifiserBruttoinntektFelt(): Promise<void> {
    const field = this.page.getByRole('textbox', { name: 'Bruttoinntekt' });
    await expect(field).toBeVisible();
  }

  /**
   * Verify no errors are present on the form
   */
  async verifiserIngenFeil(): Promise<void> {
    await assertErrors(this.page, []);
  }

  /**
   * Verify "Bekreft og fortsett" button is enabled
   * This indicates the tax calculation is complete
   */
  async verifiserBekreftKnappAktiv(): Promise<void> {
    const button = this.page.getByRole('button', { name: 'Bekreft og fortsett' });
    await expect(button).toBeEnabled({ timeout: 15000 });
  }

  /**
   * Verify that tax calculation table is displayed
   * This appears when tax is calculated successfully
   */
  async verifiserTrygdeavgiftBeregnet(): Promise<void> {
    const heading = this.page.getByRole('heading', { name: 'Foreløpig beregnet trygdeavgift' });
    await expect(heading).toBeVisible({ timeout: 5000 });

    // Verify the table with tax calculation is present
    const table = this.page.locator('table').filter({ has: this.page.getByText('Trygdeperiode') });
    await expect(table).toBeVisible();

    console.log('✅ Tax calculation table is displayed');
  }

  /**
   * Verify that "no tax" info message is displayed
   * This appears when tax should not be paid to NAV
   */
  async verifiserIngenTrygdeavgift(): Promise<void> {
    const infoMessage = this.page.locator('text=Trygdeavgift skal ikke betales til NAV');
    await expect(infoMessage).toBeVisible({ timeout: 5000 });
    console.log('✅ "No tax to NAV" info message is displayed');
  }

  /**
   * Verify that "Betales aga?" field is disabled
   * This happens for Norwegian income sources where AGA is automatically paid
   */
  async verifiserBetalesAgaDisabled(): Promise<void> {
    const betalesAgaGroup = this.page.getByRole('group', { name: 'Betales aga.?' });
    await expect(betalesAgaGroup).toBeVisible({ timeout: 5000 });

    // Check that both radio buttons are disabled
    const jaRadio = betalesAgaGroup.getByLabel('Ja');
    const neiRadio = betalesAgaGroup.getByLabel('Nei');

    await expect(jaRadio).toBeDisabled();
    await expect(neiRadio).toBeDisabled();

    console.log('✅ "Betales aga?" field is disabled (both options greyed out)');
  }

  /**
   * Verify that Bruttoinntekt field shows "Ikke relevant"
   * This appears when gross income is not needed for tax calculation
   */
  async verifiserBruttoinntektIkkeRelevant(): Promise<void> {
    const ikkeRelevantText = this.page.locator('text=Ikke relevant').first();
    await expect(ikkeRelevantText).toBeVisible({ timeout: 5000 });
    console.log('✅ Bruttoinntekt shows "Ikke relevant"');
  }

  /**
   * Verify tax rate in calculation table
   * @param expectedRate - Expected tax rate as string (e.g., "37.5", "28.3")
   */
  async verifiserTrygdeavgiftSats(expectedRate: string): Promise<void> {
    const rateCell = this.page.locator('td', { hasText: expectedRate }).first();
    await expect(rateCell).toBeVisible({ timeout: 5000 });
    console.log(`✅ Tax rate ${expectedRate}% found in calculation table`);
  }
}
