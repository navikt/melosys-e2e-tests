import { Page, Locator, Response } from '@playwright/test';
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

  // ── Step transition helpers ──────────────────────────────────────────

  /**
   * Get the current VISIBLE step heading text.
   * React keeps all step components mounted but hidden. We must find the visible h1.
   */
  protected async getCurrentStepHeading(): Promise<string> {
    return await this.page.evaluate(() => {
      const headings = document.querySelectorAll('main h1');
      for (const h of Array.from(headings)) {
        const el = h as HTMLElement;
        if (el.offsetHeight > 0 && el.offsetWidth > 0) {
          return el.textContent?.trim() || '';
        }
      }
      return headings[0]?.textContent?.trim() || 'Unknown';
    });
  }

  /**
   * Click "Bekreft og fortsett" with retry logic for reliable step transitions.
   *
   * On slow CI runners, the button click sometimes doesn't register (React re-render,
   * loading overlay, etc.). This method retries the click up to 3 times, verifying
   * that the step heading actually changed before proceeding.
   *
   * @param button - The "Bekreft og fortsett" button locator
   * @param options.waitForContent - Optional locator to wait for on the next step
   * @param options.waitForContentTimeout - Timeout for waitForContent (default: 45000ms)
   * @param options.apiPatterns - URL patterns to detect API calls (default: avklartefakta/vilkaar)
   */
  protected async clickStepButtonWithRetry(
    button: Locator,
    options?: {
      waitForContent?: Locator;
      waitForContentTimeout?: number;
      apiPatterns?: string[];
    },
  ): Promise<void> {
    const {
      waitForContent,
      waitForContentTimeout = 45000,
      apiPatterns = ['/api/avklartefakta/', '/api/vilkaar/'],
    } = options || {};
    const maxAttempts = 3;

    console.log('🔄 Klikker "Bekreft og fortsett"...');

    const headingBefore = await this.getCurrentStepHeading();
    console.log(`  Heading før: "${headingBefore}"`);

    let headingChanged = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        console.log(`  🔄 Retry ${attempt}/${maxAttempts}...`);
      }

      // Wait for button to be stable and enabled
      await button.waitFor({ state: 'visible', timeout: 10000 });
      const isEnabled = await button.isEnabled();
      if (!isEnabled) {
        console.log(`  ⏳ Knapp deaktivert, venter...`);
        await this.page.waitForTimeout(1000);
        continue;
      }
      if (attempt === 1) {
        console.log(`  Knapp aktivert: ${isEnabled}`);
      }

      // Set up response listener BEFORE clicking
      const apiResponsePromise = this.page.waitForResponse(
        (response: Response) =>
          apiPatterns.some(p => response.url().includes(p)) &&
          response.request().method() === 'POST',
        { timeout: 10000 },
      ).catch(() => null);

      await button.click();

      // Wait for API response to confirm click triggered a step transition
      const apiResponse = await apiResponsePromise;
      if (apiResponse) {
        console.log(`  ✅ API: ${apiResponse.url().split('/api/')[1]?.split('?')[0]} → ${apiResponse.status()}`);
      } else {
        console.log(`  ⚠️  Ingen API-respons (forsøk ${attempt})`);
      }

      // Wait for heading to change (confirms step transition in UI)
      const transitionStart = Date.now();
      headingChanged = await this.page.waitForFunction(
        (originalHeading: string) => {
          const headings = document.querySelectorAll('main h1');
          for (const h of headings) {
            const el = h as HTMLElement;
            if (el.offsetHeight > 0 && el.offsetWidth > 0) {
              const text = el.textContent?.trim() || '';
              return text !== originalHeading && text !== '';
            }
          }
          return false;
        },
        headingBefore,
        { timeout: 15000 },
      ).then(() => true).catch(() => false);

      if (headingChanged) {
        const headingAfter = await this.getCurrentStepHeading();
        console.log(`  ✅ Steg endret etter ${Date.now() - transitionStart}ms: "${headingBefore}" → "${headingAfter}"`);
        break;
      }

      // Heading didn't change - wait briefly before retrying
      console.log(`  ⚠️  Heading uendret etter 15s (forsøk ${attempt}/${maxAttempts})`);
      await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

      // Check if heading changed during network idle wait
      const currentHeading = await this.getCurrentStepHeading();
      if (currentHeading !== headingBefore) {
        console.log(`  ✅ Steg endret (sent): "${headingBefore}" → "${currentHeading}"`);
        headingChanged = true;
        break;
      }
    }

    if (!headingChanged) {
      const finalHeading = await this.getCurrentStepHeading();
      console.log(`  ❌ Steg endret seg ikke etter ${maxAttempts} forsøk (heading: "${finalHeading}")`);
    }

    await this.page.waitForTimeout(500);

    if (waitForContent) {
      console.log('  ⏳ Venter på innhold på neste steg...');
      const startTime = Date.now();
      await waitForContent.waitFor({ state: 'visible', timeout: waitForContentTimeout });
      console.log(`  ✅ Innhold synlig etter ${Date.now() - startTime}ms`);
    }

    console.log('✅ Bekreft og fortsett fullført');
  }
}
