import { Page, expect } from '@playwright/test';
import {
  SoknadUtsendtArbeidstakerPage,
  hentSkjemaIdFraUrl,
} from './soknad-utsendt-arbeidstaker.page';
import { lagreOgFortsett, standardUtsendingsperiode, svarRadio } from './skjema-utils';

/**
 * Page Object for den digitale «Utsendt arbeidstaker»-søknaden, variant ARBEIDSGIVER.
 *
 * Dekker de to arbeidsgiver-variantene (verifisert live 2026-06-28):
 *  - **Begge deler** («Skal du fylle ut søknaden for arbeidstaker?» = Ja, med fullmakt):
 *    11 steg, skjemadel ARBEIDSGIVER_OG_ARBEIDSTAKERS_DEL.
 *  - **Kun arbeidsgiver-del** (= Nei, oppgir arbeidstaker manuelt): 8 steg (ingen AT-steg),
 *    skjemadel ARBEIDSGIVERS_DEL → melosys-api setter behandling AVVENT_DOK_PART (T3).
 *
 * De fire arbeidsgiver-stegene (arbeidsgiverens-virksomhet-i-norge, utenlandsoppdraget,
 * arbeidssted-i-utlandet, arbeidstakerens-lonn) finnes kun her. Arbeidstaker-stegene
 * (arbeidssituasjon/skatteforhold/familiemedlemmer) og hale-stegene (tilleggsopplysninger/
 * vedlegg/oppsummering/kvittering) er identiske med DEG SELV og gjenbrukes via en komponert
 * {@link SoknadUtsendtArbeidstakerPage}.
 *
 * Egen POM (utvider IKKE BasePage) av samme grunn som DEG SELV-POM-en.
 */
export class SoknadArbeidsgiverPage {
  /** Komponert DEG SELV-POM som leverer de delte AT- og hale-stegene. */
  private readonly felles: SoknadUtsendtArbeidstakerPage;

  constructor(private page: Page) {
    this.felles = new SoknadUtsendtArbeidstakerPage(page);
  }

  /**
   * Fra rollevalg-siden (/representasjon): velg ARBEIDSGIVER, velg organisasjon (Altinn-tilgang),
   * velg/oppgi arbeidstaker, bekreft og start søknaden.
   *
   * @param opts.arbeidsgiverOrgnr  organisasjonen du har Altinn-tilgang til (f.eks. 999999999).
   * @param opts.arbeidstakerFnr    arbeidstakerens fødselsnummer.
   * @param opts.medFullmakt        true = fyll ut for begge (krever fullmakt fra arbeidstaker);
   *                                 false = send kun arbeidsgiver-delen, arbeidstaker fyller ut selv.
   * @param opts.arbeidstakerEtternavn  påkrevd når medFullmakt=false (PDL-oppslag på navn + fnr).
   * @returns søknads-id (UUID) fra URL-en.
   */
  async velgArbeidsgiverOgStart(opts: {
    arbeidsgiverOrgnr: string;
    arbeidstakerFnr: string;
    medFullmakt: boolean;
    arbeidstakerEtternavn?: string;
  }): Promise<string> {
    const page = this.page;
    await page.getByRole('button', { name: /^ARBEIDSGIVER/ }).click();
    await page.waitForURL(/\/oversikt/);

    // Velg arbeidsgiver i Aksel-comboboxen (Altinn-tilganger). Filtrer på orgnr og velg treffet.
    const arbeidsgiverCombo = page.getByRole('combobox', { name: /Velg arbeidsgiver/ });
    await arbeidsgiverCombo.click();
    await arbeidsgiverCombo.fill(opts.arbeidsgiverOrgnr);
    await page.getByRole('option', { name: new RegExp(`\\(${opts.arbeidsgiverOrgnr}\\)`) }).click();

    if (opts.medFullmakt) {
      // «Ja» → velg arbeidstaker fra fullmakt-lista (begge deler).
      await svarRadio(page, /Skal du fylle ut søknaden for arbeidstaker/, 'Ja');
      const arbeidstakerCombo = page.getByRole('combobox', { name: /Velg arbeidstaker/ });
      await arbeidstakerCombo.click();
      await arbeidstakerCombo.fill(opts.arbeidstakerFnr);
      await page.getByRole('option', { name: new RegExp(opts.arbeidstakerFnr) }).click();
    } else {
      // «Nei» → oppgi arbeidstaker manuelt og verifiser mot PDL (kun arbeidsgiver-del).
      expect(
        opts.arbeidstakerEtternavn,
        'arbeidstakerEtternavn er påkrevd når medFullmakt=false'
      ).toBeTruthy();
      await svarRadio(page, /Skal du fylle ut søknaden for arbeidstaker/, 'Nei');
      await page.getByRole('textbox', { name: 'Fødsels-/d-nummer' }).fill(opts.arbeidstakerFnr);
      await page.getByRole('textbox', { name: 'Etternavn' }).fill(opts.arbeidstakerEtternavn!);
      // To knapper heter «Søk» (denne + tabellsøket lenger ned); verifiseringsknappen er først i DOM.
      await page.getByRole('button', { name: 'Søk', exact: true }).first().click();
      // Vent på at personen er verifisert (vises som «NAVN - fnr») før vi kan starte.
      await expect(page.getByText(new RegExp(opts.arbeidstakerFnr))).toBeVisible();
    }

    await page.getByRole('checkbox', { name: /Jeg bekrefter/ }).check();
    await page.getByRole('button', { name: 'Start søknad' }).click();

    await page.waitForURL(/\/skjema\/[^/]+\/utsendingsperiode-og-land/);
    return hentSkjemaIdFraUrl(page);
  }

  // ---- Arbeidsgiver-spesifikke steg ------------------------------------------------------

  /** Steg 1: utsendingsperiode og land. Går videre til arbeidsgiverens-virksomhet-i-norge. */
  async fyllUtsendingsperiodeOgLand(land = 'Frankrike'): Promise<void> {
    const page = this.page;
    await expect(page.getByRole('heading', { name: 'Utsendingsperiode og land' })).toBeVisible();
    await page.getByLabel('I hvilket land skal arbeidet utføres?').selectOption({ label: land });

    const { fraDato, tilDato } = standardUtsendingsperiode();
    await page.getByRole('textbox', { name: 'Fra dato' }).fill(fraDato);
    await page.getByRole('textbox', { name: 'Til dato' }).fill(tilDato);

    await lagreOgFortsett(page, /\/arbeidsgiverens-virksomhet-i-norge/);
  }

  /** Steg 2: arbeidsgiverens virksomhet i Norge (privat virksomhet med ordinær drift). */
  async fyllArbeidsgiverensVirksomhet(): Promise<void> {
    const page = this.page;
    await svarRadio(page, /offentlig virksomhet/, 'Nei');
    // «bemannings-/vikarbyrå» og «opprettholder vanlig drift» dukker først opp etter «Nei» over.
    await svarRadio(page, /bemannings- eller vikarbyrå/, 'Nei');
    await svarRadio(page, /Opprettholder arbeidsgiveren vanlig drift/, 'Ja');
    await lagreOgFortsett(page, /\/utenlandsoppdraget/);
  }

  /** Steg 3: utenlandsoppdraget. */
  async fyllUtenlandsoppdraget(): Promise<void> {
    const page = this.page;
    await svarRadio(page, /oppdrag i landet arbeidstaker skal sendes ut til/, 'Ja');
    await svarRadio(page, /ansatt på grunn av dette utenlandsoppdraget/, 'Nei');
    await svarRadio(page, /fortsatt være ansatt hos dere i hele utsendingsperioden/, 'Ja');
    await svarRadio(page, /Erstatter arbeidstaker en annen person/, 'Nei');
    await lagreOgFortsett(page, /\/arbeidssted-i-utlandet/);
  }

  /** Steg 4: arbeidssted i utlandet (fast arbeidssted på land med adresse). */
  async fyllArbeidssted(): Promise<void> {
    const page = this.page;
    await page.getByLabel('Hvor skal arbeidet utføres?').selectOption({ label: 'På land' });
    await page.getByRole('textbox', { name: 'Navn på virksomheten' }).fill('Utenlandsk Avdeling SARL');
    // «Fast arbeidssted» avslører adressefeltene; «Land» fylles automatisk fra steg 1.
    await page.getByRole('radio', { name: 'Fast arbeidssted' }).check();
    await page.getByRole('textbox', { name: 'Gate/vei' }).fill('Hovedgata');
    await page.getByRole('textbox', { name: 'Nummer' }).fill('12');
    await page.getByRole('textbox', { name: 'Postkode' }).fill('75001');
    await page.getByRole('textbox', { name: 'By/sted/region' }).fill('Paris');
    await svarRadio(page, /jobbe på hjemmekontor/, 'Nei');
    await lagreOgFortsett(page, /\/arbeidstakerens-lonn/);
  }

  /**
   * Steg 5: arbeidstakerens lønn. Neste steg avhenger av variant:
   * begge deler → arbeidssituasjon, kun arbeidsgiver-del → tilleggsopplysninger.
   */
  async fyllArbeidstakerensLonn(nesteUrl: RegExp): Promise<void> {
    await svarRadio(this.page, /Utbetaler du som arbeidsgiver all lønn/, 'Ja');
    await lagreOgFortsett(this.page, nesteUrl);
  }

  // ---- Orkestrering ----------------------------------------------------------------------

  /**
   * Full innsending som arbeidsgiver MED fullmakt — fyller ut BEGGE deler (11 steg).
   * @returns søknads-id (UUID) og referansenummer fra kvitteringen.
   */
  async fyllUtOgSendInnBeggeDeler(opts: {
    arbeidsgiverOrgnr: string;
    arbeidstakerFnr: string;
    land?: string;
    vedleggFilsti?: string;
  }): Promise<{ skjemaId: string; referanse: string }> {
    const skjemaId = await this.velgArbeidsgiverOgStart({
      arbeidsgiverOrgnr: opts.arbeidsgiverOrgnr,
      arbeidstakerFnr: opts.arbeidstakerFnr,
      medFullmakt: true,
    });
    await this.fyllUtsendingsperiodeOgLand(opts.land);
    await this.fyllArbeidsgiverensVirksomhet();
    await this.fyllUtenlandsoppdraget();
    await this.fyllArbeidssted();
    await this.fyllArbeidstakerensLonn(/\/arbeidssituasjon/);
    // AT-stegene er identiske med DEG SELV → gjenbruk komponert POM.
    await this.felles.fyllArbeidssituasjon();
    await this.felles.fyllSkatteforholdOgInntekt();
    await this.felles.fyllFamiliemedlemmer();
    await this.felles.fyllTilleggsopplysninger();
    await this.felles.fyllVedlegg(opts.vedleggFilsti);
    const referanse = await this.felles.sendInnOgHentReferanse();
    return { skjemaId, referanse };
  }

  /**
   * Full innsending av KUN arbeidsgiver-delen (8 steg, ingen AT-steg). Arbeidstaker oppgis
   * manuelt. melosys-api setter behandling AVVENT_DOK_PART (venter på arbeidstakerens del).
   * @returns søknads-id (UUID) og referansenummer fra kvitteringen.
   */
  async fyllUtOgSendInnArbeidsgiversDel(opts: {
    arbeidsgiverOrgnr: string;
    arbeidstakerFnr: string;
    arbeidstakerEtternavn: string;
    land?: string;
    vedleggFilsti?: string;
  }): Promise<{ skjemaId: string; referanse: string }> {
    const skjemaId = await this.velgArbeidsgiverOgStart({
      arbeidsgiverOrgnr: opts.arbeidsgiverOrgnr,
      arbeidstakerFnr: opts.arbeidstakerFnr,
      arbeidstakerEtternavn: opts.arbeidstakerEtternavn,
      medFullmakt: false,
    });
    await this.fyllUtsendingsperiodeOgLand(opts.land);
    await this.fyllArbeidsgiverensVirksomhet();
    await this.fyllUtenlandsoppdraget();
    await this.fyllArbeidssted();
    await this.fyllArbeidstakerensLonn(/\/tilleggsopplysninger/);
    await this.felles.fyllTilleggsopplysninger();
    await this.felles.fyllVedlegg(opts.vedleggFilsti);
    const referanse = await this.felles.sendInnOgHentReferanse();
    return { skjemaId, referanse };
  }
}
