import { Page, Locator, expect } from '@playwright/test';

/**
 * Error assertion framework ported from melosys-web
 * Provides comprehensive error checking for forms
 *
 * Key features:
 * - Assert specific errors are present
 * - Assert no errors are present (pass empty array)
 * - Checks both field errors and error summary boxes
 * - Provides detailed failure messages
 */

/**
 * Assert that specific errors are present (or absent if empty array)
 *
 * @param scope - Page or Locator to search within
 * @param expectedErrors - Array of expected error messages (string or RegExp)
 *                         Pass empty array [] to verify NO errors
 *
 * @example
 * // Verify no errors
 * await assertErrors(page, []);
 *
 * @example
 * // Verify specific error
 * await assertErrors(page, ["Feltet er påkrevd"]);
 *
 * @example
 * // Verify multiple errors with regex
 * await assertErrors(page, [/påkrevd/i, "Ugyldig format"]);
 */
export async function assertErrors(
  scope: Page | Locator,
  expectedErrors: (string | RegExp)[]
): Promise<void> {
  // If empty array, verify NO errors present
  if (expectedErrors.length === 0) {
    await assertNoErrors(scope);
    return;
  }

  // Otherwise, verify expected errors are present
  await assertFieldErrors(scope, expectedErrors);
  await assertErrorSummary(scope, expectedErrors);
}

/**
 * Assert no errors are present on the page
 * Checks both field errors and error summary boxes
 */
async function assertNoErrors(scope: Page | Locator): Promise<void> {
  // Check for field errors
  const fieldErrorSelectors = [
    '.skjemaelement__feilmelding',
    '.aksel-error-message',
    '[class*="error-message"]',
    '.feilmelding',
  ];

  // Én lesing per selektor, og bare elementer med tekst teller. melosys-web har tomme
  // `role="alert"`-beholdere (MultiSelect), og siden kan navigere bort mellom count() og
  // textContent(), som da venter til timeout på et element som er borte.
  for (const selector of fieldErrorSelectors) {
    const errorTexts = await teksterMedInnhold(scope.locator(selector));

    if (errorTexts.length > 0) {
      throw new Error(
        `Expected no errors, but found ${errorTexts.length} field error(s):\n` +
        errorTexts.map((text, i) => `  ${i + 1}. ${text}`).join('\n')
      );
    }
  }

  // Check for error summary box
  const errorSummarySelectors = [
    '.alertstripe--advarsel',
    '.aksel-alert--error',
    '.aksel-alert--warning',
    '[role="alert"]',
  ];

  for (const selector of errorSummarySelectors) {
    const summaryTexts = await teksterMedInnhold(scope.locator(selector));

    if (summaryTexts.length > 0) {
      throw new Error(
        `Expected no errors, but found error summary:\n${summaryTexts[0]}`
      );
    }
  }
}

async function teksterMedInnhold(locator: Locator): Promise<string[]> {
  return (await locator.allTextContents()).map((t) => t.trim()).filter((t) => t.length > 0);
}

/**
 * Assert specific field errors are present
 */
async function assertFieldErrors(
  scope: Page | Locator,
  expectedErrors: (string | RegExp)[]
): Promise<void> {
  const errorLocator = scope.locator(
    '.skjemaelement__feilmelding, .aksel-error-message, .feilmelding'
  );

  for (const expectedError of expectedErrors) {
    if (typeof expectedError === 'string') {
      // String match - check if any error contains this text
      await expect(errorLocator).toContainText(expectedError);
    } else {
      // RegExp match - check if any error matches the pattern
      const allErrors = await errorLocator.allTextContents();
      const found = allErrors.some(text => expectedError.test(text));

      if (!found) {
        throw new Error(
          `Expected error matching ${expectedError}, but found:\n` +
          allErrors.map((text, i) => `  ${i + 1}. ${text}`).join('\n')
        );
      }
    }
  }
}

/**
 * Assert error summary box contains expected errors
 */
async function assertErrorSummary(
  scope: Page | Locator,
  expectedErrors: (string | RegExp)[]
): Promise<void> {
  const errorSummary = scope.locator(
    '.alertstripe--advarsel, .aksel-alert--error, [role="alert"]'
  );

  // Alle bokser med tekst, ikke bare den første: en tom `role="alert"`-beholder kan stå foran.
  const summaryTexts = await teksterMedInnhold(errorSummary);

  if (summaryTexts.length === 0) {
    // Ingen boks med tekst: feltfeilene over er nok.
    return;
  }

  const summaryText = summaryTexts.join('\n');

  for (const expectedError of expectedErrors) {
    if (typeof expectedError === 'string') {
      if (!summaryText.includes(expectedError)) {
        throw new Error(
          `Expected error summary to contain "${expectedError}"\n` +
          `But found: ${summaryText}`
        );
      }
    } else {
      if (!expectedError.test(summaryText)) {
        throw new Error(
          `Expected error summary to match ${expectedError}\n` +
          `But found: ${summaryText}`
        );
      }
    }
  }
}

/**
 * Assert workflow completed successfully (no errors on final page)
 *
 * @param page - Page object
 * @param expectedUrl - RegExp pattern for expected destination URL
 *
 * @example
 * await assertWorkflowCompleted(page, /\/melosys\/$/);
 */
export async function assertWorkflowCompleted(
  page: Page,
  expectedUrl: RegExp
): Promise<void> {
  // Wait for navigation
  await page.waitForURL(expectedUrl, { timeout: 10000 });

  // Verify no errors on destination page
  await assertErrors(page, []);
}

/**
 * Assert form submission succeeded
 * Checks for errors on form page, then waits for navigation to success page
 *
 * @param page - Page object
 * @param formPagePattern - RegExp pattern for form page URL
 * @param successPagePattern - RegExp pattern for success page URL
 *
 * @example
 * await assertFormSubmitted(
 *   page,
 *   /\/opprettnysak/,
 *   /\/melosys\/$/
 * );
 */
export async function assertFormSubmitted(
  page: Page,
  formPagePattern: RegExp,
  successPagePattern: RegExp
): Promise<void> {
  // Check for errors if still on form page
  if (formPagePattern.test(page.url())) {
    await assertErrors(page, []);
  }

  // Wait for navigation to success page
  await page.waitForURL(successPagePattern);

  // Verify no errors on success page
  await assertErrors(page, []);
}
