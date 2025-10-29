import { Page } from '@playwright/test';

/**
 * Helper for filling form fields that trigger API requests
 * 
 * Use this when form fields trigger dynamic updates via API calls.
 * The standard codegen recording doesn't wait for these automatically.
 */
export class FormHelper {
  constructor(private page: Page) {}

  /**
   * Fill a field and wait for API response (STABLE PATTERN)
   *
   * CRITICAL: This uses the correct Playwright pattern to avoid race conditions:
   * 1. Create the response promise FIRST (before triggering the action)
   * 2. Trigger the action (fill + blur)
   * 3. THEN await the response
   *
   * This prevents missing API responses that complete before we start listening.
   *
   * Example:
   *   const formHelper = new FormHelper(page);
   *   await formHelper.fillAndWaitForApi(
   *     page.getByRole('textbox', { name: 'Bruttoinntekt' }),
   *     '100000',
   *     '/trygdeavgift/beregning'
   *   );
   */
  async fillAndWaitForApi(
    locator: any,
    value: string,
    apiPattern: string | RegExp,
    options?: { timeout?: number; triggerBlur?: boolean }
  ) {
    const timeout = options?.timeout || 30000;  // 30s timeout for CI
    const triggerBlur = options?.triggerBlur ?? true; // Default to true

    // CRITICAL: Create the response promise FIRST (no await!)
    // This prevents race conditions where the API responds before we start listening
    const responsePromise = this.page.waitForResponse(
      response => {
        const matches = typeof apiPattern === 'string'
          ? response.url().includes(apiPattern)
          : apiPattern.test(response.url());
        return matches && response.status() === 200;
      },
      { timeout }
    );

    // Now trigger the action that causes the API call
    await locator.fill(value);

    // Trigger blur if needed (many forms trigger API on blur)
    if (triggerBlur) {
      await this.page.keyboard.press('Tab');
    }

    // THEN await the response
    try {
      await responsePromise;
      console.log(`✅ API response received for pattern: ${apiPattern}`);

      // Small buffer for UI to update after API response
      await this.page.waitForTimeout(100);
    } catch (error) {
      console.warn(`⚠️ API response timeout for pattern ${apiPattern}. Continuing anyway...`);
      // Wait longer to be safe if API didn't respond
      await this.page.waitForTimeout(1000);
    }
  }

  /**
   * Fill a field, wait for API, then wait for button to be enabled (MOST STABLE)
   *
   * This is the complete pattern for form fields that trigger API calls
   * which then enable/disable buttons based on validation.
   *
   * Uses the correct Playwright pattern:
   * 1. Create response promise FIRST
   * 2. Fill field and trigger blur
   * 3. Wait for API response
   * 4. Wait for button to be enabled (with auto-retry)
   *
   * Example:
   *   await formHelper.fillAndWaitForButton(
   *     page.getByRole('textbox', { name: 'Bruttoinntekt' }),
   *     '100000',
   *     '/trygdeavgift/beregning',
   *     page.getByRole('button', { name: 'Bekreft og fortsett' })
   *   );
   */
  async fillAndWaitForButton(
    fieldLocator: any,
    value: string,
    apiPattern: string | RegExp,
    buttonLocator: any,
    options?: { apiTimeout?: number; buttonTimeout?: number }
  ) {
    const apiTimeout = options?.apiTimeout || 30000;  // 30s for CI
    const buttonTimeout = options?.buttonTimeout || 15000;  // 15s for button enable

    // CRITICAL: Create the response promise FIRST (no await!)
    const responsePromise = this.page.waitForResponse(
      response => {
        const matches = typeof apiPattern === 'string'
          ? response.url().includes(apiPattern)
          : apiPattern.test(response.url());
        return matches && response.status() === 200;
      },
      { timeout: apiTimeout }
    );

    // Trigger the action
    await fieldLocator.fill(value);
    await this.page.keyboard.press('Tab');

    // Wait for API response
    try {
      await responsePromise;
      console.log(`✅ API response received for pattern: ${apiPattern}`);
    } catch (error) {
      console.warn(`⚠️ API response timeout for pattern ${apiPattern}`);
    }

    // Wait for button to be enabled (Playwright will auto-retry)
    try {
      await this.page.waitForTimeout(100);  // Small buffer for validation
      const { expect } = await import('@playwright/test');
      await expect(buttonLocator).toBeEnabled({ timeout: buttonTimeout });
      console.log('✅ Button is enabled and ready to click');
    } catch (error) {
      console.error('❌ Button did not become enabled within timeout');
      throw error;
    }
  }

  /**
   * Fill a field, trigger blur, and wait for network idle
   *
   * ⚠️ DEPRECATED: Use fillAndWaitForApi() instead
   * networkidle is NOT recommended by Playwright as it can fail with polling requests
   *
   * Example:
   *   await formHelper.fillAndWaitForNetworkIdle(
   *     page.getByRole('textbox', { name: 'Bruttoinntekt' }),
   *     '100000'
   *   );
   */
  async fillAndWaitForNetworkIdle(locator: any, value: string, timeoutMs: number = 30000) {
    console.warn('⚠️ fillAndWaitForNetworkIdle is deprecated. Use fillAndWaitForApi instead.');
    await locator.fill(value);
    await this.page.keyboard.press('Tab'); // Trigger blur
    try {
      await this.page.waitForLoadState('networkidle', { timeout: timeoutMs });
    } catch (error) {
      console.warn('Network did not become idle, waiting 1 second instead...');
      await this.page.waitForTimeout(1000);
    }
  }

  /**
   * Fill a field and wait a fixed amount of time for API to complete
   * This is the most reliable approach for fields that trigger API calls
   * 
   * Example:
   *   await formHelper.fillAndWait(
   *     page.getByRole('textbox', { name: 'Bruttoinntekt' }),
   *     '100000',
   *     1000  // Wait 1 second
   *   );
   */
  async fillAndWait(locator: any, value: string, waitMs: number = 1000) {
    await locator.fill(value);
    await this.page.keyboard.press('Tab'); // Trigger blur
    await this.page.waitForTimeout(waitMs);
  }

  /**
   * Fill a field and wait for a specific element to appear/update
   * 
   * Example:
   *   await formHelper.fillAndWaitForElement(
   *     page.getByRole('textbox', { name: 'Bruttoinntekt' }),
   *     '100000',
   *     'text=/Beregnet:/i'
   *   );
   */
  async fillAndWaitForElement(
    locator: any,
    value: string,
    waitForSelector: string
  ) {
    await locator.fill(value);
    await this.page.keyboard.press('Tab'); // Trigger blur
    await this.page.waitForSelector(waitForSelector, { state: 'visible' });
  }

  /**
   * Fill multiple fields sequentially, waiting for API after each
   * 
   * Example:
   *   await formHelper.fillMultipleFieldsWithApi([
   *     {
   *       locator: page.getByRole('textbox', { name: 'Bruttoinntekt' }),
   *       value: '100000',
   *       apiPattern: '/trygdeavgift/beregning'
   *     },
   *     {
   *       locator: page.getByRole('textbox', { name: 'Arbeidstimer' }),
   *       value: '37.5',
   *       apiPattern: '/trygdeavgift/beregning'
   *     }
   *   ]);
   */
  async fillMultipleFieldsWithApi(
    fields: Array<{ locator: any; value: string; apiPattern: string | RegExp }>
  ) {
    for (const field of fields) {
      await this.fillAndWaitForApi(field.locator, field.value, field.apiPattern);
    }
  }

  /**
   * Check a radio button only if it's not already checked
   * 
   * Example:
   *   await formHelper.checkRadioIfNeeded(
   *     page.getByRole('radio', { name: 'Opprett ny sak' })
   *   );
   */
  async checkRadioIfNeeded(locator: any) {
    const isChecked = await locator.isChecked();
    if (!isChecked) {
      await locator.check();
    }
  }

  /**
   * Check a radio button only if it exists and is visible
   * 
   * Example:
   *   await formHelper.checkRadioIfExists(
   *     page.getByRole('radio', { name: 'Opprett ny sak' })
   *   );
   */
  async checkRadioIfExists(locator: any, timeoutMs: number = 2000) {
    try {
      const isVisible = await locator.isVisible({ timeout: timeoutMs });
      if (isVisible) {
        await locator.check();
      }
    } catch (error) {
      console.log('Radio button not found, continuing...');
    }
  }

  /**
   * Check a checkbox only if it's not already checked
   * 
   * Example:
   *   await formHelper.checkCheckboxIfNeeded(
   *     page.getByRole('checkbox', { name: 'Godta vilkår' })
   *   );
   */
  async checkCheckboxIfNeeded(locator: any) {
    const isChecked = await locator.isChecked();
    if (!isChecked) {
      await locator.check();
    }
  }

  /**
   * Click a button only if it exists and is visible
   * 
   * Example:
   *   await formHelper.clickIfExists(
   *     page.getByRole('button', { name: 'Lukk' })
   *   );
   */
  async clickIfExists(locator: any, timeoutMs: number = 2000) {
    try {
      await locator.click({ timeout: timeoutMs });
    } catch (error) {
      console.log('Element not found, continuing...');
    }
  }
}
