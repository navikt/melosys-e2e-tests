import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { TrygdeavtaleBehandlingAssertions } from './trygdeavtale-behandling.assertions';

/**
 * Page Object for Trygdeavtale (Agreement Country) behandling workflow
 *
 * Responsibilities:
 * - Fill in period dates (fra og med / til og med)
 * - Select arbeidsland (work country)
 * - Select arbeidsgiver (employer)
 * - Select søknad result (innvilge/avslå)
 * - Select bestemmelse (regulation)
 * - Navigate through steps
 *
 * Related pages:
 * - OpprettNySakPage (navigates from)
 * - TrygdeavtaleArbeidsstedPage (navigates to)
 *
 * @example
 * const behandling = new TrygdeavtaleBehandlingPage(page);
 * await behandling.fyllInnPeriode('01.01.2024', '01.01.2026');
 * await behandling.velgArbeidsland('AU'); // Australia
 * await behandling.klikkBekreftOgFortsett();
 * await behandling.velgArbeidsgiver('Ståles Stål AS');
 * await behandling.innvilgeSøknad();
 * await behandling.velgBestemmelse('AUS_ART9_3');
 * await behandling.klikkBekreftOgFortsett();
 */
export class TrygdeavtaleBehandlingPage extends BasePage {
  readonly assertions: TrygdeavtaleBehandlingAssertions;

  // Locators - Period section
  private readonly åpneDatovelgerButton = this.page.getByRole('button', {
    name: 'Åpne datovelger'
  });

  private readonly fraOgMedField = this.page.getByRole('textbox', {
    name: 'Fra og med'
  });

  private readonly tilOgMedField = this.page.getByRole('textbox', {
    name: 'Til og med Til og med'
  });

  private readonly arbeidslandDropdown = this.page.getByLabel('ArbeidslandArbeidsland');

  // Locators - Søknad result section
  private readonly innvilgeSøknadRadio = this.page.getByRole('radio', {
    name: 'Jeg vil innvilge søknaden'
  });

  private readonly avslåSøknadRadio = this.page.getByRole('radio', {
    name: 'Jeg vil avslå søknaden'
  });

  private readonly bestemmelseDropdown = this.page.getByLabel('Velg bestemmelse');

  // Common buttons
  private readonly bekreftOgFortsettButton = this.page.getByRole('button', {
    name: 'Bekreft og fortsett'
  });

  // Locators - Vedtak step (NV). Stegvelger wrapper hvert steg i <div id={stegnavn}>
  // (felleskomponenter/stegFane), så #VEDTAK scoper til vedtak-steget. Periode-
  // redigeringen ligger i en span med BEM-klassen vurderingVedtak__datofelt.
  private readonly vedtakSteg = this.page.locator('#VEDTAK');

  private readonly vedtakPeriodeEndreButton = this.vedtakSteg.getByRole('button', {
    name: 'Endre'
  });

  private readonly vedtakPeriodeTomFelt = this.vedtakSteg.locator(
    '.vurderingVedtak__datofelt input'
  );

  private readonly vedtakPeriodeLagreButton = this.vedtakSteg
    .locator('.vurderingVedtak__datofelt')
    .getByRole('button', { name: 'Lagre' });

  private readonly grunnForNyttVedtakDropdown = this.page.getByRole('combobox', {
    name: /Oppgi grunn for nytt vedtak/
  });

  private readonly fattVedtakButton = this.page.getByRole('button', {
    name: 'Fatt vedtak'
  });

  constructor(page: Page) {
    super(page);
    this.assertions = new TrygdeavtaleBehandlingAssertions(page);
  }

  /**
   * Fill in period dates (Fra og med / Til og med)
   * Opens date picker and fills both date fields
   *
   * @param fraOgMed - Start date in format DD.MM.YYYY (e.g., '01.01.2024')
   * @param tilOgMed - End date in format DD.MM.YYYY (e.g., '01.01.2026')
   */
  async fyllInnPeriode(fraOgMed: string, tilOgMed: string): Promise<void> {
    // Open date picker
    await this.åpneDatovelgerButton.first().click();
    console.log('✅ Opened date picker');

    // Fill "Fra og med" field
    await this.fraOgMedField.click();
    await this.fraOgMedField.fill(fraOgMed);
    console.log(`✅ Filled "Fra og med": ${fraOgMed}`);

    // Copy date for convenience (matches recorded test behavior)
    await this.fraOgMedField.press('ControlOrMeta+Shift+ArrowLeft');
    await this.fraOgMedField.press('ControlOrMeta+c');

    // Fill "Til og med" field
    await this.tilOgMedField.click();
    await this.tilOgMedField.fill(tilOgMed);
    console.log(`✅ Filled "Til og med": ${tilOgMed}`);
  }

  /**
   * Select arbeidsland (work country) from dropdown
   *
   * @param landkode - Country code (e.g., 'AU' for Australia, 'SE' for Sweden)
   */
  async velgArbeidsland(landkode: string): Promise<void> {
    await this.arbeidslandDropdown.selectOption(landkode);
    console.log(`✅ Selected arbeidsland: ${landkode}`);
  }

  /**
   * Select arbeidsgiver (employer) by radio button
   *
   * @param arbeidsgiverNavn - Name of employer (e.g., 'Ståles Stål AS')
   */
  async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
    const arbeidsgiverRadio = this.page.getByRole('radio', {
      name: arbeidsgiverNavn
    });
    await arbeidsgiverRadio.check();
    console.log(`✅ Selected arbeidsgiver: ${arbeidsgiverNavn}`);
  }

  /**
   * Select "Jeg vil innvilge søknaden" (approve application)
   */
  async innvilgeSøknad(): Promise<void> {
    await this.innvilgeSøknadRadio.check();
    console.log('✅ Selected: Innvilge søknaden');
  }

  /**
   * Select "Jeg vil avslå søknaden" (reject application)
   */
  async avslåSøknad(): Promise<void> {
    await this.avslåSøknadRadio.check();
    console.log('✅ Selected: Avslå søknaden');
  }

  /**
   * Select bestemmelse (regulation) from dropdown
   *
   * @param bestemmelse - Regulation code (e.g., 'AUS_ART9_3', 'SWE_ART10_1')
   */
  async velgBestemmelse(bestemmelse: string): Promise<void> {
    await this.bestemmelseDropdown.selectOption(bestemmelse);
    console.log(`✅ Selected bestemmelse: ${bestemmelse}`);
  }

  /**
   * Click "Bekreft og fortsett" button with retry logic for reliable step transitions
   */
  async klikkBekreftOgFortsett(): Promise<void> {
    await this.clickStepButtonWithRetry(this.bekreftOgFortsettButton);
  }

  /**
   * Complete period and arbeidsland section
   * Convenience method for first step
   *
   * @param fraOgMed - Start date (default: '01.01.2024')
   * @param tilOgMed - End date (default: '01.01.2026')
   * @param landkode - Country code (default: 'AU')
   */
  async fyllUtPeriodeOgLand(
    fraOgMed: string = '01.01.2024',
    tilOgMed: string = '01.01.2026',
    landkode: string = 'AU'
  ): Promise<void> {
    await this.fyllInnPeriode(fraOgMed, tilOgMed);
    await this.velgArbeidsland(landkode);
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Complete arbeidsgiver selection
   * Convenience method for second step
   *
   * @param arbeidsgiverNavn - Employer name (default: 'Ståles Stål AS')
   */
  async velgArbeidsgiverOgFortsett(arbeidsgiverNavn: string = 'Ståles Stål AS'): Promise<void> {
    // Click html to ensure page is loaded (from recorded test)
    await this.page.locator('html').click();
    await this.velgArbeidsgiver(arbeidsgiverNavn);
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Complete søknad result and bestemmelse section
   * Convenience method for third step
   *
   * @param bestemmelse - Regulation code (default: 'AUS_ART9_3')
   */
  async innvilgeOgVelgBestemmelse(bestemmelse: string = 'AUS_ART9_3'): Promise<void> {
    await this.innvilgeSøknad();
    await this.velgBestemmelse(bestemmelse);
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Complete entire Trygdeavtale behandling workflow with default values
   * Convenience method for standard workflow
   */
  async fyllUtTrygdeavtaleBehandling(): Promise<void> {
    await this.fyllUtPeriodeOgLand();
    await this.velgArbeidsgiverOgFortsett();
    await this.innvilgeOgVelgBestemmelse();
  }

  // ── Nyvurdering (NV) ─────────────────────────────────────────────────

  /**
   * NV Inngang-steget: feltene er prefilled fra forrige behandling — endre kun
   * "Til og med" (forkort/forleng perioden) og bekreft.
   *
   * NB: bruk fill() (erstatter innholdet); pressSequentially appender til
   * den prefilled datoen.
   *
   * @param tilOgMed - Ny sluttdato i format DD.MM.YYYY (f.eks. '31.12.2025')
   */
  async endreInngangTilOgMedOgFortsett(tilOgMed: string): Promise<void> {
    await this.tilOgMedField.waitFor({ state: 'visible', timeout: 15000 });
    await this.tilOgMedField.click();
    await this.tilOgMedField.fill(tilOgMed);
    console.log(`✅ NV Inngang: endret "Til og med" til ${tilOgMed}`);
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Vedtak-steget (NV): synk vedtaksperiodens TOM-dato med Inngang-endringen.
   *
   * GOTCHA: Periode-visningen på vedtak-steget viser GAMMEL TOM — den synker
   * IKKE automatisk fra Inngang-steget. Må klikke "Endre" → fylle inline
   * TOM-felt (kun TOM er redigerbart, FOM er låst) → "Lagre".
   *
   * @param tilOgMed - Ny sluttdato i format DD.MM.YYYY (f.eks. '31.12.2025')
   */
  async endreVedtaksperiodeTom(tilOgMed: string): Promise<void> {
    await this.vedtakPeriodeEndreButton.waitFor({ state: 'visible', timeout: 30000 });
    await this.vedtakPeriodeEndreButton.click();

    await this.vedtakPeriodeTomFelt.waitFor({ state: 'visible', timeout: 10000 });
    await this.vedtakPeriodeTomFelt.click();
    await this.vedtakPeriodeTomFelt.fill(tilOgMed);

    // "Lagre" trigger PUT /trygdeavtale-flyt/{behandlingID}; DOM-en oppdateres
    // optimistisk FØR svaret, så vent på selve lagringen for å unngå at
    // etterfølgende steg racer persisteringen på treg CI
    const lagrePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/trygdeavtale-flyt/') &&
        response.request().method() === 'PUT' &&
        response.ok(),
      { timeout: 30000 }
    );
    await this.vedtakPeriodeLagreButton.click();
    await lagrePromise;

    // Etter lagring rendres datoen som ren tekst i periode-visningen
    await this.vedtakSteg
      .locator('.vurderingVedtak__datofelt_wrapper')
      .getByText(tilOgMed)
      .waitFor({ state: 'visible', timeout: 10000 });
    console.log(`✅ Vedtaksperiode TOM endret og lagret: ${tilOgMed}`);
  }

  /**
   * Velg obligatorisk "grunn for nytt vedtak" på vedtak-steget.
   * For en nyvurdering (NV) er feltet påkrevd, og "Fatt vedtak" forblir
   * deaktivert til en grunn er valgt.
   *
   * @param grunn - Grunn-kode ('NYE_OPPLYSNINGER', 'FEIL_I_BEHANDLING' eller 'Fritekst')
   */
  async velgGrunnForNyttVedtak(grunn: string): Promise<void> {
    await this.grunnForNyttVedtakDropdown.waitFor({ state: 'visible', timeout: 10000 });
    await this.grunnForNyttVedtakDropdown.selectOption(grunn);
    console.log(`✅ Valgte grunn for nytt vedtak: ${grunn}`);
  }

  /**
   * Klikk "Fatt vedtak" på vedtak-steget og vent på at vedtaket faktisk fattes.
   * Venter på POST /api/saksflyt/vedtak/{id}/fatt (kan ta 30-60s på CI) slik at
   * vi ikke fortsetter før backend har registrert vedtaket.
   */
  async fattVedtak(): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await this.fattVedtakButton.waitFor({ state: 'visible', timeout: 10000 });

    const responsePromise = this.page.waitForResponse(
      response =>
        response.url().includes('/api/saksflyt/vedtak/') &&
        response.url().includes('/fatt') &&
        response.request().method() === 'POST' &&
        (response.status() === 200 || response.status() === 204),
      { timeout: 60000 }
    );

    await this.fattVedtakButton.click();

    const response = await responsePromise;
    console.log(`✅ Vedtak fattet - API fullført: ${response.url()} -> ${response.status()}`);
  }
}
