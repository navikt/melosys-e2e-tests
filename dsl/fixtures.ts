/**
 * DSL Fixtures — wires Layer 3 (driver) → Layer 2 (DSL) → playwright-bdd.
 *
 * Each scenario gets a fresh TrygdeavtaleDriver and TrygdeavtaleDsl.
 * Step definitions destructure { trygdeavtale } from fixtures.
 */
import { test as base, createBdd } from 'playwright-bdd';
import { TrygdeavtaleDriver } from './drivers/trygdeavtale.driver';
import { TrygdeavtaleDsl } from './trygdeavtale.dsl';

export type DslFixtures = {
  trygdeavtale: TrygdeavtaleDsl;
};

export const test = base.extend<DslFixtures>({
  trygdeavtale: async ({ page }, use) => {
    const driver = new TrygdeavtaleDriver(page);
    await use(new TrygdeavtaleDsl(driver));
  },
});

export const { Given, When, Then } = createBdd(test);
