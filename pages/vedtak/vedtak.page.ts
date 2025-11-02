import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { VedtakAssertions } from './vedtak.assertions';

/**
 * Page Object for Vedtak (Decision) page
 *
 * Responsibilities:
 * - Fill text editors (Quill) with decision text
 * - Submit decision (Fatt vedtak)
 *
 * Related pages:
 * - TrygdeavgiftPage (navigates from)
 * - Complete workflow (final step)
 *
 * IMPORTANT: This page uses Quill rich text editors (.ql-editor).
 * Use the provided methods to fill these editors correctly.
 *
 * @example
 * const vedtak = new VedtakPage(page);
 * await vedtak.fyllInnFritekst('Dette er friteksten');
 * await vedtak.fyllInnBegrunnelse('Dette er begrunnelsen');
 * await vedtak.fyllInnTrygdeavgiftBegrunnelse('Trygdeavgift begrunnelse');
 * await vedtak.klikkFattVedtak();
 */
export class VedtakPage extends BasePage {
  readonly assertions: VedtakAssertions;

  // Locators for Quill editors
  private readonly quillEditors = this.page.locator('.ql-editor');

  private readonly fattVedtakButton = this.page.getByRole('button', {
    name: 'Fatt vedtak'
  });

  constructor(page: Page) {
    super(page);
    this.assertions = new VedtakAssertions(page);
  }

  /**
   * Fill the first text editor (Fritekst)
   *
   * @param tekst - Free text content
   */
  async fyllInnFritekst(tekst: string): Promise<void> {
    const editor = this.quillEditors.first();
    await editor.click();
    await editor.fill(tekst);
  }

  /**
   * Fill the second text editor (Begrunnelse)
   * This editor appears after clicking away from the first one
   *
   * @param begrunnelse - Reasoning text
   */
  async fyllInnBegrunnelse(begrunnelse: string): Promise<void> {
    // Click paragraph to reveal next editor
    await this.page.getByRole('paragraph').filter({ hasText: /^$/ }).first().click();

    // Wait for and fill the blank editor
    const blankEditor = this.page.locator('.ql-editor.ql-blank').first();
    await blankEditor.fill(begrunnelse);
  }

  /**
   * Fill the third text editor (Trygdeavgift begrunnelse)
   *
   * @param trygdeavgiftBegrunnelse - Tax reasoning text
   */
  async fyllInnTrygdeavgiftBegrunnelse(trygdeavgiftBegrunnelse: string): Promise<void> {
    // Click to reveal next editor
    const blankEditor = this.page.locator('.ql-editor.ql-blank');
    await blankEditor.click();
    await blankEditor.fill(trygdeavgiftBegrunnelse);
  }

  /**
   * Fill all three text editors with default values
   * Convenience method for standard workflow
   *
   * @param fritekst - Free text (default: 'fritekst')
   * @param begrunnelse - Reasoning (default: 'begrunnelse')
   * @param trygdeavgiftBegrunnelse - Tax reasoning (default: 'trygdeavgift')
   */
  async fyllInnAlleTekstfelt(
    fritekst: string = 'fritekst',
    begrunnelse: string = 'begrunnelse',
    trygdeavgiftBegrunnelse: string = 'trygdeavgift'
  ): Promise<void> {
    await this.fyllInnFritekst(fritekst);
    await this.fyllInnBegrunnelse(begrunnelse);
    await this.fyllInnTrygdeavgiftBegrunnelse(trygdeavgiftBegrunnelse);
  }

  /**
   * Click "Fatt vedtak" button to submit the decision
   * This completes the workflow
   */
  async klikkFattVedtak(): Promise<void> {
    await this.fattVedtakButton.click();
    console.log('✅ Workflow completed - Vedtak submitted');
  }

  /**
   * Complete entire Vedtak section with standard values
   * Convenience method for standard workflow
   */
  async fattVedtak(
    fritekst: string = 'fritekst',
    begrunnelse: string = 'begrunnelse',
    trygdeavgiftBegrunnelse: string = 'trygdeavgift'
  ): Promise<void> {
    await this.fyllInnAlleTekstfelt(fritekst, begrunnelse, trygdeavgiftBegrunnelse);
    await this.klikkFattVedtak();
  }
}
