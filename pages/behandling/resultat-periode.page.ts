import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';

/**
 * Page Object for Resultat Periode (Result Period) page
 *
 * Responsibilities:
 * - Select result for the period (Innvilget/Avslått)
 * - Navigate to next step
 * - Handle multiple periods when present
 *
 * Related pages:
 * - LovvalgPage (navigates from)
 * - TrygdeavgiftPage (navigates to)
 *
 * @example
 * const resultatPeriode = new ResultatPeriodePage(page);
 * await resultatPeriode.velgResultat('INNVILGET'); // Period 1
 * await resultatPeriode.velgResultat('INNVILGET', 2); // Period 2
 * await resultatPeriode.klikkBekreftOgFortsett();
 */
export class ResultatPeriodePage extends BasePage {
  // Locators
  private readonly bekreftOgFortsettButton = this.page.getByRole('button', {
    name: 'Bekreft og fortsett'
  });

  constructor(page: Page) {
    super(page);
  }

  /**
   * Get the resultat dropdown for a specific period
   * @param periodIndex - Period number (1-based, defaults to 1)
   * @returns Locator for the resultat dropdown
   */
  private async getResultatDropdown(periodIndex: number = 1) {
    // Try specific period label first (for multiple periods like Helse/Pensjon split)
    const specificLabel = this.page.getByLabel(`Resultat periode ${periodIndex}`);

    // Check if specific label exists
    const count = await specificLabel.count();
    if (count > 0) {
        return specificLabel;
    }

    // Fall back to generic "Resultat" for single period cases
    return this.page.getByLabel('Resultat');
  }

  /**
   * Select result for the period
   *
   * @param resultat - Result value (e.g., 'INNVILGET', 'AVSLÅTT')
   * @param periodIndex - Period number (1-based, defaults to 1)
   */
  async velgResultat(resultat: string, periodIndex: number = 1): Promise<void> {
    const dropdown = await this.getResultatDropdown(periodIndex);
    await dropdown.selectOption(resultat);
    console.log(`✅ Selected resultat: ${resultat} for periode ${periodIndex}`);
  }

  /**
   * Click "Bekreft og fortsett" button
   */
  async klikkBekreftOgFortsett(): Promise<void> {
    await this.bekreftOgFortsettButton.waitFor({ state: 'visible' });
    await this.bekreftOgFortsettButton.click();
    console.log('✅ Clicked Bekreft og fortsett');
  }

  /**
   * Complete resultat periode step with standard value
   * Convenience method for standard workflow
   *
   * @param resultat - Result value (default: 'INNVILGET')
   * @param periodIndex - Period number (1-based, defaults to 1)
   */
  async fyllUtResultatPeriode(resultat: string = 'INNVILGET', periodIndex: number = 1): Promise<void> {
    await this.velgResultat(resultat, periodIndex);
    await this.klikkBekreftOgFortsett();
  }
}
