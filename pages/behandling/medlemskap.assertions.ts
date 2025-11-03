import { Page, expect } from '@playwright/test';
import { assertErrors } from '../../utils/assertions';

/**
 * Assertion methods for MedlemskapPage
 *
 * Responsibilities:
 * - Verify form fields are visible and enabled
 * - Verify no errors on the page
 * - Verify successful navigation
 */
export class MedlemskapAssertions {
  constructor(readonly page: Page) {}

  /**
   * Verify the "Fra og med" field is visible and enabled
   */
  async verifiserFraOgMedFelt(): Promise<void> {
    const field = this.page.getByRole('textbox', { name: 'Fra og med' });
    await expect(field).toBeVisible();
    await expect(field).toBeEnabled();
  }

  /**
   * Verify the land dropdown is visible
   */
  async verifiserLandDropdown(): Promise<void> {
    // First ensure radio button is checked
    await this.page.getByRole('radio', { name: 'Velg land fra liste' }).check();

    // Then verify dropdown appears
    const dropdown = this.page.locator('.css-19bb58m');
    await expect(dropdown).toBeVisible();
  }

  /**
   * Verify no errors are present on the form
   */
  async verifiserIngenFeil(): Promise<void> {
    await assertErrors(this.page, []);
  }

  /**
   * Verify "Bekreft og fortsett" button is enabled
   */
  async verifiserBekreftKnappAktiv(): Promise<void> {
    const button = this.page.getByRole('button', { name: 'Bekreft og fortsett' });
    await expect(button).toBeEnabled({ timeout: 10000 });
  }
}
