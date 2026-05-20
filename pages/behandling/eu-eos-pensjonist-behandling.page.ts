import { Page, expect } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { TIMEOUT_LONG, TIMEOUT_MEDIUM, TIMEOUT_VEDTAK } from '../shared/constants';
import { EuEosPensjonistBehandlingAssertions } from './eu-eos-pensjonist-behandling.assertions';

export class EuEosPensjonistBehandlingPage extends BasePage {
  private static readonly IVERKSETT_URL = /\/api\/saksflyt\/iverksett\/trygdeavgift\/\d+\/pensjonist$/;

  readonly assertions: EuEosPensjonistBehandlingAssertions;

  private readonly fraOgMedField = this.page.getByRole('textbox', { name: 'Fra og med' });

  private readonly tilOgMedField = this.page.getByRole('textbox', { name: 'Til og med' });

  private readonly bostedslandDropdown = this.page.getByLabel('Bostedsland');

  private readonly bekreftOgFortsettButton = this.page.getByRole('button', {
    name: 'Bekreft og fortsett',
  });

  private readonly bekreftOgSendButton = this.page.getByRole('button', {
    name: 'Bekreft og send',
  });

  private readonly skattepliktigGroup = this.page.getByRole('group', { name: 'Skattepliktig' });

  constructor(page: Page) {
    super(page);
    this.assertions = new EuEosPensjonistBehandlingAssertions(page);
  }

  private isPensjonistIverksettEndpoint(url: string): boolean {
    return EuEosPensjonistBehandlingPage.IVERKSETT_URL.test(new URL(url).pathname);
  }

  async ventPåSideLastet(): Promise<void> {
    await this.fraOgMedField.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
    console.log('✅ EU/EØS pensjonist behandling page loaded');
  }

  // NB: Ingen .press('Enter') etter fill — debounced lagring (500ms) i
  // vurderingOpplysninger.tsx kan komme i ugyldig tilstand når Enter trigger
  // tidlig submit/blur før de andre feltene er fylt.
  async fyllInnFraOgMed(dato: string): Promise<void> {
    await this.fraOgMedField.click();
    await this.fraOgMedField.fill(dato);
    console.log(`✅ Fylte inn fra og med: ${dato}`);
  }

  async fyllInnTilOgMed(dato: string): Promise<void> {
    await this.tilOgMedField.click();
    await this.tilOgMedField.fill(dato);
    console.log(`✅ Fylte inn til og med: ${dato}`);
  }

  async velgBostedsland(landkode: string): Promise<void> {
    await this.bostedslandDropdown.selectOption(landkode);
    console.log(`✅ Valgte bostedsland: ${landkode}`);
  }

  async fyllUtPeriodeOgBostedsland(
    fraOgMed: string,
    tilOgMed: string,
    bostedsland: string,
  ): Promise<void> {
    await this.ventPåSideLastet();
    await this.fyllInnFraOgMed(fraOgMed);
    await this.fyllInnTilOgMed(tilOgMed);

    // Sett opp lytter FØR siste handling for å unngå race med debounced lagring
    const periodeLagret = this.page.waitForResponse(
      response =>
        response.url().includes('/helseutgift-dekkes-perioder') &&
        response.request().method() !== 'GET',
      { timeout: TIMEOUT_MEDIUM },
    );

    await this.velgBostedsland(bostedsland);
    await periodeLagret;
  }

  async klikkBekreftOgFortsett(): Promise<void> {
    await this.clickStepButtonWithRetry(this.bekreftOgFortsettButton, {
      waitForContent: this.skattepliktigGroup,
      verifyHeadingChange: true,
    });
  }

  async klikkBekreftOgSend(): Promise<void> {
    await this.bekreftOgSendButton.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
    await expect(this.bekreftOgSendButton).toBeEnabled({ timeout: TIMEOUT_LONG });

    const responsePromise = this.page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        this.isPensjonistIverksettEndpoint(response.url()) &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: TIMEOUT_VEDTAK }
    );

    await this.bekreftOgSendButton.click();
    await responsePromise;
    console.log('✅ Bekreftet og sendte pensjonistbehandling');
  }
}
