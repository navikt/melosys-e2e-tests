import { Page, expect } from '@playwright/test';

/**
 * Assertions for journalføring page
 */
export class JournalforingAssertions {
  constructor(private readonly page: Page) {}

  /**
   * Verify journalføring page is loaded
   */
  async verifiserSideLaster(): Promise<void> {
    // Check for any journalføring-related content
    const journalforingContent = this.page.locator('[class*="journalforing"], form, [data-testid*="journalforing"]');
    await expect(journalforingContent.first()).toBeVisible({ timeout: 10000 });
  }

  /**
   * Verify document preview is visible
   */
  async verifiserDokumentVises(): Promise<void> {
    const dokument = this.page.locator('[class*="dokument"], [class*="pdf"], iframe');
    await expect(dokument.first()).toBeVisible({ timeout: 10000 });
  }

  /**
   * Verify form is ready for input
   */
  async verifiserSkjemaKlart(): Promise<void> {
    // At least one radio button or form element should be visible
    const formElement = this.page.locator('input[type="radio"], select, button[type="submit"]');
    await expect(formElement.first()).toBeVisible({ timeout: 10000 });
  }

  /**
   * Verify success after journalføring
   */
  async verifiserJournalføringVellykket(): Promise<void> {
    // After successful journalføring, we should navigate away from the form
    // or see a success message
    await Promise.race([
      // Option 1: Navigated to case/behandling page
      expect(this.page).toHaveURL(/saksbehandling|behandling|fagsak/i, { timeout: 15000 }),
      // Option 2: Success message
      expect(this.page.getByText(/Journalført|Lagret|Opprettet/i)).toBeVisible({ timeout: 15000 }),
    ]).catch(() => {
      // If neither, check we're not still on journalføring page with error
      const url = this.page.url();
      if (url.includes('journalforing')) {
        throw new Error('Still on journalføring page - may have failed');
      }
    });
  }

  /**
   * Verify case was created
   */
  async verifiserSakOpprettet(): Promise<void> {
    // Check for case creation success indicators
    const successIndicator = this.page.getByText(/Sak opprettet|Behandling opprettet/i);
    const caseUrl = /saksbehandling\/\d+|fagsak\/\d+/;

    await Promise.race([
      expect(successIndicator).toBeVisible({ timeout: 10000 }),
      expect(this.page).toHaveURL(caseUrl, { timeout: 10000 }),
    ]);
  }

  /**
   * Verify we're on journalføring page with correct IDs
   */
  async verifiserPåJournalforingSide(journalpostID: string, oppgaveID: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`journalforing/${journalpostID}/${oppgaveID}`), { timeout: 5000 });
  }

  /**
   * Verify error message is displayed
   */
  async verifiserFeilmelding(melding: string | RegExp): Promise<void> {
    const pattern = typeof melding === 'string' ? new RegExp(melding, 'i') : melding;
    const feilmelding = this.page.getByText(pattern);
    await expect(feilmelding).toBeVisible({ timeout: 5000 });
  }
}
