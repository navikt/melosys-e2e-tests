/**
 * Example tests demonstrating the @known-error tag feature
 *
 * These tests show how to use @known-error to mark tests that are expected to fail
 * due to known bugs. Tests will still run but won't fail the CI pipeline.
 *
 * To run these examples:
 *   npx playwright test test-to-keep-but-not-to-run/known-error-example.spec.ts
 */

import { test, expect } from '../fixtures';
import { AuthHelper } from '../helpers/auth-helper';

test.describe('Known Error Examples', () => {

  test('passing test - normal behavior', async ({ page }) => {
    // Regular test that passes
    // This will show as PASSED in the report

    await page.goto('http://localhost:3000/melosys/');
    await expect(page).toHaveTitle(/Melosys/);
  });

  test('failing test with @known-error tag @known-error', async ({ page }) => {
    // This test is expected to fail due to a known bug
    // Because it has @known-error tag:
    // - Test will run
    // - When it fails (as expected), it shows as PASSED
    // - Doesn't fail the CI pipeline

    await page.goto('http://localhost:3000/melosys/');

    // This assertion will fail (element doesn't exist)
    await expect(page.getByText('This Element Does Not Exist')).toBeVisible();

    // But the test will be marked as PASSED because it's expected to fail!
  });

  test('failing test with issue reference @known-error #MELOSYS-1234', async ({ page }) => {
    // Include issue tracker reference in the test name
    // This helps track which bug this test is related to

    await page.goto('http://localhost:3000/melosys/');

    // Simulate a known bug - this will fail
    await expect(page.getByText('Non-existent feature')).toBeVisible();

    // Test shows as PASSED because failure is expected
    // When bug MELOSYS-1234 is fixed, this test will unexpectedly pass
    // and Playwright will mark it as FAILED (indicating you can remove @known-error)
  });

  test('realistic example: tax calculation bug @known-error', async ({ page }) => {
    // Realistic example: Known bug in tax calculation for edge case

    const auth = new AuthHelper(page);
    await auth.login();

    await page.goto('http://localhost:3000/melosys/');

    // Navigate to a form where the bug exists
    await page.getByRole('button', { name: 'Opprett ny sak' }).click();

    // Simulate filling in data that triggers the bug
    await page.getByLabel('Bruttoinntekt').fill('0');

    // This assertion will fail because of the bug
    // But test won't fail CI because it's marked @known-error
    await expect(page.getByText('Ugyldig inntekt')).toBeVisible();
  });

  test('comparison: regular failing test (will fail CI)', async ({ page }) => {
    // This is a regular test WITHOUT @known-error tag
    // If this test fails, it WILL fail the CI pipeline
    // Only use this for real bugs that should be fixed immediately

    await page.goto('http://localhost:3000/melosys/');

    // Comment out this line to make the test pass:
    // await expect(page.getByText('This will fail')).toBeVisible();

    // Regular assertion that should pass
    await expect(page).toHaveTitle(/Melosys/);
  });

});

test.describe('When to use @known-error', () => {

  test('USE @known-error: Bug found but not fixed yet @known-error', async ({ page }) => {
    // ✅ GOOD USE CASE:
    // - You found a bug in the application
    // - Bug is logged in JIRA but won't be fixed immediately
    // - You want to track it with a test
    // - You don't want it to block CI

    // Simulate bug scenario...
    await page.goto('http://localhost:3000/melosys/');
    await expect(page.getByText('Future feature')).toBeVisible();
  });

  test.skip('DO NOT use @known-error: Feature not implemented yet', async ({ page }) => {
    // ❌ BAD USE CASE for @known-error
    // ✅ GOOD USE CASE for test.skip()
    // - Feature hasn't been built yet
    // - Test is ready for when feature is implemented
    // - Use test.skip() instead!

    // When feature is ready, remove .skip
  });

  test('DO NOT use @known-error: Flaky test', async ({ page }) => {
    // ❌ BAD USE CASE for @known-error
    // - Test passes sometimes, fails sometimes
    // - This is a test problem, not an application bug
    // - Fix the test instead! Use proper waits, selectors, etc.

    await page.goto('http://localhost:3000/melosys/');

    // Fix flaky tests by:
    // - Using auto-waiting selectors (getByRole, getByLabel)
    // - Adding explicit waits for API calls
    // - Using FormHelper for fields that trigger API requests
  });

});

test.describe('Lifecycle of a @known-error test', () => {

  test('Step 1: Bug found @known-error #MELOSYS-9999', async ({ page }) => {
    // 1. You find a bug while testing
    // 2. Create a test case that reproduces the bug
    // 3. Add @known-error tag so it doesn't block CI
    // 4. Create JIRA ticket and reference it in test name

    await page.goto('http://localhost:3000/melosys/');
    await expect(page.getByText('Bug behavior')).toBeVisible();

    // Test fails as expected, shows as PASSED in report
  });

  // Later... bug is fixed in the application

  test('Step 2: Bug fixed - REMOVE @known-error tag now!', async ({ page }) => {
    // When developer fixes bug #MELOSYS-9999:
    // 1. Test will unexpectedly PASS
    // 2. Playwright will mark it as FAILED (reversed logic)
    // 3. This tells you the bug is fixed!
    // 4. Remove @known-error tag from test name
    // 5. Test becomes a regular passing regression test

    await page.goto('http://localhost:3000/melosys/');
    await expect(page).toHaveTitle(/Melosys/);

    // This test passes normally now
  });

});
