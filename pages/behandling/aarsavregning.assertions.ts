import { Page, expect } from '@playwright/test';
import { assertErrors } from '../../utils/assertions';

/**
 * Assertion methods for AarsavregningPage
 *
 * Responsibilities:
 * - Verify page is loaded correctly
 * - Verify form fields are visible
 * - Verify no errors on the page
 * - Verify button states
 */
export class AarsavregningAssertions {
  constructor(readonly page: Page) {}

  /**
   * Verify Årsavregning page has loaded
   * Checks that the year selector is visible
   */
  async verifiserSideLastet(): Promise<void> {
    const aarVelger = this.page.locator('#aarVelger');
    await expect(aarVelger).toBeVisible({ timeout: 10000 });
    console.log('✅ Årsavregning page is loaded');
  }

  /**
   * Verify the bestemmelse dropdown is visible
   */
  async verifiserBestemmelseDropdown(): Promise<void> {
    const dropdown = this.page.getByLabel('Bestemmelse');
    await expect(dropdown).toBeVisible();
  }

  /**
   * Verify inntektskilde dropdown is visible
   */
  async verifiserInntektskildeDropdown(): Promise<void> {
    const dropdown = this.page.getByLabel('Inntektskilde');
    await expect(dropdown).toBeVisible();
  }

  /**
   * Verify bruttoinntekt field is visible
   */
  async verifiserBruttoinntektFelt(): Promise<void> {
    const field = this.page.getByRole('textbox', { name: 'Bruttoinntekt' });
    await expect(field).toBeVisible();
  }

  /**
   * Verify "Bekreft og fortsett" button is enabled
   * This indicates the form is valid and ready to submit
   */
  async verifiserBekreftKnappAktiv(): Promise<void> {
    const button = this.page.getByRole('button', { name: 'Bekreft og fortsett' });
    await expect(button).toBeEnabled({ timeout: 15000 });
    console.log('✅ Bekreft og fortsett button is enabled');
  }

  /**
   * Verify "Bekreft og fortsett" button is disabled
   */
  async verifiserBekreftKnappDeaktivert(): Promise<void> {
    const button = this.page.getByRole('button', { name: 'Bekreft og fortsett' });
    await expect(button).toBeDisabled({ timeout: 5000 });
    console.log('✅ Bekreft og fortsett button is disabled');
  }

  /**
   * Verify no errors are present on the form
   */
  async verifiserIngenFeil(): Promise<void> {
    await assertErrors(this.page, []);
  }
}
