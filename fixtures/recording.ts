import { test as base } from '@playwright/test';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
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
 * Recordings saved to:
 * - recordings/<sanitized-test-name>.json (local working copy)
 * - playwright-report/recordings/<sanitized-test-name>.json (CI artifact)
 * - Also attached to test results via testInfo.attach()
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
        // Attach recording JSON to test report (shows up in Playwright HTML report)
        await testInfo.attach('api-recording', {
          path: outputPath,
          contentType: 'application/json',
        });

        // Copy to playwright-report/recordings/ for CI artifact collection
        const reportRecordingsDir = join(process.cwd(), 'playwright-report', 'recordings');
        if (!existsSync(reportRecordingsDir)) {
          mkdirSync(reportRecordingsDir, { recursive: true });
        }
        const destPath = join(reportRecordingsDir, basename(outputPath));
        copyFileSync(outputPath, destPath);
        console.log(`🔴 [Recording] Copied to CI artifact path: ${destPath}`);

        // Log race-relevant summary
        const raceRelevant = recorder.getRaceRelevantExchanges();
        if (raceRelevant.length > 0) {
          console.log(`\n⚡ [Recording] Race-relevant API calls (${raceRelevant.length}):`);
          for (const e of raceRelevant) {
            console.log(`   #${e.index} ${e.request.method} ${e.request.pathname} → ${e.response.status} (T+${e.elapsedMs}ms, ${e.durationMs}ms)`);
          }
        }

        testInfo.annotations.push({
          type: 'api-recording',
          description: outputPath,
        });
      }
    }
  }, { auto: true }],
});
