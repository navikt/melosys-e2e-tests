import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  
  /* Run tests in files in parallel */
  fullyParallel: false,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Always run tests sequentially - one worker only */
  workers: 1,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['list'],
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
        launchOptions: {
          slowMo: 100,
        }
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
    command: 'echo "Make sure docker-compose services are running: cd ../melosys-docker-compose && make start-all"',
    url: 'http://localhost:3000/melosys/',
    reuseExistingServer: true,
    timeout: 5000,
  },

  /* Set up hooks to check docker logs after each test */
  globalSetup: './global-setup.ts',
});
