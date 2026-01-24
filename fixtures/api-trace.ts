import { test as base } from '@playwright/test';
import * as path from 'path';
import { ApiTraceRecorder } from '../helpers/api-trace-helper';

/**
 * API Trace Fixture - Automatically records API calls during tests
 *
 * Purpose:
 * Records all API requests with precise timestamps to help debug race conditions,
 * particularly the ObjectOptimisticLockingFailureException on SaksopplysningKilde.
 *
 * Enable via environment variable:
 *   RECORD_API_TRACE=true npm test tests/your-test.spec.ts
 *
 * Optional verbose mode (includes request/response bodies):
 *   RECORD_API_TRACE=true API_TRACE_VERBOSE=true npm test tests/your-test.spec.ts
 *
 * Output:
 *   playwright-report/api-traces/{test-name}.json
 *   playwright-report/api-traces/{test-name}.txt (timeline visualization)
 *
 * The trace includes:
 * - Precise timestamps for each request
 * - Elapsed time since test start
 * - Request method and URL
 * - Response status and duration
 * - Markers for known race condition endpoints
 *
 * Race condition endpoints tracked:
 * - /api/kontroll/ferdigbehandling
 * - /api/saksflyt/vedtak/{id}/fatt
 * - /api/registeropplysninger/
 * - /api/behandling/
 */

// Fixture type
interface ApiTraceFixtures {
  apiTraceRecorder: ApiTraceRecorder | null;
}

export const apiTraceFixture = base.extend<ApiTraceFixtures>({
  apiTraceRecorder: [async ({ page }, use, testInfo) => {
    // Debug: Log environment variable status
    const isEnabled = ApiTraceRecorder.isEnabled();
    console.log(`\n🔍 API Trace Fixture: RECORD_API_TRACE=${process.env.RECORD_API_TRACE}, enabled=${isEnabled}`);

    // Check if tracing is enabled
    if (!isEnabled) {
      // Return null recorder when disabled
      await use(null);
      return;
    }

    // Create recorder with test name
    const testName = testInfo.title
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();

    const recorder = new ApiTraceRecorder(testInfo.title);

    // Attach to page before test
    await recorder.attach(page);

    // Run the test
    await use(recorder);

    // After test: save trace and print summary
    const outputDir = path.join(
      process.cwd(),
      'playwright-report',
      'api-traces'
    );
    const outputFile = path.join(outputDir, `${testName}.json`);

    try {
      recorder.saveToFile(outputFile);
      recorder.printSummary();

      // Attach trace to test report
      const result = recorder.getResult();

      await testInfo.attach('api-trace-json', {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json'
      });

      await testInfo.attach('api-trace-timeline', {
        body: result.timeline,
        contentType: 'text/plain'
      });

      // If there were race condition endpoints called, add annotation
      if (result.summary.raceConditionEndpoints.length > 0) {
        testInfo.annotations.push({
          type: 'race-condition-endpoints',
          description: result.summary.raceConditionEndpoints.join(', ')
        });
      }
    } catch (error) {
      console.error('Failed to save API trace:', error);
    }
  }, { auto: true }]
});
