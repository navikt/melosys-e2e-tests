# Known Errors Guide

This guide explains how to use the `@known-error` tag to mark tests that are expected to fail due to known bugs or issues.

## Overview

The `@known-error` tag allows you to:
- **Keep failing tests in the test suite** - Don't delete or skip tests for known bugs
- **Track known issues** - Tests serve as documentation of known problems
- **Prevent CI failures** - Known failing tests won't break the build
- **Get notified when bugs are fixed** - Test will fail if it unexpectedly passes (indicating the bug is fixed!)

## How It Works

When a test is tagged with `@known-error`:
- ✅ Test **RUNS** during test execution
- ✅ Test results are **SHOWN** in the report
- ✅ If test **FAILS**, it's marked as **PASSED** (expected behavior)
- ⚠️ If test **SUCCEEDS**, it's marked as **FAILED** (bug is fixed - time to update!)
- ✅ CI pipeline **DOESN'T FAIL** due to this test

## Usage

### Basic Usage

Simply add `@known-error` to your test title:

```typescript
import { test, expect } from '../fixtures';

test('should calculate correct tax @known-error', async ({ page }) => {
  // This test is expected to fail due to a known bug
  // but we keep it to track the issue

  // ... test code that currently fails ...
});
```

### With Issue Tracker Reference

Include a reference to your issue tracker (JIRA, GitHub issue, etc.):

```typescript
test('should handle edge case with zero income @known-error #MELOSYS-1234', async ({ page }) => {
  // Reference to JIRA ticket MELOSYS-1234
  // ... test code ...
});

test('should validate international characters @known-error https://github.com/org/repo/issues/567', async ({ page }) => {
  // Reference to GitHub issue
  // ... test code ...
});
```

### When to Use @known-error

Use `@known-error` when:
- ✅ You've found a bug but it won't be fixed immediately
- ✅ You want to track the bug with a test case
- ✅ You don't want to delete or skip the test
- ✅ You don't want the failing test to block CI/CD

**Don't use** `@known-error` when:
- ❌ The test is flaky (fix the test instead)
- ❌ The feature isn't implemented yet (use `test.skip()` instead)
- ❌ The test is for manual testing only (use `@manual` instead)

## Comparison with @manual

| Feature | @known-error | @manual |
|---------|-------------|---------|
| **Runs by default** | ✅ Yes | ❌ No (skipped) |
| **Runs in CI** | ✅ Yes | ❌ No |
| **Can fail CI** | ❌ No | ❌ N/A |
| **Shows in reports** | ✅ Yes | ⚠️ Only if run manually |
| **Use case** | Known bugs to track | Manual-only tests |
| **Run command** | `npm test` | `MANUAL_TESTS=true npm test` |

## Viewing Results

### In Test Reports

Known error tests appear in the HTML report with a special annotation:

```bash
npm run show-report
```

Look for tests marked with:
- ✅ **Expected to fail** annotation
- Status shows whether test failed (expected) or passed (bug fixed!)

### In CI/CD

GitHub Actions will:
- Run all `@known-error` tests
- Show results in the test summary
- **NOT fail** the build if these tests fail
- **FAIL** the build if these tests unexpectedly pass (indicating bug is fixed)

## Migration from Skipped Tests

If you currently skip tests for known bugs:

**Before:**
```typescript
test.skip('should handle edge case', async ({ page }) => {
  // Skipped - nobody knows about this issue
});
```

**After:**
```typescript
test('should handle edge case @known-error #MELOSYS-1234', async ({ page }) => {
  // Still runs! Tracked with JIRA ticket
  // Will notify us when bug is fixed
});
```

## Workflow for Bug Fixes

1. **Bug found** - Create test with `@known-error` tag
2. **Test runs** - Fails as expected, doesn't block CI
3. **Bug fixed** - Developer fixes the bug in application code
4. **Test passes** - Test now passes unexpectedly
5. **Test fails!** - Playwright marks it as failed (bug is fixed!)
6. **Update test** - Remove `@known-error` tag, test is now a regular passing test

## Examples

### Example 1: Tax Calculation Bug

```typescript
test('should calculate correct tax for zero income @known-error #MELOSYS-5678', async ({ page }) => {
  // Known issue: Tax calculation fails when income is 0
  // Tracked in JIRA: MELOSYS-5678
  // Expected to be fixed in Sprint 23

  const auth = new AuthHelper(page);
  await auth.login();

  // ... navigate to tax calculation page ...

  await page.getByLabel('Bruttoinntekt').fill('0');
  await page.getByRole('button', { name: 'Beregn' }).click();

  // This assertion will fail due to the bug
  await expect(page.getByText('Trygdeavgift: 0 kr')).toBeVisible();
});
```

### Example 2: UI Validation Bug

```typescript
test('should show validation error for negative amount @known-error', async ({ page }) => {
  // Known issue: Negative amounts are accepted when they shouldn't be
  // Bug report filed but low priority

  // ... test code that expects validation error ...

  await expect(page.getByText('Beløp kan ikke være negativt')).toBeVisible();
  // This fails because the validation is missing
});
```

## Best Practices

1. **Always include issue reference** - Use ticket number or URL
2. **Keep test code up to date** - Update test when application code changes (even if still failing)
3. **Review periodically** - Check if bugs are fixed quarterly
4. **Don't overuse** - Too many known errors = tech debt
5. **Remove tag when fixed** - Once bug is fixed, remove `@known-error` tag

## Troubleshooting

### Test still fails CI

If a `@known-error` test is failing the CI pipeline:
- Check that you're using the main `test` fixture from `../fixtures`
- Verify the tag is spelled correctly: `@known-error` (all lowercase, hyphen)
- Make sure the tag is in the test title, not in a comment

### Test doesn't run at all

If the test is being skipped:
- Check you haven't combined `@known-error` with `test.skip()`
- Verify the test file is in the `tests/` directory
- Make sure the test isn't also tagged with `@manual`

## See Also

- [Fixtures Guide](FIXTURES.md) - Automatic cleanup and docker log checking
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common test issues
