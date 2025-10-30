import { test as base } from '@playwright/test';
import { checkDockerLogs, formatErrorReport } from '../helpers/check-docker-logs';

/**
 * Custom fixture that checks docker logs after each test
 * Import this in your tests instead of @playwright/test
 */

// Store test start times
const testStartTimes = new Map<string, Date>();

export const test = base.extend<{ dockerLogChecker: void }>({
  // Auto-fixture that runs for every test
  dockerLogChecker: [async ({ }, use, testInfo) => {
    // Before test: record start time
    const startTime = new Date();
    testStartTimes.set(testInfo.testId, startTime);

    // Run the test
    await use();

    // After test: check docker logs
    const minutesAgo = Math.ceil((Date.now() - startTime.getTime()) / 1000 / 60) + 1;

    console.log(`\n🔍 Checking docker logs for errors during: ${testInfo.title}`);

    const errors = checkDockerLogs('melosys-api', minutesAgo);

    if (errors.length > 0) {
      const report = formatErrorReport('melosys-api', errors);

      // Attach to test results (visible in HTML report and CI)
      await testInfo.attach('docker-logs-errors', {
        body: report,
        contentType: 'text/plain',
      });

      console.log(report);

      // Optional: Fail test if critical errors found
      // if (errors.some(e => e.level === 'ERROR')) {
      //   throw new Error(`Found ${errors.filter(e => e.level === 'ERROR').length} ERROR(s) in melosys-api logs`);
      // }
    } else {
      console.log(`✅ No docker errors during test`);
    }

    testStartTimes.delete(testInfo.testId);
  }, { auto: true }], // auto: true means this runs for every test automatically
});

export { expect } from '@playwright/test';
