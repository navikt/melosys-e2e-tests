import { Page, expect } from '@playwright/test';
import { assertErrors } from '../../utils/assertions';

/**
 * Assertion methods for TrygdeavgiftPage
 *
 * Responsibilities:
 * - Verify page is loaded correctly
 * - Verify form fields are visible
 * - Verify no errors on the page
 * - Verify button states
 */
export class TrygdeavgiftAssertions {
  constructor(readonly page: Page) {}

  /**
   * Verify Trygdeavgift page has loaded
   * Checks that the Skattepliktig field is visible
   */
  async verifiserSideLastet(): Promise<void> {
    const skattepliktigField = this.page.getByRole('radio', { name: 'Nei' }).first();
    await expect(skattepliktigField).toBeVisible({ timeout: 10000 });
  }

  /**
   * Verify Inntektskilde dropdown is visible
   */
  async verifiserInntektskildeDropdown(): Promise<void> {
    const dropdown = this.page.getByLabel('Inntektskilde');
    await expect(dropdown).toBeVisible();
  }

  /**
   * Verify Bruttoinntekt field is visible
   */
  async verifiserBruttoinntektFelt(): Promise<void> {
    const field = this.page.getByRole('textbox', { name: 'Bruttoinntekt' });
    await expect(field).toBeVisible();
  }

  /**
   * Verify no errors are present on the form
   */
  async verifiserIngenFeil(): Promise<void> {
    await assertErrors(this.page, []);
  }

  /**
   * Verify "Bekreft og fortsett" button is enabled
   * This indicates the tax calculation is complete
   */
  async verifiserBekreftKnappAktiv(): Promise<void> {
    const button = this.page.getByRole('button', { name: 'Bekreft og fortsett' });
    await expect(button).toBeEnabled({ timeout: 15000 });
  }
}
