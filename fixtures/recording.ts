import { test as base } from '@playwright/test';
import { ApiRecorder } from '../recording/api-recorder';

/**
 * Recording fixture - automatically records API calls when RECORD_API=true.
 *
 * Integrates with the main fixture via mergeTests.
 * No-op when RECORD_API is not set (zero overhead).
 *
 * Usage:
 *   RECORD_API=true npx playwright test tests/eu-eos/eu-eos-arbeid-flere-land.spec.ts
 *
 * Recordings saved to: recordings/<sanitized-test-name>.json
 */
export const recordingFixture = base.extend<{ apiRecorder: ApiRecorder | null }>({
  apiRecorder: [async ({ page }, use, testInfo) => {
    let recorder: ApiRecorder | null = null;

    if (process.env.RECORD_API === 'true') {
      recorder = new ApiRecorder(testInfo.file, testInfo.title);
      await recorder.attachToPage(page);
      console.log(`\n🔴 [Recording] Started for: ${testInfo.title}`);
    }

    await use(recorder);

    if (recorder && recorder.exchangeCount > 0) {
      const outputPath = recorder.save();
      console.log(`🔴 [Recording] Completed: ${recorder.exchangeCount} exchanges → ${outputPath}`);

      if (outputPath) {
        testInfo.annotations.push({
          type: 'api-recording',
          description: outputPath,
        });
      }
    }
  }, { auto: true }],
});
