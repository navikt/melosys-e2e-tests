import { Page, expect } from '@playwright/test';
import { BasePage } from '../shared/base.page';

/**
 * Page Object for Trygdeavgift-steget for EU/EØS Pensjonist
 * (helseutgiftDekkesPeriode/vurderingTrygdeavgift)
 *
 * Forskjell fra vanlig TrygdeavgiftPage (FTRL):
 * - Beregning-URL: `/trygdeavgift/eos-pensjonist/beregning`
 * - Inntektskilder: PENSJON og UFØRETRYGD (fordi erEøsPensjonist=true → pliktig=true)
 *   (PENSJON_UFØRETRYGD/KILDESKATT er for ikke-EU/EØS pensjonist-tilfeller)
 *
 * @example
 * const trygdeavgift = new EuEosPensjonistTrygdeavgiftPage(page);
 * await trygdeavgift.ventPåSideLastet();
 * await trygdeavgift.velgIkkeSkattepliktig();
 * await trygdeavgift.velgInntektskilde('PENSJON');
 * await trygdeavgift.fyllInnBruttoinntektMedApiVent('8000');
 */
export class EuEosPensjonistTrygdeavgiftPage extends BasePage {
  private readonly skatteforholdsGroup = this.page.getByRole('group', { name: 'Skattepliktig' });

  private readonly inntektskildeDropdown = this.page.getByLabel('Inntektskilde');

  private readonly bruttoinntektField = this.page.getByLabel('Bruttoinntekt');

  constructor(page: Page) {
    super(page);
  }

  async ventPåSideLastet(): Promise<void> {
    await this.skatteforholdsGroup.waitFor({ state: 'visible', timeout: 15000 });
  }

  async velgSkattepliktig(): Promise<void> {
    await this.velgSkattepliktigAlternativ(true);
  }

  async velgIkkeSkattepliktig(): Promise<void> {
    await this.velgSkattepliktigAlternativ(false);
  }

  private async velgSkattepliktigAlternativ(erSkattepliktig: boolean): Promise<void> {
    const navn = erSkattepliktig ? 'Ja' : 'Nei';
    await this.ventPåBeregning(async () => {
      await this.skatteforholdsGroup.getByRole('radio', { name: navn }).click();
    });
  }

  async velgInntektskilde(inntektskildetype: string): Promise<void> {
    await this.inntektskildeDropdown.waitFor({ state: 'visible', timeout: 15000 });
    await expect(this.inntektskildeDropdown).toBeEnabled();
    await expect
      .poll(async () => this.inntektskildeDropdown.locator('option').count(), { timeout: 15000 })
      .toBeGreaterThan(1);
    await this.inntektskildeDropdown.selectOption({ value: inntektskildetype });
  }

  async fyllInnBruttoinntekt(beløp: string): Promise<void> {
    await this.bruttoinntektField.click();
    await this.bruttoinntektField.fill(beløp);
  }

  async fyllInnBruttoinntektMedApiVent(beløp: string): Promise<void> {
    const beregningResponsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('eos-pensjonist/beregning') && resp.status() === 200,
      { timeout: 15000 },
    );
    await this.fyllInnBruttoinntekt(beløp);
    await this.bruttoinntektField.press('Tab');
    await beregningResponsePromise;
  }

  async ventPåBeregning(action: () => Promise<void>): Promise<void> {
    const beregningResponsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('eos-pensjonist/beregning') && resp.status() === 200,
      { timeout: 15000 },
    );
    await action();
    await beregningResponsePromise;
  }

  async verifiserInfomeldingMinstebeløpSynlig(): Promise<void> {
    await expect(
      this.page.getByText('Trygdeavgift skal ikke betales da inntekten er under minstebeløpet.'),
    ).toBeVisible();
  }

  async verifiserInfomeldingMinstebeløpIkkeSynlig(): Promise<void> {
    await expect(
      this.page.getByText('Trygdeavgift skal ikke betales da inntekten er under minstebeløpet.'),
    ).not.toBeVisible();
  }

  async verifiserTrygdeavgiftsTabellSynlig(): Promise<void> {
    await expect(this.page.getByRole('columnheader', { name: 'Trygdeperiode' })).toBeVisible();
  }

  async verifiserTrygdeavgiftsTabellIkkeSynlig(): Promise<void> {
    await expect(this.page.getByRole('columnheader', { name: 'Trygdeperiode' })).not.toBeVisible();
  }
}
