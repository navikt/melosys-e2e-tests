/**
 * ATDD Fixtures — wires Layer 3 (driver) → Layer 2 (DSL) → playwright-bdd.
 *
 * Merges existing cleanup/docker-log fixtures so BDD tests get the same
 * automatic cleanup and error detection as regular tests.
 */
import { mergeTests, test as pwTest } from '@playwright/test';
import { test as bddBase, createBdd } from 'playwright-bdd';
import { cleanupFixture } from '../fixtures/cleanup';
import { dockerLogsFixture } from '../fixtures/docker-logs';
import { TrygdeavtaleDriver } from './drivers/trygdeavtale.driver';
import { TrygdeavtaleDsl } from './trygdeavtale.dsl';

export type DslFixtures = {
  trygdeavtale: TrygdeavtaleDsl;
};

const dslFixture = bddBase.extend<DslFixtures>({
  trygdeavtale: async ({ page }, use) => {
    const driver = new TrygdeavtaleDriver(page);
    await use(new TrygdeavtaleDsl(driver));
  },
});

export const test = mergeTests(dslFixture, cleanupFixture, dockerLogsFixture);

export const { Given, When, Then } = createBdd(test);
