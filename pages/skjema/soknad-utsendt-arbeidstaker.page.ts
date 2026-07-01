import { Page, expect } from '@playwright/test';
import { SkjemaAuthHelper } from '../../helpers/skjema-auth-helper';
import { ddmmyyyy, lagreOgFortsett, standardUtsendingsperiode, svarRadio } from './skjema-utils';

/**
 * Page Object for den digitale «Utsendt arbeidstaker»-søknaden i melosys-skjema-web,
 * variant DEG SELV (arbeidstaker fyller ut sin egen del).
 *
 * Selvstendig POM (utvider IKKE pages/shared/base.page.ts) fordi BasePage er koblet til
 * melosys-web/FormHelper. Bruker rolle-baserte selektorer (label/legend/knappetekst) sider
 * Aksel-komponentene genererer dynamiske id-er.
 *
 * Stegrekkefølge for DEG SELV-arbeidstaker (verifisert i live-flyt 2026-06-21):
 *   oversikt → utsendingsperiode-og-land → arbeidssituasjon → skatteforhold-og-inntekt
 *   → familiemedlemmer → tilleggsopplysninger → vedlegg → oppsummering → kvittering
 *
 * Steg-metodene for arbeidssituasjon t.o.m. oppsummering deles med arbeidsgiver-varianten
 * (begge deler) — se soknad-arbeidsgiver.page.ts som komponerer denne POM-en for AT-stegene.
 */
export class SoknadUtsendtArbeidstakerPage {
  constructor(private page: Page) {}

  /**
   * Fra rollevalg-siden (/representasjon): velg DEG SELV, oppgi arbeidsgiver og start søknaden.
   * @returns søknads-id (UUID) fra URL-en.
   */
  async startSoknadSomDegSelv(arbeidsgiverOrgnr = '999999999'): Promise<string> {
    const page = this.page;
    await page.getByRole('button', { name: 'DEG SELV' }).click();
    await page.waitForURL(/\/oversikt/);

    await page.getByRole('textbox', { name: 'Arbeidsgivers organisasjonsnummer' }).fill(arbeidsgiverOrgnr);
    await page.getByRole('checkbox', { name: /Jeg bekrefter/ }).check();
    await page.getByRole('button', { name: 'Start søknad' }).click();

    await page.waitForURL(/\/skjema\/[^/]+\/utsendingsperiode-og-land/);
    return hentSkjemaIdFraUrl(page);
  }

  /**
   * MELOSYS-8170: Åpne DEG SELV-søknaden via varsel-lenken arbeidstaker får når arbeidsgiver har
   * sendt inn sin del UTEN fullmakt. Skjema-api bygger lenken som VARSLING_ARBEIDSTAKER_SKJEMA_LENKE
   * + `/oversikt?representasjonstype=DEG_SELV&arbeidsgiverOrgnr=…`, så arbeidstaker lander rett på
   * /oversikt med arbeidsgivers orgnr FORHÅNDSUTFYLT (og EREG-resolvet) — hen slipper å taste det
   * inn selv. I motsetning til {@link startSoknadSomDegSelv} går vi altså IKKE via rollevalget.
   * Forutsetter innlogget bruker (kjør SkjemaAuthHelper.login() først).
   *
   * Verifiserer kjernen i 8170 før den starter søknaden:
   *  - orgnr-feltet har lenkens orgnr som VERDI (satt av lenken, ikke tastet av testen),
   *  - EREG-oppslaget lenken utløser har resolvet arbeidsgiveren (navnet vises),
   *  - bekreftelsen er IKKE auto-huket (lenken forhåndsutfyller kun orgnr; arbeidstaker må fortsatt
   *    aktivt bekrefte før start).
   *
   * @param arbeidsgiverOrgnr        orgnr lenken bærer (= arbeidsgivers innsendte orgnr).
   * @param forventetArbeidsgiverNavn navnet EREG resolver orgnr til (ventes på før start).
   * @returns søknads-id (UUID) fra URL-en.
   */
  async startSoknadViaVarselLenke(
    arbeidsgiverOrgnr = '999999999',
    forventetArbeidsgiverNavn = 'Ståles Stål AS'
  ): Promise<string> {
    const page = this.page;
    const varselLenke = new URL(
      `oversikt?representasjonstype=DEG_SELV&arbeidsgiverOrgnr=${arbeidsgiverOrgnr}`,
      SkjemaAuthHelper.BASE_URL
    ).toString();
    await page.goto(varselLenke);
    await page.waitForURL(/\/oversikt/);

    await expect(
      page.getByRole('textbox', { name: 'Arbeidsgivers organisasjonsnummer' })
    ).toHaveValue(arbeidsgiverOrgnr);
    await expect(page.getByText(forventetArbeidsgiverNavn)).toBeVisible({ timeout: 10000 });

    const bekreftelse = page.getByRole('checkbox', { name: /Jeg bekrefter/ });
    await expect(bekreftelse, 'lenken skal kun forhåndsutfylle orgnr, ikke auto-bekrefte').not.toBeChecked();
    await bekreftelse.check();

    await page.getByRole('button', { name: 'Start søknad' }).click();
    await page.waitForURL(/\/skjema\/[^/]+\/utsendingsperiode-og-land/);
    return hentSkjemaIdFraUrl(page);
  }

  async fyllUtsendingsperiodeOgLand(land = 'Frankrike'): Promise<void> {
    const page = this.page;
    await expect(page.getByRole('heading', { name: 'Utsendingsperiode og land' })).toBeVisible();
    await page.getByLabel('I hvilket land skal arbeidet utføres?').selectOption({ label: land });

    const { fraDato, tilDato } = standardUtsendingsperiode();
    await page.getByRole('textbox', { name: 'Fra dato' }).fill(fraDato);
    await page.getByRole('textbox', { name: 'Til dato' }).fill(tilDato);

    await lagreOgFortsett(page, /\/arbeidssituasjon/);
  }

  async fyllArbeidssituasjon(): Promise<void> {
    await svarRadio(this.page, /lønnet arbeid i Norge/, 'Ja');
    await svarRadio(this.page, /selvstendig virksomhet eller arbeide for en annen/, 'Nei');
    await lagreOgFortsett(this.page, /\/skatteforhold-og-inntekt/);
  }

  async fyllSkatteforholdOgInntekt(): Promise<void> {
    const page = this.page;
    await svarRadio(page, /skattepliktig til Norge/, 'Ja');
    await page.getByRole('checkbox', { name: 'Norsk virksomhet' }).check();
    await page.getByRole('checkbox', { name: 'Lønnsinntekt' }).check();
    await svarRadio(page, /pengestøtte fra et annet EØS-land/, 'Nei');
    await lagreOgFortsett(page, /\/familiemedlemmer/);
  }

  async fyllFamiliemedlemmer(): Promise<void> {
    await svarRadio(this.page, /ektefelle, partner, samboer eller barn/, 'Nei');
    await lagreOgFortsett(this.page, /\/tilleggsopplysninger/);
  }

  async fyllTilleggsopplysninger(): Promise<void> {
    await svarRadio(this.page, /flere opplysninger til søknaden/, 'Nei');
    await lagreOgFortsett(this.page, /\/vedlegg/);
  }

  /**
   * Vedlegg-steget. Uten argument svarer den «Nei» (ingen vedlegg). Med en filsti svarer
   * den «Ja» og laster opp filen (deles av arbeidsgiver-varianten + T3 sin journalpost-assert).
   * @param filsti absolutt sti til en fil (PDF/JPG/PNG, maks 10 MB) — lastes opp via det
   *               skjulte file-input-feltet bak «Velg filer».
   */
  async fyllVedlegg(filsti?: string): Promise<void> {
    const page = this.page;
    if (filsti) {
      await svarRadio(page, /annen dokumentasjon/, 'Ja');
      await page.locator('input[type="file"]').setInputFiles(filsti);
      // Vent på at filnavn-chipen dukker opp — beviser at opplasting + ClamAV-scan er ferdig
      // (skjema-api lagrer vedlegget). Uten denne ventingen kan «Lagre og fortsett» tråkke
      // forbi før vedlegget er persistert.
      const filnavn = filsti.split('/').pop()!;
      await expect(page.getByRole('link', { name: filnavn })).toBeVisible({ timeout: 15000 });
    } else {
      await svarRadio(page, /annen dokumentasjon/, 'Nei');
    }
    await lagreOgFortsett(page, /\/oppsummering/);
  }

  /**
   * Send inn fra oppsummeringssiden og returner referansenummeret fra kvitteringen.
   */
  async sendInnOgHentReferanse(): Promise<string> {
    const page = this.page;
    await expect(page.getByRole('heading', { name: 'Oppsummering' })).toBeVisible();
    await page.getByRole('button', { name: 'Send søknad' }).click();

    await page.waitForURL(/\/kvittering/);
    await expect(page.getByRole('heading', { name: 'Takk!' })).toBeVisible();

    const kvitteringstekst = await page
      .getByText(/Vi har mottatt din søknad med referanse/)
      .innerText();
    // Feil HER hvis kvitteringsteksten ikke inneholder en referanse — tom streng ville ellers
    // smyge forbi T1-assertionen som en forvirrende regex-mismatch på '' i stedet for her.
    const referanse = kvitteringstekst.match(/referanse\s+([A-Z0-9]+)/)?.[1];
    expect(referanse, `Fant ikke referansenummer i kvitteringen: "${kvitteringstekst}"`).toBeTruthy();
    return referanse!;
  }

  /**
   * Fyll ut hele DEG SELV-flyten og send inn.
   * @returns søknads-id (UUID, korrelerer mot SKJEMA_SAK_MAPPING i melosys-api) og referansenummeret.
   */
  async fyllUtOgSendInnKomplettSoknad(
    arbeidsgiverOrgnr = '999999999',
    land = 'Frankrike',
    vedleggFilsti?: string
  ): Promise<{ skjemaId: string; referanse: string }> {
    const skjemaId = await this.startSoknadSomDegSelv(arbeidsgiverOrgnr);
    await this.fyllUtsendingsperiodeOgLand(land);
    await this.fyllArbeidssituasjon();
    await this.fyllSkatteforholdOgInntekt();
    await this.fyllFamiliemedlemmer();
    await this.fyllTilleggsopplysninger();
    await this.fyllVedlegg(vedleggFilsti);
    const referanse = await this.sendInnOgHentReferanse();
    return { skjemaId, referanse };
  }
}

/**
 * Hent søknads-id-en (UUID) ut av URL-en på første skjema-steg. Feil med en presis melding hvis
 * URL-formen har endret seg — ellers bæres en tom id videre til SKJEMA_SAK_MAPPING-oppslaget i T2
 * og gir en misvisende «Kafka-mottak feilet»-timeout 45s senere.
 */
export function hentSkjemaIdFraUrl(page: Page): string {
  const skjemaId = page.url().match(/\/skjema\/([0-9a-f-]{36})\//i)?.[1];
  expect(skjemaId, `Fant ikke søknads-id (UUID) i URL-en: ${page.url()}`).toBeTruthy();
  return skjemaId!;
}

export { ddmmyyyy };
