/**
 * DSL for Trygdeavtale — Layer 2.
 *
 * Pure domain language. No knowledge of POMs, pages, selectors, or helpers.
 * Delegates all actions to the protocol driver (Layer 3).
 *
 * This class is the equivalent of Farley's ShoppingDsl — it exposes
 * domain operations that both step definitions and plain tests can use.
 */
import { TrygdeavtaleDriver } from './drivers/trygdeavtale.driver';

export class TrygdeavtaleDsl {
  constructor(private readonly driver: TrygdeavtaleDriver) {}

  /** Opprett en standard trygdeavtale-behandling */
  async opprettBehandling(): Promise<void> {
    await this.driver.loggInn();
    await this.driver.navigerTilOpprettSak();
    await this.driver.opprettSak();
    await this.driver.navigerTilBehandling();
  }

  /** Fatt vedtak med gitt resultat */
  async fattVedtak(resultat: string): Promise<void> {
    if (resultat !== 'INNVILGET') {
      throw new Error(`Resultat "${resultat}" er ikke implementert ennå`);
    }
    await this.driver.fyllUtBehandling();
    await this.driver.fattVedtak();
  }

  /** Verifiser at behandlingen er fullført: AVSLUTTET i DB med ferdig iverksetting */
  async verifiserFullført(): Promise<void> {
    await this.driver.verifiserFullført();
  }
}
