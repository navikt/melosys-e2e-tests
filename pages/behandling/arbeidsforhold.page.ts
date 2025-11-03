import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';

/**
 * Page Object for Arbeidsforhold (Employment) section in behandling workflow
 *
 * Responsibilities:
 * - Select employer(s) from checkbox list
 * - Navigate to next step
 *
 * Related pages:
 * - MedlemskapPage (navigates from)
 * - LovvalgPage (navigates to)
 *
 * @example
 * const arbeidsforhold = new ArbeidsforholdPage(page);
 * await arbeidsforhold.velgArbeidsgiver('Ståles Stål AS');
 * await arbeidsforhold.klikkBekreftOgFortsett();
 */
export class ArbeidsforholdPage extends BasePage {
  // Locators
  private readonly bekreftButton = this.page.getByRole('button', {
    name: 'Bekreft og fortsett'
  });

  constructor(page: Page) {
    super(page);
  }

  /**
   * Select employer by name from checkbox list
   *
   * @param arbeidsgiverNavn - Employer name (e.g., "Ståles Stål AS")
   */
  async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
    const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });
    await checkbox.check();
  }

  /**
   * Select multiple employers
   *
   * @param arbeidsgiverNavnList - Array of employer names
   */
  async velgArbeidsgivere(arbeidsgiverNavnList: string[]): Promise<void> {
    for (const navn of arbeidsgiverNavnList) {
      await this.velgArbeidsgiver(navn);
    }
  }

  /**
   * Click "Bekreft og fortsett" button to proceed to next step
   */
  async klikkBekreftOgFortsett(): Promise<void> {
    await this.bekreftButton.click();
  }

  /**
   * Complete entire Arbeidsforhold section with a single employer
   * Convenience method for standard workflow
   *
   * @param arbeidsgiverNavn - Employer name (default: "Ståles Stål AS")
   */
  async fyllUtArbeidsforhold(arbeidsgiverNavn: string = 'Ståles Stål AS'): Promise<void> {
    await this.velgArbeidsgiver(arbeidsgiverNavn);
    await this.klikkBekreftOgFortsett();
  }
}
