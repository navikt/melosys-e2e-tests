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

  /**
   * Radiogruppe «Beregn endelig trygdeavgift» / «Oppgi endelig beregnet
   * trygdeavgift» (endeligAvgiftValgRadioGroup.tsx). Vises i uten/delt-grunnlag-
   * flyten (toggle `melosys.arsavregning.eos_pensjonist`). «Beregn»
   * (OPPLYSNINGER_ENDRET) er forhåndsvalgt.
   */
  private readonly endeligAvgiftValgGroup = this.page.locator('.endeligAvgiftValg_radio_group');

  /**
   * Manuelt avgiftsbeløp-felt (manuellAvgiftFormPart.tsx, name=manueltAvgiftBeloep).
   * Vises kun når «Oppgi endelig beregnet trygdeavgift» er valgt.
   */
  private readonly endeligBeregnetTrygdeavgiftField = this.page.getByRole('textbox', {
    name: 'Endelig beregnet trygdeavgift'
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
   * Radiogruppe for inngangsspørsmålet om innbetalt trygdeavgift.
   * Etiketten varierer med toggle `melosys.arsavregning.eos_pensjonist`:
   *   - toggle på  → «Avviker innbetalt trygdeavgift fra tidligere beregnet avgift?»
   *   - toggle av  → «Skal du legge til trygdeavgift fra Avgiftssystemet …?»
   * Vi matcher derfor begge etikettene.
   */
  private readonly trygdeavgiftAvvikGroup = this.page.getByRole('group', {
    name: /Avviker innbetalt|Skal du legge til trygdeavgift/,
  });

  /**
   * Besvar inngangsspørsmålet om innbetalt trygdeavgift med «Nei».
   *
   * Gammel flyt viser en Ja/Nei-radio (etikett varierer med feature toggle,
   * se trygdeavgiftAvvikGroup) som må besvares for å avdekke resten av
   * årsavregningsskjemaet. Den nye eos_pensjonist-flyten (toggle
   * `melosys.arsavregning.eos_pensjonist`) skjuler radioen når det ikke finnes
   * tidligere trygdeavgiftsgrunnlag og setter `harInnbetaltTrygdeavgift = true`
   * automatisk – da rendres skjemaet med en gang, og «Innbetalt trygdeavgift»
   * blir et påkrevd felt i stedet (se fyllInnBruttoinntektMedApiVent). Metoden
   * er derfor adaptiv: klikker «Nei» hvis radioen finnes, ellers hopper den
   * over (ny flyt).
   */
  async svarNei(): Promise<void> {
    const avvikerNei = this.trygdeavgiftAvvikGroup.getByRole('radio', { name: 'Nei' });

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
      console.log('✅ Svarte Nei på inngangsspørsmålet om innbetalt trygdeavgift (gammel flyt)');
      return;
    }

    console.log(
      'ℹ️ Ny eos_pensjonist-flyt: avvik-radioen er skjult – hopper over svarNei'
    );
  }

  /**
   * Answer "Ja" to the initial årsavregning question about innbetalt trygdeavgift.
   */
  async svarJa(): Promise<void> {
    await this.trygdeavgiftAvvikGroup.waitFor({ state: 'visible', timeout: TIMEOUT_MEDIUM });
    await this.trygdeavgiftAvvikGroup.getByRole('radio', { name: 'Ja' }).check();
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
   * Velg «Oppgi endelig beregnet trygdeavgift» (MANUELL_ENDELIG_AVGIFT) i
   * uten/delt-grunnlag-flyten.
   *
   * Byttet trigger DELETE av AVGIFT_SYSTEMET-perioder og en
   * PUT …/aarsavregninger/{id}/endeligAvgift/MANUELL_ENDELIG_AVGIFT — vi venter
   * på PUT-en før vi går videre, ellers kan påfølgende lagringer race. Etterpå
   * forsvinner perioder/skatt/inntekt-seksjonene og det manuelle feltet
   * «Endelig beregnet trygdeavgift» vises (eneste påkrevde felt).
   */
  async velgOppgiEndeligTrygdeavgift(): Promise<void> {
    await this.endeligAvgiftValgGroup.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
    const radioInput = this.endeligAvgiftValgGroup.locator(
      'input[value="MANUELL_ENDELIG_AVGIFT"]'
    );

    const valgLagret = this.page.waitForResponse(
      response =>
        response.url().includes('/endeligAvgift/MANUELL_ENDELIG_AVGIFT') &&
        response.request().method() === 'PUT' &&
        response.status() === 200,
      { timeout: TIMEOUT_API }
    );

    await radioInput.waitFor({ state: 'attached', timeout: TIMEOUT_MEDIUM });
    await radioInput.click({ force: true });
    await expect(radioInput).toBeChecked({ timeout: TIMEOUT_MEDIUM });
    await valgLagret;
    console.log('✅ Valgte «Oppgi endelig beregnet trygdeavgift» (MANUELL_ENDELIG_AVGIFT lagret)');

    await this.endeligBeregnetTrygdeavgiftField.waitFor({
      state: 'visible',
      timeout: TIMEOUT_MEDIUM
    });
  }

  /**
   * Fyll det manuelle feltet «Endelig beregnet trygdeavgift»
   * (Oppgi-varianten / MANUELL_ENDELIG_AVGIFT).
   *
   * Lagres via debounced PUT /api/behandlinger/{id}/aarsavregninger/{id} —
   * vi venter på den slik at beløpet garantert er persistert før neste steg.
   *
   * @param beløp - Manuelt endelig avgiftsbeløp (f.eks. '250')
   */
  async fyllInnEndeligBeregnetTrygdeavgift(beløp: string): Promise<void> {
    await this.endeligBeregnetTrygdeavgiftField.waitFor({
      state: 'visible',
      timeout: TIMEOUT_MEDIUM
    });

    const lagret = this.page.waitForResponse(
      response =>
        /\/api\/behandlinger\/\d+\/aarsavregninger\/\d+$/.test(
          new URL(response.url()).pathname
        ) &&
        response.request().method() === 'PUT' &&
        response.status() === 200,
      { timeout: TIMEOUT_API }
    );

    await this.endeligBeregnetTrygdeavgiftField.fill(beløp);
    await this.endeligBeregnetTrygdeavgiftField.press('Tab');
    await expect(this.endeligBeregnetTrygdeavgiftField).toHaveValue(beløp, {
      timeout: TIMEOUT_MEDIUM
    });

    await lagret;
    console.log(`✅ Fylte inn endelig beregnet trygdeavgift (manuelt): ${beløp}`);
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
   * Select trygdedekning (coverage) from dropdown.
   *
   * For bestemmelser med kun én lovlig dekning (f.eks. § 2-1 → Full dekning)
   * settes dekning automatisk og feltet er read-only — da trengs ikke dette kallet.
   * For § 2-8 (frivillig) finnes det flere valg (f.eks. helse+pensjon).
   *
   * Dropdown har aria-label "Trygdedekning periode 1" (indeks-basert).
   *
   * @param dekning - Dekning code (e.g., 'FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON')
   * @param periodeIndex - Period index (0-based, default 0)
   */
  async velgDekning(dekning: string, periodeIndex: number = 0): Promise<void> {
    const dekningDropdown = this.page.getByLabel(`Trygdedekning periode ${periodeIndex + 1}`);
    await dekningDropdown.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
    await dekningDropdown.selectOption(dekning);
    console.log(`✅ Selected dekning = ${dekning} (periode ${periodeIndex + 1})`);
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
   * Select "Betales aga?" (arbeidsgiveravgift) radio button.
   *
   * Vises kun for visse inntektskilder (f.eks. INNTEKT_FRA_UTLANDET).
   * For ARBEIDSINNTEKT vises "Ikke relevant" i stedet.
   *
   * @param betalesAga - true for "Ja", false for "Nei"
   */
  async velgBetalesAga(betalesAga: boolean): Promise<void> {
    const agaGroup = this.page.getByRole('group', { name: /Betales aga/ });
    await agaGroup.waitFor({ state: 'visible', timeout: TIMEOUT_MEDIUM });
    const radio = agaGroup.getByRole('radio', { name: betalesAga ? 'Ja' : 'Nei' });
    await radio.check();
    console.log(`✅ Selected Betales aga = ${betalesAga ? 'Ja' : 'Nei'}`);
  }

  /**
   * Klikk "Legg til inntekt" for å legge til en ny inntektskildeperiode.
   */
  async klikkLeggTilInntekt(): Promise<void> {
    const knapp = this.page.getByRole('button', { name: 'Legg til inntekt' });
    await knapp.waitFor({ state: 'visible', timeout: TIMEOUT_MEDIUM });
    await knapp.click();
    console.log('✅ Klikket "Legg til inntekt"');
  }

  /**
   * Select inntektskilde for en gitt rad-indeks (0-basert).
   *
   * @param indeks - Rad-indeks (0 = første, 1 = andre, osv.)
   * @param inntektskilde - Inntektskilde-kode (f.eks. 'ARBEIDSINNTEKT', 'NÆRINGSINNTEKT')
   */
  async velgInntektskildeForIndeks(indeks: number, inntektskilde: string): Promise<void> {
    const dropdown = this.page.locator(`select[name="inntektskilder[${indeks}].kildetype"]`);
    await dropdown.waitFor({ state: 'visible', timeout: TIMEOUT_MEDIUM });
    await expect(dropdown).toBeEnabled({ timeout: TIMEOUT_LONG });

    await this.page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector) as HTMLSelectElement;
        return el && el.options.length > 1;
      },
      `select[name="inntektskilder[${indeks}].kildetype"]`,
      { timeout: TIMEOUT_LONG }
    );

    await dropdown.selectOption(inntektskilde);
    console.log(`✅ Selected Inntektskilde[${indeks}] = ${inntektskilde}`);
  }

  /**
   * Fill bruttoinntekt for en gitt rad-indeks (0-basert).
   * Trigger IKKE API-vent — bruk fyllInnBruttoinntektForIndeksMedApiVent for siste rad.
   *
   * NB: Kun rad 0 har accessible name "Bruttoinntekt" — påfølgende rader har tom
   * label (hideLabel=true, label=""). Bruk derfor name-attributt for å lokalisere feltet.
   *
   * @param indeks - Rad-indeks (0 = første, 1 = andre, osv.)
   * @param beløp - Beløp som string
   */
  async fyllInnBruttoinntektForIndeks(indeks: number, beløp: string): Promise<void> {
    const felt = this.page.locator(`input[name="inntektskilder[${indeks}].bruttoInntekt"]`);
    await felt.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
    await felt.fill(beløp);
    await felt.press('Tab');
    console.log(`✅ Fylte inn Bruttoinntekt[${indeks}] = ${beløp}`);
  }

  /**
   * Fill bruttoinntekt for en gitt rad-indeks MED API-vent.
   * Bruk denne på SISTE rad for å vente på beregnings-responsen.
   *
   * @param indeks - Rad-indeks (0 = første, 1 = andre, osv.)
   * @param beløp - Beløp som string
   */
  async fyllInnBruttoinntektForIndeksMedApiVent(indeks: number, beløp: string): Promise<void> {
    await this.fyllInnInnbetaltTrygdeavgiftHvisPåkrevd('0');

    const felt = this.page.locator(`input[name="inntektskilder[${indeks}].bruttoInntekt"]`);
    await felt.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });

    const responsePromise = this.page.waitForResponse(
      response =>
        isTrygdeavgiftBeregningResponse(response) && response.request().method() === 'PUT',
      { timeout: 30000 }
    );

    await felt.fill(beløp);
    await felt.press('Tab');

    await responsePromise;
    console.log(`✅ Trygdeavgift calculation API completed (Bruttoinntekt[${indeks}] = ${beløp})`);

    await expect(this.bekreftButton).toBeEnabled({ timeout: TIMEOUT_API });
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

    // CRITICAL: Create response promise BEFORE triggering action.
    // Filtrer på PUT: matcher treffer også GET-en som henter beregningen ved
    // innlasting, og siden «Innbetalt trygdeavgift» fylles før denne lytteren
    // settes opp (ny flyt) kan en GET ellers løse promisen for tidlig. Selve
    // beregningen ved bruttoinntekt-endring er alltid en PUT.
    const responsePromise = this.page.waitForResponse(
      response =>
        isTrygdeavgiftBeregningResponse(response) && response.request().method() === 'PUT',
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
    const synlig = await this.isElementVisible(this.innbetaltTrygdeavgiftField, TIMEOUT_SHORT);
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
