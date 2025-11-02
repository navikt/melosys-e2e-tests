import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';

/**
 * Page Object for Resultat Periode (Result Period) page
 *
 * Responsibilities:
 * - Select result for the period (Innvilget/Avslått)
 * - Navigate to next step
 *
 * Related pages:
 * - LovvalgPage (navigates from)
 * - TrygdeavgiftPage (navigates to)
 *
 * @example
 * const resultatPeriode = new ResultatPeriodePage(page);
 * await resultatPeriode.velgResultat('INNVILGET');
 * await resultatPeriode.klikkBekreftOgFortsett();
 */
export class ResultatPeriodePage extends BasePage {
  // Locators
  private readonly resultatDropdown = this.page.getByLabel('Resultat periode');
  private readonly bekreftOgFortsettButton = this.page.getByRole('button', {
    name: 'Bekreft og fortsett'
  });

  constructor(page: Page) {
    super(page);
  }

  /**
   * Select result for the period
   *
   * @param resultat - Result value (e.g., 'INNVILGET', 'AVSLÅTT')
   */
  async velgResultat(resultat: string): Promise<void> {
    await this.resultatDropdown.selectOption(resultat);
    console.log(`✅ Selected resultat: ${resultat}`);
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
   */
  async fyllUtResultatPeriode(resultat: string = 'INNVILGET'): Promise<void> {
    await this.velgResultat(resultat);
    await this.klikkBekreftOgFortsett();
  }
}
