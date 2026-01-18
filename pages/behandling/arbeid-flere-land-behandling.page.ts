import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { ArbeidFlereLandBehandlingAssertions } from './arbeid-flere-land-behandling.assertions';

/**
 * Page Object for EU/EØS "Arbeid i flere land" behandling workflow
 *
 * Ansvar:
 * - Håndtere "Arbeid i flere land" (ARBEID_FLERE_LAND) behandlingsflyten
 * - Velge hovedland (radio-knapp)
 * - Velge arbeidsgiver (checkbox)
 * - Svare på spørsmål om arbeidslokasjon
 * - Svare på spørsmål om arbeidstype
 * - Svare på spørsmål om prosent
 * - Fylle inn fritekst-felter
 * - Fatte vedtak
 *
 * Relaterte sider:
 * - OpprettNySakPage (navigerer fra)
 * - EuEosBehandlingPage (søsken-POM for andre EU/EØS-flows)
 *
 * @example
 * const behandling = new ArbeidFlereLandBehandlingPage(page);
 * await behandling.klikkBekreftOgFortsett(); // Første steg
 * await behandling.velgLandRadio('Norge');
 * await behandling.klikkBekreftOgFortsett();
 * // ... etc
 */
export class ArbeidFlereLandBehandlingPage extends BasePage {
  readonly assertions: ArbeidFlereLandBehandlingAssertions;

  // Felles knapper
  private readonly bekreftOgFortsettButton = this.page.getByRole('button', {
    name: 'Bekreft og fortsett'
  });

  private readonly fattVedtakButton = this.page.getByRole('button', {
    name: 'Fatt vedtak'
  });

  // Locators - Tekst-felter
  private readonly fritekstTilBegrunnelseField = this.page.getByRole('textbox', {
    name: 'Fritekst til begrunnelse'
  });

  private readonly ytterligereInformasjonField = this.page.getByRole('textbox', {
    name: 'Ytterligere informasjon til'
  });

  constructor(page: Page) {
    super(page);
    this.assertions = new ArbeidFlereLandBehandlingAssertions(page);
  }

  /**
   * Velg land via radio-knapp
   * Brukes i steg 2 for å velge hovedland
   *
   * @param landNavn - Navn på land (f.eks. 'Norge', 'Estland')
   */
  async velgLandRadio(landNavn: string): Promise<void> {
    const landRadio = this.page.getByRole('radio', { name: landNavn });
    await landRadio.waitFor({ state: 'visible' });
    await landRadio.check();
    console.log(`✅ Valgte land: ${landNavn}`);
  }

  /**
   * Velg arbeidsgiver med checkbox
   *
   * IMPORTANT: Checkbox triggers immediate API save when checked!
   * This method waits for that API call to complete.
   *
   * Enhanced with retry logic: if checkbox doesn't appear, refreshes page and tries again.
   *
   * @param arbeidsgiverNavn - Navn på arbeidsgiver (f.eks. 'Ståles Stål AS')
   * @param maxRetries - Maximum number of page refresh retries (default: 2)
   */
  async velgArbeidsgiver(arbeidsgiverNavn: string, maxRetries: number = 2): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.tryVelgArbeidsgiver(arbeidsgiverNavn, attempt);
        return; // Success - exit the retry loop
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          console.log(`\n🔄 Attempt ${attempt + 1} failed, refreshing page and retrying...`);
          await this.page.reload({ waitUntil: 'networkidle' });
          await this.page.waitForTimeout(2000); // Wait for React to re-render
        }
      }
    }

    // All retries exhausted
    throw lastError;
  }

  /**
   * Internal method to attempt selecting arbeidsgiver checkbox
   */
  private async tryVelgArbeidsgiver(arbeidsgiverNavn: string, attempt: number): Promise<void> {
    console.log(`\n🔍 === velgArbeidsgiver("${arbeidsgiverNavn}") attempt ${attempt + 1} ===`);

    // Verify we're on behandling page
    const url = this.page.url();
    if (!url.includes('/behandling/') && !url.includes('/saksbehandling/')) {
      throw new Error(`NOT on behandling/saksbehandling page! Current URL: ${url}`);
    }

    // Wait for network to be idle
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
      console.log('⚠️  Network idle timeout');
    });

    // Wait for React render
    await this.page.waitForTimeout(1000);

    // Check if target checkbox exists
    const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });
    const isVisible = await checkbox.isVisible().catch(() => false);

    if (!isVisible) {
      // Log available checkboxes for debugging
      const allCheckboxes = await this.page.getByRole('checkbox').all();
      console.error(`❌ Checkbox "${arbeidsgiverNavn}" not visible. Found ${allCheckboxes.length} checkboxes.`);

      if (allCheckboxes.length > 0) {
        console.error('📋 Available checkboxes:');
        for (const box of allCheckboxes) {
          const label = await box.getAttribute('aria-label') ||
                        await box.textContent() ||
                        'unknown';
          console.error(`   - "${label}"`);
        }
      }
    }

    // Wait for checkbox visibility (shorter timeout since we have retries)
    const timeout = attempt === 0 ? 30000 : 15000;
    console.log(`⏳ Waiting for checkbox (${timeout / 1000}s timeout)...`);

    await checkbox.waitFor({ state: 'visible', timeout });
    console.log(`✅ Checkbox visible`);

    // Set up response listener BEFORE checking
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
      console.log(`✅ Arbeidsgiver saved: ${response.status()}`);
    }

    console.log(`✅ Valgte arbeidsgiver: ${arbeidsgiverNavn}\n`);
  }

  /**
   * Velg checkbox for "Arbeid utføres i land som er..."
   * Dette spørsmålet handler om arbeidslokasjon
   */
  async velgArbeidUtføresILandSomEr(): Promise<void> {
    const checkbox = this.page.getByRole('checkbox', {
      name: 'Arbeid utføres i land som er'
    });
    await checkbox.waitFor({ state: 'visible' });
    await checkbox.check();
    console.log('✅ Valgte: Arbeid utføres i land som er');
  }

  /**
   * Velg "Lønnet arbeid i to eller flere land" radio-knapp
   */
  async velgLønnetArbeidIToEllerFlereLand(): Promise<void> {
    const radio = this.page.getByRole('radio', {
      name: 'Lønnet arbeid i to eller'
    });
    await radio.waitFor({ state: 'visible' });
    await radio.check();
    console.log('✅ Valgte: Lønnet arbeid i to eller flere land');
  }

  /**
   * Velg "Selvstendig næringsvirksomhet i to eller flere land" radio-knapp
   */
  async velgSelvstendigNæringsvirksomhetIToEllerFlereLand(): Promise<void> {
    const radio = this.page.getByRole('radio', {
      name: 'Selvstendig næringsvirksomhet i to eller flere land',
      exact: true
    });
    await radio.waitFor({ state: 'visible' });
    await radio.check();
    console.log('✅ Valgte: Selvstendig næringsvirksomhet i to eller flere land');
  }

  /**
   * Velg "% eller mer" radio-knapp
   * Dette spørsmålet handler om prosentandel av arbeid
   */
  async velgProsentEllerMer(): Promise<void> {
    const radio = this.page.getByRole('radio', {
      name: '% eller mer'
    });
    await radio.waitFor({ state: 'visible' });
    await radio.check();
    console.log('✅ Valgte: % eller mer');
  }

  /**
   * Fyll inn fritekst til begrunnelse
   *
   * @param tekst - Tekst til begrunnelse
   */
  async fyllInnFritekstTilBegrunnelse(tekst: string): Promise<void> {
    await this.fritekstTilBegrunnelseField.click();
    await this.fritekstTilBegrunnelseField.fill(tekst);
    console.log(`✅ Fylte inn fritekst til begrunnelse: "${tekst}"`);
  }

  /**
   * Fyll inn ytterligere informasjon
   *
   * @param tekst - Ytterligere informasjon
   */
  async fyllInnYtterligereInformasjon(tekst: string): Promise<void> {
    await this.ytterligereInformasjonField.click();
    await this.ytterligereInformasjonField.fill(tekst);
    console.log(`✅ Fylte inn ytterligere informasjon: "${tekst}"`);
  }

  /**
   * Klikk "Bekreft og fortsett" knapp og vent på at neste steg er klart
   *
   * IMPORTANT: This method waits for specific step transition API calls AND
   * optionally waits for specific content to appear on the next step.
   *
   * @param options - Optional configuration for step transition
   * @param options.waitForContent - Optional Locator to wait for on the next step.
   *                                 This ensures React has finished rendering before proceeding.
   * @param options.waitForContentTimeout - Timeout in ms for waiting for content (default: 30000ms)
   *
   * @example
   * // Basic usage - just wait for API and network idle
   * await behandling.klikkBekreftOgFortsett();
   *
   * // Robust usage - wait for specific content on next step
   * await behandling.klikkBekreftOgFortsett({
   *   waitForContent: page.getByRole('checkbox', { name: 'Ståles Stål AS' })
   * });
   */
  async klikkBekreftOgFortsett(options?: {
    waitForContent?: import('@playwright/test').Locator;
    waitForContentTimeout?: number;
  }): Promise<void> {
    const { waitForContent, waitForContentTimeout = 30000 } = options || {};

    console.log('🔄 Klikker "Bekreft og fortsett"...');

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
      console.log('⚠️  No step transition APIs detected');
    }

    // If specific content is provided, wait for it to be visible
    // This is the MOST ROBUST way to ensure the next step is ready
    if (waitForContent) {
      console.log('⏳ Waiting for specific content on next step...');
      const startTime = Date.now();
      await waitForContent.waitFor({ state: 'visible', timeout: waitForContentTimeout });
      console.log(`✅ Content visible after ${Date.now() - startTime}ms`);
    } else {
      // Fallback: Wait for React to process the state update and render next step
      await this.page.waitForTimeout(500);

      // Wait for network idle as fallback
      await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
        console.log('⚠️  Network idle timeout (non-critical)');
      });
    }

    console.log('✅ Klikket Bekreft og fortsett');
  }

  /**
   * Håndter SED-dokument popup og velg SED-type
   * Denne metoden åpner popup med SED-dokumenter og velger riktig type
   *
   * IMPORTANT: This opens a popup window! Use with page.waitForEvent('popup')
   *
   * @param sedType - Type SED-dokument å velge (f.eks. 'SED A003')
   */
  async velgSedDokument(sedType: string = 'SED A003'): Promise<void> {
    console.log(`🔍 Åpner SED-dokument popup og velger: ${sedType}`);

    // Click to open popup (this triggers "Innvilgelse yrkesaktiv i" text)
    const popupPromise = this.page.waitForEvent('popup');
    await this.page.getByText('Innvilgelse yrkesaktiv i').click();

    // Wait for popup to open
    const popup = await popupPromise;
    console.log('✅ Popup åpnet');

    // Click on the SED type in the popup
    await popup.getByText(sedType).click();
    console.log(`✅ Valgte SED-type: ${sedType} i popup`);

    // Popup should close automatically, return to main page
    await this.page.waitForTimeout(500);
  }

  /**
   * Klikk "Fatt vedtak" knapp for å fullføre behandlingen
   *
   * IMPORTANT: This method waits for the critical vedtak creation API call.
   * The endpoint POST /api/saksflyt/vedtak/{id}/fatt creates the vedtak document
   * and can take 30-60 seconds on CI.
   */
  async fattVedtak(): Promise<void> {
    // Vent på at nettverket er stille før vi fatter vedtak
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
   * Fullfør hele "Arbeid i flere land" behandlingsflyten
   * Hjelpemetode for komplett arbeidsflyt med standardverdier
   *
   * @param land - Land å velge (default: 'Norge')
   * @param arbeidsgiver - Arbeidsgiver å velge (default: 'Ståles Stål AS')
   * @param begrunnelse - Fritekst til begrunnelse (default: 'Lorem ipsum')
   * @param informasjon - Ytterligere informasjon (default: 'Dodatkowo')
   */
  async fyllUtArbeidFlereLandBehandling(
    land: string = 'Norge',
    arbeidsgiver: string = 'Ståles Stål AS',
    begrunnelse: string = 'Lorem ipsum',
    informasjon: string = 'Dodatkowo'
  ): Promise<void> {
    // Steg 1: Bekreft og fortsett (ingen handling nødvendig)
    // Wait for land radio button to be visible on next step
    await this.klikkBekreftOgFortsett({
      waitForContent: this.page.getByRole('radio', { name: land })
    });

    // Steg 2: Velg land
    await this.velgLandRadio(land);

    // Steg 3: Navigate to arbeidsgiver step
    // NOTE: Don't use waitForContent here - let velgArbeidsgiver handle it with retry logic
    // The checkbox sometimes doesn't appear due to race conditions, and velgArbeidsgiver
    // will refresh the page and retry if needed
    await this.klikkBekreftOgFortsett();

    // Steg 3: Velg arbeidsgiver (with retry + page refresh if checkbox doesn't appear)
    await this.velgArbeidsgiver(arbeidsgiver);

    // Wait for "Arbeid utføres i land som er" checkbox on next step
    await this.klikkBekreftOgFortsett({
      waitForContent: this.page.getByRole('checkbox', { name: 'Arbeid utføres i land som er' })
    });

    // Steg 4: Velg arbeid utføres i land som er
    await this.velgArbeidUtføresILandSomEr();

    // Wait for "Lønnet arbeid i to eller" radio on next step
    await this.klikkBekreftOgFortsett({
      waitForContent: this.page.getByRole('radio', { name: 'Lønnet arbeid i to eller' })
    });

    // Steg 5: Velg lønnet arbeid i to eller flere land
    await this.velgLønnetArbeidIToEllerFlereLand();

    // Wait for "% eller mer" radio on next step
    await this.klikkBekreftOgFortsett({
      waitForContent: this.page.getByRole('radio', { name: '% eller mer' })
    });

    // Steg 6: Velg prosent eller mer
    await this.velgProsentEllerMer();

    // Wait for fritekst field on next step
    await this.klikkBekreftOgFortsett({
      waitForContent: this.page.getByRole('textbox', { name: 'Fritekst til begrunnelse' })
    });

    // Steg 7: Fyll inn fritekst-felter
    await this.fyllInnFritekstTilBegrunnelse(begrunnelse);
    await this.fyllInnYtterligereInformasjon(informasjon);

    // Steg 8: Fatt vedtak
    await this.fattVedtak();
  }

  // ============================================================
  // VIDERESEND SØKNAD (SED A008) METHODS
  // ============================================================
  // Disse metodene brukes når søknaden skal videresendes til et
  // annet land i stedet for at Norge fatter vedtak.

  /**
   * Velg "Annet" radio-knapp
   * Brukes når kompetent land er et annet enn Norge
   */
  async velgAnnetKompetentLand(): Promise<void> {
    const radio = this.page.getByRole('radio', { name: 'Annet' });
    await radio.waitFor({ state: 'visible' });
    await radio.check();
    console.log('✅ Valgte: Annet (kompetent land)');
  }

  /**
   * Fyll inn kompetent land i fritekst-felt
   * Feltet har ingen label, brukes med getByLabel('', { exact: true })
   *
   * @param land - Land med kode (f.eks. 'Sverige (SE)')
   */
  async fyllInnKompetentLand(land: string): Promise<void> {
    const field = this.page.getByLabel('', { exact: true });
    await field.click();
    await field.fill(land);
    console.log(`✅ Fylte inn kompetent land: ${land}`);
  }

  /**
   * Kryss av for "Oppgitt utenlandsk"
   */
  async velgOppgittUtenlandsk(): Promise<void> {
    const checkbox = this.page.getByRole('checkbox', { name: 'Oppgitt utenlandsk' });
    await checkbox.waitFor({ state: 'visible' });
    await checkbox.check();
    console.log('✅ Valgte: Oppgitt utenlandsk');
  }

  /**
   * Kryss av for "Ikke registrert bosatt i Norge"
   */
  async velgIkkeRegistrertBosattINorge(): Promise<void> {
    const checkbox = this.page.getByRole('checkbox', { name: 'Ikke registrert bosatt i Norge' });
    await checkbox.waitFor({ state: 'visible' });
    await checkbox.check();
    console.log('✅ Valgte: Ikke registrert bosatt i Norge');
  }

  /**
   * Velg utenlandsk institusjon fra dropdown
   *
   * @param institusjon - Institusjons-ID (f.eks. 'SE:ACC12600')
   */
  async velgUtenlandskInstitusjon(institusjon: string): Promise<void> {
    const dropdown = this.page.getByLabel('Velg utenlandsk institusjon');
    await dropdown.waitFor({ state: 'visible' });
    await dropdown.selectOption(institusjon);
    console.log(`✅ Valgte utenlandsk institusjon: ${institusjon}`);
  }

  /**
   * Legg til vedlegg fra "Dokumenter tilknyttet behandlingen"
   *
   * Åpner vedlegg-dialogen og velger et dokument fra listen.
   * Videresend søknad krever minst ett vedlegg.
   */
  async leggTilVedlegg(): Promise<void> {
    console.log('📎 Legger til vedlegg...');

    // Wait for page to stabilize after institution selection
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(1000);

    // Debug: Log current page state
    const currentHeading = await this.page.locator('main h1').first().textContent().catch(() => 'unknown');
    console.log(`📄 Current page heading: "${currentHeading}"`);
    console.log(`🔗 Current URL: ${this.page.url()}`);

    // Verify we're on step 3 (Videresending av søknad)
    const step3Indicator = this.page.locator('text=Videresending av søknad');
    const isOnStep3 = await step3Indicator.isVisible().catch(() => false);
    console.log(`📋 Er på steg 3 (Videresending): ${isOnStep3}`);

    // Klikk "Legg til vedlegg" knappen
    // First, try to find the button with different selectors
    let leggTilButton = this.page.getByRole('button', { name: /Legg til vedlegg/i });
    let isVisible = await leggTilButton.isVisible().catch(() => false);

    if (!isVisible) {
      console.log('⏳ "Legg til vedlegg" knapp ikke synlig, prøver alternativ selector...');
      // Try finding by text content
      leggTilButton = this.page.locator('button:has-text("Legg til vedlegg")');
      isVisible = await leggTilButton.isVisible().catch(() => false);
    }

    if (!isVisible) {
      // List all buttons on the page for debugging
      const allButtons = await this.page.getByRole('button').allTextContents();
      console.log(`🔘 Tilgjengelige knapper: ${allButtons.join(', ')}`);
      throw new Error('Fant ikke "Legg til vedlegg" knappen');
    }

    await leggTilButton.waitFor({ state: 'visible', timeout: 10000 });
    await leggTilButton.click();
    console.log('✅ Klikket "Legg til vedlegg"');

    // Vent på at dialogen åpnes
    await this.page.waitForTimeout(500);

    // Finn og klikk på første checkbox i "Dokumenter tilknyttet behandlingen" seksjonen
    // Listen viser dokumenter fra journalposter tilknyttet saken
    const dokumentCheckboxer = this.page.locator('dialog, [role="dialog"]').getByRole('checkbox');
    const count = await dokumentCheckboxer.count();
    console.log(`📄 Fant ${count} dokumenter i dialogen`);

    if (count === 0) {
      // Ingen dokumenter funnet - sjekk innholdet
      const dialogText = await this.page.locator('dialog, [role="dialog"]').textContent().catch(() => 'unknown');
      console.error('❌ Ingen dokumenter tilgjengelig');
      console.error(`📋 Dialog innhold: ${dialogText}`);
      throw new Error('Ingen dokumenter tilgjengelig for vedlegg');
    }

    // Velg første dokument
    await dokumentCheckboxer.first().check();
    console.log('✅ Valgte første dokument som vedlegg');

    // Lukk dialogen ved å klikke "Lukk" eller "Velg"
    const lukkButton = this.page.locator('dialog, [role="dialog"]').getByRole('button', { name: /Lukk|Velg|OK/i });
    if (await lukkButton.isVisible().catch(() => false)) {
      await lukkButton.click();
      console.log('✅ Lukket vedlegg-dialogen');
    }

    await this.page.waitForTimeout(500);
  }

  /**
   * Klikk "Videresend søknad" knapp
   * Sender SED A008 til valgt utenlandsk institusjon
   *
   * IMPORTANT: This triggers API call to create and send SED A008
   */
  async klikkVideresendSøknad(): Promise<void> {
    const button = this.page.getByRole('button', { name: 'Videresend søknad' });
    await button.waitFor({ state: 'visible' });

    // Set up response listener BEFORE clicking
    const responsePromise = this.page.waitForResponse(
      response => response.url().includes('/api/') &&
                  response.request().method() === 'POST',
      { timeout: 30000 }
    ).catch(() => null);

    await button.click();

    // Wait for API response
    const response = await responsePromise;
    if (response) {
      console.log(`✅ Videresend søknad - API: ${response.url()} -> ${response.status()}`);
    } else {
      console.log('⚠️  Videresend søknad - No API response detected');
    }

    // Wait for network to settle
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
      console.log('⚠️  Network idle timeout');
    });

    console.log('✅ Klikket Videresend søknad');
  }

  /**
   * Fullfør "Videresend søknad" (SED A008) flyten
   * Hjelpemetode for komplett arbeidsflyt der søknaden videresendes
   *
   * Steg:
   * 1. Inngang - Bekreft og fortsett
   * 2. Bosted - Velg "Annet" og fyll inn kompetent land, checkboxer, bekreft
   * 3. Videresending av søknad - Velg institusjon, legg til vedlegg, og videresend
   *
   * IMPORTANT: Saken må ha minst én journalpost med dokument tilknyttet FØR denne
   * metoden kalles. Bruk `createJournalpostForSak()` fra mock-helper for å opprette.
   *
   * @param kompetentLand - Land med kode (default: 'Sverige (SE)')
   * @param institusjon - Institusjons-ID (default: 'SE:ACC12600')
   */
  async fyllUtVideresendSøknad(
    kompetentLand: string = 'Sverige (SE)',
    institusjon: string = 'SE:ACC12600'
  ): Promise<void> {
    // Steg 1: Inngang - Bekreft og fortsett
    console.log('📋 Steg 1/3: Inngang');
    await this.klikkBekreftOgFortsett();

    // Steg 2: Bosted - Velg "Annet" kompetent land og checkboxer
    console.log('📋 Steg 2/3: Bosted - velg kompetent land');
    await this.velgAnnetKompetentLand();
    await this.fyllInnKompetentLand(kompetentLand);
    await this.velgOppgittUtenlandsk();
    await this.velgIkkeRegistrertBosattINorge();

    // Click button and wait explicitly for step 3 to appear
    console.log('📋 Klikker Bekreft og fortsett for å gå til steg 3...');
    const bekreftButton = this.page.getByRole('button', { name: 'Bekreft og fortsett' });
    await bekreftButton.click();

    // Steg 3: Videresending av søknad - Velg institusjon, vedlegg, og videresend
    console.log('📋 Steg 3/3: Videresending av søknad');

    // Wait for the institution dropdown to be visible - this indicates we're on step 3
    const dropdown = this.page.getByLabel('Velg utenlandsk institusjon');
    console.log('⏳ Venter på at institusjon-dropdown blir synlig...');

    try {
      await dropdown.waitFor({ state: 'visible', timeout: 30000 });
      console.log('✅ Institusjon-dropdown er synlig');
    } catch (error) {
      // Debug: Take screenshot and check page content
      console.error('❌ Institusjon-dropdown ble ikke synlig innen timeout');
      const pageTitle = await this.page.locator('main h1, main h2').first().textContent().catch(() => 'unknown');
      console.error(`📄 Nåværende sidetittel: "${pageTitle}"`);
      console.error(`🔗 URL: ${this.page.url()}`);

      // Check if "Bekreft og fortsett" button is still visible (meaning we didn't transition)
      const buttonStillVisible = await bekreftButton.isVisible().catch(() => false);
      if (buttonStillVisible) {
        console.error('⚠️  "Bekreft og fortsett" er fortsatt synlig - steget byttet ikke!');
        console.error('   Forsøker å klikke på nytt...');
        await bekreftButton.click();
        await this.page.waitForTimeout(2000);
        await dropdown.waitFor({ state: 'visible', timeout: 15000 });
      } else {
        throw error;
      }
    }

    // Velg institusjon
    await this.velgUtenlandskInstitusjon(institusjon);

    // Legg til vedlegg (påkrevd for videresend søknad)
    await this.leggTilVedlegg();

    // Videresend søknaden
    await this.klikkVideresendSøknad();
  }
}
