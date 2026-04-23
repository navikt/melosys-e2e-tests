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

  async fyllInnFraOgMed(dato: string): Promise<void> {
    await this.fraOgMedField.click();
    await this.fraOgMedField.fill(dato);
    await this.fraOgMedField.press('Enter');
    console.log(`✅ Fylte inn fra og med: ${dato}`);
  }

  async fyllInnTilOgMed(dato: string): Promise<void> {
    await this.tilOgMedField.click();
    await this.tilOgMedField.fill(dato);
    await this.tilOgMedField.press('Enter');
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
    await this.velgBostedsland(bostedsland);
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
