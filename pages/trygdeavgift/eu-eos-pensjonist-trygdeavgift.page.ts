import { Page, expect } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { EuEosPensjonistTrygdeavgiftAssertions } from './eu-eos-pensjonist-trygdeavgift.assertions';

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
  readonly assertions: EuEosPensjonistTrygdeavgiftAssertions;

  private readonly skattepliktigGroup = this.page.getByRole('group', { name: 'Skattepliktig' });

  private readonly inntektskildeDropdown = this.page.getByLabel('Inntektskilde');

  private readonly bruttoinntektField = this.page.getByLabel('Bruttoinntekt');

  private readonly leggTilInntektKnapp = this.page.getByRole('button', { name: 'Legg til inntekt' });

  constructor(page: Page) {
    super(page);
    this.assertions = new EuEosPensjonistTrygdeavgiftAssertions(page);
  }

  private inntektskildeForIndeks(index: number) {
    return this.page.locator(`select[name="inntektskilder[${index}].kildetype"]`);
  }

  private bruttoinntektForIndeks(index: number) {
    return this.page.locator(`input[name="inntektskilder[${index}].bruttoInntekt"]`);
  }

  async ventPåSideLastet(): Promise<void> {
    await this.skattepliktigGroup.waitFor({ state: 'visible', timeout: 15000 });
  }

  async velgSkattepliktig(): Promise<void> {
    await this.velgSkattepliktigAlternativ(true);
  }

  async velgIkkeSkattepliktig(): Promise<void> {
    await this.velgSkattepliktigAlternativ(false);
  }

  private async velgSkattepliktigAlternativ(erSkattepliktig: boolean): Promise<void> {
    const navn = erSkattepliktig ? 'Ja' : 'Nei';
    // Radio-klikket trigger ikke alltid en PUT mot /eos-pensjonist/beregning
    // (form-useEffect avhenger av antall perioder, ikke skatteplikttype-verdien).
    // Tolerant vent: fang evt. debounced PUT, ellers fall tilbake til kort pause.
    // Den definitive PUT'en garanteres av fyllInnBruttoinntektMedApiVent senere.
    const beregningResponsePromise = this.page
      .waitForResponse(
        (resp) =>
          resp.url().includes('eos-pensjonist/beregning') &&
          resp.request().method() === 'PUT' &&
          resp.status() === 200,
        { timeout: 3000 },
      )
      .catch(() => null);

    await this.skattepliktigGroup.getByRole('radio', { name: navn }).click();

    const response = await beregningResponsePromise;
    if (!response) {
      await this.page.waitForTimeout(1500);
    }
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
    await this.ventPåBeregning(async () => {
      await this.fyllInnBruttoinntekt(beløp);
      await this.bruttoinntektField.press('Tab');
    });
  }

  async ventPåBeregning(action: () => Promise<void>): Promise<void> {
    const beregningResponsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('eos-pensjonist/beregning') &&
        resp.request().method() === 'PUT' &&
        resp.status() === 200,
      { timeout: 15000 },
    );
    await action();
    await beregningResponsePromise;
  }

  async klikkLeggTilInntekt(): Promise<void> {
    await this.leggTilInntektKnapp.click();
  }

  async velgInntektskildeForIndeks(index: number, label: string): Promise<void> {
    const dropdown = this.inntektskildeForIndeks(index);
    await dropdown.waitFor({ state: 'visible', timeout: 15000 });
    await expect(dropdown).toBeEnabled();
    await dropdown.selectOption({ label });
  }

  async fyllInnBruttoinntektForIndeksMedApiVent(index: number, beløp: string): Promise<void> {
    await this.ventPåBeregning(async () => {
      const felt = this.bruttoinntektForIndeks(index);
      await felt.click();
      await felt.fill(beløp);
      await felt.press('Tab');
    });
  }
}
