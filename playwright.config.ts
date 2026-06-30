import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * Felles Chromium-launch-options. Deles mellom hovedprosjektet, skjema-prosjektet og
 * skjema-oppvarmings-setupet slik at host-resolver-regelen (wonderwall → host.docker.internal)
 * gjelder overalt der skjema-innlogging skjer.
 */
const chromiumLaunchOptions = {
  slowMo: 100,
  // Skjema-innlogging: wonderwall redirecter nettleseren til host.docker.internal:8082
  // (mock-oauth2). Chromium leser ikke pålitelig /etc/hosts, så vi tvinger mappingen på
  // browser-nivå. Uskadelig for øvrige tester (ingen annen nettlesertrafikk går dit), og
  // fungerer både lokalt og på CI (mock-oauth2 er publisert på localhost:8082 begge steder).
  args: ['--host-resolver-rules=MAP host.docker.internal 127.0.0.1'],
};

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

    /* Collect trace on ALL runs - you can view replays of successful tests */
    trace: 'on',  // Always record traces
    
    /* Screenshot on ALL runs - so you can see what happened */
    screenshot: 'on',
    
    /* Video recording - record ALL tests */
    video: 'on',
    
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
        launchOptions: chromiumLaunchOptions,
      },
      // Skjema-testene kjøres av det dedikerte 'skjema'-prosjektet (med oppvarmings-avhengighet),
      // så de ekskluderes her for å unngå dobbeltkjøring.
      testIgnore: /tests\/skjema\//,
    },

    // Skjema-oppvarming: kjøres ÉN gang før skjema-testene, og kun når skjema-tester faktisk er
    // valgt (fordi 'skjema'-prosjektet avhenger av dette setupet). Matcher *.setup.ts.
    {
      name: 'skjema-setup',
      testMatch: /tests\/skjema\/.*\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: chromiumLaunchOptions,
      },
    },

    // Skjema-testene som egen prosjekt-enhet, slik at oppvarmingen kun trigges når disse kjøres.
    {
      name: 'skjema',
      testMatch: /tests\/skjema\/.*\.spec\.ts/,
      dependencies: ['skjema-setup'],
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: chromiumLaunchOptions,
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
