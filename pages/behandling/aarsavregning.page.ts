import { Page, expect } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { TIMEOUT_API, TIMEOUT_LONG, TIMEOUT_MEDIUM, TIMEOUT_SHORT, TIMEOUT_VEDTAK } from '../shared/constants';
import { isTrygdeavgiftBeregningResponse } from '../shared/trygdeavgift-api';
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

  private readonly avvikerInnbetaltGroup = this.page.getByRole('group', {
    name: 'Avviker innbetalt'
  });

  private readonly inntektskildeDropdown = this.page.getByLabel('Inntektskilde');

  private readonly bruttoinntektField = this.page.getByRole('textbox', { name: 'Bruttoinntekt' });

  private readonly innbetaltTrygdeavgiftField = this.page.getByRole('textbox', {
    name: 'Innbetalt trygdeavgift'
  });

  private readonly bekreftButton = this.page.getByRole('button', { name: 'Bekreft og fortsett' });

  private readonly fattVedtakButton = this.page.getByRole('button', { name: 'Fatt vedtak' });

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
      await this.aarVelger.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
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
    await this.aarVelger.waitFor({ state: 'visible', timeout: TIMEOUT_MEDIUM });
    await this.aarVelger.selectOption(år);
    console.log(`✅ Selected år = ${år}`);
  }

  /**
   * Besvar «Avviker innbetalt trygdeavgift …?» med «Nei» (gammel flyt).
   *
   * Gammel flyt viser en Ja/Nei-radio for innbetalt trygdeavgift som må
   * besvares for å avdekke resten av årsavregningsskjemaet. Den nye
   * eos_pensjonist-flyten (toggle `melosys.arsavregning.eos_pensjonist`)
   * skjuler radioen når det ikke finnes tidligere trygdeavgiftsgrunnlag og
   * setter `harInnbetaltTrygdeavgift = true` automatisk – da rendres skjemaet
   * med en gang, og «Innbetalt trygdeavgift» blir et påkrevd felt i stedet
   * (se fyllInnBruttoinntektMedApiVent). Metoden er derfor adaptiv: klikker
   * «Nei» hvis radioen finnes, ellers hopper den over (ny flyt).
   */
  async svarNei(): Promise<void> {
    const avvikerNei = this.avvikerInnbetaltGroup.getByRole('radio', { name: 'Nei' });

    // Etter årsvalg/innlasting dukker enten avvik-radioen (gammel flyt) eller
    // innbetalt-feltet (ny flyt) opp. Vent på det første som blir synlig.
    await Promise.race([
      avvikerNei.waitFor({ state: 'visible', timeout: TIMEOUT_LONG }).catch(() => {}),
      this.innbetaltTrygdeavgiftField
        .waitFor({ state: 'visible', timeout: TIMEOUT_LONG })
        .catch(() => {}),
    ]);

    if (await avvikerNei.isVisible().catch(() => false)) {
      await avvikerNei.check();
      console.log('✅ Svarte Nei på «Avviker innbetalt trygdeavgift» (gammel flyt)');
      return;
    }

    console.log(
      'ℹ️ Ny eos_pensjonist-flyt: «Avviker innbetalt»-radio er skjult – hopper over svarNei'
    );
  }

  /**
   * Answer "Ja" to the first radio question on the page
   */
  async svarJa(): Promise<void> {
    const jaRadio = this.page.getByRole('radio', { name: 'Ja' });
    await jaRadio.waitFor({ state: 'visible', timeout: TIMEOUT_MEDIUM });
    await jaRadio.check();
    console.log('✅ Answered Ja');
  }

  /**
   * Select whether paid trygdeavgift deviates from calculated value.
   * Waits for the debounced PUT /trygdeavgift/beregning, mirrors velgSkattepliktig.
   *
   * @param avviker - true for "Ja", false for "Nei"
   */
  async velgAvvikerInnbetalt(avviker: boolean): Promise<void> {
    await this.avvikerInnbetaltGroup.waitFor({ state: 'visible', timeout: TIMEOUT_MEDIUM });

    const expectedValue = avviker ? 'true' : 'false';
    const radioInput = this.avvikerInnbetaltGroup.locator(`input[value="${expectedValue}"]`);

    const responsePromise = this.page.waitForResponse(
      response =>
        isTrygdeavgiftBeregningResponse(response) &&
        response.request().method() === 'PUT',
      { timeout: TIMEOUT_MEDIUM }
    ).catch(() => null);

    await radioInput.waitFor({ state: 'attached', timeout: TIMEOUT_MEDIUM });
    await radioInput.click({ force: true });
    await expect(radioInput).toBeChecked({ timeout: TIMEOUT_MEDIUM });

    const response = await responsePromise;
    if (response) {
      console.log('✅ Debounced PUT /trygdeavgift/beregning completed - avviker saved');
    } else {
      await this.page.waitForTimeout(1500);
    }

    console.log(`✅ Selected Avviker innbetalt = ${avviker ? 'Ja' : 'Nei'}`);
  }

  /**
   * Fill the paid trygdeavgift amount.
   * The value is included in the later årsavregning calculation.
   *
   * @param beløp - Amount as string (e.g. '300')
   */
  async fyllInnInnbetaltTrygdeavgift(beløp: string): Promise<void> {
    await this.innbetaltTrygdeavgiftField.waitFor({ state: 'visible', timeout: TIMEOUT_MEDIUM });

    const responsePromise = this.page.waitForResponse(
      response =>
        isTrygdeavgiftBeregningResponse(response) &&
        response.request().method() === 'PUT',
      { timeout: TIMEOUT_MEDIUM }
    ).catch(() => null);

    await this.innbetaltTrygdeavgiftField.fill(beløp);
    await this.innbetaltTrygdeavgiftField.press('Tab');
    await expect(this.innbetaltTrygdeavgiftField).toHaveValue(beløp, { timeout: TIMEOUT_MEDIUM });

    const response = await responsePromise;
    if (response) {
      console.log('✅ Debounced PUT /trygdeavgift/beregning completed - innbetalt saved');
    } else {
      await this.page.waitForTimeout(1500);
    }

    console.log(`✅ Fylte inn innbetalt trygdeavgift: ${beløp}`);
  }

  /**
   * Select bestemmelse (regulation) from dropdown
   *
   * @param bestemmelse - Regulation code (e.g., 'FTRL_KAP2_2_1')
   */
  async velgBestemmelse(bestemmelse: string): Promise<void> {
    await this.bestemmelseDropdown.waitFor({ state: 'visible', timeout: TIMEOUT_MEDIUM });
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

    await this.skattepliktigGroup.waitFor({ state: 'visible', timeout: TIMEOUT_MEDIUM });

    const expectedValue = erSkattepliktig ? 'SKATTEPLIKTIG' : 'IKKE_SKATTEPLIKTIG';

    // Set up response listener BEFORE clicking to catch the debounced PUT
    const responsePromise = this.page.waitForResponse(
      response =>
        isTrygdeavgiftBeregningResponse(response) &&
        response.request().method() === 'PUT',
      { timeout: TIMEOUT_MEDIUM }
    ).catch(() => null); // Don't fail if no PUT

    const radioInput = this.skattepliktigGroup.locator(`input[value="${expectedValue}"]`);
    await radioInput.waitFor({ state: 'attached', timeout: TIMEOUT_MEDIUM });
    await radioInput.click({ force: true });

    await this.page.waitForTimeout(200);

    const isChecked = await radioInput.isChecked();
    if (!isChecked) {
      const radioLabel = erSkattepliktig ? 'Ja' : 'Nei';
      const labelText = this.skattepliktigGroup.getByText(radioLabel, { exact: true });
      await labelText.click();
      await this.page.waitForTimeout(200);
    }

    await expect(radioInput).toBeChecked({ timeout: TIMEOUT_MEDIUM });

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
    await this.inntektskildeDropdown.waitFor({ state: 'visible', timeout: TIMEOUT_MEDIUM });
    await expect(this.inntektskildeDropdown).toBeEnabled({ timeout: TIMEOUT_LONG });

    // Wait for options to populate
    await this.page.waitForFunction(
      (selector) => {
        const dropdown = document.querySelector(selector) as HTMLSelectElement;
        return dropdown && dropdown.options.length > 1;
      },
      'select[name="inntektskilder[0].kildetype"]',
      { timeout: TIMEOUT_LONG }
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
    // Ny eos_pensjonist-flyt uten tidligere grunnlag krever at «Innbetalt
    // trygdeavgift» fylles ut – ellers er skjemaet ugyldig og PUT-en mot
    // /trygdeavgift/beregning kjøres aldri (waitForResponse under timer da ut).
    // I gammel flyt finnes ikke feltet, så dette blir et no-op.
    await this.fyllInnInnbetaltTrygdeavgiftHvisPåkrevd('0');

    await this.bruttoinntektField.waitFor({ state: 'visible', timeout: TIMEOUT_MEDIUM });

    // CRITICAL: Create response promise BEFORE triggering action
    const responsePromise = this.page.waitForResponse(
      response => isTrygdeavgiftBeregningResponse(response),
      { timeout: 30000 }
    );

    await this.bruttoinntektField.fill(beløp);
    await this.bruttoinntektField.press('Tab'); // Trigger blur event

    await responsePromise;
    console.log('✅ Trygdeavgift calculation API completed');

    await expect(this.bekreftButton).toBeEnabled({ timeout: TIMEOUT_API });
    console.log('✅ Bekreft og fortsett button is enabled');
  }

  /**
   * Fyll «Innbetalt trygdeavgift» hvis feltet er synlig og tomt.
   *
   * I den nye eos_pensjonist-flyten (uten tidligere trygdeavgiftsgrunnlag)
   * er dette feltet påkrevd og må fylles før trygdeavgiftsberegningen kjører.
   * I gammel flyt finnes ikke feltet, og metoden gjør ingenting. Idempotent:
   * tester som allerede har fylt feltet (f.eks. eu-eos-pensjonist via
   * velgAvvikerInnbetalt + fyllInnInnbetaltTrygdeavgift) påvirkes ikke.
   *
   * @param beløp - Innbetalt beløp (default '0' = ingenting innbetalt)
   */
  private async fyllInnInnbetaltTrygdeavgiftHvisPåkrevd(beløp: string = '0'): Promise<void> {
    const synlig = await this.innbetaltTrygdeavgiftField
      .waitFor({ state: 'visible', timeout: TIMEOUT_SHORT })
      .then(() => true)
      .catch(() => false);
    if (!synlig) {
      return;
    }

    const eksisterende = (
      await this.innbetaltTrygdeavgiftField.inputValue().catch(() => '')
    ).trim();
    if (eksisterende !== '') {
      return;
    }

    await this.innbetaltTrygdeavgiftField.fill(beløp);
    await this.innbetaltTrygdeavgiftField.press('Tab');
    console.log(`✅ Ny eos_pensjonist-flyt: fylte «Innbetalt trygdeavgift» = ${beløp}`);
  }

  /**
   * Click "Bekreft og fortsett" button with retry logic for reliable step transitions
   */
  async klikkBekreftOgFortsett(): Promise<void> {
    await this.clickStepButtonWithRetry(this.bekreftButton);
  }

  /**
   * Click the secondary "Bekreft og fortsett" button on the resultat/oppsummering
   * step that follows årsavregning input. Relies on heading-change detection so
   * we don't have to couple this page to whatever comes next in the wizard.
   */
  async klikkBekreftPåResultatside(): Promise<void> {
    // klikkBekreftOgFortsett() (simple-modus) returnerer etter bare 500 ms, så
    // resultatsteget kan fortsatt rendre når vi kommer hit. På CI kan «Bekreft
    // og fortsett» på resultatsiden bruke >10 s, og clickStepButtonWithRetry sin
    // interne 10 s-venting (base.page.ts) rakk ikke overgangen → timeout.
    // La forrige overgang roe seg og vent eksplisitt (lengre) på resultatsidens
    // knapp før vi driver neste steg.
    await this.page.waitForLoadState('networkidle', { timeout: TIMEOUT_LONG }).catch(() => {});

    // Hvis forrige steg dobbel-avanserte rett til vedtakssteget, finnes det
    // ingen «Bekreft og fortsett» igjen — da er vi allerede der vi skal.
    if (await this.fattVedtakButton.isVisible().catch(() => false)) {
      console.log('✅ Allerede på vedtakssteget — hopper over Bekreft på resultatside');
      return;
    }

    await this.bekreftButton.waitFor({ state: 'visible', timeout: TIMEOUT_VEDTAK });
    await this.clickStepButtonWithRetry(this.bekreftButton, {
      waitForContent: this.fattVedtakButton,
      verifyHeadingChange: true,
    });
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
