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
   * FIX: Uses polling with retries to handle async employer data loading.
   * The employer list is loaded asynchronously after step transition.
   * waitForResponse doesn't work reliably because the API might complete
   * before we start listening.
   *
   * @param arbeidsgiverNavn - Navn på arbeidsgiver (f.eks. 'Ståles Stål AS')
   */
  async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
    console.log(`\n🔍 velgArbeidsgiver("${arbeidsgiverNavn}")`);

    // Verify we're on behandling page
    const url = this.page.url();
    if (!url.includes('/behandling/') && !url.includes('/saksbehandling/')) {
      throw new Error(`NOT on behandling/saksbehandling page! Current URL: ${url}`);
    }

    const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });

    // ROBUST FIX: Poll for checkbox with retries
    // This handles both cases: API already completed or still loading
    const maxAttempts = 10;
    const pollInterval = 3000; // 3 seconds between attempts
    let attempt = 0;
    let isVisible = false;

    while (attempt < maxAttempts && !isVisible) {
      attempt++;
      isVisible = await checkbox.isVisible().catch(() => false);

      if (isVisible) {
        console.log(`✅ Checkbox found on attempt ${attempt}`);
        break;
      }

      if (attempt < maxAttempts) {
        // Log available checkboxes for debugging
        const allCheckboxes = await this.page.getByRole('checkbox').all();
        console.log(`⏳ Attempt ${attempt}/${maxAttempts}: Checkbox not visible yet. Found ${allCheckboxes.length} checkboxes.`);

        if (allCheckboxes.length === 0) {
          console.log(`   Waiting for employer data to load...`);
        } else {
          for (const box of allCheckboxes) {
            const label = await box.getAttribute('aria-label') ||
                          await box.getAttribute('name') ||
                          'unknown';
            console.log(`   - "${label}"`);
          }
        }

        // Wait before next attempt
        await this.page.waitForTimeout(pollInterval);

        // Also wait for any network activity to complete
        await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      }
    }

    if (!isVisible) {
      // Final attempt with Playwright's built-in wait
      console.log(`⏳ Final wait for checkbox "${arbeidsgiverNavn}"...`);
      await checkbox.waitFor({ state: 'visible', timeout: 10000 });
    }

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

    // Still wait for React state update
    await this.page.waitForTimeout(500);

    // Optional: Wait for network idle as fallback (shorter timeout now)
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      console.log('⚠️  Network idle timeout (non-critical)');
    });

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

    // Steg 3: Velg arbeidsgiver (velgArbeidsgiver now waits for employer API internally)
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
