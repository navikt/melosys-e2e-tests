/**
 * Meta-test to verify @known-error functionality
 *
 * This test file verifies that the @known-error tag works correctly:
 * - Tests with @known-error that fail: Don't block CI
 * - Tests with @known-error that pass: Don't block CI, but show notification
 * - Regular tests: Normal behavior
 *
 * Run this test to verify the known-error system:
 *   npx playwright test test-to-keep-but-not-to-run/known-error-meta-test.spec.ts
 *
 * Expected outcome:
 * - All tests in this file should "pass" from CI perspective
 * - Reporter should show:
 *   - known-error-failing-test: ⚠️ (Known Error - Failed)
 *   - known-error-passing-test: ✨ (Known Error - Passed)
 *   - regular-passing-test: ✅ (Passed)
 * - CI Status: passed (because no real failures)
 */

import { test, expect } from '../fixtures';

test.describe('@known-error Meta-Tests', () => {

  test('known-error-failing-test @known-error', async ({ page }) => {
    // This test is marked as @known-error and WILL FAIL
    // Expected behavior:
    // - Test runs
    // - Test fails (assertion error)
    // - Reporter marks it as "known-error-failed" (⚠️)
    // - CI does NOT fail

    await page.goto('http://localhost:3000/melosys/');

    // This will fail - element doesn't exist
    await expect(page.getByText('This Element Does Not Exist At All')).toBeVisible({
      timeout: 2000 // Short timeout to fail quickly
    });
  });

  test('known-error-passing-test @known-error', async ({ page }) => {
    // This test is marked as @known-error but WILL PASS
    // Expected behavior:
    // - Test runs
    // - Test passes (assertion succeeds)
    // - Reporter marks it as "known-error-passed" (✨)
    // - Reporter notes: "Bug might be fixed - consider removing tag"
    // - CI does NOT fail

    await page.goto('http://localhost:3000/melosys/');

    // This will pass - page title exists
    await expect(page).toHaveTitle(/Melosys/);
  });

  test('regular-passing-test', async ({ page }) => {
    // This is a regular test (no @known-error) that WILL PASS
    // Expected behavior:
    // - Test runs
    // - Test passes
    // - Reporter marks it as "passed" (✅)
    // - CI passes

    await page.goto('http://localhost:3000/melosys/');
    await expect(page).toHaveTitle(/Melosys/);
  });

  // NOTE: We don't include a "regular-failing-test" here because
  // that would actually fail the CI, which we don't want for this meta-test.
  // The point is to verify that @known-error tests don't fail CI.

});

test.describe('Verification Checklist', () => {

  test('verify test ran successfully @manual', async ({ page }) => {
    // This test is manual - run with MANUAL_TESTS=true npm test
    // After running the meta-tests above, verify:
    //
    // 1. Check test-summary.md:
    //    - Overall Results should show:
    //      - ⚠️ Known Error (Failed): 1
    //      - ✨ Known Error (Passed): 1
    //      - ✅ Passed: 1
    //      - **Status: passed** (NOT failed!)
    //
    // 2. Check test results table:
    //    - known-error-failing-test: ⚠️ icon
    //    - known-error-passing-test: ✨ icon
    //    - regular-passing-test: ✅ icon
    //
    // 3. Check sections:
    //    - "⚠️ Known Error Tests (Failed)" section should list failing test
    //    - "✨ Known Error Tests (Passed)" section should list passing test with warning
    //
    // 4. Verify retry behavior:
    //    - known-error tests should show "1 attempt" (no retries)
    //    - They should NOT show "3 (0 failed)" like before
    //
    // 5. Check CI:
    //    - GitHub Actions should show green check ✅
    //    - Even though one @known-error test failed
    //
    // If all above checks pass, the @known-error system is working correctly!

    console.log('✅ Meta-test verification checklist ready');
  });

});
