import { Page, expect } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { LovvalgAssertions } from './lovvalg.assertions';

/**
 * Page Object for Lovvalg (Rules) section in behandling workflow
 *
 * Responsibilities:
 * - Select bestemmelse (regulation)
 * - Select brukers situasjon (user situation)
 * - Answer multiple Ja/Nei questions
 * - Navigate through multiple steps
 *
 * Related pages:
 * - ArbeidsforholdPage (navigates from)
 * - TrygdeavgiftPage (navigates to)
 *
 * @example
 * const lovvalg = new LovvalgPage(page);
 * await lovvalg.velgBestemmelse('FTRL_KAP2_2_1');
 * await lovvalg.velgBrukersSituasjon('MIDLERTIDIG_ARBEID_2_1_FJERDE_LEDD');
 * await lovvalg.svarJaPaaFørsteSpørsmål();
 * await lovvalg.svarJaPaaSpørsmålIGruppe('Er søkers arbeidsoppdrag i');
 * await lovvalg.klikkBekreftOgFortsett();
 */
export class LovvalgPage extends BasePage {
  readonly assertions: LovvalgAssertions;
  // Locators
  private readonly bestemmelseDropdown = this.page.getByLabel('Hvilken bestemmelse skal sø');

  private readonly brukersSituasjonDropdown = this.page.getByLabel('Angi brukers situasjon');

  private readonly bekreftButton = this.page.getByRole('button', {
    name: 'Bekreft og fortsett'
  });

  constructor(page: Page) {
    super(page);
    this.assertions = new LovvalgAssertions(page);
  }

  /**
   * Select bestemmelse (regulation) from dropdown
   *
   * @param bestemmelse - Regulation code (e.g., 'FTRL_KAP2_2_1')
   */
  async velgBestemmelse(bestemmelse: string): Promise<void> {
    await this.bestemmelseDropdown.selectOption(bestemmelse);
  }

  /**
   * Select brukers situasjon (user situation) from dropdown
   *
   * @param situasjon - Situation code (e.g., 'MIDLERTIDIG_ARBEID_2_1_FJERDE_LEDD')
   */
  async velgBrukersSituasjon(situasjon: string): Promise<void> {
    await this.brukersSituasjonDropdown.selectOption(situasjon);
  }

  /**
   * Answer "Ja" to the first question on the page
   * Used when there's only one question or need to answer the first one
   */
  async svarJaPaaFørsteSpørsmål(): Promise<void> {
    const firstJaRadio = this.page.getByRole('radio', { name: 'Ja' }).first();
    await firstJaRadio.waitFor({ state: 'visible', timeout: 5000 });
    await firstJaRadio.check();
  }

  /**
   * Answer "Nei" to the first question on the page
   * Used for testing blocking scenarios
   */
  async svarNeiPaaFørsteSpørsmål(): Promise<void> {
    const firstNeiRadio = this.page.getByRole('radio', { name: 'Nei' }).first();
    await firstNeiRadio.waitFor({ state: 'visible', timeout: 5000 });
    await firstNeiRadio.check();
  }

  /**
   * Answer "Ja" to a specific question by group name
   *
   * @param gruppeNavn - Partial group name (e.g., "Er søkers arbeidsoppdrag i")
   *
   * @example
   * await lovvalg.svarJaPaaSpørsmålIGruppe('Er søkers arbeidsoppdrag i');
   */
  async svarJaPaaSpørsmålIGruppe(gruppeNavn: string): Promise<void> {
    const gruppe = this.page.getByRole('group', { name: new RegExp(gruppeNavn, 'i') });
    const jaRadio = gruppe.getByLabel('Ja');
    await jaRadio.check();
  }

  /**
   * Answer "Nei" to a specific question by group name
   *
   * @param gruppeNavn - Partial group name
   */
  async svarNeiPaaSpørsmålIGruppe(gruppeNavn: string): Promise<void> {
    const gruppe = this.page.getByRole('group', { name: new RegExp(gruppeNavn, 'i') });
    const neiRadio = gruppe.getByLabel('Nei');
    await neiRadio.check();
  }

  /**
   * Answer multiple questions with "Ja" by providing partial group names
   *
   * @param gruppeNavn - Array of partial group names
   *
   * @example
   * await lovvalg.svarJaPaaSpørsmål([
   *   'Er søkers arbeidsoppdrag i',
   *   'Plikter arbeidsgiver å betale',
   *   'Har søker lovlig opphold i'
   * ]);
   */
  async svarJaPaaSpørsmål(gruppeNavn: string[]): Promise<void> {
    for (const navn of gruppeNavn) {
      await this.svarJaPaaSpørsmålIGruppe(navn);
    }
  }

  /**
   * Click "Bekreft og fortsett" button and wait for it to be enabled
   *
   * Note: This button may take time to enable after answering questions
   */
  async klikkBekreftOgFortsett(): Promise<void> {
    await expect(this.bekreftButton).toBeEnabled({ timeout: 10000 });
    console.log('✅ Bekreft og fortsett button is enabled');
    await this.bekreftButton.click();
  }

  /**
   * Click "Bekreft og fortsett" and wait for page to load
   * Used when navigating between multiple steps
   */
  async klikkBekreftOgFortsettMedVent(): Promise<void> {
    await this.klikkBekreftOgFortsett();
    console.log('✅ Clicked Bekreft og fortsett');

    // Wait for page to load
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(500);
    console.log(`📍 Current URL: ${this.currentUrl()}`);
  }

  /**
   * Complete standard Lovvalg workflow with common values
   * Answers typical questions with "Ja"
   */
  async fyllUtLovvalg(): Promise<void> {
    await this.velgBestemmelse('FTRL_KAP2_2_1');
    await this.velgBrukersSituasjon('MIDLERTIDIG_ARBEID_2_1_FJERDE_LEDD');

    // Answer first question
    await this.svarJaPaaFørsteSpørsmål();

    // Answer group questions
    await this.svarJaPaaSpørsmål([
      'Er søkers arbeidsoppdrag i',
      'Plikter arbeidsgiver å betale',
      'Har søker lovlig opphold i'
    ]);

    // Click through two steps
    await this.klikkBekreftOgFortsettMedVent();
    await this.klikkBekreftOgFortsettMedVent();
  }
}
