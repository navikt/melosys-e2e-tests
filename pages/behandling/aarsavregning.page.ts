import { Page, expect } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { AarsavregningAssertions } from './aarsavregning.assertions';

/**
 * Page Object for Årsavregning behandling section
 *
 * Responsibilities:
 * - Select year (aarVelger)
 * - Answer Nei/Ja for relevant question
 * - Select bestemmelse (regulation)
 * - Select fra og med / til og med period using date pickers
 * - Select skattepliktig status
 * - Select inntektskilde
 * - Fill bruttoinntekt with API wait
 * - Click Bekreft og fortsett
 *
 * Related pages:
 * - BehandlingPage (navigates from after clicking behandling link)
 * - VedtakPage (navigates to after Bekreft og fortsett)
 *
 * IMPORTANT: This page has dynamic forms that trigger API calls.
 * Use fyllInnBruttoinntektMedApiVent for the bruttoinntekt field.
 *
 * @example
 * const aarsavregning = new AarsavregningPage(page);
 * await aarsavregning.velgÅr('2025');
 * await aarsavregning.velgBestemmelse('FTRL_KAP2_2_1');
 * await aarsavregning.velgFraOgMedPeriode('06.01.2025');
 * await aarsavregning.velgTilOgMedPeriode('12.01.2025');
 * await aarsavregning.velgSkattepliktig(false);
 * await aarsavregning.velgInntektskilde('ARBEIDSINNTEKT');
 * await aarsavregning.fyllInnBruttoinntektMedApiVent('3213');
 * await aarsavregning.klikkBekreftOgFortsett();
 */
export class AarsavregningPage extends BasePage {
  readonly assertions: AarsavregningAssertions;

  // Locators
  private readonly aarVelger = this.page.locator('#aarVelger');

  private readonly bestemmelseDropdown = this.page.getByLabel('Bestemmelse');

  private readonly fraOgMedDatoField = this.page
    .getByLabel('Fra og med periode')
    .getByRole('textbox');

  private readonly tilOgMedDatoField = this.page
    .getByLabel('Til og med periode')
    .getByRole('textbox');

  private readonly skattepliktigGroup = this.page.getByRole('group', { name: 'Skattepliktig' });

  private readonly inntektskildeDropdown = this.page.getByLabel('Inntektskilde');

  private readonly bruttoinntektField = this.page.getByRole('textbox', { name: 'Bruttoinntekt' });

  private readonly bekreftButton = this.page.getByRole('button', { name: 'Bekreft og fortsett' });

  constructor(page: Page) {
    super(page);
    this.assertions = new AarsavregningAssertions(page);
  }

  /**
   * Wait for Årsavregning page to load
   * Verifies the year selector is visible
   */
  async ventPåSideLastet(): Promise<void> {
    try {
      await this.aarVelger.waitFor({ state: 'visible', timeout: 10000 });
      console.log('✅ Årsavregning page loaded - year selector visible');
    } catch (error) {
      console.error('❌ Failed to reach Årsavregning page');
      console.error(`Current URL: ${this.currentUrl()}`);
      await this.screenshot('aarsavregning-not-loaded');
      throw error;
    }
  }

  /**
   * Select year from the year selector dropdown
   *
   * @param år - Year to select (e.g., '2025', '2024')
   */
  async velgÅr(år: string): Promise<void> {
    await this.aarVelger.waitFor({ state: 'visible', timeout: 5000 });
    await this.aarVelger.selectOption(år);
    console.log(`✅ Selected år = ${år}`);
  }

  /**
   * Answer "Nei" to the first radio question on the page
   * Used for the initial Nei/Ja question in årsavregning
   */
  async svarNei(): Promise<void> {
    const neiRadio = this.page.getByRole('radio', { name: 'Nei' });
    await neiRadio.waitFor({ state: 'visible', timeout: 5000 });
    await neiRadio.check();
    console.log('✅ Answered Nei');
  }

  /**
   * Answer "Ja" to the first radio question on the page
   */
  async svarJa(): Promise<void> {
    const jaRadio = this.page.getByRole('radio', { name: 'Ja' });
    await jaRadio.waitFor({ state: 'visible', timeout: 5000 });
    await jaRadio.check();
    console.log('✅ Answered Ja');
  }

  /**
   * Select bestemmelse (regulation) from dropdown
   *
   * @param bestemmelse - Regulation code (e.g., 'FTRL_KAP2_2_1')
   */
  async velgBestemmelse(bestemmelse: string): Promise<void> {
    await this.bestemmelseDropdown.waitFor({ state: 'visible', timeout: 5000 });
    await this.bestemmelseDropdown.selectOption(bestemmelse);
    console.log(`✅ Selected bestemmelse = ${bestemmelse}`);
  }

  /**
   * Fill "Fra og med periode" date field
   *
   * @param dato - Date in format DD.MM.YYYY (e.g., '06.01.2025')
   */
  async velgFraOgMedPeriode(dato: string): Promise<void> {
    await this.fraOgMedDatoField.click();
    await this.fraOgMedDatoField.fill(dato);
    await this.fraOgMedDatoField.press('Enter');
    console.log(`✅ Fylte inn fra og med periode: ${dato}`);
  }

  /**
   * Fill "Til og med periode" date field
   *
   * @param dato - Date in format DD.MM.YYYY (e.g., '12.01.2025')
   */
  async velgTilOgMedPeriode(dato: string): Promise<void> {
    await this.tilOgMedDatoField.click();
    await this.tilOgMedDatoField.fill(dato);
    await this.tilOgMedDatoField.press('Enter');
    console.log(`✅ Fylte inn til og med periode: ${dato}`);
  }

  /**
   * Select Skattepliktig (tax liable) status
   *
   * IMPORTANT: This method waits for the debounced PUT API call to complete.
   * The form uses a 500ms debounce before making the PUT request to save changes.
   *
   * @param erSkattepliktig - true for "Ja", false for "Nei"
   */
  async velgSkattepliktig(erSkattepliktig: boolean): Promise<void> {
    console.log(`📝 velgSkattepliktig: Setting to ${erSkattepliktig ? 'Ja' : 'Nei'}...`);

    await this.skattepliktigGroup.waitFor({ state: 'visible', timeout: 5000 });

    const expectedValue = erSkattepliktig ? 'SKATTEPLIKTIG' : 'IKKE_SKATTEPLIKTIG';

    // Set up response listener BEFORE clicking to catch the debounced PUT
    const responsePromise = this.page.waitForResponse(
      response =>
        response.url().includes('/trygdeavgift/beregning') &&
        response.request().method() === 'PUT' &&
        response.status() === 200,
      { timeout: 3000 }
    ).catch(() => null); // Don't fail if no PUT

    const radioInput = this.skattepliktigGroup.locator(`input[value="${expectedValue}"]`);
    await radioInput.waitFor({ state: 'attached', timeout: 5000 });
    await radioInput.click({ force: true });

    await this.page.waitForTimeout(200);

    const isChecked = await radioInput.isChecked();
    if (!isChecked) {
      const radioLabel = erSkattepliktig ? 'Ja' : 'Nei';
      const labelText = this.skattepliktigGroup.getByText(radioLabel, { exact: true });
      await labelText.click();
      await this.page.waitForTimeout(200);
    }

    await expect(radioInput).toBeChecked({ timeout: 5000 });

    const response = await responsePromise;
    if (response) {
      console.log('✅ Debounced PUT /trygdeavgift/beregning completed - value saved');
    } else {
      console.log('⚠️  No PUT detected, waiting for debounce period...');
      await this.page.waitForTimeout(1500);
    }

    console.log(`✅ Selected Skattepliktig = ${erSkattepliktig ? 'Ja' : 'Nei'}`);
  }

  /**
   * Select Inntektskilde (income source) from dropdown
   *
   * @param inntektskilde - Income source code (e.g., 'ARBEIDSINNTEKT')
   *
   * Available codes:
   * - 'ARBEIDSINNTEKT'
   * - 'NÆRINGSINNTEKT'
   * - 'INNTEKT_FRA_UTLANDET'
   * - 'FN_SKATTEFRITAK'
   * - 'MISJONÆR'
   * - 'PENSJON'
   * - 'PENSJON_KILDESKATT'
   */
  async velgInntektskilde(inntektskilde: string): Promise<void> {
    await this.inntektskildeDropdown.waitFor({ state: 'visible', timeout: 5000 });
    await expect(this.inntektskildeDropdown).toBeEnabled({ timeout: 10000 });

    // Wait for options to populate
    await this.page.waitForFunction(
      (selector) => {
        const dropdown = document.querySelector(selector) as HTMLSelectElement;
        return dropdown && dropdown.options.length > 1;
      },
      'select[name="inntektskilder[0].kildetype"]',
      { timeout: 10000 }
    );

    await this.inntektskildeDropdown.selectOption(inntektskilde);
    console.log(`✅ Selected Inntektskilde = ${inntektskilde}`);
  }

  /**
   * Fill Bruttoinntekt field WITH API wait (RECOMMENDED)
   * This waits for the /trygdeavgift/beregning API call to complete
   *
   * @param beløp - Amount as string (e.g., '3213')
   */
  async fyllInnBruttoinntektMedApiVent(beløp: string): Promise<void> {
    await this.bruttoinntektField.waitFor({ state: 'visible', timeout: 5000 });

    // CRITICAL: Create response promise BEFORE triggering action
    const responsePromise = this.page.waitForResponse(
      response => response.url().includes('/trygdeavgift/beregning') && response.status() === 200,
      { timeout: 30000 }
    );

    await this.bruttoinntektField.fill(beløp);
    await this.bruttoinntektField.press('Tab'); // Trigger blur event

    await responsePromise;
    console.log('✅ Trygdeavgift calculation API completed');

    await expect(this.bekreftButton).toBeEnabled({ timeout: 15000 });
    console.log('✅ Bekreft og fortsett button is enabled');
  }

  /**
   * Click "Bekreft og fortsett" button
   */
  async klikkBekreftOgFortsett(): Promise<void> {
    await this.bekreftButton.click();
    console.log('✅ Clicked Bekreft og fortsett');
  }

  /**
   * Complete entire Årsavregning section
   * Convenience method for standard workflow
   *
   * @param år - Year to select (default: '2025')
   * @param bestemmelse - Regulation code (default: 'FTRL_KAP2_2_1')
   * @param fraOgMedDag - Fra og med date in format DD.MM.YYYY (e.g., '06.01.2025')
   * @param tilOgMedDag - Til og med date in format DD.MM.YYYY (e.g., '12.01.2025')
   * @param erSkattepliktig - Tax liable status (default: false)
   * @param inntektskilde - Income source code (default: 'ARBEIDSINNTEKT')
   * @param bruttoinntekt - Gross income amount (default: '100000')
   */
  async fyllUtAarsavregning(
    år: string = '2025',
    bestemmelse: string = 'FTRL_KAP2_2_1',
    fraOgMedDag: string,
    tilOgMedDag: string,
    erSkattepliktig: boolean = false,
    inntektskilde: string = 'ARBEIDSINNTEKT',
    bruttoinntekt: string = '100000'
  ): Promise<void> {
    await this.ventPåSideLastet();
    await this.velgÅr(år);
    await this.svarNei();
    await this.velgBestemmelse(bestemmelse);
    await this.velgFraOgMedPeriode(fraOgMedDag);
    await this.velgTilOgMedPeriode(tilOgMedDag);
    await this.velgSkattepliktig(erSkattepliktig);
    await this.velgInntektskilde(inntektskilde);
    await this.fyllInnBruttoinntektMedApiVent(bruttoinntekt);
    await this.klikkBekreftOgFortsett();
  }
}
