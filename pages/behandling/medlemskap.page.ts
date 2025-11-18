import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { MedlemskapAssertions } from './medlemskap.assertions';

/**
 * Page Object for Medlemskap (Membership) section in behandling workflow
 *
 * Responsibilities:
 * - Fill date range (Fra og med, Til og med)
 * - Select land (country) from React Select dropdown
 * - Select trygdedekning (insurance coverage)
 * - Navigate to next step
 *
 * Related pages:
 * - OpprettNySakPage (navigates from)
 * - ArbeidsforholdPage (navigates to)
 *
 * @example
 * const medlemskap = new MedlemskapPage(page);
 * await medlemskap.velgPeriode('01.01.2024', '31.12.2024');
 * await medlemskap.velgLand('Afghanistan');
 * await medlemskap.velgTrygdedekning('FULL_DEKNING_FTRL');
 * await medlemskap.klikkBekreftOgFortsett();
 */
export class MedlemskapPage extends BasePage {
  readonly assertions: MedlemskapAssertions;

  // Locators
  private readonly fraOgMedField = this.page.getByRole('textbox', { name: 'Fra og med' });

  private readonly tilOgMedField = this.page.getByRole('textbox', {
    name: 'Til og med Til og med'
  });

  private readonly velgLandRadio = this.page.getByRole('radio', {
    name: 'Velg land fra liste'
  });

  private readonly flereLandRadio = this.page.getByRole('radio', {
    name: 'Flere land, ikke kjent hvilke'
  });

  // React Select dropdown - uses CSS class
  private readonly landDropdown = this.page.locator('.css-19bb58m');

  private readonly trygdedekningDropdown = this.page.getByLabel('Trygdedekning');

  private readonly bekreftButton = this.page.getByRole('button', {
    name: 'Bekreft og fortsett'
  });

  constructor(page: Page) {
    super(page);
    this.assertions = new MedlemskapAssertions(page);
  }

  /**
   * Fill "Fra og med" date field
   *
   * @param dato - Date in format DD.MM.YYYY (e.g., "01.01.2024")
   */
  async fyllInnFraOgMed(dato: string): Promise<void> {
    await this.fraOgMedField.fill(dato);
  }

  /**
   * Fill "Til og med" date field
   *
   * @param dato - Date in format DD.MM.YYYY (e.g., "31.12.2024")
   */
  async fyllInnTilOgMed(dato: string): Promise<void> {
    await this.tilOgMedField.fill(dato);
  }

  /**
   * Fill date range (both Fra og med and Til og med)
   *
   * @param fraOgMed - Start date in format DD.MM.YYYY
   * @param tilOgMed - End date in format DD.MM.YYYY
   */
  async velgPeriode(fraOgMed: string, tilOgMed: string): Promise<void> {
    await this.fyllInnFraOgMed(fraOgMed);
    await this.fyllInnTilOgMed(tilOgMed);
  }

  /**
   * Select "Velg land fra liste" radio button
   * This reveals the land dropdown
   */
  async velgLandFraListe(): Promise<void> {
    await this.velgLandRadio.check();
  }

  /**
   * Select "Flere land, ikke kjent hvilke" radio button
   * Use this when the person works in multiple countries but exact countries are unknown
   */
  async velgFlereLandIkkeKjentHvilke(): Promise<void> {
    await this.flereLandRadio.check();
  }

  /**
   * Select land (country) from React Select dropdown
   *
   * @param landNavn - Country name (e.g., "Afghanistan", "Norge")
   *
   * Note: This uses a React Select component which requires special handling
   */
  async velgLand(landNavn: string): Promise<void> {
    // Ensure radio button is selected
    await this.velgLandFraListe();

    // Click the React Select dropdown
    await this.landDropdown.click();

    // Wait for and click the option
    const landOption = this.page.getByRole('option', { name: landNavn });
    await landOption.click();
  }

  /**
   * Select trygdedekning (insurance coverage) from dropdown
   *
   * @param trygdedekning - Coverage type (e.g., 'FULL_DEKNING_FTRL')
   */
  async velgTrygdedekning(trygdedekning: string): Promise<void> {
    await this.trygdedekningDropdown.selectOption(trygdedekning);
  }

  /**
   * Click "Bekreft og fortsett" button to proceed to next step
   */
  async klikkBekreftOgFortsett(): Promise<void> {
    await this.bekreftButton.click();
  }

  /**
   * Complete entire Medlemskap section with common values
   * Convenience method for standard workflow
   *
   * @param fraOgMed - Start date (default: "01.01.2024")
   * @param tilOgMed - End date (default: "31.12.2024")
   * @param land - Country name (default: "Afghanistan")
   * @param trygdedekning - Coverage type (default: "FULL_DEKNING_FTRL")
   */
  async fyllUtMedlemskap(
    fraOgMed: string = '01.01.2024',
    tilOgMed: string = '31.12.2024',
    land: string = 'Afghanistan',
    trygdedekning: string = 'FULL_DEKNING_FTRL'
  ): Promise<void> {
    await this.velgPeriode(fraOgMed, tilOgMed);
    await this.velgLand(land);
    await this.velgTrygdedekning(trygdedekning);
    await this.klikkBekreftOgFortsett();
  }
}
