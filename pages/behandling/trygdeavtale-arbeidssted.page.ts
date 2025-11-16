import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';

/**
 * Page Object for Trygdeavtale Arbeidssted (Workplace) section
 *
 * Responsibilities:
 * - Add arbeidssted/skip/plattform (workplace/ship/platform)
 * - Navigate to Vedtak page
 *
 * Related pages:
 * - TrygdeavtaleBehandlingPage (navigates from)
 * - VedtakPage (navigates to)
 *
 * @example
 * const arbeidssted = new TrygdeavtaleArbeidsstedPage(page);
 * await arbeidssted.åpneArbeidsstedSeksjon();
 * await arbeidssted.leggTilArbeidssted('Test Workplace');
 * await arbeidssted.gåTilVedtak();
 */
export class TrygdeavtaleArbeidsstedPage extends BasePage {
  // Locators
  private readonly arbeidsstedButton = this.page.getByRole('button', {
    name: 'Arbeidssted(er)'
  });

  private readonly leggTilArbeidsstedButton = this.page.getByRole('button', {
    name: 'Legg til arbeidssted/'
  });

  private readonly navnPåArbeidsstedField = this.page.getByRole('textbox', {
    name: 'Navn på arbeidssted/skip/'
  });

  private readonly lagreButton = this.page.getByRole('button', {
    name: 'Lagre'
  });

  private readonly fattVedtakButton = this.page.getByRole('button', {
    name: 'Fatt vedtak'
  });

  constructor(page: Page) {
    super(page);
  }

  /**
   * Open arbeidssted section by clicking the button
   * This expands the arbeidssted accordion
   */
  async åpneArbeidsstedSeksjon(): Promise<void> {
    await this.arbeidsstedButton.click();
    console.log('✅ Opened arbeidssted section');
  }

  /**
   * Click "Legg til arbeidssted/skip/plattform" button
   * Opens the form to add a new workplace
   */
  async klikkLeggTilArbeidssted(): Promise<void> {
    await this.leggTilArbeidsstedButton.click();
    console.log('✅ Clicked "Legg til arbeidssted"');
  }

  /**
   * Fill in workplace name
   *
   * @param navn - Name of workplace/ship/platform
   */
  async fyllInnNavnPåArbeidssted(navn: string): Promise<void> {
    await this.navnPåArbeidsstedField.click();
    await this.navnPåArbeidsstedField.fill(navn);
    console.log(`✅ Filled workplace name: ${navn}`);
  }

  /**
   * Click "Lagre" button to save the workplace
   */
  async klikkLagre(): Promise<void> {
    await this.lagreButton.click();
    console.log('✅ Saved arbeidssted');
  }

  /**
   * Add a new arbeidssted (workplace)
   * Convenience method that opens form, fills name, and saves
   *
   * @param navn - Name of workplace (e.g., 'Test', 'Oslo Office')
   */
  async leggTilArbeidssted(navn: string): Promise<void> {
    await this.klikkLeggTilArbeidssted();
    await this.fyllInnNavnPåArbeidssted(navn);
    await this.klikkLagre();
  }

  /**
   * Click "Bekreft og fortsett" button if visible
   * This may appear when there are validation warnings (e.g., family members)
   */
  async klikkBekreftOgFortsettHvisVises(): Promise<void> {
    const bekreftButton = this.page.getByRole('button', { name: 'Bekreft og fortsett' });
    const isVisible = await bekreftButton.isVisible().catch(() => false);

    if (isVisible) {
      await bekreftButton.click();
      console.log('✅ Clicked "Bekreft og fortsett" to acknowledge warnings');
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Click "Fatt vedtak" button to submit the decision
   * For Trygdeavtale, this directly submits without a separate vedtak page
   */
  async fattVedtak(): Promise<void> {
    await this.fattVedtakButton.click();
    console.log('✅ Submitted vedtak');
  }

  /**
   * Complete arbeidssted workflow and submit vedtak
   * Convenience method for standard workflow
   *
   * @param arbeidsstedNavn - Workplace name (default: 'Test')
   */
  async fyllUtArbeidsstedOgFattVedtak(arbeidsstedNavn: string = 'Test'): Promise<void> {
    await this.åpneArbeidsstedSeksjon();
    await this.leggTilArbeidssted(arbeidsstedNavn);

    // Handle potential "Bekreft og fortsett" button for warnings
    await this.klikkBekreftOgFortsettHvisVises();

    await this.fattVedtak();
  }
}
