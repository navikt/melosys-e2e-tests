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
   * Enhanced with comprehensive diagnostics to identify why checkbox doesn't appear.
   *
   * @param arbeidsgiverNavn - Navn på arbeidsgiver (f.eks. 'Ståles Stål AS')
   */
  async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
    console.log(`\n🔍 === DIAGNOSTICS: velgArbeidsgiver("${arbeidsgiverNavn}") ===`);

    // DIAGNOSTIC 1: Current page state
    const url = this.page.url();
    const pageTitle = await this.page.title().catch(() => 'unknown');
    console.log(`📍 Current URL: ${url}`);
    console.log(`📄 Page title: ${pageTitle}`);

    // DIAGNOSTIC 2: Verify we're on behandling page
    // EU/EØS uses /saksbehandling/, other flows use /behandling/
    if (!url.includes('/behandling/') && !url.includes('/saksbehandling/')) {
      throw new Error(`NOT on behandling/saksbehandling page! Current URL: ${url}`);
    }

    // DIAGNOSTIC 3: Count checkboxes BEFORE waits
    const checkboxCountBefore = await this.page.getByRole('checkbox').count();
    console.log(`✓ Checkboxes before waits: ${checkboxCountBefore}`);

    // DIAGNOSTIC 4: Monitor employer-related API calls
    let employerApiCalled = false;
    const employerApis: string[] = [];

    const apiListener = (response: Response) => {
      const responseUrl = response.url();
      // Monitor for potential employer list endpoints
      if (responseUrl.includes('/arbeidsforhold') ||
          responseUrl.includes('/virksomheter') ||
          responseUrl.includes('/registeropplysninger') ||
          responseUrl.includes('/mottatteopplysninger')) {
        employerApiCalled = true;
        employerApis.push(`${responseUrl} → ${response.status()}`);
        console.log(`📡 Employer-related API: ${responseUrl} → ${response.status()}`);
      }
    };

    this.page.on('response', apiListener);

    try {
      // CRITICAL: Wait for network to be idle FIRST
      console.log(`⏳ Waiting for network idle (15s timeout)...`);
      const networkStart = Date.now();
      await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
        console.log('⚠️  Network idle timeout (15s exceeded)');
      });
      console.log(`✅ Network idle completed (${Date.now() - networkStart}ms)`);

      // Extra wait to ensure React has rendered the employer list
      console.log(`⏳ Waiting for React render (1000ms)...`);
      await this.page.waitForTimeout(1000);

      // DIAGNOSTIC 5: Count checkboxes AFTER waits
      const checkboxCountAfter = await this.page.getByRole('checkbox').count();
      console.log(`✓ Checkboxes after waits: ${checkboxCountAfter}`);

      if (checkboxCountAfter !== checkboxCountBefore) {
        console.log(`📊 Checkbox count changed: ${checkboxCountBefore} → ${checkboxCountAfter}`);
      }

      // DIAGNOSTIC 6: Report on employer API calls
      if (!employerApiCalled) {
        console.warn('⚠️  WARNING: No employer API calls detected!');
        console.warn('   Monitored for: /arbeidsforhold, /virksomheter, /registeropplysninger, /mottatteopplysninger');
      } else {
        console.log(`✅ Employer APIs called: ${employerApis.length}`);
        employerApis.forEach(api => console.log(`   - ${api}`));
      }

      // DIAGNOSTIC 7: Check if target checkbox exists
      const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });
      const isVisible = await checkbox.isVisible().catch(() => false);

      if (!isVisible) {
        console.error(`\n❌ === FAILURE DIAGNOSTICS ===`);
        console.error(`Target checkbox "${arbeidsgiverNavn}" NOT visible!`);
        console.error(`Current URL: ${url}`);

        // List ALL checkboxes
        console.error(`\n📋 Available checkboxes on page:`);
        const allCheckboxes = await this.page.getByRole('checkbox').all();

        if (allCheckboxes.length === 0) {
          console.error(`   ⚠️  NO CHECKBOXES FOUND AT ALL!`);
          console.error(`   → This means the employer list component hasn't rendered.`);
          console.error(`   → Possible causes:`);
          console.error(`      1. Not on the right step yet`);
          console.error(`      2. Employer data not loaded from backend`);
          console.error(`      3. Frontend error preventing render`);
        } else {
          for (let i = 0; i < allCheckboxes.length; i++) {
            const box = allCheckboxes[i];
            const label = await box.getAttribute('aria-label') ||
                          await box.getAttribute('name') ||
                          await box.textContent() ||
                          'unknown';
            const isChecked = await box.isChecked().catch(() => false);
            console.error(`   ${i + 1}. "${label}" ${isChecked ? '[checked]' : ''}`);
          }
        }

        // Take screenshot
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const screenshotPath = `playwright-report/debug-arbeidsgiver-${timestamp}.png`;
        await this.page.screenshot({
          path: screenshotPath,
          fullPage: true
        });
        console.error(`\n📸 Screenshot saved: ${screenshotPath}`);

        // Get page content snippet
        const bodyText = await this.page.textContent('body').catch(() => '');
        const snippet = bodyText?.substring(0, 500) || '';
        console.error(`\n📄 Page content (first 500 chars):`);
        console.error(snippet);

        console.error(`\n=== END FAILURE DIAGNOSTICS ===\n`);
      }

      // Wait for checkbox visibility (will fail with comprehensive diagnostics above)
      console.log(`⏳ Waiting for checkbox "${arbeidsgiverNavn}" to be visible (45s timeout)...`);
      const visibilityStart = Date.now();

      await checkbox.waitFor({ state: 'visible', timeout: 45000 });
      console.log(`✅ Checkbox visible (${Date.now() - visibilityStart}ms)`);

      // CRITICAL: Set up response listener BEFORE checking
      // Checkbox triggers immediate API save: POST /api/mottatteopplysninger/{id}
      const responsePromise = this.page.waitForResponse(
        response => response.url().includes('/api/mottatteopplysninger/') &&
                    response.request().method() === 'POST' &&
                    response.status() === 200,
        { timeout: 5000 }
      ).catch(() => null); // Don't fail if API doesn't fire

      await checkbox.check();

      // Wait for immediate API save
      const response = await responsePromise;
      if (response) {
        console.log(`✅ Arbeidsgiver selection saved: ${response.url()} -> ${response.status()}`);
      } else {
        console.log('⚠️  No immediate API save detected (checkbox might already be checked)');
      }

      console.log(`✅ Valgte arbeidsgiver: ${arbeidsgiverNavn}`);
      console.log(`✅ === velgArbeidsgiver completed ===\n`);

    } finally {
      // Clean up API listener
      this.page.off('response', apiListener);
    }
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
   * Klikk "Bekreft og fortsett" knapp
   * Venter på at siden er klar etter navigasjon
   *
   * IMPORTANT: This method waits for specific step transition API calls.
   * Each step transition triggers 5-6 POST requests to save all form data.
   *
   * Enhanced with URL change detection to identify navigation race conditions.
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

    // CRITICAL FIX: Wait for network to be fully idle BEFORE proceeding
    // The backend locks the treatment during state transitions. We MUST wait
    // for ALL network activity to complete to ensure the treatment is editable again.
    // Increased timeout to 20s to handle slow CI environments.
    console.log('⏳ Waiting for complete network idle after step transition...');
    await this.page.waitForLoadState('networkidle', { timeout: 20000 });
    console.log('✅ Network fully idle');

    // Additional wait for backend state machine to unlock treatment
    // This ensures the backend has finished all async processing
    await this.page.waitForTimeout(1000);

    // ENHANCED: Verify URL change and report detailed navigation status
    const urlAfter = this.page.url();
    const urlChanged = urlBefore !== urlAfter;

    console.log(`✅ Klikket Bekreft og fortsett`);
    console.log(`  URL før:  ${urlBefore}`);
    console.log(`  URL etter: ${urlAfter}`);
    console.log(`  URL endret: ${urlChanged}`);

    // DIAGNOSTIC: If URL didn't change, log warning
    if (!urlChanged) {
      console.warn('⚠️  URL did not change after step transition!');
      console.warn('   This could indicate:');
      console.warn('   1. Same-page navigation (step change without URL change)');
      console.warn('   2. Navigation race condition (next step not initialized yet)');
      console.warn('   Adding extra wait for page state update...');
      await this.page.waitForTimeout(1000);

      // Double-check URL after extra wait
      const urlAfterExtraWait = this.page.url();
      if (urlAfterExtraWait !== urlBefore) {
        console.log(`✅ URL changed after extra wait: ${urlAfterExtraWait}`);
      } else {
        console.log(`ℹ️  URL still unchanged - this might be normal for same-page navigation`);
      }
    }
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
    await this.klikkBekreftOgFortsett();

    // Steg 2: Velg land
    await this.velgLandRadio(land);
    await this.klikkBekreftOgFortsett();

    // CRITICAL FIX: Wait for employer data to be loaded before selecting
    // After step transition, the frontend fetches employer data from backend.
    // We must wait for these API calls to complete before calling velgArbeidsgiver.
    console.log('⏳ Waiting for employer data API after step transition...');
    const employerApiPromise = this.page.waitForResponse(
      response => (response.url().includes('/arbeidsforhold') ||
                   response.url().includes('/virksomheter') ||
                   response.url().includes('/registeropplysninger') ||
                   response.url().includes('/mottatteopplysninger')) &&
                  response.status() === 200,
      { timeout: 15000 }
    ).catch(() => {
      console.log('⚠️  No employer API detected within 15s - proceeding anyway');
      return null;
    });

    const employerResponse = await employerApiPromise;
    if (employerResponse) {
      console.log(`✅ Employer data loaded: ${employerResponse.url()} -> ${employerResponse.status()}`);
      // Give React time to render the employer list after API response
      await this.page.waitForTimeout(500);
    }

    // Steg 3: Velg arbeidsgiver
    await this.velgArbeidsgiver(arbeidsgiver);
    await this.klikkBekreftOgFortsett();

    // Steg 4: Velg arbeid utføres i land som er
    await this.velgArbeidUtføresILandSomEr();
    await this.klikkBekreftOgFortsett();

    // Steg 5: Velg lønnet arbeid i to eller flere land
    await this.velgLønnetArbeidIToEllerFlereLand();
    await this.klikkBekreftOgFortsett();

    // Steg 6: Velg prosent eller mer
    await this.velgProsentEllerMer();
    await this.klikkBekreftOgFortsett();

    // Steg 7: Fyll inn fritekst-felter
    await this.fyllInnFritekstTilBegrunnelse(begrunnelse);
    await this.fyllInnYtterligereInformasjon(informasjon);

    // Steg 8: Fatt vedtak
    await this.fattVedtak();
  }
}
