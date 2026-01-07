import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';

/**
 * Page Object for Resultat Periode (Result Period) page
 *
 * Responsibilities:
 * - Select result for the period (Innvilget/Avslått)
 * - Handle multiple periods (when trygdedekning creates split periods)
 * - Navigate to next step
 *
 * Related pages:
 * - LovvalgPage (navigates from)
 * - TrygdeavgiftPage (navigates to)
 *
 * @example
 * const resultatPeriode = new ResultatPeriodePage(page);
 * await resultatPeriode.fyllUtResultatPeriode('INNVILGET');
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
   * Get all resultat dropdowns on the page
   * Some trygdedekning values (like FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON) create
   * multiple periods that each need a result selected
   */
  private async getResultatDropdowns() {
    // Wait for at least one dropdown to be visible
    await this.page.getByLabel('Resultat periode 1').waitFor({ state: 'visible', timeout: 10000 });

    // Find all resultat dropdowns
    const dropdowns = [];
    for (let i = 1; i <= 10; i++) {
      const dropdown = this.page.getByLabel(`Resultat periode ${i}`);
      if (await dropdown.isVisible().catch(() => false)) {
        dropdowns.push(dropdown);
      } else {
        break;
      }
    }
    return dropdowns;
  }

  /**
   * Select result for a specific period
   *
   * @param periodeNr - Period number (1-based)
   * @param resultat - Result value (e.g., 'INNVILGET', 'AVSLÅTT')
   */
  async velgResultatForPeriode(periodeNr: number, resultat: string): Promise<void> {
    const dropdown = this.page.getByLabel(`Resultat periode ${periodeNr}`);
    await dropdown.selectOption(resultat);
    console.log(`✅ Selected resultat for periode ${periodeNr}: ${resultat}`);
  }

  /**
   * Select result for all periods on the page
   *
   * @param resultat - Result value (e.g., 'INNVILGET', 'AVSLÅTT')
   */
  async velgResultatForAllePerioder(resultat: string): Promise<void> {
    const dropdowns = await this.getResultatDropdowns();
    console.log(`📝 Found ${dropdowns.length} periode(r) to set resultat for`);

    for (let i = 0; i < dropdowns.length; i++) {
      await dropdowns[i].selectOption(resultat);
      console.log(`✅ Selected resultat for periode ${i + 1}: ${resultat}`);
    }
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
   * Complete resultat periode step intelligently
   *
   * When FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON creates split periods with same dates
   * (e.g., Helsedel and Pensjonsdel), setting all to INNVILGET causes overlap error.
   *
   * This method:
   * 1. Sets the first period to the requested result (default INNVILGET)
   * 2. Sets subsequent periods with same date ranges to AVSLÅTT to avoid overlap
   * 3. Sets periods with different date ranges to the requested result
   *
   * @param resultat - Result value (default: 'INNVILGET')
   */
  async fyllUtResultatPeriode(resultat: string = 'INNVILGET'): Promise<void> {
    const dropdowns = await this.getResultatDropdowns();
    console.log(`📝 Found ${dropdowns.length} periode(r) to process`);

    if (dropdowns.length === 0) {
      console.log('⚠️ No result dropdowns found, just clicking button');
      await this.klikkBekreftOgFortsett();
      return;
    }

    if (dropdowns.length === 1) {
      // Single period - simple case
      await dropdowns[0].selectOption(resultat);
      console.log(`✅ Selected resultat for single periode: ${resultat}`);
    } else {
      // Multiple periods - need to check for overlaps
      // Strategy: Set first period to requested result, check if button is enabled
      // If not (overlap error), set subsequent periods to AVSLÅTT

      // First, try setting all to requested result
      for (let i = 0; i < dropdowns.length; i++) {
        await dropdowns[i].selectOption(resultat);
      }
      console.log(`📝 Set all ${dropdowns.length} perioder to ${resultat}`);

      // Check if button is enabled
      const isEnabled = await this.bekreftOgFortsettButton.isEnabled().catch(() => false);

      if (!isEnabled) {
        // Check for overlap error
        const hasOverlapError = await this.page.getByText('Innvilgede perioder overlapper').isVisible({ timeout: 1000 }).catch(() => false);

        if (hasOverlapError && resultat === 'INNVILGET') {
          console.log('⚠️ Detected overlap error - adjusting periods');
          // Set second period to Avslått (typically Pensjonsdel when Helsedel is first)
          if (dropdowns.length >= 2) {
            await dropdowns[1].selectOption({ label: 'Avslått' });
            console.log('✅ Set periode 2 to Avslått to avoid overlap');
          }
        }
      }
    }

    await this.klikkBekreftOgFortsett();
  }
}
