/**
 * ATDD-fixtures — kobler Lag 3 (driver) → Lag 2 (DSL) → playwright-bdd.
 *
 * Fletter inn de eksisterende Playwright-fixturene (cleanup, docker-logs,
 * known-error, recording) slik at BDD-scenarioene får NØYAKTIG samme automatiske
 * opprydding, feillogg-sjekk, @known-error-håndtering og API-recording som de
 * vanlige testene. Uten cleanup-fixturen er suiten ubrukelig (delt DB).
 *
 * To innganger til samme DSL:
 *   - `test` / `Given/When/Then`: BDD-inngangen (Lag 1 = Gherkin .feature-filer).
 *   - `dslTest`: ren Playwright-inngang (Lag 1 = lesbar TypeScript). Beviser at
 *     playwright-bdd er byttbart — DSL-en er verdien, Gherkin er bare innpakning.
 *     Se tests/trygdeavtale/trygdeavtale-vedtak-dsl.spec.ts (@manual).
 */
import { mergeTests, test as pwTest } from '@playwright/test';
import { test as bddBase, createBdd, defineParameterType } from 'playwright-bdd';
import { cleanupFixture } from '../fixtures/cleanup';
import { dockerLogsFixture } from '../fixtures/docker-logs';
import { test as knownErrorFixture } from '../fixtures/known-error';
import { recordingFixture } from '../fixtures/recording';
import { TrygdeavtaleDriver } from './drivers/trygdeavtale.driver';
import { TrygdeavtaleDsl } from './dsl/trygdeavtale.dsl';

export type DslFixtures = {
  trygdeavtale: TrygdeavtaleDsl;
};

/**
 * Egendefinert parametertype {dato} slik at datoer kan skrives uten anførselstegn
 * i feature-filene: «... perioden 01.01.2024 til 31.12.2025». Regexen speiler det
 * norske DD.MM.YYYY-formatet POM-ene bruker.
 */
defineParameterType({
  name: 'dato',
  regexp: /\d{2}\.\d{2}\.\d{4}/,
  transformer: (s) => s,
});

/** Fixture-funksjonen som lager en fersk, scenario-scoped DSL (delt av begge inngangene). */
const trygdeavtaleFixture = {
  trygdeavtale: async ({ page }: { page: import('@playwright/test').Page }, use: (dsl: TrygdeavtaleDsl) => Promise<void>) => {
    const driver = new TrygdeavtaleDriver(page);
    await use(new TrygdeavtaleDsl(driver));
  },
};

// BDD-inngang: DSL-fixture på playwright-bdd sin base + de delte fixturene.
const bddDslFixture = bddBase.extend<DslFixtures>(trygdeavtaleFixture);
export const test = mergeTests(
  bddDslFixture,
  cleanupFixture,
  dockerLogsFixture,
  knownErrorFixture,
  recordingFixture
);

// Ren Playwright-inngang: samme DSL-fixture på @playwright/test sin base.
const pwDslFixture = pwTest.extend<DslFixtures>(trygdeavtaleFixture);
export const dslTest = mergeTests(
  pwDslFixture,
  cleanupFixture,
  dockerLogsFixture,
  knownErrorFixture,
  recordingFixture
);

export const { Given, When, Then } = createBdd(test);
export { expect } from '@playwright/test';
