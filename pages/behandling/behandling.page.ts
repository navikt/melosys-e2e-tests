import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';

/**
 * Page Object for navigating between sections in a behandling (case treatment)
 *
 * Responsibilities:
 * - Navigate to different sections: Medlemskap, Arbeidsforhold, Lovvalg, Trygdeavgift, Vedtak
 * - Clicking section buttons in the behandling workflow
 *
 * Related pages:
 * - MedlemskapPage (navigates to)
 * - ArbeidsforholdPage (navigates to)
 * - LovvalgPage (navigates to)
 * - TrygdeavgiftPage (navigates to)
 * - VedtakPage (navigates to)
 *
 * @example
 * const behandling = new BehandlingPage(page);
 * await behandling.gåTilTrygdeavgift();
 * await behandling.gåTilVedtak();
 */
export class BehandlingPage extends BasePage {
  // Locators for section navigation buttons
  private readonly medlemskapButton = this.page.locator('button').filter({ hasText: 'Medlemskap' });
  private readonly arbeidsforholdButton = this.page.locator('button').filter({ hasText: 'Arbeidsforhold' });
  private readonly lovvalgButton = this.page.locator('button').filter({ hasText: 'Lovvalg' });
  private readonly trygdeavgiftButton = this.page.locator('button').filter({ hasText: 'Trygdeavgift' });
  private readonly vedtakButton = this.page.locator('button').filter({ hasText: 'Vedtak' });

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to Medlemskap section
   */
  async gåTilMedlemskap(): Promise<void> {
    await this.medlemskapButton.click();
  }

  /**
   * Navigate to Arbeidsforhold section
   */
  async gåTilArbeidsforhold(): Promise<void> {
    await this.arbeidsforholdButton.click();
  }

  /**
   * Navigate to Lovvalg section
   */
  async gåTilLovvalg(): Promise<void> {
    await this.lovvalgButton.click();
  }

  /**
   * Navigate to Trygdeavgift section
   */
  async gåTilTrygdeavgift(): Promise<void> {
    await this.trygdeavgiftButton.click();
  }

  /**
   * Navigate to Vedtak section
   */
  async gåTilVedtak(): Promise<void> {
    await this.vedtakButton.click();
  }
}
