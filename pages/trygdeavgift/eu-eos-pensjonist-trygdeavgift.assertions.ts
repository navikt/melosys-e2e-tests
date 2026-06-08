import { Page, expect } from '@playwright/test';

/**
 * Assertion-metoder for EuEosPensjonistTrygdeavgiftPage
 *
 * Ansvar:
 * - Verifisere at infomeldinger er synlige/ikke synlige
 * - Verifisere at beregningstabellen er synlig/ikke synlig
 * - Verifisere 25%-regel-markering (*)
 * - Verifisere sammenslåtte inntektskilder-markering (***)
 */
export class EuEosPensjonistTrygdeavgiftAssertions {
  constructor(readonly page: Page) {}

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

  /**
   * Verifiserer "under minstebeløp"-modus: infomeldingen er synlig OG
   * beregningstabellen er fraværende.
   *
   * Rekkefølgen håndheves bevisst: infomeldingen ventes på først (garanterer at
   * beregningen er fullført og React har ferdig-rendret), deretter sjekkes at
   * tabellen ikke finnes med `toHaveCount(0)`. I motsetning til `not.toBeVisible()`
   * — som returnerer umiddelbart hvis elementet ikke er der akkurat nå og dermed kan
   * bestå for tidlig — feiler `toHaveCount(0)` hvis tabellen dukker opp i en sen
   * React-render innen default-timeout.
   */
  async verifiserMinstebeløpModus(): Promise<void> {
    await this.verifiserInfomeldingMinstebeløpSynlig();
    await expect(this.page.getByRole('columnheader', { name: 'Trygdeperiode' })).toHaveCount(0);
  }

  /**
   * Verifiserer 25%-regel-markering:
   * - `*` i sats-kolonnen
   * - fotnote "* Beregnet etter 25 %-regelen"
   */
  async verifiser25ProsentRegelMarkering(): Promise<void> {
    await expect(this.page.getByRole('cell', { name: '*' })).toBeVisible();
    await expect(this.page.getByText('* Beregnet etter 25 %-regelen')).toBeVisible();
  }

  /**
   * Verifiserer sammenslåtte inntektskilder-markering:
   * - `***` i inntektskilde-kolonnen
   * - fotnote "*** Mer enn en inntekt"
   */
  async verifiserSammenslåtteInntektskilderMarkering(): Promise<void> {
    await expect(this.page.getByRole('cell', { name: '***' })).toBeVisible();
    await expect(this.page.getByText('*** Mer enn en inntekt')).toBeVisible();
  }
}
