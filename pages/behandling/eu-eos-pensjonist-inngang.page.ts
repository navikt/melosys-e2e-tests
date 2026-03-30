import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';

/**
 * Page Object for Inngang-steget for EU/EØS Pensjonist TRYGDEAVGIFT
 * (vurderingOpplysninger - "Oppgi opplysninger fra attest / S1")
 *
 * Ansvar:
 * - Fylle inn helseutgiftDekkesPeriode (fom/tom)
 * - Velge bostedsland
 * - Bekrefte og gå videre til Trygdeavgift-steget
 *
 * @example
 * const inngang = new EuEosPensjonistInngangPage(page);
 * await inngang.ventPåSideLastet();
 * await inngang.fyllInnPeriode('01.01.2024', '31.12.2024');
 * await inngang.velgBostedsland('SE');
 * await inngang.klikkBekreftOgFortsett();
 */
export class EuEosPensjonistInngangPage extends BasePage {
  private readonly fraOgMedField = this.page.getByRole('textbox', { name: 'Fra og med' });
  private readonly tilOgMedField = this.page.getByRole('textbox', { name: 'Til og med' });
  private readonly bostedslandSelect = this.page.getByLabel('Bostedsland');
  private readonly bekreftKnapp = this.page.getByRole('button', { name: 'Bekreft og fortsett' });

  constructor(page: Page) {
    super(page);
  }

  async ventPåSideLastet(): Promise<void> {
    await this.page
      .getByRole('heading', { name: 'Oppgi opplysninger fra attest / S1', level: 1 })
      .waitFor({ state: 'visible', timeout: 15000 });
  }

  async fyllInnFraDato(dato: string): Promise<void> {
    await this.fraOgMedField.click();
    await this.fraOgMedField.fill(dato);
    await this.fraOgMedField.press('Tab');
  }

  async fyllInnTilDato(dato: string): Promise<void> {
    await this.tilOgMedField.click();
    await this.tilOgMedField.fill(dato);
    await this.tilOgMedField.press('Tab');
  }

  async fyllInnPeriode(fraDato: string, tilDato: string): Promise<void> {
    await this.fyllInnFraDato(fraDato);
    await this.fyllInnTilDato(tilDato);
  }

  async velgBostedsland(landkode: string): Promise<void> {
    await this.bostedslandSelect.selectOption({ value: landkode });
  }

  async klikkBekreftOgFortsett(): Promise<void> {
    await this.bekreftKnapp.click();
    await this.page.waitForLoadState('networkidle');
  }
}
