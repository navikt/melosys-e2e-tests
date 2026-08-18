import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * BDD-testgenerering (opt-in ATDD-eksempel — se docs/atdd/README.md).
 *
 * Genererer Playwright-testfiler i .features-gen/ fra .feature-filene + step-
 * definisjonene. Dette er Lag 1 i Farleys fire-lags-modell:
 *   Lag 1: atdd/features/      (.feature-filer, strukturert tekst på norsk)
 *   Lag 2: atdd/dsl + atdd/steps  (DSL + bindinger)
 *   Lag 3: atdd/drivers, pages/, helpers/  (protokolldrivere)
 *   Lag 4: docker-compose       (system under test)
 *
 * NB: defineBddConfig auto-genererer IKKE — genereringen skjer kun via `bddgen`
 * (kjøres av `npm run test:bdd`). `.features-gen/` er gitignored, så kjør alltid
 * `npm run test:bdd` (som kjører `npx bddgen` først) og aldri `playwright test
 * --project=bdd` direkte (kan ellers kjøre utdaterte/manglende genererte filer).
 *
 * featuresRoot settes eksplisitt slik at .features-gen/ speiler domene-mappene
 * direkte (f.eks. .features-gen/trygdeavtale/...) uten et overflødig atdd/features/-
 * prefiks.
 */
const bddTestDir = defineBddConfig({
  featuresRoot: 'atdd/features',
  features: 'atdd/features/**/*.feature',
  steps: ['atdd/steps/*.ts', 'atdd/fixtures.ts'],
  language: 'no',
});

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',

  /* Maximum time one test can run for */
  timeout: 60000, // 60 seconds - increased for complex workflows

  /* Run tests in files in parallel */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Skip tests tagged with @manual by default */
  grep: process.env.MANUAL_TESTS ? /@manual/ : undefined,
  grepInvert: process.env.MANUAL_TESTS ? undefined : /@manual/,
  
  /* Retry on CI only.
   * P1 flak-reduksjon: senket fra 2 → 1 for å avdekke reelle flak tidligere.
   * retries=2 maskerte flak; med de eksplisitte ventene på plass skal én
   * grønn kjøring nå være til å stole på. Akseptansebar = 20+ påfølgende
   * grønne kjøringer på main med retries=1 (krever løpende overvåking).
   * Egen commit — kan reverteres uavhengig hvis flak fortsatt dukker opp. */
  retries: process.env.CI ? 1 : 0,

  /* Always run tests sequentially - one worker only */
  workers: 1,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['list'],
    // Custom summary reporter - creates markdown summary with error details
    ['./reporters/test-summary.ts'],
    // GitHub Actions reporter - creates annotations and summary in CI
    ...(process.env.CI ? [['github']] : []),
  ],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Artefakter kun ved behov for å spare ressurser: trace/video tas først når
     * en test kjøres på nytt (retry), skjermbilde kun ved feil. Første grønne
     * kjøring produserer altså ingen tunge artefakter. */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    
    /* Maximum time each action such as `click()` can take */
    actionTimeout: 10000,
    
    /* Viewport size */
    viewport: { width: 1920, height: 1080 },
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Slow down actions slightly for more stable tests
        launchOptions: {
          slowMo: 100,
          // Skjema-innlogging: wonderwall redirecter nettleseren til host.docker.internal:8082
          // (mock-oauth2). Chromium leser ikke pålitelig /etc/hosts, så vi tvinger mappingen på
          // browser-nivå. Uskadelig for øvrige tester (ingen annen nettlesertrafikk går dit), og
          // fungerer både lokalt og på CI (mock-oauth2 er publisert på localhost:8082 begge steder).
          args: ['--host-resolver-rules=MAP host.docker.internal 127.0.0.1'],
        }
      },
    },

    // BDD-prosjekt — kjører .feature-filene via playwright-bdd (opt-in ATDD-eksempel).
    // Kjør via: npm run test:bdd  (kjører `npx bddgen` først; kjør ALDRI direkte
    // uten bddgen — .features-gen/ er gitignored og kan da være utdatert/tomt).
    // Ikke med i default `npm test` (som er pinnet til --project=chromium).
    {
      name: 'bdd',
      testDir: bddTestDir,
      // NV-/unntak-scenarioene driver flere behandlinger og venter på iverksetting;
      // 60s-standarden fra config-toppen holder ikke. One-liner-bindingene har
      // ingen plass å kalle test.setTimeout(), så vi setter timeout på prosjektnivå
      // (samme 180s som de tilsvarende .spec.ts-testene bruker).
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          slowMo: 100,
          // Speiler chromium-prosjektet: skjema-innlogging redirecter til
          // host.docker.internal:8082 (mock-oauth2), og Chromium leser ikke
          // /etc/hosts pålitelig. Uskadelig for de øvrige kallene.
          args: ['--host-resolver-rules=MAP host.docker.internal 127.0.0.1'],
        },
      },
    },

    // Uncomment to test on Firefox and WebKit
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Wait for services to be ready before running tests */
  webServer: {
    command: 'echo "Make sure docker-compose services are running: cd ../melosys-docker-compose && make dev-eessi"',
    url: 'http://localhost:3000/melosys/',
    reuseExistingServer: true,
    timeout: 5000,
  },

  /* Set up hooks to check docker logs after each test */
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
});
