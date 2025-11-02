import { Page, expect } from '@playwright/test';
import { assertErrors, assertWorkflowCompleted } from '../../utils/assertions';
import { withDatabase } from '../../helpers/db-helper';

/**
 * Assertion methods for OpprettNySakPage
 *
 * Responsibilities:
 * - Verify form fields are visible and enabled
 * - Verify case creation succeeded
 * - Verify database state after creation
 *
 * @example
 * const opprettSak = new OpprettNySakPage(page);
 * await opprettSak.opprettStandardSak('30056928150');
 * await opprettSak.assertions.verifiserBehandlingOpprettet();
 */
export class OpprettNySakAssertions {
  constructor(readonly page: Page) {}

  /**
   * Verify the user ID field is visible and enabled
   */
  async verifiserBrukerIDFelt(): Promise<void> {
    const brukerIDField = this.page.getByRole('textbox', {
      name: 'Brukers f.nr. eller d-nr.:',
    });
    await expect(brukerIDField).toBeVisible();
    await expect(brukerIDField).toBeEnabled();
  }

  /**
   * Verify the sakstype dropdown is visible with options
   */
  async verifiserSakstypeDropdown(): Promise<void> {
    const sakstypeDropdown = this.page.getByLabel('Sakstype');
    await expect(sakstypeDropdown).toBeVisible();

    // Verify it has options
    const optionCount = await sakstypeDropdown.locator('option').count();
    expect(optionCount).toBeGreaterThan(1); // More than just placeholder
  }

  /**
   * Verify no errors are present on the form
   */
  async verifiserIngenFeil(): Promise<void> {
    await assertErrors(this.page, []);
  }

  /**
   * Verify specific error message is present
   *
   * @param feilmelding - Expected error message text
   */
  async verifiserFeilmelding(feilmelding: string): Promise<void> {
    await assertErrors(this.page, [feilmelding]);
  }

  /**
   * Verify treatment (behandling) was created successfully
   * Checks:
   * 1. No errors on form page (if still there)
   * 2. Navigation to main page
   * 3. No errors on destination page
   */
  async verifiserBehandlingOpprettet(): Promise<void> {
    // Check for errors if still on form page
    if (this.page.url().includes('/opprettnysak')) {
      await assertErrors(this.page, []);
    }

    // Wait for navigation to main page
    await assertWorkflowCompleted(this.page, /\/melosys\/$/);
  }

  /**
   * Verify case exists in database
   *
   * @param fnr - User's national ID to search for
   * @returns The case ID (SAK_ID) if found
   */
  async verifiserSakIDatabase(fnr: string): Promise<string> {
    return await withDatabase(async (db) => {
      const result = await db.queryOne(
        'SELECT SAK_ID, PERSONNUMMER FROM SAK WHERE personnummer = :pnr ORDER BY SAK_ID DESC',
        { pnr: fnr }
      );

      expect(result).not.toBeNull();
      expect(result.PERSONNUMMER).toBe(fnr);

      return result.SAK_ID;
    });
  }

  /**
   * Verify treatment (behandling) exists in database
   *
   * @param fnr - User's national ID to search for
   * @returns The treatment ID (BEHANDLING_ID) if found
   */
  async verifiserBehandlingIDatabase(fnr: string): Promise<string> {
    return await withDatabase(async (db) => {
      const result = await db.queryOne(
        `SELECT b.BEHANDLING_ID, s.PERSONNUMMER
         FROM BEHANDLING b
         JOIN SAK s ON b.SAK_ID = s.SAK_ID
         WHERE s.personnummer = :pnr
         ORDER BY b.BEHANDLING_ID DESC`,
        { pnr: fnr }
      );

      expect(result).not.toBeNull();
      expect(result.PERSONNUMMER).toBe(fnr);

      return result.BEHANDLING_ID;
    });
  }

  /**
   * Complete verification: UI + Database
   * Verifies that case was created successfully both in UI and database
   *
   * @param fnr - User's national ID to verify
   */
  async verifiserKomplettOpprettelse(fnr: string): Promise<{
    sakId: string;
    behandlingId: string;
  }> {
    // Verify UI
    await this.verifiserBehandlingOpprettet();

    // Verify database
    const sakId = await this.verifiserSakIDatabase(fnr);
    const behandlingId = await this.verifiserBehandlingIDatabase(fnr);

    return { sakId, behandlingId };
  }
}
