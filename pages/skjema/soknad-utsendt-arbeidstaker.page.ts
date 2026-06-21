import { Page, expect } from '@playwright/test';

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
    return page.url().match(/\/skjema\/([^/]+)\//)?.[1] ?? '';
  }

  async fyllUtsendingsperiodeOgLand(land = 'Frankrike'): Promise<void> {
    const page = this.page;
    await expect(page.getByRole('heading', { name: 'Utsendingsperiode og land' })).toBeVisible();
    await page.getByLabel('I hvilket land skal arbeidet utføres?').selectOption({ label: land });

    // Periode godt innenfor 24-måneders-grensen, beregnet relativt til i dag så testen ikke ruster.
    const fra = new Date();
    fra.setMonth(fra.getMonth() + 1, 1); // 1. i neste måned
    const til = new Date(fra);
    til.setMonth(til.getMonth() + 6);
    await page.getByRole('textbox', { name: 'Fra dato' }).fill(ddmmyyyy(fra));
    await page.getByRole('textbox', { name: 'Til dato' }).fill(ddmmyyyy(til));

    await this.lagreOgFortsett(/\/arbeidssituasjon/);
  }

  async fyllArbeidssituasjon(): Promise<void> {
    await this.svarRadio(/lønnet arbeid i Norge/, 'Ja');
    await this.svarRadio(/selvstendig virksomhet eller arbeide for en annen/, 'Nei');
    await this.lagreOgFortsett(/\/skatteforhold-og-inntekt/);
  }

  async fyllSkatteforholdOgInntekt(): Promise<void> {
    const page = this.page;
    await this.svarRadio(/skattepliktig til Norge/, 'Ja');
    await page.getByRole('checkbox', { name: 'Norsk virksomhet' }).check();
    await page.getByRole('checkbox', { name: 'Lønnsinntekt' }).check();
    await this.svarRadio(/pengestøtte fra et annet EØS-land/, 'Nei');
    await this.lagreOgFortsett(/\/familiemedlemmer/);
  }

  async fyllFamiliemedlemmer(): Promise<void> {
    await this.svarRadio(/ektefelle, partner, samboer eller barn/, 'Nei');
    await this.lagreOgFortsett(/\/tilleggsopplysninger/);
  }

  async fyllTilleggsopplysninger(): Promise<void> {
    await this.svarRadio(/flere opplysninger til søknaden/, 'Nei');
    await this.lagreOgFortsett(/\/vedlegg/);
  }

  async fyllVedlegg(): Promise<void> {
    await this.svarRadio(/annen dokumentasjon/, 'Nei');
    await this.lagreOgFortsett(/\/oppsummering/);
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
    return kvitteringstekst.match(/referanse\s+([A-Z0-9]+)/)?.[1] ?? '';
  }

  /**
   * Fyll ut hele DEG SELV-flyten og send inn.
   * @returns søknads-id (UUID, korrelerer mot SKJEMA_SAK_MAPPING i melosys-api) og referansenummeret.
   */
  async fyllUtOgSendInnKomplettSoknad(
    arbeidsgiverOrgnr = '999999999',
    land = 'Frankrike'
  ): Promise<{ skjemaId: string; referanse: string }> {
    const skjemaId = await this.startSoknadSomDegSelv(arbeidsgiverOrgnr);
    await this.fyllUtsendingsperiodeOgLand(land);
    await this.fyllArbeidssituasjon();
    await this.fyllSkatteforholdOgInntekt();
    await this.fyllFamiliemedlemmer();
    await this.fyllTilleggsopplysninger();
    await this.fyllVedlegg();
    const referanse = await this.sendInnOgHentReferanse();
    return { skjemaId, referanse };
  }

  private async svarRadio(gruppe: RegExp, svar: 'Ja' | 'Nei'): Promise<void> {
    // Aksel RadioGroup rendrer <fieldset role="radiogroup"> med legend som tilgjengelig navn.
    await this.page.getByRole('radiogroup', { name: gruppe }).getByRole('radio', { name: svar }).check();
  }

  private async lagreOgFortsett(nesteUrl: RegExp): Promise<void> {
    await this.page.getByRole('button', { name: 'Lagre og fortsett' }).click();
    await this.page.waitForURL(nesteUrl);
  }
}

/** dd.mm.yyyy — formatet Aksel DatePicker forventer på norsk. */
function ddmmyyyy(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}
