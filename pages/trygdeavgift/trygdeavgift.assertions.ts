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

  /**
   * Verify that a validation error is displayed
   * @param expectedErrorText - Part of the error message to match (can be substring or regex)
   */
  async verifiserValideringsfeil(expectedErrorText: string | RegExp): Promise<void> {
    // Look for text containing the error message
    // The error message appears somewhere on the page in a red alert box
    if (typeof expectedErrorText === 'string') {
      const errorLocator = this.page.getByText(expectedErrorText, { exact: false });
      await expect(errorLocator).toBeVisible({ timeout: 5000 });
      const actualErrorText = await errorLocator.textContent();
      console.log(`✅ Validation error displayed: ${actualErrorText}`);
    } else {
      // For regex patterns, use locator with filter
      const errorLocator = this.page.locator('body').getByText(expectedErrorText);
      await expect(errorLocator).toBeVisible({ timeout: 5000 });
      const actualErrorText = await errorLocator.textContent();
      console.log(`✅ Validation error displayed: ${actualErrorText}`);
    }
  }

  /**
   * Verify that "Bekreft og fortsett" button is disabled due to validation error
   */
  async verifiserBekreftKnappDeaktivert(): Promise<void> {
    const button = this.page.getByRole('button', { name: 'Bekreft og fortsett' });
    await expect(button).toBeDisabled({ timeout: 5000 });
    console.log('✅ "Bekreft og fortsett" button is disabled');
  }

  /**
   * Verify calculated tax values in the table
   * @param expectedValues - Array of expected tax calculations for each period
   *
   * @example
   * await trygdeavgift.assertions.verifiserBeregnedeTrygdeavgiftVerdier([
   *   { sats: '9.2', avgiftPerMnd: '9200 nkr' },
   *   { sats: '9.2', avgiftPerMnd: '9200 nkr' }
   * ]);
   */
  async verifiserBeregnedeTrygdeavgiftVerdier(expectedValues: Array<{ sats: string; avgiftPerMnd: string }>): Promise<void> {
    // Wait for the table to be visible
    const table = this.page.locator('table').filter({ has: this.page.getByText('Trygdeperiode') });
    await expect(table).toBeVisible({ timeout: 5000 });

    // Get all rows in the table body (skip header)
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();

    expect(rowCount).toBe(expectedValues.length);
    console.log(`✅ Found ${rowCount} tax calculation rows`);

    // Verify each row
    for (let i = 0; i < expectedValues.length; i++) {
      const row = rows.nth(i);
      const expected = expectedValues[i];

      // Get cells by column position
      const satsCell = row.locator('td').nth(3); // "Sats" column (4th column, index 3)
      const avgiftCell = row.locator('td').nth(4); // "Avgift per md." column (5th column, index 4)

      // Verify values
      await expect(satsCell).toHaveText(expected.sats);
      await expect(avgiftCell).toHaveText(expected.avgiftPerMnd);

      console.log(`✅ Row ${i + 1}: Sats=${expected.sats}%, Avgift=${expected.avgiftPerMnd}`);
    }
  }
}
