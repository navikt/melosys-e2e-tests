import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';

/**
 * Page Object for Behandlingsmeny (hamburger menu)
 *
 * Responsibilities:
 * - Open/close the hamburger menu
 * - Navigate "Avslutt behandling" accordion
 * - Perform bortfall (mark treatment as lapsed)
 *
 * UI structure (from behandlingsmeny.tsx):
 * - Hamburger button: role="button", aria-label="Behandlingsmeny"
 * - Accordion with two sections:
 *   - "Legg behandling tilbake"
 *   - "Avslutt behandling"
 * - Actions under "Avslutt behandling" include:
 *   - "Behandlingen er bortfalt" → opens confirmation modal
 *
 * Confirmation modal (from dialogboksBekreftValg.tsx):
 * - Title: "Avslutt behandling som bortfalt"
 * - Buttons: "Bekreft" and "Avbryt"
 *
 * @example
 * const behandlingsmeny = new BehandlingsmenyPage(page);
 * await behandlingsmeny.bortfallBehandling();
 */
export class BehandlingsmenyPage extends BasePage {
  private readonly hamburgerButton = this.page.locator('[aria-label="Behandlingsmeny"]');
  private readonly avsluttBehandlingHeader = this.page.getByRole('button', { name: 'Avslutt behandling' });
  private readonly behandlingenErBortfaltButton = this.page.getByRole('button', { name: 'Behandlingen er bortfalt' });
  private readonly bekreftButton = this.page.getByRole('button', { name: 'Bekreft' });

  constructor(page: Page) {
    super(page);
  }

  /**
   * Open the hamburger menu
   */
  async åpneMeny(): Promise<void> {
    await this.hamburgerButton.click();
    console.log('✅ Opened behandlingsmeny');
  }

  /**
   * Mark the current treatment as bortfalt (lapsed)
   *
   * Steps:
   * 1. Click hamburger menu button
   * 2. Expand "Avslutt behandling" accordion
   * 3. Click "Behandlingen er bortfalt"
   * 4. Confirm in modal by clicking "Bekreft"
   * 5. Wait for navigation back to frontpage
   */
  async bortfallBehandling(): Promise<void> {
    await this.åpneMeny();

    // Expand "Avslutt behandling" accordion
    await this.avsluttBehandlingHeader.click();
    console.log('   Expanded "Avslutt behandling" accordion');

    // Click "Behandlingen er bortfalt"
    await this.behandlingenErBortfaltButton.click();
    console.log('   Clicked "Behandlingen er bortfalt"');

    // Wait for confirmation modal and click "Bekreft"
    await this.bekreftButton.waitFor({ state: 'visible' });
    await this.bekreftButton.click();
    console.log('   Confirmed bortfall');

    // Wait for navigation away from behandling page
    await this.page.waitForLoadState('networkidle');
    console.log('✅ Behandling marked as bortfalt');
  }
}
