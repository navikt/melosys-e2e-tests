import { Page, expect } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { KallSporing } from '../shared/kall-sporing';
import { sporForhåndskontroll, ventPåForhåndskontroll } from '../shared/stoppet-vedtak.assertions';

/**
 * Page Object for behandlingstema IKKE_YRKESAKTIV, felles for EU/EØS og trygdeavtale
 * (rute: /melosys/{EU_EOS|TRYGDEAVTALE}/ikkeYrkesaktiv/{saksnr}/?behandlingID={id}).
 *
 * Tre steg (melosys-web `src/sider/ikkeYrkesaktiv/`):
 * 1. «Oppgi opplysninger fra søknaden»: periode og land
 * 2. «Bestemmelse og vurdering»: innvilgelse og bestemmelse
 * 3. Vedtak («Omfattet av norsk trygdelovgivning - …»): periode, fritekster og «Fatt vedtak»
 *
 * @example
 * const ikkeYrkesaktiv = new IkkeYrkesaktivBehandlingPage(page);
 * await ikkeYrkesaktiv.fyllUtSøknadsopplysninger('01.01.2024', '31.12.2025', 'SE');
 * await ikkeYrkesaktiv.bekreftOgFortsett();
 * await ikkeYrkesaktiv.innvilgOgVelgBestemmelse('FO_883_2004_ART11_2');
 * await ikkeYrkesaktiv.fattVedtak();
 *
 * // Ny vurdering: inngang og bestemmelse er kopiert fra forrige behandling
 * await ikkeYrkesaktiv.bekreftKopierteSøknadsopplysninger('01.01.2024', '31.12.2025', 'AU');
 * await ikkeYrkesaktiv.innvilgOgVelgBestemmelse('AUS_ART11');
 * await ikkeYrkesaktiv.velgGrunnForNyttVedtak('NYE_OPPLYSNINGER');
 * await ikkeYrkesaktiv.fattVedtak();
 */
export class IkkeYrkesaktivBehandlingPage extends BasePage {
  // ── Steg 1: Inngang ──────────────────────────────────────────────────
  private readonly inngang = this.page.locator('.vurderingInngang_ikkeYrkesaktiv');

  private readonly inngangHeading = this.page.getByRole('heading', {
    name: 'Oppgi opplysninger fra søknaden',
    level: 1,
  });

  private readonly fraOgMedField = this.inngang.getByRole('textbox', { name: /^Fra og med/ });

  // «Til og med» har hjelpetekst i etiketten, så navnet er lengre enn selve etiketten
  private readonly tilOgMedField = this.inngang.getByRole('textbox', { name: /^Til og med/ });

  private readonly landDropdown = this.inngang.getByLabel('Land', { exact: true });

  // ── Steg 2: Bestemmelse og vurdering ─────────────────────────────────
  private readonly bestemmelseHeading = this.page.getByRole('heading', {
    name: 'Bestemmelse og vurdering',
    level: 1,
  });

  private readonly innvilgRadio = this.page.getByRole('radio', { name: 'Jeg vil innvilge søknaden' });

  private readonly bestemmelseDropdown = this.page.getByLabel('Velg bestemmelse');

  // ── Steg 3: Vedtak ───────────────────────────────────────────────────
  private readonly vedtakHeading = this.page.getByRole('heading', {
    name: /^Omfattet av norsk trygdelovgivning/,
    level: 1,
  });

  // Feilmeldinger-komponenten viser kontrollfeil i en feilstripe over stegknappene
  private readonly kontrollfeilStripe = this.page.locator('.feilmelding .varselstripe');

  private readonly fattVedtakButton = this.page.getByRole('button', { name: 'Fatt vedtak' });

  // Vises bare på en ny vurdering; «Fatt vedtak» er deaktivert til en grunn er valgt
  private readonly grunnForNyttVedtakDropdown = this.page.getByRole('combobox', {
    name: /Oppgi grunn for nytt vedtak/,
  });

  // ── Felles ───────────────────────────────────────────────────────────
  private readonly bekreftOgFortsettButton = this.page.getByRole('button', { name: 'Bekreft og fortsett' });

  private forhåndskontroll: KallSporing | null = null;

  constructor(page: Page) {
    super(page);
  }

  /**
   * Fyll ut «Oppgi opplysninger fra søknaden».
   *
   * @param fraOgMed - Startdato DD.MM.YYYY
   * @param tilOgMed - Sluttdato DD.MM.YYYY. Fyll den ut: uten sluttdato stopper
   *                   kontrollen periodeManglerSluttdato vedtaket.
   * @param land     - Landkode, f.eks. 'SE' (EU/EØS) eller 'AU' (trygdeavtale)
   */
  async fyllUtSøknadsopplysninger(fraOgMed: string, tilOgMed: string, land: string): Promise<void> {
    await this.inngangHeading.waitFor({ state: 'visible', timeout: 30000 });

    await this.fraOgMedField.click();
    await this.fraOgMedField.fill(fraOgMed);
    console.log(`✅ Fylte "Fra og med": ${fraOgMed}`);

    await this.tilOgMedField.click();
    await this.tilOgMedField.fill(tilOgMed);
    console.log(`✅ Fylte "Til og med": ${tilOgMed}`);

    await this.landDropdown.selectOption(land);
    console.log(`✅ Valgte land: ${land}`);
  }

  /**
   * Bekreft inngangssteget. Første klikk lagrer periode og land, oppfrisker
   * registeropplysningene i en dialog og går videre til neste steg av seg selv.
   */
  async bekreftOgFortsett(): Promise<void> {
    await this.clickStepButtonWithRetry(this.bekreftOgFortsettButton);
    await this.bestemmelseHeading.waitFor({ state: 'visible', timeout: 60000 });
    console.log('✅ Steg «Bestemmelse og vurdering» vises');
  }

  /**
   * Ny vurdering: inngangssteget er kopiert fra forrige behandling. Krev at periode
   * og land står der, og bekreft uten å endre dem.
   */
  async bekreftKopierteSøknadsopplysninger(fraOgMed: string, tilOgMed: string, land: string): Promise<void> {
    await this.inngangHeading.waitFor({ state: 'visible', timeout: 30000 });
    await expect(this.fraOgMedField).toHaveValue(fraOgMed);
    await expect(this.tilOgMedField).toHaveValue(tilOgMed);
    await expect(this.landDropdown).toHaveValue(land);
    console.log(`✅ Kopierte søknadsopplysninger: ${fraOgMed}–${tilOgMed}, ${land}`);
    await this.bekreftOgFortsett();
  }

  /**
   * Velg «Jeg vil innvilge søknaden» og bestemmelse, og gå til vedtakssteget.
   *
   * Radioknappen og bestemmelsen lagrer hver sin lovvalgsperiode. Vi venter på
   * lagringen etter radioknappen før bestemmelsen velges, ellers kan den første
   * lagringen (uten bestemmelse) bli den siste.
   *
   * På en ny vurdering er radioknappen kopiert fra forrige behandling. `check()` på
   * en avkrysset radioknapp gjør ingenting og lagrer ikke, så da hopper vi over den.
   * Bestemmelsen velges alltid: nedtrekkslisten lagrer ved hvert valg, også når
   * verdien er den samme.
   *
   * @param bestemmelse - Bestemmelseskode, f.eks. 'FO_883_2004_ART11_2' eller 'AUS_ART11'.
   *                      Ikke FO_883_2004_ART11_3E: den krever «Velg brukers situasjon»,
   *                      som denne metoden ikke fyller ut.
   */
  async innvilgOgVelgBestemmelse(bestemmelse: string): Promise<void> {
    await this.innvilgRadio.waitFor({ state: 'visible', timeout: 15000 });
    if (await this.innvilgRadio.isChecked()) {
      console.log('✅ «Jeg vil innvilge søknaden» er kopiert fra forrige behandling');
    } else {
      await this.lagreLovvalgsperiode(() => this.innvilgRadio.check());
      console.log('✅ Valgte «Jeg vil innvilge søknaden»');
    }

    await this.bestemmelseDropdown.waitFor({ state: 'visible', timeout: 15000 });
    await this.waitForDropdownToPopulate(this.bestemmelseDropdown);
    await this.lagreLovvalgsperiode(() => this.bestemmelseDropdown.selectOption(bestemmelse));
    console.log(`✅ Valgte bestemmelse: ${bestemmelse}`);

    // Vedtakssteget kjører forhåndskontrollen når det åpnes, så sporingen må starte før klikket
    this.forhåndskontroll = sporForhåndskontroll(this.page);
    await this.clickStepButtonWithRetry(this.bekreftOgFortsettButton);
    await this.vedtakHeading.waitFor({ state: 'visible', timeout: 30000 });
    console.log('✅ Vedtakssteget vises');
  }

  /**
   * Ny vurdering: velg grunn for nytt vedtak på vedtakssteget og vent på at den lagres.
   *
   * @param grunn - f.eks. 'NYE_OPPLYSNINGER' eller 'FEIL_I_BEHANDLING'
   */
  async velgGrunnForNyttVedtak(grunn: string): Promise<void> {
    await this.grunnForNyttVedtakDropdown.waitFor({ state: 'visible', timeout: 15000 });
    const [svar] = await Promise.all([
      this.page.waitForResponse(
        r => r.url().includes('/resultat/nyvurderingbakgrunn') && r.request().method() === 'POST',
        { timeout: 15000 }
      ),
      this.grunnForNyttVedtakDropdown.selectOption(grunn),
    ]);
    expect(
      svar.ok(),
      `Lagring av grunn for nytt vedtak svarte ${svar.status()}: ${await svar.text().catch(() => '')}`
    ).toBeTruthy();
    console.log(`✅ Valgte grunn for nytt vedtak: ${grunn}`);
  }

  /**
   * Klikk «Fatt vedtak» og vent på at /fatt svarer OK.
   *
   * Venter først på forhåndskontrollen og krever at den ikke fant feil. Ellers
   * stopper vedtaket før iverksettingen, og testen feiler av feil grunn.
   */
  async fattVedtak(): Promise<void> {
    expect(
      this.forhåndskontroll,
      'innvilgOgVelgBestemmelse() må åpne vedtakssteget før fattVedtak()'
    ).not.toBeNull();
    await ventPåForhåndskontroll(this.forhåndskontroll!);
    // Neste vedtak på samme side skal ikke vente på tellingene fra dette
    this.forhåndskontroll = null;
    await expect(
      this.kontrollfeilStripe,
      'Forhåndskontrollen på vedtakssteget skal ikke vise feil'
    ).toHaveCount(0);
    await expect(this.fattVedtakButton).toBeEnabled({ timeout: 15000 });

    const [svar] = await Promise.all([
      this.page.waitForResponse(
        r =>
          r.url().includes('/api/saksflyt/vedtak/') &&
          r.url().includes('/fatt') &&
          r.request().method() === 'POST',
        { timeout: 60000 }
      ),
      this.fattVedtakButton.click(),
    ]);
    expect(svar.ok(), `/fatt svarte ${svar.status()}: ${await svar.text().catch(() => '')}`).toBeTruthy();
    console.log(`✅ Vedtak fattet: ${svar.url()} -> ${svar.status()}`);
  }

  /** Utfør `handling` og krev at lovvalgsperioden den lagrer, svarer OK. */
  private async lagreLovvalgsperiode(handling: () => Promise<unknown>): Promise<void> {
    const [svar] = await Promise.all([
      this.page.waitForResponse(
        r => r.url().includes('/lovvalgsperioder') && ['POST', 'PUT'].includes(r.request().method()),
        { timeout: 15000 }
      ),
      handling(),
    ]);
    expect(
      svar.ok(),
      `Lagring av lovvalgsperiode svarte ${svar.status()}: ${await svar.text().catch(() => '')}`
    ).toBeTruthy();
  }
}
