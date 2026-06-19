/**
 * Step definitions for Trygdeavtale — maps Gherkin to DSL.
 *
 * One file per feature. Each binding is a one-liner.
 * This is where you see the coupling between feature file and DSL.
 *
 * Feature:
 *   Gitt en opprettet trygdeavtale-behandling     → trygdeavtale.opprettBehandling()
 *   Når saksbehandler fatter vedtak med resultat X → trygdeavtale.fattVedtak(X)
 *   Så blir behandlingen fullført og søknad ...    → trygdeavtale.verifiserFullført()
 */
import { Given, When, Then } from '../fixtures';

Given(
  'en opprettet trygdeavtale-behandling',
  async ({ trygdeavtale }) => {
    await trygdeavtale.opprettBehandling();
  },
);

When(
  'saksbehandler fatter vedtak med resultat {string}',
  async ({ trygdeavtale }, resultat: string) => {
    await trygdeavtale.fattVedtak(resultat);
  },
);

Then(
  'blir behandlingen fullført og søknad innvilget',
  async ({ trygdeavtale }) => {
    await trygdeavtale.verifiserFullført();
  },
);
