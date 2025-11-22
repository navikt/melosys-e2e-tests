import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { EuEosArbeidFlereLandAssertions } from './eu-eos-arbeid-flere-land.assertions';

/**
 * Page Object for EU/EØS "Arbeid i flere land" behandling workflow
 * EØS artikkel 13.1 - Arbeid i flere land
 *
 * Ansvar:
 * - Velge hjemland (Norge/annet)
 * - Velge arbeidsgiver(e)
 * - Bekrefte arbeid i flere land
 * - Velge type arbeid (lønnet arbeid i to eller flere land)
 * - Velge prosentandel arbeid
 * - Fylle inn vedtakstekst og fatte vedtak
 *
 * Relaterte sider:
 * - OpprettNySakPage (navigerer fra)
 * - Komplett arbeidsflyt (hele behandlingen)
 *
 * VIKTIG: Denne flyten krever at to land er valgt under saksopprettelsen:
 * 1. Arbeidsland (f.eks. Estland)
 * 2. Hjemland (f.eks. Norge)
 *
 * @example
 * const behandling = new EuEosArbeidFlereLandPage(page);
 * await behandling.klikkBekreftOgFortsett(); // Initial
 * await behandling.velgHjemlandOgFortsett('Norge');
 * await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
 * await behandling.bekreftArbeidIFlereLandOgFortsett();
 * await behandling.velgLønnetArbeidIToEllerFlereOgFortsett();
 * await behandling.velgProsentandelOgFortsett();
 * await behandling.fyllUtVedtakOgFatt('Begrunnelse', 'Ytterligere info');
 */
export class EuEosArbeidFlereLandPage extends BasePage {
  readonly assertions: EuEosArbeidFlereLandAssertions;

  // Locators - Hjemland
  private readonly norgeRadio = this.page.getByRole('radio', { name: 'Norge' });

  // Locators - Arbeidsgiver
  // Dynamisk checkbox basert på arbeidsgivernavn

  // Locators - Arbeid i flere land
  private readonly arbeidIFlereLandCheckbox = this.page.getByRole('checkbox', {
    name: 'Arbeid utføres i land som er'
  });

  // Locators - Type arbeid
  private readonly lønnetArbeidIToEllerFlereRadio = this.page.getByRole('radio', {
    name: 'Lønnet arbeid i to eller'
  });

  // Locators - Prosentandel
  private readonly prosentEllerMerRadio = this.page.getByRole('radio', {
    name: '% eller mer'
  });

  // Locators - Vedtak
  private readonly fritekstBegrunnelseField = this.page.getByRole('textbox', {
    name: 'Fritekst til begrunnelse'
  });

  private readonly ytterligereInformasjonField = this.page.getByRole('textbox', {
    name: 'Ytterligere informasjon til'
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
    this.assertions = new EuEosArbeidFlereLandAssertions(page);
  }

  /**
   * Klikk "Bekreft og fortsett" knapp
   * Brukes på hvert steg i behandlingen
   */
  async klikkBekreftOgFortsett(): Promise<void> {
    await this.bekreftOgFortsettButton.click();
    // Vent litt for at React state skal oppdatere seg (knappen trigger state change, ikke full page reload)
    // Økt til 1000ms for å sikre at alle elementer er lastet
    await this.page.waitForTimeout(1000);
    console.log('✅ Klikket Bekreft og fortsett');
  }

  /**
   * Velg hjemland (Norge)
   * Dette er landet hvor personen er bosatt/har hovedarbeidssted
   */
  async velgHjemland(): Promise<void> {
    // Wait for network idle to ensure page has loaded after step transition
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      console.log('⚠️  Network idle timeout, continuing anyway');
    });

    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.norgeRadio.waitFor({ state: 'visible', timeout: 30000 });
    await this.norgeRadio.check();
    console.log('✅ Valgte hjemland: Norge');
  }

  /**
   * Velg hjemland og gå videre
   * Hjelpemetode for steg 1
   *
   * @param land - Hjemland (default: 'Norge')
   */
  async velgHjemlandOgFortsett(land: string = 'Norge'): Promise<void> {
    // For nå støtter vi bare Norge, men kan utvides
    if (land === 'Norge') {
      await this.velgHjemland();
    } else {
      // Wait for network idle to ensure page has loaded
      await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
        console.log('⚠️  Network idle timeout, continuing anyway');
      });

      // Kan utvides med andre land om nødvendig
      const radio = this.page.getByRole('radio', { name: land });
      // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
      await radio.waitFor({ state: 'visible', timeout: 30000 });
      await radio.check();
      console.log(`✅ Valgte hjemland: ${land}`);
    }
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Velg arbeidsgiver(e) med checkbox
   *
   * @param arbeidsgiverNavn - Navn på arbeidsgiver (f.eks. 'Ståles Stål AS')
   */
  async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
    console.log(`🔍 Leter etter arbeidsgiver checkbox: "${arbeidsgiverNavn}"`);

    // CRITICAL: Wait for network to be idle FIRST to ensure employer list has loaded
    // The checkbox won't exist until the backend provides the employer data
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
      console.log('⚠️  Network idle timeout, continuing anyway (employer list might still load)');
    });

    // Extra wait to ensure React has rendered the employer list
    await this.page.waitForTimeout(1000);

    const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });

    // Increased timeout to 45s for slow CI environments
    await checkbox.waitFor({ state: 'visible', timeout: 45000 });
    await checkbox.check();
    console.log(`✅ Valgte arbeidsgiver: ${arbeidsgiverNavn}`);
  }

  /**
   * Velg arbeidsgiver og gå videre
   * Hjelpemetode for steg 2
   *
   * @param arbeidsgiverNavn - Navn på arbeidsgiver (default: 'Ståles Stål AS')
   */
  async velgArbeidsgiverOgFortsett(arbeidsgiverNavn: string = 'Ståles Stål AS'): Promise<void> {
    await this.velgArbeidsgiver(arbeidsgiverNavn);
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Bekreft at arbeid utføres i flere land
   * Krysser av for "Arbeid utføres i land som er dekket av EØS-avtalen"
   */
  async bekreftArbeidIFlereLand(): Promise<void> {
    console.log('🔍 Leter etter "Arbeid utføres i land som er" checkbox...');

    // CRITICAL: Wait for network to be idle FIRST to ensure page has fully loaded
    // The checkbox won't exist until the backend provides the step data
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
      console.log('⚠️  Network idle timeout, continuing anyway');
    });

    // Extra wait to ensure React has rendered the checkbox
    await this.page.waitForTimeout(1000);

    // Vent på at checkbox er synlig og stabil før sjekking (unngår race condition)
    // Increased timeout to 45s for slow CI environments
    await this.arbeidIFlereLandCheckbox.waitFor({ state: 'visible', timeout: 45000 });
    await this.arbeidIFlereLandCheckbox.check();
    console.log('✅ Bekreftet: Arbeid utføres i flere land');
  }

  /**
   * Bekreft arbeid i flere land og gå videre
   * Hjelpemetode for steg 3
   */
  async bekreftArbeidIFlereLandOgFortsett(): Promise<void> {
    await this.bekreftArbeidIFlereLand();
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Velg "Lønnet arbeid i to eller flere land"
   */
  async velgLønnetArbeidIToEllerFlere(): Promise<void> {
    // Wait for network idle to ensure page has loaded after step transition
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      console.log('⚠️  Network idle timeout, continuing anyway');
    });

    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.lønnetArbeidIToEllerFlereRadio.waitFor({ state: 'visible', timeout: 30000 });
    await this.lønnetArbeidIToEllerFlereRadio.check();
    console.log('✅ Valgte: Lønnet arbeid i to eller flere land');
  }

  /**
   * Velg lønnet arbeid i to eller flere land og gå videre
   * Hjelpemetode for steg 4
   */
  async velgLønnetArbeidIToEllerFlereOgFortsett(): Promise<void> {
    await this.velgLønnetArbeidIToEllerFlere();
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Velg prosentandel arbeid (25% eller mer)
   */
  async velgProsentandel(): Promise<void> {
    // Wait for network idle to ensure page has loaded after step transition
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      console.log('⚠️  Network idle timeout, continuing anyway');
    });

    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.prosentEllerMerRadio.waitFor({ state: 'visible', timeout: 30000 });
    await this.prosentEllerMerRadio.check();
    console.log('✅ Valgte: 25% eller mer av arbeidet i hjemlandet');
  }

  /**
   * Velg prosentandel og gå videre
   * Hjelpemetode for steg 5
   */
  async velgProsentandelOgFortsett(): Promise<void> {
    await this.velgProsentandel();
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Fyll inn fritekst til begrunnelse
   *
   * @param tekst - Begrunnelsestekst
   */
  async fyllInnBegrunnelse(tekst: string): Promise<void> {
    await this.fritekstBegrunnelseField.click();
    await this.fritekstBegrunnelseField.fill(tekst);
    console.log(`✅ Fylte inn begrunnelse: "${tekst}"`);
  }

  /**
   * Fyll inn ytterligere informasjon til arbeidsgiver
   *
   * @param tekst - Informasjonstekst
   */
  async fyllInnYtterligereInformasjon(tekst: string): Promise<void> {
    await this.ytterligereInformasjonField.click();
    await this.ytterligereInformasjonField.fill(tekst);
    console.log(`✅ Fylte inn ytterligere informasjon: "${tekst}"`);
  }

  /**
   * Klikk "Fatt vedtak" knapp for å fullføre behandlingen
   *
   * IMPORTANT: This method waits for the critical vedtak creation API call.
   * The endpoint POST /api/saksflyt/vedtak/{id}/fatt creates the vedtak document
   * and can take 30-60 seconds on CI due to backend race conditions.
   *
   * @see docs/debugging/EU-EOS-SKIP-BACKEND-RACE-CONDITION.md
   */
  async klikkFattVedtak(): Promise<void> {
    // CRITICAL: Set up response listener BEFORE clicking
    // Wait for the vedtak creation API - same pattern as eu-eos-behandling.page.ts
    const responsePromise = this.page.waitForResponse(
      response => response.url().includes('/api/saksflyt/vedtak/') &&
                  response.url().includes('/fatt') &&
                  response.request().method() === 'POST' &&
                  (response.status() === 200 || response.status() === 204),
      { timeout: 60000 } // Long timeout - backend race condition can cause delays
    );

    await this.fattVedtakButton.click();

    const response = await responsePromise;
    console.log(`✅ Fattet vedtak - API completed: ${response.url()} -> ${response.status()}`);
  }

  /**
   * Fyll ut vedtaksseksjon og fatt vedtak
   * Hjelpemetode for steg 6 (siste steg)
   *
   * @param begrunnelse - Begrunnelsestekst
   * @param ytterligereInfo - Ytterligere informasjon
   */
  async fyllUtVedtakOgFatt(
    begrunnelse: string = 'Standard begrunnelse',
    ytterligereInfo: string = 'Ytterligere informasjon'
  ): Promise<void> {
    await this.fyllInnBegrunnelse(begrunnelse);
    await this.fyllInnYtterligereInformasjon(ytterligereInfo);
    await this.klikkFattVedtak();
  }

  /**
   * Fullfør hele "Arbeid i flere land" behandlingsflyt med standardverdier
   * Hjelpemetode for komplett arbeidsflyt fra steg 1 til vedtak
   *
   * @param hjemland - Hjemland (default: 'Norge')
   * @param arbeidsgiver - Arbeidsgiver (default: 'Ståles Stål AS')
   * @param begrunnelse - Vedtaksbegrunnelse (default: 'Standard begrunnelse')
   * @param ytterligereInfo - Ytterligere info (default: 'Ytterligere informasjon')
   */
  async fyllUtKomplettBehandling(
    hjemland: string = 'Norge',
    arbeidsgiver: string = 'Ståles Stål AS',
    begrunnelse: string = 'Standard begrunnelse',
    ytterligereInfo: string = 'Ytterligere informasjon'
  ): Promise<void> {
    await this.klikkBekreftOgFortsett(); // Initial bekreftelse
    await this.velgHjemlandOgFortsett(hjemland);
    await this.velgArbeidsgiverOgFortsett(arbeidsgiver);
    await this.bekreftArbeidIFlereLandOgFortsett();
    await this.velgLønnetArbeidIToEllerFlereOgFortsett();
    await this.velgProsentandelOgFortsett();
    await this.fyllUtVedtakOgFatt(begrunnelse, ytterligereInfo);
    console.log('✅ Komplett "Arbeid i flere land" behandling fullført');
  }
}
