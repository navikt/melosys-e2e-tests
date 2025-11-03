import { Page } from '@playwright/test';
import { BasePage } from './shared/base.page';
import { MELOSYS_URL } from './shared/constants';

/**
 * Page Object for the Melosys main page (hovedside)
 *
 * Responsibilities:
 * - Navigation to main page
 * - Initiating "create new case" workflow
 * - Search functionality (future)
 *
 * Related pages:
 * - OpprettNySakPage (navigates to when clicking "Opprett ny sak")
 *
 * @example
 * const hovedside = new HovedsidePage(page);
 * await hovedside.goto();
 * await hovedside.klikkOpprettNySak();
 */
export class HovedsidePage extends BasePage {
  // Locators
  private readonly opprettNySakButton = this.page.getByRole('button', {
    name: 'Opprett ny sak/behandling',
  });

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the main Melosys page
   */
  async goto(): Promise<void> {
    await super.goto(MELOSYS_URL);
  }

  /**
   * Click "Opprett ny sak/behandling" button
   * This will navigate to the "Opprett ny sak" page
   */
  async klikkOpprettNySak(): Promise<void> {
    await this.opprettNySakButton.click();
  }

  /**
   * Navigate to main page and click "Opprett ny sak" in one step
   * Convenience method for common workflow
   */
  async gotoOgOpprettNySak(): Promise<void> {
    await this.goto();
    await this.klikkOpprettNySak();
  }

  /**
   * Verify main page is loaded
   * Checks that the "Opprett ny sak" button is visible
   */
  async verifiserHovedside(): Promise<void> {
    await this.waitForElement(this.opprettNySakButton);
  }
}
