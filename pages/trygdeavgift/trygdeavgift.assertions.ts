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
    // Wait a bit for errors to appear
    await this.page.waitForTimeout(500);

    // Find validation error messages - look for elements with error-related text
    // that are reasonably short (< 500 chars to avoid capturing entire page sections)
    const allErrorLocators = this.page.locator('div, p, span').filter({
      hasText: /kan ikke velges|påkrevd|ugyldig|må|feil|ikke tillatt/i
    });

    const errorCount = await allErrorLocators.count();

    if (errorCount === 0) {
      throw new Error('❌ No validation errors found on page. Expected error containing: ' + expectedErrorText);
    }

    // Collect validation messages (filter out noise like date pickers, long UI sections)
    const foundErrors: string[] = [];
    for (let i = 0; i < errorCount; i++) {
      const text = await allErrorLocators.nth(i).textContent();
      if (text && text.trim().length > 0 && text.trim().length < 500) {
        const trimmed = text.trim();
        // Avoid duplicates
        if (!foundErrors.includes(trimmed)) {
          foundErrors.push(trimmed);
        }
      }
    }

    // Filter to actual validation error messages by excluding common UI noise
    const isLikelyValidationError = (msg: string): boolean => {
      // Exclude common UI elements that contain "må" or other trigger words
      const uiNoisePatterns = [
        /^Gå til/i,
        /^Måned/i,
        /^Åpne datovelger/i,
        /hjelpetekst/i,
        /^Hvis bruker har flere/i
      ];

      if (uiNoisePatterns.some(pattern => pattern.test(msg))) {
        return false;
      }

      // Must contain actual error keywords and be reasonably short
      const hasErrorKeyword = /kan ikke velges|påkrevd|ugyldig|ikke tillatt|Feil/i.test(msg);
      const isReasonableLength = msg.length > 10 && msg.length < 200;

      return hasErrorKeyword && isReasonableLength;
    };

    const validationErrors = foundErrors.filter(isLikelyValidationError);

    console.log(`📋 Found ${validationErrors.length} validation error(s) on page:`);
    validationErrors.forEach((msg, idx) => {
      console.log(`   ${idx + 1}. "${msg}"`);
    });

    // Now check if expected error is among them
    const expectedPattern = typeof expectedErrorText === 'string' ? expectedErrorText : expectedErrorText.source;
    const matchingError = validationErrors.find(msg => {
      if (typeof expectedErrorText === 'string') {
        return msg.includes(expectedErrorText);
      } else {
        return expectedErrorText.test(msg);
      }
    });

    if (!matchingError) {
      throw new Error(
        `❌ Expected validation error not found!\n\n` +
        `Expected (substring): "${expectedPattern}"\n\n` +
        `Actual validation errors found:\n${validationErrors.map((e, i) => `  ${i + 1}. "${e}"`).join('\n')}\n\n` +
        `(Filtered out ${foundErrors.length - validationErrors.length} UI noise elements)`
      );
    }

    console.log(`✅ Validation error verified: "${matchingError}"`);
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
   * Verify the sats (rate) column shows expected value for a specific row.
   * Uses td.tall_felt to find the sats cell (first .tall_felt in each row).
   *
   * @param radIndex - Row index (0-based)
   * @param forventetSats - Expected text: '*' (minstebeløp), '**' (25%-regel), or numeric like '6.8'
   */
  async verifiserSatsKolonne(radIndex: number, forventetSats: string | RegExp): Promise<void> {
    const table = this.page.locator('table').filter({ has: this.page.getByText('Trygdeperiode') });
    await expect(table).toBeVisible({ timeout: 5000 });

    const row = table.locator('tbody tr').nth(radIndex);
    const satsCell = row.locator('td.tall_felt').first();
    await expect(satsCell).toHaveText(forventetSats);
    console.log(`✅ Sats column row ${radIndex}: ${forventetSats}`);
  }

  /**
   * Verify that a forklaringstekst (footnote) is visible below the table.
   * The component renders these in div.forklaringstekster when beregningstype
   * is MINSTEBELOEP or TJUEFEM_PROSENT_REGEL.
   *
   * @param tekst - Expected text (substring match) or RegExp
   */
  async verifiserForklaringstekst(tekst: string | RegExp): Promise<void> {
    const forklaring = this.page.locator('.forklaringstekster');
    await expect(forklaring).toBeVisible({ timeout: 5000 });
    await expect(forklaring).toContainText(tekst);
    console.log(`✅ Forklaringstekst verified`);
  }

  /**
   * Verify that no forklaringstekster are visible (ordinær beregning).
   * The div.forklaringstekster is only rendered when MINSTEBELOEP or
   * TJUEFEM_PROSENT_REGEL is present.
   */
  async verifiserIngenForklaringstekster(): Promise<void> {
    const forklaring = this.page.locator('.forklaringstekster');
    await expect(forklaring).not.toBeVisible({ timeout: 2000 });
    console.log(`✅ No forklaringstekster visible`);
  }

  /**
   * Verify the Dekning column text for a specific row.
   * Used for 25%-regel with split frivillig: "Helsedel" / "Pensjonsdel"
   *
   * Table columns: Trygdeperiode(0) | Dekning(1) | Inntektskilde(2) | Sats(3) | Avgift per md.(4)
   *
   * @param radIndex - Row index (0-based)
   * @param forventetDekning - Expected text (substring or RegExp)
   */
  async verifiserDekningKolonne(radIndex: number, forventetDekning: string | RegExp): Promise<void> {
    const table = this.page.locator('table').filter({ has: this.page.getByText('Trygdeperiode') });
    await expect(table).toBeVisible({ timeout: 5000 });

    const row = table.locator('tbody tr').nth(radIndex);
    const dekningCell = row.locator('td').nth(1);
    await expect(dekningCell).toContainText(forventetDekning);
    console.log(`✅ Dekning column row ${radIndex}: ${forventetDekning}`);
  }

  /**
   * Verify the Inntektskilde column text for a specific row.
   * Shows "***" when harSammenslåtteInntektskilder=true, otherwise the source name.
   *
   * @param radIndex - Row index (0-based)
   * @param forventetInntektskilde - Expected text (substring or RegExp)
   */
  async verifiserInntektskildeKolonne(radIndex: number, forventetInntektskilde: string | RegExp): Promise<void> {
    const table = this.page.locator('table').filter({ has: this.page.getByText('Trygdeperiode') });
    await expect(table).toBeVisible({ timeout: 5000 });

    const row = table.locator('tbody tr').nth(radIndex);
    const inntektskildeCell = row.locator('td').nth(2);
    await expect(inntektskildeCell).toContainText(forventetInntektskilde);
    console.log(`✅ Inntektskilde column row ${radIndex}: ${forventetInntektskilde}`);
  }

  /**
   * Verify the Avgift per md. column text for a specific row.
   *
   * @param radIndex - Row index (0-based)
   * @param forventetAvgift - Expected text (e.g., "0 nkr", "174 nkr")
   */
  async verifiserAvgiftPerMd(radIndex: number, forventetAvgift: string | RegExp): Promise<void> {
    const table = this.page.locator('table').filter({ has: this.page.getByText('Trygdeperiode') });
    await expect(table).toBeVisible({ timeout: 5000 });

    const row = table.locator('tbody tr').nth(radIndex);
    const avgiftCell = row.locator('td').last();
    await expect(avgiftCell).toContainText(forventetAvgift);
    console.log(`✅ Avgift per md. column row ${radIndex}: ${forventetAvgift}`);
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
