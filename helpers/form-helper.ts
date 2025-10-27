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
   * Fill a field and wait for API response
   * Handles both immediate triggers and blur-triggered API calls
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
    const timeout = options?.timeout || 10000;
    const triggerBlur = options?.triggerBlur ?? true; // Default to true
    
    // Fill the field
    await locator.fill(value);
    
    // Trigger blur if needed (many forms trigger API on blur)
    if (triggerBlur) {
      await this.page.keyboard.press('Tab');
    }
    
    // Wait for the API response
    try {
      await this.page.waitForResponse(
        response => {
          const matches = typeof apiPattern === 'string'
            ? response.url().includes(apiPattern)
            : apiPattern.test(response.url());
          return matches && response.status() === 200;
        },
        { timeout }
      );
      
      // Extra safety: wait a bit for UI to update after API response
      await this.page.waitForTimeout(100);
    } catch (error) {
      console.warn(`Warning: API response not detected for pattern ${apiPattern}. Continuing anyway...`);
      // Wait a bit longer to be safe
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Fill a field, trigger blur, and wait for network idle
   * This is the most reliable but slowest option
   * 
   * Example:
   *   await formHelper.fillAndWaitForNetworkIdle(
   *     page.getByRole('textbox', { name: 'Bruttoinntekt' }),
   *     '100000'
   *   );
   */
  async fillAndWaitForNetworkIdle(locator: any, value: string, timeoutMs: number = 30000) {
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
