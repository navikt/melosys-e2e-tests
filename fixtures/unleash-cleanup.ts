import { mergeTests } from '@playwright/test';
import { cleanupFixture } from './cleanup';
import { dockerLogsFixture } from './docker-logs';
import { test as base } from '@playwright/test';
import { UnleashHelper } from '../helpers/unleash-helper';

/**
 * Unleash cleanup fixture - opt-in fixture for tests that use Unleash feature toggles
 *
 * This fixture:
 * 1. Captures the initial state of all feature toggles BEFORE the test
 * 2. Runs the test (test can enable/disable toggles as needed)
 * 3. Restores ONLY the toggles that changed during the test
 *
 * Benefits:
 * - Only runs for tests that explicitly need it (opt-in)
 * - Smart cleanup: only restores toggles that actually changed
 * - No unnecessary API calls or console noise
 *
 * Usage:
 * ```typescript
 * import { test, expect } from '../../fixtures/unleash-cleanup';
 *
 * test('my test with unleash', async ({ page, request }) => {
 *   const unleash = new UnleashHelper(request);
 *   await unleash.disableFeature('melosys.some-feature');
 *   // ... test logic ...
 *   // Cleanup happens automatically after test
 * });
 * ```
 */

const unleashCleanupFixture = base.extend<{ unleashReset: void }>({
  unleashReset: [async ({ request }, use) => {
    const unleash = new UnleashHelper(request);

    // Capture initial state of all feature toggles
    const initialStates = new Map<string, boolean>();
    try {
      const features = await unleash.listFeatures();
      for (const feature of features) {
        const isEnabled = await unleash.isFeatureEnabled(feature);
        initialStates.set(feature, isEnabled);
      }
    } catch (error: any) {
      console.log(`   ⚠️  Failed to capture initial Unleash state: ${error.message || error}`);
    }

    // Run the test
    await use();

    // Restore only the toggles that changed during the test
    let restoredCount = 0;
    try {
      for (const [feature, wasEnabled] of initialStates) {
        const isEnabled = await unleash.isFeatureEnabled(feature);

        // Only restore if state changed
        if (isEnabled !== wasEnabled) {
          if (wasEnabled) {
            await unleash.enableFeature(feature);
          } else {
            await unleash.disableFeature(feature);
          }
          restoredCount++;
        }
      }

      if (restoredCount > 0) {
        console.log(`   ✅ Unleash: Restored ${restoredCount} toggle(s) to original state`);
      }
    } catch (error: any) {
      console.log(`   ⚠️  Unleash restoration failed: ${error.message || error}`);
    }
  }, { auto: true }]
});

/**
 * Test fixture with Unleash cleanup support
 * Use this in tests that need feature toggle control
 */
export const test = mergeTests(cleanupFixture, dockerLogsFixture, unleashCleanupFixture);
export { expect } from '@playwright/test';
