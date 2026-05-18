import { Page, expect } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { EuEosPensjonistBehandlingAssertions } from './eu-eos-pensjonist-behandling.assertions';

export class EuEosPensjonistBehandlingPage extends BasePage {
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

  async ventPåSideLastet(): Promise<void> {
    await this.fraOgMedField.waitFor({ state: 'visible', timeout: 10000 });
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
      { timeout: 5000 },
    );

    await this.velgBostedsland(bostedsland);
    await periodeLagret;
  }

  async klikkBekreftOgFortsett(): Promise<void> {
    await this.clickStepButtonWithRetry(this.bekreftOgFortsettButton, {
      waitForContent: this.skattepliktigGroup,
    });
  }

  async klikkBekreftOgSend(): Promise<void> {
    await this.bekreftOgSendButton.waitFor({ state: 'visible', timeout: 10000 });
    await expect(this.bekreftOgSendButton).toBeEnabled({ timeout: 10000 });
    await this.bekreftOgSendButton.click();
    console.log('✅ Bekreftet og sendte pensjonistbehandling');
  }
}
