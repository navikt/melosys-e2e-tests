import { Page, expect } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { TrygdeavgiftPensjonistBehandlingAssertions } from './trygdeavgift-pensjonist-behandling.assertions';

/**
 * Page Object for EU/EØS Trygdeavgift Pensjonist førstegangsbehandling wizard
 *
 * This is a unique multi-step wizard for creating a Trygdeavgift Pensjonist case:
 *   Step 1: Period dates (Fra og med / Til og med) + Bostedsland dropdown
 *   Step 2: Yrkesaktiv question (Ja/Nei radio) + Inntektskilde dropdown + Bruttoinntekt
 *   Step 3: "Bekreft og send" button to submit
 *
 * IMPORTANT: The date fields are plain textboxes (NOT datepickers).
 * The Bostedsland dropdown uses value codes (e.g., 'FO' for Færøyene).
 *
 * Related pages:
 * - OpprettNySakPage (navigates from after case creation)
 * - VedtakPage (not used — this wizard submits directly via "Bekreft og send")
 *
 * @example
 * const behandling = new TrygdeavgiftPensjonistBehandlingPage(page);
 * await behandling.fyllInnFraOgMed('01.01.2024');
 * await behandling.fyllInnTilOgMed('31.12.2024');
 * await behandling.velgBostedsland('FO');
 * await behandling.klikkBekreftOgFortsett();
 * await behandling.svarNeiYrkesaktiv();
 * await behandling.velgInntektskilde('PENSJON');
 * await behandling.fyllInnBruttoinntektMedApiVent('200000');
 * await behandling.klikkBekreftOgSend();
 */
export class TrygdeavgiftPensjonistBehandlingPage extends BasePage {
  readonly assertions: TrygdeavgiftPensjonistBehandlingAssertions;

  // Step 1 locators — Period and Bostedsland
  private readonly fraOgMedField = this.page.getByRole('textbox', { name: 'Fra og med' });
  private readonly tilOgMedField = this.page.getByRole('textbox', { name: 'Til og med' });
  private readonly bostedslandDropdown = this.page.getByLabel('Bostedsland');

  // Step 2 locators — Yrkesaktiv, Inntektskilde, Bruttoinntekt
  private readonly neiRadio = this.page.getByRole('radio', { name: 'Nei' });
  private readonly jaRadio = this.page.getByRole('radio', { name: 'Ja' });
  private readonly inntektskildeDropdown = this.page.getByLabel('Inntektskilde');
  private readonly bruttoinntektField = this.page.getByRole('textbox', { name: 'Bruttoinntekt' });

  // Shared buttons
  private readonly bekreftOgFortsettButton = this.page.getByRole('button', { name: 'Bekreft og fortsett' });
  private readonly bekreftOgSendButton = this.page.getByRole('button', { name: 'Bekreft og send' });

  constructor(page: Page) {
    super(page);
    this.assertions = new TrygdeavgiftPensjonistBehandlingAssertions(page);
  }

  // ── Step 1: Period and Bostedsland ────────────────────────────────────

  /**
   * Wait for the behandling page to load
   * Verifies that the Fra og med field is visible (first step indicator)
   */
  async ventPåSideLastet(): Promise<void> {
    try {
      await this.fraOgMedField.waitFor({ state: 'visible', timeout: 15000 });
      console.log('✅ Trygdeavgift Pensjonist behandling loaded - Fra og med field visible');
    } catch (error) {
      console.error('❌ Failed to reach Trygdeavgift Pensjonist behandling page');
      console.error(`Current URL: ${this.currentUrl()}`);
      await this.screenshot('trygdeavgift-pensjonist-not-loaded');
      throw error;
    }
  }

  /**
   * Fill "Fra og med" date field
   *
   * @param dato - Date in format DD.MM.YYYY (e.g., '01.01.2024')
   */
  async fyllInnFraOgMed(dato: string): Promise<void> {
    await this.fraOgMedField.click();
    await this.fraOgMedField.fill(dato);
    await this.fraOgMedField.press('Tab');
    console.log(`✅ Fylte inn Fra og med: ${dato}`);
  }

  /**
   * Fill "Til og med" date field
   *
   * @param dato - Date in format DD.MM.YYYY (e.g., '31.12.2024')
   */
  async fyllInnTilOgMed(dato: string): Promise<void> {
    await this.tilOgMedField.click();
    await this.tilOgMedField.fill(dato);
    await this.tilOgMedField.press('Tab');
    console.log(`✅ Fylte inn Til og med: ${dato}`);
  }

  /**
   * Select Bostedsland (country of residence) from dropdown
   * Uses country code values (e.g., 'FO' for Færøyene, 'GL' for Grønland)
   *
   * @param landkode - Country code (e.g., 'FO', 'GL', 'DK', 'SE')
   */
  async velgBostedsland(landkode: string): Promise<void> {
    await this.bostedslandDropdown.waitFor({ state: 'visible', timeout: 5000 });
    await this.bostedslandDropdown.selectOption(landkode);
    console.log(`✅ Valgte Bostedsland: ${landkode}`);
  }

  /**
   * Click "Bekreft og fortsett" to advance from Step 1 to Step 2
   *
   * Uses heading-change verification since this is a multi-step wizard.
   * Passes the Nei radio button as waitForContent since that's the first
   * element on Step 2.
   */
  async klikkBekreftOgFortsett(): Promise<void> {
    await this.clickStepButtonWithRetry(this.bekreftOgFortsettButton, {
      waitForContent: this.neiRadio,
      verifyHeadingChange: true,
    });
  }

  // ── Step 2: Yrkesaktiv, Inntektskilde, Bruttoinntekt ─────────────────

  /**
   * Answer "Nei" to the yrkesaktiv question
   * This is the typical answer for pensjonist cases
   */
  async svarNeiYrkesaktiv(): Promise<void> {
    await this.neiRadio.waitFor({ state: 'visible', timeout: 10000 });
    await this.neiRadio.check();
    console.log('✅ Svarte Nei på yrkesaktiv-spørsmål');
  }

  /**
   * Answer "Ja" to the yrkesaktiv question
   */
  async svarJaYrkesaktiv(): Promise<void> {
    await this.jaRadio.waitFor({ state: 'visible', timeout: 10000 });
    await this.jaRadio.check();
    console.log('✅ Svarte Ja på yrkesaktiv-spørsmål');
  }

  /**
   * Select Inntektskilde (income source) from dropdown
   *
   * @param inntektskilde - Income source code (e.g., 'PENSJON', 'ARBEIDSINNTEKT')
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
    console.log(`✅ Valgte Inntektskilde: ${inntektskilde}`);
  }

  /**
   * Fill Bruttoinntekt field WITH API wait (RECOMMENDED)
   * Waits for /trygdeavgift/beregning API call to complete after blur
   *
   * @param beløp - Amount as string (e.g., '200000')
   */
  async fyllInnBruttoinntektMedApiVent(beløp: string): Promise<void> {
    await this.bruttoinntektField.waitFor({ state: 'visible', timeout: 5000 });

    // CRITICAL: Create response promise BEFORE triggering blur
    const responsePromise = this.page.waitForResponse(
      response => response.url().includes('/trygdeavgift/beregning') && response.status() === 200,
      { timeout: 30000 }
    );

    await this.bruttoinntektField.fill(beløp);
    await this.bruttoinntektField.press('Tab'); // Trigger blur → API call

    await responsePromise;
    console.log('✅ Trygdeavgift calculation API completed');
  }

  // ── Step 3: Submit ────────────────────────────────────────────────────

  /**
   * Click "Bekreft og send" button to submit the behandling
   *
   * This is the final step of the Trygdeavgift Pensjonist wizard.
   * Waits for the vedtak API response to confirm successful submission.
   */
  async klikkBekreftOgSend(): Promise<void> {
    await this.bekreftOgSendButton.waitFor({ state: 'visible', timeout: 10000 });
    await expect(this.bekreftOgSendButton).toBeEnabled({ timeout: 15000 });

    // CRITICAL: Set up response listener BEFORE clicking
    const responsePromise = this.page.waitForResponse(
      response => response.url().includes('/api/saksflyt/vedtak/') &&
                  response.url().includes('/fatt') &&
                  response.request().method() === 'POST' &&
                  (response.status() === 200 || response.status() === 204),
      { timeout: 60000 }
    );

    await this.bekreftOgSendButton.click();

    const response = await responsePromise;
    console.log(`✅ Bekreft og send fullført - vedtak API: ${response.status()}`);
  }

  // ── Convenience methods ───────────────────────────────────────────────

  /**
   * Complete Step 1: Fill period dates and select bostedsland, then continue
   *
   * @param fraOgMed - Start date (DD.MM.YYYY)
   * @param tilOgMed - End date (DD.MM.YYYY)
   * @param bostedsland - Country code (e.g., 'FO')
   */
  async fyllUtSteg1(fraOgMed: string, tilOgMed: string, bostedsland: string): Promise<void> {
    await this.ventPåSideLastet();
    await this.fyllInnFraOgMed(fraOgMed);
    await this.fyllInnTilOgMed(tilOgMed);
    await this.velgBostedsland(bostedsland);
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Complete Step 2: Answer yrkesaktiv, select income source, fill bruttoinntekt
   *
   * @param erYrkesaktiv - true for "Ja", false for "Nei" (default: false for pensjonist)
   * @param inntektskilde - Income source code (default: 'PENSJON')
   * @param bruttoinntekt - Gross income amount (default: '200000')
   */
  async fyllUtSteg2(
    erYrkesaktiv: boolean = false,
    inntektskilde: string = 'PENSJON',
    bruttoinntekt: string = '200000'
  ): Promise<void> {
    if (erYrkesaktiv) {
      await this.svarJaYrkesaktiv();
    } else {
      await this.svarNeiYrkesaktiv();
    }
    await this.velgInntektskilde(inntektskilde);
    await this.fyllInnBruttoinntektMedApiVent(bruttoinntekt);
  }

  /**
   * Complete entire førstegangsbehandling with standard pensjonist values
   *
   * @param fraOgMed - Start date (DD.MM.YYYY)
   * @param tilOgMed - End date (DD.MM.YYYY)
   * @param bostedsland - Country code (default: 'FO')
   * @param inntektskilde - Income source code (default: 'PENSJON')
   * @param bruttoinntekt - Gross income (default: '200000')
   */
  async fyllUtFørstegangsbehandling(
    fraOgMed: string,
    tilOgMed: string,
    bostedsland: string = 'FO',
    inntektskilde: string = 'PENSJON',
    bruttoinntekt: string = '200000'
  ): Promise<void> {
    await this.fyllUtSteg1(fraOgMed, tilOgMed, bostedsland);
    await this.fyllUtSteg2(false, inntektskilde, bruttoinntekt);
    await this.klikkBekreftOgSend();
  }
}
