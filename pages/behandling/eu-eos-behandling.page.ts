import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { EuEosBehandlingAssertions } from './eu-eos-behandling.assertions';

/**
 * Page Object for EU/EØS behandling workflow
 *
 * Ansvar:
 * - Fylle inn periode (med dateplukker)
 * - Velge land (EU/EØS-land)
 * - Bekrefte første steg
 * - Velge yrkesaktiv/selvstendig
 * - Velge arbeidsgiver(e)
 * - Velge arbeidstype (lønnet arbeid)
 * - Svare på spørsmål (Ja/Nei)
 * - Innvilge/avslå søknad
 * - Fatte vedtak
 *
 * Relaterte sider:
 * - OpprettNySakPage (navigerer fra)
 * - Komplett arbeidsflyt (siste steg)
 *
 * @example
 * const behandling = new EuEosBehandlingPage(page);
 * await behandling.fyllInnFraTilDato('01.01.2024', '01.01.2026');
 * await behandling.velgLand('Danmark');
 * await behandling.klikkBekreftOgFortsett();
 * await behandling.velgYrkesaktiv();
 * await behandling.klikkBekreftOgFortsett();
 */
export class EuEosBehandlingPage extends BasePage {
  readonly assertions: EuEosBehandlingAssertions;

  // Locators - Periode
  private readonly åpneDatepickerButton = this.page.getByRole('button', {
    name: 'Åpne datovelger'
  });

  private readonly årDropdown = this.page.getByRole('dialog').getByLabel('År');

  private readonly fraDatoField = this.page.getByRole('textbox', { name: 'Fra' });
  private readonly tilDatoField = this.page.getByRole('textbox', { name: 'Til' });

  // Locators - Land
  private readonly landDropdown = this.page.locator('.css-19bb58m');

  // Locators - Yrkesaktiv/Selvstendig
  private readonly yrkesaktivRadio = this.page.getByRole('radio', {
    name: 'Yrkesaktiv',
    exact: true
  });

  private readonly selvstendigRadio = this.page.getByRole('radio', {
    name: 'Selvstendig',
    exact: true
  });

  // Locators - Arbeidstype
  private readonly lønnetArbeidRadio = this.page.getByRole('radio', {
    name: 'Lønnet arbeid'
  });

  private readonly ulønnetArbeidRadio = this.page.getByRole('radio', {
    name: 'Ulønnet arbeid'
  });

  // Locators - Søknadsresultat
  private readonly innvilgeSøknadRadio = this.page.getByRole('radio', {
    name: 'Ja, jeg vil innvilge søknaden'
  });

  private readonly avslåSøknadRadio = this.page.getByRole('radio', {
    name: 'Nei, jeg vil avslå søknaden'
  });

  // Felles knapper
  private readonly bekreftOgFortsettButton = this.page.getByRole('button', {
    name: 'Bekreft og fortsett'
  });

  private readonly fattVedtakButton = this.page.getByRole('button', {
    name: 'Fatt vedtak'
  });

  constructor(page: Page) {
    super(page);
    this.assertions = new EuEosBehandlingAssertions(page);
  }

  /**
   * Åpne dateplukker og velg år og dag
   * Brukes for startdato
   *
   * @param år - År (f.eks. '2024')
   * @param dag - Dag som tekst (f.eks. 'fredag 1', 'lørdag 15')
   */
  async velgPeriodeMedDatepicker(år: string, dag: string): Promise<void> {
    await this.åpneDatepickerButton.first().click();
    console.log('✅ Åpnet dateplukker');

    await this.årDropdown.selectOption(år);
    console.log(`✅ Valgte år: ${år}`);

    await this.page.getByRole('button', { name: dag, exact: true }).click();
    console.log(`✅ Valgte dag: ${dag}`);
  }

  /**
   * Fyll inn startdato i tekstfelt
   *
   * @param dato - Dato i format DD.MM.YYYY (f.eks. '01.01.2024')
   */
  async fyllInnStartdato(dato: string): Promise<void> {
    await this.fraDatoField.click();
    await this.fraDatoField.fill(dato);
    await this.fraDatoField.press('Enter');
    console.log(`✅ Fylte inn startdato: ${dato}`);
  }

  /**
   * Fyll inn sluttdato i tekstfelt
   *
   * @param dato - Dato i format DD.MM.YYYY (f.eks. '01.01.2026')
   */
  async fyllInnSluttdato(dato: string): Promise<void> {
    await this.tilDatoField.click();
    await this.tilDatoField.fill(dato);
    await this.tilDatoField.press('Enter');
    console.log(`✅ Fylte inn sluttdato: ${dato}`);
  }

  /**
   * Fyll inn både startdato og sluttdato
   * Hjelpemetode som kombinerer startdato og sluttdato
   *
   * @param fraDato - Startdato i format DD.MM.YYYY (f.eks. '01.01.2024')
   * @param tilDato - Sluttdato i format DD.MM.YYYY (f.eks. '01.01.2026')
   */
  async fyllInnFraTilDato(fraDato: string, tilDato: string): Promise<void> {
    await this.fyllInnStartdato(fraDato);
    await this.fyllInnSluttdato(tilDato);
    console.log(`✅ Fylte inn periode: ${fraDato} - ${tilDato}`);
  }

  /**
   * Velg land fra dropdown
   * Bruker CSS-locator da denne dropdown-komponenten ikke har god label
   *
   * @param landNavn - Navn på land (f.eks. 'Danmark', 'Sverige')
   */
  async velgLand(landNavn: string): Promise<void> {
    await this.landDropdown.click();
    await this.page.getByRole('option', { name: landNavn }).click();
    // Vent litt for at siden skal oppdatere seg (kan trigge visning av andre felter)
    await this.page.waitForTimeout(500);
    console.log(`✅ Valgte land: ${landNavn}`);
  }

  /**
   * Velg andre land fra dropdown (for "Arbeid i flere land")
   * Dette er en multi-select dropdown - klikk samme dropdown igjen for å legge til flere land
   *
   * @param landNavn - Navn på land (f.eks. 'Norge')
   */
  async velgAndreLand(landNavn: string): Promise<void> {
    // For "Arbeid i flere land" er det en multi-select dropdown
    // Klikk samme dropdown igjen for å legge til flere land
    await this.landDropdown.click();

    // Velg landet fra listen
    await this.page.getByRole('option', { name: landNavn, exact: true }).click();
    console.log(`✅ Valgte andre land: ${landNavn}`);
  }

  /**
   * Velg "Yrkesaktiv" radio-knapp
   */
  async velgYrkesaktiv(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.yrkesaktivRadio.waitFor({ state: 'visible' });
    await this.yrkesaktivRadio.check();
    console.log('✅ Valgte: Yrkesaktiv');
  }

  /**
   * Velg "Selvstendig" radio-knapp
   */
  async velgSelvstendig(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.selvstendigRadio.waitFor({ state: 'visible' });
    await this.selvstendigRadio.check();
    console.log('✅ Valgte: Selvstendig');
  }

  /**
   * Velg arbeidsgiver(e) med checkbox
   *
   * IMPORTANT: Checkbox triggers immediate API save when checked!
   * This method now waits for that API call to complete.
   *
   * FIX: Now actively waits for employer API to complete before looking for checkbox.
   * The employer list is loaded asynchronously after step transition.
   *
   * @param arbeidsgiverNavn - Navn på arbeidsgiver (f.eks. 'Ståles Stål AS')
   */
  async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
    console.log(`\n🔍 velgArbeidsgiver("${arbeidsgiverNavn}")`);

    // CRITICAL FIX: Wait for employer data API to complete FIRST
    // The checkbox won't appear until the backend returns employer data.
    // networkidle is not reliable because it might pass before the API is even called.
    console.log(`⏳ Waiting for employer data API (20s timeout)...`);
    const apiStart = Date.now();

    const employerApiResponse = await this.page.waitForResponse(
      response => {
        const responseUrl = response.url();
        const isEmployerApi = (
          responseUrl.includes('/arbeidsforhold') ||
          responseUrl.includes('/virksomheter') ||
          responseUrl.includes('/registeropplysninger') ||
          responseUrl.includes('/mottatteopplysninger')
        ) && response.status() === 200;

        if (isEmployerApi) {
          console.log(`📡 Employer API: ${responseUrl} → ${response.status()}`);
        }
        return isEmployerApi;
      },
      { timeout: 20000 }
    ).catch(() => {
      console.log('⚠️  No employer API within 20s - checkbox might already be rendered');
      return null;
    });

    if (employerApiResponse) {
      console.log(`✅ Employer API completed (${Date.now() - apiStart}ms)`);
    }

    // Wait for React to render after API response
    await this.page.waitForTimeout(500);

    // Wait for any remaining network activity
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      console.log('⚠️  Network idle timeout (non-critical)');
    });

    // Now look for the checkbox
    const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });

    // Check if already visible
    const isVisible = await checkbox.isVisible().catch(() => false);
    if (!isVisible) {
      // Debug: list available checkboxes
      const allCheckboxes = await this.page.getByRole('checkbox').all();
      console.log(`📋 Available checkboxes (${allCheckboxes.length}):`);
      for (const box of allCheckboxes) {
        const label = await box.getAttribute('aria-label') ||
                      await box.getAttribute('name') ||
                      'unknown';
        console.log(`   - "${label}"`);
      }
    }

    // Wait for checkbox to be visible
    console.log(`⏳ Waiting for checkbox "${arbeidsgiverNavn}" to be visible...`);
    await checkbox.waitFor({ state: 'visible', timeout: 30000 });

    // Set up response listener BEFORE checking (checkbox triggers API save)
    const responsePromise = this.page.waitForResponse(
      response => response.url().includes('/api/mottatteopplysninger/') &&
                  response.request().method() === 'POST' &&
                  response.status() === 200,
      { timeout: 5000 }
    ).catch(() => null);

    await checkbox.check();

    // Wait for API save
    const response = await responsePromise;
    if (response) {
      console.log(`✅ Arbeidsgiver saved: ${response.url()}`);
    }

    console.log(`✅ Valgte arbeidsgiver: ${arbeidsgiverNavn}\n`);
  }

  /**
   * Velg "Lønnet arbeid" radio-knapp
   */
  async velgLønnetArbeid(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.lønnetArbeidRadio.waitFor({ state: 'visible' });
    await this.lønnetArbeidRadio.check();
    console.log('✅ Valgte: Lønnet arbeid');
  }

  /**
   * Velg "Ulønnet arbeid" radio-knapp
   */
  async velgUlønnetArbeid(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.ulønnetArbeidRadio.waitFor({ state: 'visible' });
    await this.ulønnetArbeidRadio.check();
    console.log('✅ Valgte: Ulønnet arbeid');
  }

  /**
   * Svar "Ja" på første synlige spørsmål
   * Brukes når det bare er ett spørsmål på siden
   *
   * FIX: Added longer timeout and network wait for slow CI environments.
   */
  async svarJa(): Promise<void> {
    // Wait for network to stabilize after step transition
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      console.log('⚠️  Network idle timeout (non-critical)');
    });

    const jaRadio = this.page.getByRole('radio', { name: 'Ja' });
    // Vent på at radio-knapp er synlig (increased timeout for slow CI)
    await jaRadio.waitFor({ state: 'visible', timeout: 30000 });
    await jaRadio.check();
    console.log('✅ Svarte: Ja');
  }

  /**
   * Svar "Nei" på første synlige spørsmål
   */
  async svarNei(): Promise<void> {
    const neiRadio = this.page.getByRole('radio', { name: 'Nei' });
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await neiRadio.waitFor({ state: 'visible' });
    await neiRadio.check();
    console.log('✅ Svarte: Nei');
  }

  /**
   * Velg "Ja, jeg vil innvilge søknaden"
   */
  async innvilgeSøknad(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.innvilgeSøknadRadio.waitFor({ state: 'visible' });
    await this.innvilgeSøknadRadio.check();
    console.log('✅ Valgte: Innvilge søknaden');
  }

  /**
   * Velg "Nei, jeg vil avslå søknaden"
   */
  async avslåSøknad(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.avslåSøknadRadio.waitFor({ state: 'visible' });
    await this.avslåSøknadRadio.check();
    console.log('✅ Valgte: Avslå søknaden');
  }

  /**
   * Klikk "Bekreft og fortsett" knapp
   * Venter på at siden er klar etter navigasjon
   *
   * IMPORTANT: This method waits for specific step transition API calls.
   * Each step transition triggers 5-6 POST requests to save all form data:
   * - POST /api/avklartefakta/{id} -> 200 (clarified facts)
   * - POST /api/vilkaar/{id} -> 200 (conditions)
   * - POST /api/anmodningsperioder/{id} -> 200 (request periods)
   * - POST /api/utpekingsperioder/{id} -> 200 (designation periods)
   * - POST /api/mottatteopplysninger/{id} -> 200 (received info, often 2x)
   *
   * We wait for the two most critical endpoints (avklartefakta and vilkaar)
   * which are always present in step transitions.
   */
  async klikkBekreftOgFortsett(): Promise<void> {
    console.log('🔄 Klikker "Bekreft og fortsett"...');
    const urlBefore = this.page.url();

    // Check if button is enabled before clicking
    const isEnabled = await this.bekreftOgFortsettButton.isEnabled();
    console.log(`  Knapp aktivert: ${isEnabled}`);

    // CRITICAL: Set up response listeners BEFORE clicking
    // Wait for the two most important step transition APIs
    const avklartefaktaPromise = this.page.waitForResponse(
      response => response.url().includes('/api/avklartefakta/') &&
                  response.request().method() === 'POST' &&
                  response.status() === 200,
      { timeout: 10000 }
    ).catch(() => null); // Don't fail if not present in this step

    const vilkaarPromise = this.page.waitForResponse(
      response => response.url().includes('/api/vilkaar/') &&
                  response.request().method() === 'POST' &&
                  response.status() === 200,
      { timeout: 10000 }
    ).catch(() => null); // Don't fail if not present in this step

    await this.bekreftOgFortsettButton.click();

    // Wait for critical APIs to complete (if they fire)
    const [avklartefaktaResponse, vilkaarResponse] = await Promise.all([
      avklartefaktaPromise,
      vilkaarPromise
    ]);

    if (avklartefaktaResponse || vilkaarResponse) {
      console.log('✅ Step transition APIs completed:');
      if (avklartefaktaResponse) console.log(`   - avklartefakta: ${avklartefaktaResponse.status()}`);
      if (vilkaarResponse) console.log(`   - vilkaar: ${vilkaarResponse.status()}`);
    } else {
      console.log('⚠️  No step transition APIs detected, waiting for React state update');
    }

    // Still wait for React state update
    await this.page.waitForTimeout(500);

    // Optional: Wait for network idle as fallback (shorter timeout now)
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      console.log('⚠️  Network idle timeout (non-critical)');
    });

    const urlAfter = this.page.url();
    console.log(`✅ Klikket Bekreft og fortsett`);
    console.log(`  URL før:  ${urlBefore}`);
    console.log(`  URL etter: ${urlAfter}`);
    console.log(`  URL endret: ${urlBefore !== urlAfter}`);
  }

  /**
   * Klikk "Fatt vedtak" knapp for å fullføre behandlingen
   * EU/EØS fatter vedtak direkte uten egen vedtaksside
   *
   * IMPORTANT: This method waits for the critical vedtak creation API call.
   * The endpoint POST /api/saksflyt/vedtak/{id}/fatt creates the vedtak document
   * and can take 30-60 seconds on CI.
   *
   * Network pattern:
   * - POST /api/saksflyt/vedtak/{id}/fatt -> 204 (vedtak creation)
   * - POST /api/kontroll/ferdigbehandling -> 400 (completion check, may fail)
   */
  async fattVedtak(): Promise<void> {
    // Vent på at nettverket er stille før vi fatter vedtak
    // Dette sikrer at alle tidligere API-kall er fullført
    await this.page.waitForLoadState('networkidle', { timeout: 10000 });

    // Vent på at "Fatt vedtak"-knappen er synlig og aktivert
    await this.fattVedtakButton.waitFor({ state: 'visible', timeout: 10000 });

    // CRITICAL: Set up response listener BEFORE clicking
    // Wait for the vedtak creation API - this is the MOST IMPORTANT endpoint!
    const responsePromise = this.page.waitForResponse(
      response => response.url().includes('/api/saksflyt/vedtak/') &&
                  response.url().includes('/fatt') &&
                  response.request().method() === 'POST' &&
                  (response.status() === 200 || response.status() === 204),
      { timeout: 60000 } // Long timeout - vedtak creation can take 30-60 seconds on CI
    );

    await this.fattVedtakButton.click();

    // Wait for vedtak creation to complete
    const response = await responsePromise;
    console.log(`✅ Vedtak fattet - API completed: ${response.url()} -> ${response.status()}`);
  }

  /**
   * Fullfør periode-seksjonen
   * Hjelpemetode for første steg
   *
   * @param år - År (default: '2024')
   * @param dag - Dag (default: 'fredag 1')
   * @param sluttdato - Sluttdato (default: '01.01.2026')
   * @param land - Land (default: 'Danmark')
   */
  async fyllUtPeriodeOgLand(
    år: string = '2024',
    dag: string = 'fredag 1',
    sluttdato: string = '01.01.2026',
    land: string = 'Danmark'
  ): Promise<void> {
    await this.velgPeriodeMedDatepicker(år, dag);
    await this.fyllInnSluttdato(sluttdato);
    await this.velgLand(land);
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Fullfør yrkesaktiv/selvstendig-seksjonen
   * Hjelpemetode for andre steg
   *
   * @param erYrkesaktiv - true for Yrkesaktiv, false for Selvstendig (default: true)
   */
  async velgYrkesaktivEllerSelvstendigOgFortsett(erYrkesaktiv: boolean = true): Promise<void> {
    if (erYrkesaktiv) {
      await this.velgYrkesaktiv();
    } else {
      await this.velgSelvstendig();
    }
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Fullfør arbeidsgiver-seksjonen
   * Hjelpemetode for tredje steg
   *
   * @param arbeidsgiverNavn - Navn på arbeidsgiver (default: 'Ståles Stål AS')
   */
  async velgArbeidsgiverOgFortsett(arbeidsgiverNavn: string = 'Ståles Stål AS'): Promise<void> {
    await this.velgArbeidsgiver(arbeidsgiverNavn);
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Fullfør arbeidstype-seksjonen
   * Hjelpemetode for fjerde steg
   *
   * @param erLønnetArbeid - true for Lønnet arbeid, false for Ulønnet arbeid (default: true)
   */
  async velgArbeidstype(erLønnetArbeid: boolean = true): Promise<void> {
    if (erLønnetArbeid) {
      await this.velgLønnetArbeid();
    } else {
      await this.velgUlønnetArbeid();
    }
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Svar "Ja" på et spørsmål og gå videre
   * Hjelpemetode for spørsmålssteg
   */
  async svarJaOgFortsett(): Promise<void> {
    await this.svarJa();
    await this.svarJa();
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Innvilg søknad og fatt vedtak
   * Hjelpemetode for siste steg
   */
  async innvilgeOgFattVedtak(): Promise<void> {
    await this.innvilgeSøknad();
    await this.klikkBekreftOgFortsett();
    await this.fattVedtak();
  }

  /**
   * Fullfør hele EU/EØS behandlingsflyt med standardverdier
   * Hjelpemetode for komplett arbeidsflyt
   */
  async fyllUtEuEosBehandling(): Promise<void> {
    await this.fyllUtPeriodeOgLand();
    await this.velgYrkesaktivEllerSelvstendigOgFortsett();
    await this.velgArbeidsgiverOgFortsett();
    await this.velgArbeidstype();
    await this.svarJaOgFortsett(); // Første spørsmål
    await this.svarJaOgFortsett(); // Andre spørsmål
    await this.innvilgeOgFattVedtak();
  }
}
