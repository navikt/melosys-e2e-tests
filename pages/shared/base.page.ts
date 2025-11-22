import { Page, Locator } from '@playwright/test';
import { TIMEOUT_MEDIUM } from './constants';

/**
 * Base Page Object class providing common functionality
 * All page objects should extend this class
 *
 * Key features:
 * - Integrates with FormHelper for API-triggered fields
 * - Provides polling strategies for dynamic dropdowns
 * - Offers fallback selector patterns for robustness
 * - Includes common navigation and wait utilities
 * - Monitors browser console for errors (diagnostic mode)
 */
export abstract class BasePage {

  protected constructor(readonly page: Page) {
    // DIAGNOSTIC: Monitor browser console for errors
    // This helps identify frontend bugs that prevent rendering
    this.setupConsoleMonitoring();
  }

  /**
   * Set up browser console monitoring for diagnostics
   * Logs all browser console errors and page errors to help debug rendering issues
   */
  private setupConsoleMonitoring(): void {
    // Monitor browser console messages (console.error calls)
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`🔴 Browser console error: ${msg.text()}`);
      }
    });

    // Monitor uncaught page errors (JavaScript exceptions)
    this.page.on('pageerror', err => {
      console.error(`🔴 Page error: ${err.message}`);
      if (err.stack) {
        console.error(`   Stack: ${err.stack.split('\n')[0]}`); // First line of stack
      }
    });
  }

  /**
   * Navigate to a specific URL
   */
  async goto(url: string): Promise<void> {
    await this.page.goto(url);
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Wait for element with polling strategy (from melosys-web)
   */
  async waitForElement(
    locator: Locator,
    options: { timeout?: number; state?: 'visible' | 'hidden' | 'attached' } = {}
  ): Promise<void> {
    const { timeout = TIMEOUT_MEDIUM, state = 'visible' } = options;
    await locator.waitFor({ state, timeout });
  }

  /**
   * Check if element exists and is visible
   */
  async isElementVisible(locator: Locator, timeout = 1000): Promise<boolean> {
    try {
      await locator.waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Try multiple selectors until one works (fallback pattern from melosys-web)
   * Returns the first visible locator, or null if none found
   */
  async trySelectors(selectors: string[]): Promise<Locator | null> {
    for (const selector of selectors) {
      const element = this.page.locator(selector);
      if (await this.isElementVisible(element)) {
        return element;
      }
    }
    return null;
  }

  /**
   * Select dropdown option by visible text (user-friendly)
   * Matches text content instead of value attribute
   */
  async selectByVisibleText(dropdown: Locator, visibleText: string): Promise<void> {
    const options = await dropdown.locator('option').all();
    let foundValue: string | null = null;

    for (const option of options) {
      const text = await option.textContent();
      if (text?.trim() === visibleText.trim()) {
        foundValue = await option.getAttribute('value');
        break;
      }
    }

    if (!foundValue) {
      const availableOptions = await Promise.all(
        options.map(opt => opt.textContent())
      );
      throw new Error(
        `Could not find option with text "${visibleText}". ` +
        `Available options: ${availableOptions.join(', ')}`
      );
    }

    await dropdown.selectOption({ value: foundValue });
  }

  /**
   * Polling strategy for dependent dropdowns (from melosys-web)
   * Waits for dropdown to populate with options (more than just the placeholder)
   *
   * @param dropdown - The dropdown locator to wait for
   * @param maxRetries - Maximum number of retry attempts (default: 50)
   * @param retryDelay - Delay between retries in ms (default: 200)
   */
  async waitForDropdownToPopulate(
    dropdown: Locator,
    maxRetries = 50,
    retryDelay = 200
  ): Promise<void> {
    let retries = 0;
    let optionCount = await dropdown.locator('option').count();

    while (optionCount <= 1 && retries < maxRetries) {
      await this.page.waitForTimeout(retryDelay);
      optionCount = await dropdown.locator('option').count();
      retries++;
    }

    if (optionCount <= 1) {
      throw new Error(
        `Dropdown hasn't loaded values after ${maxRetries * retryDelay}ms`
      );
    }
  }

  /**
   * Check radio button if it exists
   * Useful for conditional UI elements
   */
  async checkRadioIfExists(locator: Locator): Promise<void> {
    if (await this.isElementVisible(locator)) {
      await locator.check();
    }
  }

  /**
   * Get current URL
   */
  currentUrl(): string {
    return this.page.url();
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(urlPattern: RegExp, timeout = TIMEOUT_MEDIUM): Promise<void> {
    await this.page.waitForURL(urlPattern, { timeout });
  }

  /**
   * Take screenshot for debugging
   */
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `test-results/debug-${name}.png`,
      fullPage: true,
    });
  }
}
