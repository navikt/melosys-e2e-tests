import { defineConfig } from '@playwright/test';

/**
 * Config for `playwright merge-reports` i merge-jobben i e2e-tests.yml. Samme testDir som
 * playwright.config.ts, så filstiene i den samlede rapporten blir de samme som i en kjøring
 * uten sharding. html først: den tømmer playwright-report/ før test-summary skriver dit.
 */
export default defineConfig({
  testDir: './tests',
  reporter: [['html', { open: 'never' }], ['./reporters/test-summary.ts']],
});
