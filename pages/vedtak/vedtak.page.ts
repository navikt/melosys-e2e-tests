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
   * Matches line 163-164 of old working test
   *
   * @param tekst - Free text content
   */
  async fyllInnFritekst(tekst: string): Promise<void> {
    const firstEditor = this.quillEditors.first();
    await firstEditor.click();
    await firstEditor.fill(tekst);

    // Verify the text was filled
    const content = await firstEditor.textContent();
    console.log(`✅ Filled fritekst field with: "${content}"`);
  }

  /**
   * Fill the second text editor (Begrunnelse)
   * Matches line 165-166 of old working test
   *
   * IMPORTANT: After clicking paragraph, the first editor loses focus and .ql-blank class.
   * The FIRST .ql-blank editor is now the second editor overall.
   *
   * @param begrunnelse - Reasoning text
   */
  async fyllInnBegrunnelse(begrunnelse: string): Promise<void> {
    // Click paragraph to blur first editor (line 165 of old test)
    await this.page.getByRole('paragraph').filter({ hasText: /^$/ }).first().click();

    // Fill FIRST blank editor with begrunnelse (line 166 of old test)
    // After the paragraph click, first editor is no longer blank,
    // so .first() now targets the second editor overall
    await this.page.locator('.ql-editor.ql-blank').first().fill(begrunnelse);
    console.log(`✅ Filled begrunnelse field`);
  }

  /**
   * Fill the third text editor (Trygdeavgift begrunnelse)
   * Matches line 167-168 of old working test
   *
   * IMPORTANT: After clicking .ql-blank, the second editor loses focus and .ql-blank class.
   * The FIRST .ql-blank editor is now the third editor overall.
   *
   * @param trygdeavgiftBegrunnelse - Tax reasoning text
   */
  async fyllInnTrygdeavgiftBegrunnelse(trygdeavgiftBegrunnelse: string): Promise<void> {
    // Click blank editor to blur second editor (line 167 of old test)
    await this.page.locator('.ql-editor.ql-blank').click();

    // Fill blank editor with trygdeavgift (line 168 of old test)
    // After the click, second editor is no longer blank,
    // so .ql-blank now targets the third editor overall
    await this.page.locator('.ql-editor.ql-blank').fill(trygdeavgiftBegrunnelse);

    // CRITICAL: Click away from the editor to blur it and trigger form validation
    // The old test immediately clicks "Fatt vedtak" which blurs the editor.
    // We need to blur it first so validation runs and enables the button.
    await this.page.keyboard.press('Tab');
    await this.page.waitForTimeout(500); // Wait for validation to complete

    console.log(`✅ Filled trygdeavgift begrunnelse field`);
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
   *
   * If the button is disabled, checks for error/warning messages
   * and throws an error with the actual validation message.
   */
  async klikkFattVedtak(): Promise<void> {
    // Wait for button to be visible
    await this.fattVedtakButton.waitFor({ state: 'visible' });

    // Check if button is disabled
    const isDisabled = await this.fattVedtakButton.isDisabled();
    if (isDisabled) {
      console.log('⚠️ Button is disabled, checking for error messages...');

      // Scroll to top to make error messages visible
      await this.page.evaluate(() => window.scrollTo(0, 0));
      await this.page.waitForTimeout(500);

      // Try multiple selectors for error messages
      const errorSelectors = [
        '.varselstripe',           // From melosys-web Feilmeldinger component
        '.feilmelding',            // Container class
        '[role="alert"]',          // Standard alert role
        '.navds-alert--error',     // Nav design system
        '.navds-alert--warning'    // Nav design system warnings
      ];

      const errorMessages: string[] = [];

      // Try each selector
      for (const selector of errorSelectors) {
        const elements = this.page.locator(selector);
        const count = await elements.count();

        if (count > 0) {
          console.log(`   Found ${count} error(s) with selector: ${selector}`);
          for (let i = 0; i < count; i++) {
            const text = await elements.nth(i).textContent();
            if (text && text.trim().length > 0) {
              let cleanText = text.trim();

              // Remove common prefixes like "Feil", "Advarsel", "Error", "Warning"
              cleanText = cleanText
                .replace(/^Feil\s*/i, '')
                .replace(/^Advarsel\s*/i, '')
                .replace(/^Error\s*/i, '')
                .replace(/^Warning\s*/i, '')
                .trim();

              if (cleanText.length > 0 && !errorMessages.includes(cleanText)) {
                errorMessages.push(cleanText);
              }
            }
          }
        }
      }

      if (errorMessages.length > 0) {
        // Debug: Print all editor contents
        const editors = await this.page.locator('.ql-editor').all();
        console.log('📝 Editor contents:');
        for (let i = 0; i < editors.length; i++) {
          const content = await editors[i].textContent();
          console.log(`   Editor ${i + 1}: "${content}"`);
        }

        // Throw error with actual validation messages
        throw new Error(
          `❌ Cannot submit vedtak - validation errors found:\n` +
          errorMessages.map((msg, idx) => `   ${idx + 1}. ${msg}`).join('\n')
        );
      }

      // If no error messages found, debug what's on the page
      console.log('🔍 Debugging: No error messages found. Checking page content...');

      // Take a screenshot at the top of the page
      await this.page.screenshot({
        path: 'debug-vedtak-error.png',
        fullPage: false
      });
      console.log('   Screenshot saved to: debug-vedtak-error.png');

      // If no error messages but button is disabled, throw generic error
      throw new Error(
        '❌ Cannot submit vedtak - button is disabled but no error messages found. ' +
        'Screenshot saved to debug-vedtak-error.png for investigation.'
      );
    }

    // Normal click
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
