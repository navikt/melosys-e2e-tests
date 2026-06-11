import { Page, expect } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { TrygdeavtaleUnntaksregistreringAssertions } from './trygdeavtale-unntaksregistrering.assertions';

/**
 * Page Object for unntaksregistrering på trygdeavtale-saker
 * (rute: /melosys/TRYGDEAVTALE/unntaksregistrering/{saksnr}/?behandlingID={id}).
 *
 * To-stegs skjema (EnkelStegvelger):
 * 1. «Inngang» (heading «Oppgi opplysninger fra attesten»): periode fom/tom +
 *    avsenderland. For TRYGDEAVTALE finnes kun ETT landfelt — avsenderlandet
 *    lagres også som lovvalgsland (FASTSATT_AV_LAND).
 * 2. «Unntak medlemskap»: radiogruppe «Vurder unntaksperiode»
 *    (Godkjenn / Godkjenn, men endre periode / Ikke godkjenn). Ved Godkjenn
 *    vises bestemmelse-dropdown (f.eks. AUS_ART9_3) med read-only dekning.
 *
 * Submit («Bekreft og avslutt») fyrer PUT resultat/utfallregistreringunntak →
 * POST lovvalgsperioder → POST /saksflyt/unntaksregistrering (204, fyres 2x —
 * idempotent frontend-quirk). Vi venter kun på saksflyt-POST-en.
 *
 * NB: Ved «Ikke godkjenn» POSTer frontend lovvalgsperioder uten bestemmelse —
 * api svarer 400 + WARN, men flyten fullfører likevel (saksflyt 204). Vent
 * derfor ALDRI på lovvalgsperioder-kallet.
 *
 * @example
 * const unntak = new TrygdeavtaleUnntaksregistreringPage(page);
 * await unntak.ventPåInngang();
 * await unntak.fyllUtInngang('01.01.2024', '31.12.2025', 'AU');
 * await unntak.bekreftInngangOgFortsett();
 * await unntak.godkjennMedBestemmelse('AUS_ART9_3');
 * await unntak.bekreftOgAvslutt();
 */
export class TrygdeavtaleUnntaksregistreringPage extends BasePage {
  readonly assertions: TrygdeavtaleUnntaksregistreringAssertions;

  // ── Steg 1: Inngang ──────────────────────────────────────────────────
  private readonly inngangHeading = this.page.getByRole('heading', {
    name: 'Oppgi opplysninger fra attesten',
    level: 1
  });

  private readonly fraOgMedField = this.page.getByRole('textbox', {
    name: /^Fra og med/
  });

  private readonly tilOgMedField = this.page.getByRole('textbox', {
    name: /^Til og med/
  });

  private readonly avsenderlandDropdown = this.page.getByLabel(/Avsenderland/);

  private readonly bekreftOgFortsettButton = this.page.getByRole('button', {
    name: 'Bekreft og fortsett'
  });

  // ── Steg 2: Unntak medlemskap ────────────────────────────────────────
  private readonly unntakMedlemskapHeading = this.page.getByRole('heading', {
    name: 'Unntak medlemskap',
    level: 1
  });

  // exact: true så vi ikke matcher «Godkjenn, men endre periode»
  private readonly godkjennRadio = this.page.getByRole('radio', {
    name: 'Godkjenn',
    exact: true
  });

  private readonly ikkeGodkjennRadio = this.page.getByRole('radio', {
    name: 'Ikke godkjenn'
  });

  private readonly bestemmelseDropdown = this.page.getByLabel(/Bestemmelse/);

  private readonly bekreftOgAvsluttButton = this.page.getByRole('button', {
    name: 'Bekreft og avslutt'
  });

  constructor(page: Page) {
    super(page);
    this.assertions = new TrygdeavtaleUnntaksregistreringAssertions(page);
  }

  /**
   * Vent på at unntaksregistrering-siden er lastet (oppgavelenken på
   * hovedsiden peker direkte hit for sakstema UNNTAK).
   */
  async ventPåInngang(): Promise<void> {
    await expect(this.page).toHaveURL(/\/unntaksregistrering\//, { timeout: 30000 });
    await this.inngangHeading.waitFor({ state: 'visible', timeout: 30000 });
    console.log('✅ Unntaksregistrering-siden lastet (Inngang)');
  }

  /**
   * Fyll ut Inngang-steget: periode + avsenderland.
   *
   * @param fraOgMed     - Startdato DD.MM.YYYY
   * @param tilOgMed     - Sluttdato DD.MM.YYYY
   * @param avsenderland - Landkode (default 'AU' — Australia; IKKE India, jf. MELOSYS-6938)
   */
  async fyllUtInngang(
    fraOgMed: string,
    tilOgMed: string,
    avsenderland: string = 'AU'
  ): Promise<void> {
    await this.fraOgMedField.click();
    await this.fraOgMedField.fill(fraOgMed);
    console.log(`✅ Fylte "Fra og med": ${fraOgMed}`);

    await this.tilOgMedField.click();
    await this.tilOgMedField.fill(tilOgMed);
    console.log(`✅ Fylte "Til og med": ${tilOgMed}`);

    await this.avsenderlandDropdown.selectOption(avsenderland);
    console.log(`✅ Valgte avsenderland: ${avsenderland}`);
  }

  /**
   * Bekreft Inngang-steget og fortsett til «Unntak medlemskap».
   *
   * VIKTIG timing-rekkefølge: Inngang-feltene lagres KUN i lokal Redux —
   * persistering skjer via menypanelets debouncede auto-save
   * (POST /api/mottatteopplysninger/{id}, ~1,5 s etter siste feltendring).
   * Første klikk på «Bekreft og fortsett» auto-kjører registeroppfrisk +
   * full re-last av saksopplysninger (DialogboksOppfriskSak med
   * `bekreftetFraStart` — det finnes ALDRI noen «Avbryt oppdatering»-knapp,
   * kun spinner/suksess) og går så automatisk videre til steg 2.
   * Klikker vi før auto-saven har persistert, nullstiller re-lasten nettopp
   * inntastet periode/avsenderland (→ «Godkjenn» disabled, Land «Ukjent»,
   * FASTSATT_AV_LAND=null). Derfor: vent på auto-save-POST-en FØR klikket —
   * da returnerer re-lasten de persisterte verdiene.
   */
  async bekreftInngangOgFortsett(): Promise<void> {
    console.log('⏳ Venter på auto-save av mottatte opplysninger (debounced ~1,5s)...');
    const autoSaveResponse = await this.page.waitForResponse(
      (response) =>
        response.url().includes('/api/mottatteopplysninger/') &&
        response.request().method() === 'POST' &&
        response.ok(),
      { timeout: 30000 }
    );
    console.log(`✅ Mottatte opplysninger persistert: POST → ${autoSaveResponse.status()}`);

    await this.clickStepButtonWithRetry(this.bekreftOgFortsettButton);

    // Klikket trigger auto-oppfrisk (spinner → «Registeropplysningene er
    // oppdatert») og auto-naviger til steg 2 — vent kun på neste heading.
    await this.unntakMedlemskapHeading.waitFor({ state: 'visible', timeout: 60000 });
    console.log('✅ Steg «Unntak medlemskap» vises');
  }

  /**
   * Velg «Godkjenn» og bestemmelse på «Unntak medlemskap»-steget.
   * Bestemmelse-dropdownen populeres async (GET lovvalgsbestemmelser).
   *
   * @param bestemmelse - Bestemmelse-kode (default 'AUS_ART9_3' — Utsendt
   *                      arbeidstaker, artikkel 9 nr. 3)
   */
  async godkjennMedBestemmelse(bestemmelse: string = 'AUS_ART9_3'): Promise<void> {
    // «Godkjenn» er disabled til skjemaet har sluttdato (tom) — den kommer
    // fra persistert mottatteopplysninger-periode ved mount av steget.
    await expect(this.godkjennRadio).toBeEnabled({ timeout: 15000 });
    await this.godkjennRadio.check();
    console.log('✅ Valgte «Godkjenn»');

    await this.bestemmelseDropdown.waitFor({ state: 'visible', timeout: 15000 });
    await this.waitForDropdownToPopulate(this.bestemmelseDropdown);
    await this.bestemmelseDropdown.selectOption(bestemmelse);
    console.log(`✅ Valgte bestemmelse: ${bestemmelse}`);
  }

  /**
   * Velg «Ikke godkjenn» på «Unntak medlemskap»-steget.
   * Viser infomelding om at utenlandsk trygdemyndighet bør informeres
   * (ingen bestemmelse-dropdown).
   */
  async ikkeGodkjenn(): Promise<void> {
    await this.ikkeGodkjennRadio.check();
    console.log('✅ Valgte «Ikke godkjenn»');
  }

  /**
   * Klikk «Bekreft og avslutt» og vent på at saksflyt-prosessen faktisk
   * startes (POST /saksflyt/unntaksregistrering → 204). Frontend POSTer også
   * lovvalgsperioder først — det kallet venter vi bevisst IKKE på (gir 400
   * ved «Ikke godkjenn», jf. klassedoc).
   */
  async bekreftOgAvslutt(): Promise<void> {
    await this.bekreftOgAvsluttButton.waitFor({ state: 'visible', timeout: 10000 });
    await expect(this.bekreftOgAvsluttButton).toBeEnabled({ timeout: 15000 });

    const saksflytPromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/saksflyt/unntaksregistrering/') &&
        response.request().method() === 'POST' &&
        (response.status() === 204 || response.status() === 200),
      { timeout: 60000 }
    );

    await this.bekreftOgAvsluttButton.click();
    const response = await saksflytPromise;
    console.log(`✅ Unntaksregistrering bekreftet: ${response.url()} -> ${response.status()}`);
  }
}
