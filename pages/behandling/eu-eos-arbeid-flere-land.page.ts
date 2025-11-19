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
    console.log('✅ Klikket Bekreft og fortsett');
  }

  /**
   * Velg hjemland (Norge)
   * Dette er landet hvor personen er bosatt/har hovedarbeidssted
   */
  async velgHjemland(): Promise<void> {
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
      // Kan utvides med andre land om nødvendig
      const radio = this.page.getByRole('radio', { name: land });
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
    const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });
    await checkbox.waitFor({ state: 'visible' });
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
   */
  async klikkFattVedtak(): Promise<void> {
    await this.fattVedtakButton.click();
    console.log('✅ Fattet vedtak - Arbeid i flere land behandling fullført');
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
