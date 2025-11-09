import { Page, expect } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { TrygdeavgiftAssertions } from './trygdeavgift.assertions';

/**
 * Page Object for Trygdeavgift (Tax) calculation page
 *
 * Responsibilities:
 * - Select tax liability status (Skattepliktig)
 * - Select income source (Inntektskilde)
 * - Fill gross income with API wait handling
 * - Navigate to next step
 *
 * Related pages:
 * - LovvalgPage (navigates from)
 * - VedtakPage (navigates to)
 *
 * IMPORTANT: This page has dynamic forms that trigger API calls.
 * Use FormHelper methods for fields that require API waits.
 *
 * @example
 * const trygdeavgift = new TrygdeavgiftPage(page);
 * await trygdeavgift.velgSkattepliktig(false);
 * await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');
 * await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
 * await trygdeavgift.klikkBekreftOgFortsett();
 */
export class TrygdeavgiftPage extends BasePage {
  readonly assertions: TrygdeavgiftAssertions;

  // Locators
  private readonly skattepliktigGroup = this.page.getByRole('group', { name: 'Skattepliktig' });

  private readonly inntektskildeDropdown = this.page.getByLabel('Inntektskilde');

  private readonly bruttoinntektField = this.page.getByRole('textbox', {
    name: 'Bruttoinntekt'
  });

  private readonly bekreftButton = this.page.getByRole('button', {
    name: 'Bekreft og fortsett'
  });

  // Locator for "Betales aga?" radio group (appears for some income sources)
  private readonly betalesAgaGroup = this.page.getByRole('group', {
    name: 'Betales aga.?'
  });

  constructor(page: Page) {
    super(page);
    this.assertions = new TrygdeavgiftAssertions(page);
  }

  /**
   * Wait for Trygdeavgift page to load
   * Verifies the Skattepliktig field is visible
   */
  async ventPåSideLastet(): Promise<void> {
    try {
      await this.skattepliktigGroup.waitFor({ state: 'visible', timeout: 10000 });
      console.log('✅ Trygdeavgift page loaded - Skattepliktig field visible');
    } catch (error) {
      console.error('❌ Failed to reach Trygdeavgift page');
      console.error(`Current URL: ${this.currentUrl()}`);
      await this.screenshot('trygdeavgift-not-loaded');
      throw error;
    }
  }

  /**
   * Select Skattepliktig (tax liable) status
   *
   * IMPORTANT: This method waits for the debounced PUT API call to complete.
   * The form uses a 500ms debounce before making the PUT request to save changes.
   *
   * Timing breakdown:
   * - t=0ms: Click radio button
   * - t=50ms: useEffect triggers 500ms debounce
   * - t=500ms: Debounce fires, PUT /trygdeavgift/beregning starts
   * - t=700-1000ms: PUT completes, value saved to database
   *
   * We wait 1500ms to ensure the entire sequence completes reliably.
   *
   * @param erSkattepliktig - true for "Ja", false for "Nei"
   */
  async velgSkattepliktig(erSkattepliktig: boolean): Promise<void> {
    // Wait for the group to be visible
    await this.skattepliktigGroup.waitFor({ state: 'visible', timeout: 5000 });

    // Get the radio button within the group
    const radio = erSkattepliktig
      ? this.skattepliktigGroup.getByLabel('Ja')
      : this.skattepliktigGroup.getByLabel('Nei');

    // Wait for radio button to be enabled
    await radio.waitFor({ state: 'visible', timeout: 5000 });

    // Set up response listener BEFORE clicking to catch the debounced PUT
    const responsePromise = this.page.waitForResponse(
      response => response.url().includes('/trygdeavgift/beregning') &&
                  response.request().method() === 'PUT' &&
                  response.status() === 200,
      { timeout: 3000 } // 500ms debounce + 2500ms for API
    ).catch(() => null); // Don't fail if no PUT (form might prevent it)

    // Check the radio button (triggers change event)
    await radio.check();

    // Verify it was checked
    await expect(radio).toBeChecked({ timeout: 5000 });

    // CRITICAL: Wait for the debounced PUT request to fire and complete
    // The form has a 500ms debounce, so we need to wait for that plus the API time
    const response = await responsePromise;

    if (response) {
      console.log('✅ Debounced PUT /trygdeavgift/beregning completed - value saved');
    } else {
      // If no PUT detected, wait a bit longer to be safe
      // This can happen if form validation prevents the PUT
      console.log('⚠️  No PUT detected, waiting for debounce period...');
      await this.page.waitForTimeout(1500);
    }

    console.log(`✅ Selected Skattepliktig = ${erSkattepliktig ? 'Ja' : 'Nei'}`);
  }

  /**
   * Select Inntektskilde (income source) from dropdown
   * This reveals different fields based on selection
   *
   * @param inntektskilde - Income source label (e.g., 'Arbeidsinntekt', 'Pensjon')
   *                        or legacy code (e.g., 'ARBEIDSINNTEKT', 'PENSJON')
   *
   * Available options (actual dropdown labels):
   * - 'Arbeidsinntekt' (code: ARBEIDSINNTEKT)
   * - 'Næringsinntekt' (code: NÆRINGSINNTEKT)
   * - 'Inntekt fra utlandet' (code: INNTEKT_FRA_UTLANDET)
   * - 'Ansatt i FN' (code: FN_SKATTEFRITAK)
   * - 'Misjonær' (code: MISJONÆR)
   * - 'Pensjon' (code: PENSJON)
   * - 'Pensjon kildeskatt' (code: PENSJON_KILDESKATT)
   */
  async velgInntektskilde(inntektskilde: string): Promise<void> {
    // Map both legacy codes AND old full display text to actual dropdown labels
    // Note: Dropdown labels are simpler than full display text used in old tests
    const labelMapping: { [key: string]: string } = {
      // Legacy codes (recommended format)
      'ARBEIDSINNTEKT': 'Arbeidsinntekt',
      'NÆRINGSINNTEKT': 'Næringsinntekt',
      'INNTEKT_FRA_UTLANDET': 'Inntekt fra utlandet',
      'FN_SKATTEFRITAK': 'Ansatt i FN',
      'MISJONÆR': 'Misjonær',
      'PENSJON': 'Pensjon',
      'PENSJON_KILDESKATT': 'Pensjon kildeskatt',
      // Old full display text (backward compatibility)
      'Arbeidsinntekt fra Norge': 'Arbeidsinntekt',
      'Næringsinntekt fra Norge': 'Næringsinntekt',
      'Ansatt i FN med skattefritak': 'Ansatt i FN',
      'Misjonær som skal arbeide i utlandet i minst to år': 'Misjonær',
      'Pensjon/uføretrygd': 'Pensjon',
      'Pensjon/uføretrygd det betales kildeskatt av': 'Pensjon kildeskatt'
    };

    // Use mapped label if exists, otherwise use input as-is (might be actual label)
    const label = labelMapping[inntektskilde] || inntektskilde;

    // Wait for dropdown to appear and be enabled after selecting Skattepliktig
    // The dropdown might be visible but disabled while loading options
    await this.inntektskildeDropdown.waitFor({ state: 'visible', timeout: 5000 });
    await expect(this.inntektskildeDropdown).toBeEnabled({ timeout: 10000 });

    // CRITICAL: Wait for options to be populated in the dropdown
    // After selecting Skattepliktig, the options are loaded dynamically
    // We need to poll until the dropdown has options (not just enabled)
    await this.page.waitForFunction(
      (selector) => {
        const dropdown = document.querySelector(selector) as HTMLSelectElement;
        return dropdown && dropdown.options.length > 1; // More than just placeholder
      },
      'select[name="inntektskilder[0].kildetype"]',
      { timeout: 10000 }
    );

    // Get available options to determine which label format to use
    const availableLabels = await this.page.evaluate(() => {
      const dropdown = document.querySelector('select[name="inntektskilder[0].kildetype"]') as HTMLSelectElement;
      if (!dropdown) return [];
      return Array.from(dropdown.options).map(opt => opt.text || opt.label || opt.value).filter(v => v);
    });

    // Try to find a matching option in the dropdown
    // The dropdown uses different label formats depending on Skattepliktig value:
    // - Skattepliktig = Ja: Full text like "Arbeidsinntekt fra Norge"
    // - Skattepliktig = Nei: Short text like "Arbeidsinntekt"
    let labelToSelect = label;

    if (!availableLabels.includes(label)) {
      // Try ALL keys that map to this label value
      const possibleLabels = Object.entries(labelMapping)
        .filter(([key, val]) => val === label)
        .map(([key]) => key);

      // Find the first one that exists in the dropdown
      for (const possibleLabel of possibleLabels) {
        if (availableLabels.includes(possibleLabel)) {
          labelToSelect = possibleLabel;
          break;
        }
      }
    }

    await this.inntektskildeDropdown.selectOption({ label: labelToSelect });
    console.log(`✅ Selected Inntektskilde = ${labelToSelect}`);
  }

  /**
   * Select "Betales aga?" (AGA payment) option
   * This field appears for certain income sources like INNTEKT_FRA_UTLANDET
   *
   * @param betalesAga - true for "Ja", false for "Nei"
   */
  async velgBetalesAga(betalesAga: boolean): Promise<void> {
    // Wait for the group to appear (it may not be visible for all income sources)
    await this.betalesAgaGroup.waitFor({ state: 'visible', timeout: 5000 });

    if (betalesAga) {
      await this.betalesAgaGroup.getByLabel('Ja').check();
    } else {
      await this.betalesAgaGroup.getByLabel('Nei').check();
    }
    console.log(`✅ Selected Betales aga = ${betalesAga ? 'Ja' : 'Nei'}`);
  }

  /**
   * Fill Bruttoinntekt field WITHOUT API wait
   * Use this if you don't need to wait for calculation API
   *
   * @param beløp - Amount as string (e.g., '100000')
   */
  async fyllInnBruttoinntekt(beløp: string): Promise<void> {
    await this.bruttoinntektField.waitFor({ state: 'visible', timeout: 5000 });
    await this.bruttoinntektField.fill(beløp);
  }

  /**
   * Fill Bruttoinntekt field WITH API wait (RECOMMENDED)
   * This waits for the /trygdeavgift/beregning API call to complete
   *
   * @param beløp - Amount as string (e.g., '100000')
   *
   * IMPORTANT: This is the most reliable way to handle this field.
   * The field triggers an API call on blur that calculates trygdeavgift.
   */
  async fyllInnBruttoinntektMedApiVent(beløp: string): Promise<void> {
    // Wait for field to be visible
    await this.bruttoinntektField.waitFor({ state: 'visible', timeout: 5000 });

    // CRITICAL: Create response promise BEFORE triggering action
    // This prevents race conditions where API response comes before we start listening
    const responsePromise = this.page.waitForResponse(
      response => response.url().includes('/trygdeavgift/beregning') && response.status() === 200,
      { timeout: 30000 }
    );

    // Trigger the action that causes the API call
    await this.bruttoinntektField.fill(beløp);
    await this.bruttoinntektField.press('Tab'); // Trigger blur event

    // Wait for API response
    await responsePromise;
    console.log('✅ Trygdeavgift calculation API completed');

    // Wait for button to be enabled (validation completes after API)
    await expect(this.bekreftButton).toBeEnabled({ timeout: 15000 });
    console.log('✅ Bekreft og fortsett button is enabled');
  }

  /**
   * Click "Bekreft og fortsett" button
   */
  async klikkBekreftOgFortsett(): Promise<void> {
    await this.bekreftButton.click();
  }

  /**
   * Complete entire Trygdeavgift section with common values
   * Convenience method for standard workflow
   *
   * @param erSkattepliktig - Tax liable status (default: false)
   * @param inntektskilde - Income source (default: 'ARBEIDSINNTEKT')
   * @param bruttoinntekt - Gross income (default: '100000')
   */
  async fyllUtTrygdeavgift(
    erSkattepliktig: boolean = false,
    inntektskilde: string = 'ARBEIDSINNTEKT',
    bruttoinntekt: string = '100000'
  ): Promise<void> {
    await this.ventPåSideLastet();
    await this.velgSkattepliktig(erSkattepliktig);
    await this.velgInntektskilde(inntektskilde);
    await this.fyllInnBruttoinntektMedApiVent(bruttoinntekt);
    await this.klikkBekreftOgFortsett();
  }
}
