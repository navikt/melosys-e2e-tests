import { test as base } from '@playwright/test';

/**
 * Fixture that automatically marks tests tagged with @known-error.
 *
 * Tests marked with @known-error will:
 * - Still run during test execution
 * - Show results in the test report
 * - NOT cause CI pipeline to fail (whether they pass or fail)
 * - Be marked with special annotation for the reporter to handle
 *
 * When a @known-error test fails: Expected behavior, don't block CI
 * When a @known-error test passes: Bug might be fixed, note in report but don't block CI
 *
 * Usage:
 * ```typescript
 * test('should do something @known-error', async ({ page }) => {
 *   // Test code that tracks a known bug
 * });
 *
 * // Or with description:
 * test('should handle edge case @known-error #JIRA-123', async ({ page }) => {
 *   // Reference to issue tracker
 * });
 * ```
 */
export const test = base.extend<{ autoTestFixture: void }>({
  // Auto-detect @known-error tag in test title
  autoTestFixture: [async ({}, use, testInfo) => {
    // Check if test title contains @known-error tag (case-insensitive)
    if (testInfo.title.toLowerCase().includes('@known-error')) {
      // Add annotation to mark this test as tracking a known bug
      // The reporter will handle this specially:
      // - If it fails: Don't count as real failure (expected behavior)
      // - If it passes: Note in report (bug might be fixed) but don't fail CI
      testInfo.annotations.push({
        type: 'known-error',
        description: 'This test tracks a known bug and should not fail CI'
      });
    }

    await use();
  }, { auto: true }],
});

export { expect } from '@playwright/test';
