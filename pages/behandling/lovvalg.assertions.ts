import { Page, expect } from '@playwright/test';

/**
 * Assertion methods for LovvalgPage
 *
 * Responsibilities:
 * - Verify warning messages (yellow alert boxes)
 * - Verify button states (enabled/disabled)
 * - Verify alternative action messages
 * - Verify no warnings present
 *
 * Note: Lovvalg warnings are different from validation errors:
 * - Warnings (yellow) = Valid input but blocks normal flow -> use alternative path
 * - Validation errors (red) = Invalid input -> fix the error
 */
export class LovvalgAssertions {
  constructor(readonly page: Page) {}

  /**
   * Verify that a warning message is displayed (yellow alert box)
   * Filters out UI noise and focuses on actual warning messages
   *
   * @param expectedWarning - Part of the warning message to match (string or regex)
   *
   * @example
   * await lovvalg.assertions.verifiserAdvarselsmelding('Du kan ikke gå videre');
   * await lovvalg.assertions.verifiserAdvarselsmelding(/kan ikke gå videre/i);
   */
  async verifiserAdvarselsmelding(expectedWarning: string | RegExp): Promise<void> {
    // Wait a bit for warnings to appear
    await this.page.waitForTimeout(500);

    // Find warning messages - look for elements with warning-related keywords
    const allWarningLocators = this.page.locator('div, p, span, li').filter({
      hasText: /kan ikke gå videre|må|advarsel|obs|Send brev|Opprett ny BUC|avslutte behandlingen/i
    });

    const warningCount = await allWarningLocators.count();

    if (warningCount === 0) {
      throw new Error('❌ No warning messages found on page. Expected warning containing: ' + expectedWarning);
    }

    // Collect warning messages (filter out noise like date pickers, help text, etc.)
    const foundWarnings: string[] = [];
    for (let i = 0; i < warningCount; i++) {
      const text = await allWarningLocators.nth(i).textContent();
      if (text && text.trim().length > 0 && text.trim().length < 500) {
        const trimmed = text.trim();
        // Avoid duplicates
        if (!foundWarnings.includes(trimmed)) {
          foundWarnings.push(trimmed);
        }
      }
    }

    // Filter to actual warning messages by excluding common UI noise
    const isLikelyWarningMessage = (msg: string): boolean => {
      // Exclude common UI elements
      const uiNoisePatterns = [
        /^Gå til/i,
        /^Måned/i,
        /^Åpne datovelger/i,
        /hjelpetekst/i,
        /^Velg/i,
        /^Fra og med/i,
        /^Til og med/i
      ];

      if (uiNoisePatterns.some(pattern => pattern.test(msg))) {
        return false;
      }

      // Must contain actual warning keywords and be reasonably short
      const hasWarningKeyword = /kan ikke gå videre|må avslutte|Send brev|Opprett ny BUC|periode i MEDL/i.test(msg);
      const isReasonableLength = msg.length > 10 && msg.length < 500;

      return hasWarningKeyword && isReasonableLength;
    };

    const warningMessages = foundWarnings.filter(isLikelyWarningMessage);

    console.log(`📋 Found ${warningMessages.length} warning message(s) on page:`);
    warningMessages.forEach((msg, idx) => {
      console.log(`   ${idx + 1}. "${msg}"`);
    });

    // Now check if expected warning is among them
    const expectedPattern = typeof expectedWarning === 'string' ? expectedWarning : expectedWarning.source;
    const matchingWarning = warningMessages.find(msg => {
      if (typeof expectedWarning === 'string') {
        return msg.includes(expectedWarning);
      } else {
        return expectedWarning.test(msg);
      }
    });

    if (!matchingWarning) {
      throw new Error(
        `❌ Expected warning message not found!\n\n` +
        `Expected (substring): "${expectedPattern}"\n\n` +
        `Actual warning messages found:\n${warningMessages.map((e, i) => `  ${i + 1}. "${e}"`).join('\n')}\n\n` +
        `(Filtered out ${foundWarnings.length - warningMessages.length} UI noise elements)`
      );
    }

    console.log(`✅ Warning message verified: "${matchingWarning}"`);
  }

  /**
   * Verify that "Bekreft og fortsett" button is disabled
   * This happens when a blocking scenario is triggered (any "Nei" answer)
   */
  async verifiserBekreftKnappDeaktivert(): Promise<void> {
    const button = this.page.getByRole('button', { name: 'Bekreft og fortsett' });
    await expect(button).toBeDisabled({ timeout: 5000 });
    console.log('✅ "Bekreft og fortsett" button is disabled');
  }

  /**
   * Verify that "Bekreft og fortsett" button is enabled
   * This happens when all questions are answered "Ja"
   */
  async verifiserBekreftKnappAktiv(): Promise<void> {
    const button = this.page.getByRole('button', { name: 'Bekreft og fortsett' });
    await expect(button).toBeEnabled({ timeout: 5000 });
    console.log('✅ "Bekreft og fortsett" button is enabled');
  }

  /**
   * Verify that alternative action message is displayed
   * This message appears in blocking scenarios, listing alternative paths
   *
   * Expected messages include:
   * - "du kan bruke 'Send brev'-fanen..."
   * - "du må avslutte behandlingen og angi resultatet..."
   * - "periode i MEDL og eventuelt avgiftssystemet må registreres manuelt"
   */
  async verifiserAlternativeHandlinger(): Promise<void> {
    // Check for specific alternative action text
    const sendBrevText = this.page.getByText(/Send brev.*fanen/i);
    const avsluttBehandlingText = this.page.getByText(/avslutte behandlingen/i);
    const medlText = this.page.getByText(/periode i MEDL/i);

    // At least one of these should be visible
    const sendBrevVisible = await sendBrevText.first().isVisible().catch(() => false);
    const avsluttVisible = await avsluttBehandlingText.first().isVisible().catch(() => false);
    const medlVisible = await medlText.first().isVisible().catch(() => false);

    if (!sendBrevVisible && !avsluttVisible && !medlVisible) {
      throw new Error('❌ No alternative action messages found on page');
    }

    console.log('✅ Alternative action messages are displayed');
  }

  /**
   * Verify that no warnings are present
   * Use this for valid scenarios where user can proceed
   */
  async verifiserIngenAdvarsler(): Promise<void> {
    // Check that no warning boxes with "Du kan ikke gå videre" are visible
    const warningBox = this.page.locator('div, p, span').filter({ hasText: /kan ikke gå videre/i });
    const count = await warningBox.count();

    if (count > 0) {
      const text = await warningBox.first().textContent();
      throw new Error(`❌ Unexpected warning found on page: "${text}"`);
    }

    console.log('✅ No warning messages displayed');
  }

  /**
   * Verify that Lovvalg page has loaded
   * Checks that the bestemmelse dropdown is visible
   */
  async verifiserSideLastet(): Promise<void> {
    const bestemmelseDropdown = this.page.getByLabel('Hvilken bestemmelse skal sø');
    await expect(bestemmelseDropdown).toBeVisible({ timeout: 10000 });
    console.log('✅ Lovvalg page loaded');
  }
}
