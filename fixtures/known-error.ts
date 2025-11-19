import { test as base } from '@playwright/test';

/**
 * Fixture that automatically marks tests tagged with @known-error as expected to fail.
 *
 * Tests marked with @known-error will:
 * - Still run during test execution
 * - Show results in the test report
 * - NOT cause CI pipeline to fail when they fail
 * - Show as PASSED if they fail (expected behavior)
 * - Show as FAILED if they unexpectedly succeed (bug is fixed!)
 *
 * Usage:
 * ```typescript
 * test('should do something @known-error', async ({ page }) => {
 *   // Test code that is expected to fail
 * });
 *
 * // Or with description:
 * test('should handle edge case @known-error #JIRA-123', async ({ page }) => {
 *   // Reference to issue tracker
 * });
 * ```
 */
export const test = base.extend({
  // Auto-detect @known-error tag in test title
  autoTestFixture: [async ({}, use, testInfo) => {
    // Check if test title contains @known-error tag
    if (testInfo.title.includes('@known-error')) {
      // Mark test as expected to fail
      testInfo.annotations.push({
        type: 'known-error',
        description: 'This test is marked as a known error and is expected to fail'
      });

      // Use Playwright's test.fail() to mark as expected failure
      // If the test fails, it will be marked as passed
      // If the test succeeds, it will be marked as failed (bug is fixed!)
      base.fail();
    }

    await use();
  }, { auto: true }],
});

export { expect } from '@playwright/test';
