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
   * Verifiserer at beregningstabellen ikke er synlig.
   *
   * Forutsetning: Kall etter `verifiserInfomeldingMinstebeløpSynlig()` for å sikre
   * at React har ferdig-rendret siden (infomeldingen garanterer at beregningen er fullført).
   * Uten denne forutsetningen kan assertion-en bestå for tidlig, siden assertionstimeout
   * kan utløpe før tabellen eventuelt dukker opp i en sen React-render.
   */
  async verifiserTrygdeavgiftsTabellIkkeSynlig(): Promise<void> {
    await expect(this.page.getByRole('columnheader', { name: 'Trygdeperiode' })).not.toBeVisible();
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
   * - fotnote "*** Mer enn en inntektskilde"
   */
  async verifiserSammenslåtteInntektskilderMarkering(): Promise<void> {
    await expect(this.page.getByRole('cell', { name: '***' })).toBeVisible();
    await expect(this.page.getByText('*** Mer enn en inntektskilde')).toBeVisible();
  }
}
