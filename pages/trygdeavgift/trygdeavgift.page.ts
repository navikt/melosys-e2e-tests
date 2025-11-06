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
   * IMPORTANT: This method properly scopes to the "Skattepliktig" group and waits
   * for the radio button to be ready. This prevents the double-click issue.
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

    // Check the radio button
    await radio.check();

    // Verify it was checked
    await expect(radio).toBeChecked({ timeout: 5000 });

    console.log(`✅ Selected Skattepliktig = ${erSkattepliktig ? 'Ja' : 'Nei'}`);
  }

  /**
   * Select Inntektskilde (income source) from dropdown
   * This reveals different fields based on selection
   *
   * @param inntektskilde - Income source code (e.g., 'ARBEIDSINNTEKT', 'INNTEKT_FRA_UTLANDET')
   */
  async velgInntektskilde(inntektskilde: string): Promise<void> {
    // Wait for dropdown to appear after selecting Skattepliktig
    await this.inntektskildeDropdown.waitFor({ state: 'visible', timeout: 5000 });
    await this.inntektskildeDropdown.selectOption(inntektskilde);
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
