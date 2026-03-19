import { Page, expect } from '@playwright/test';
import { assertErrors } from '../../utils/assertions';
import { withDatabase } from '../../helpers/db-helper';

/**
 * Assertion methods for TrygdeavgiftPensjonistBehandlingPage
 *
 * Responsibilities:
 * - Verify page loaded correctly (step 1 fields visible)
 * - Verify no form errors
 * - Verify database state after førstegangsbehandling submission
 */
export class TrygdeavgiftPensjonistBehandlingAssertions {
  constructor(readonly page: Page) {}

  /**
   * Verify the behandling page has loaded (Step 1)
   * Checks that the Fra og med field is visible
   */
  async verifiserSideLastet(): Promise<void> {
    const fraOgMedField = this.page.getByRole('textbox', { name: 'Fra og med' });
    await expect(fraOgMedField).toBeVisible({ timeout: 15000 });
    console.log('✅ Trygdeavgift Pensjonist behandling page loaded');
  }

  /**
   * Verify Bostedsland dropdown is visible
   */
  async verifiserBostedslandDropdown(): Promise<void> {
    const dropdown = this.page.getByLabel('Bostedsland');
    await expect(dropdown).toBeVisible();
    console.log('✅ Bostedsland dropdown is visible');
  }

  /**
   * Verify no form errors are present
   */
  async verifiserIngenFeil(): Promise<void> {
    await assertErrors(this.page, []);
  }

  /**
   * Verify specific error message is shown
   *
   * @param feilmelding - Expected error message text
   */
  async verifiserFeilmelding(feilmelding: string): Promise<void> {
    await assertErrors(this.page, [feilmelding]);
  }

  /**
   * Verify that a behandling was created in the database
   *
   * @param fnr - User's fødselsnummer
   * @returns Behandlings-ID if found
   */
  async verifiserBehandlingIDatabase(fnr: string): Promise<string> {
    return await withDatabase(async (db) => {
      const result = await db.queryOne(
        `SELECT b.BEHANDLING_ID, s.PERSONNUMMER, b.BEHANDLINGSTEMA
         FROM BEHANDLING b
         JOIN SAK s ON b.SAK_ID = s.SAK_ID
         WHERE s.personnummer = :pnr
         ORDER BY b.BEHANDLING_ID DESC`,
        { pnr: fnr }
      );

      expect(result, 'Fant ingen behandling i databasen').not.toBeNull();
      expect(result.PERSONNUMMER).toBe(fnr);
      console.log(`✅ Verifisert behandling i database: ${result.BEHANDLING_ID} (tema: ${result.BEHANDLINGSTEMA})`);

      return result.BEHANDLING_ID;
    });
  }

  /**
   * Verify vedtak was created in the database
   *
   * @param fnr - User's fødselsnummer
   */
  async verifiserVedtakIDatabase(fnr: string): Promise<void> {
    await withDatabase(async (db) => {
      const result = await db.queryOne(
        `SELECT v.VEDTAK_ID, v.VEDTAK_TYPE, s.PERSONNUMMER
         FROM VEDTAK v
         JOIN BEHANDLING b ON v.BEHANDLING_ID = b.BEHANDLING_ID
         JOIN SAK s ON b.SAK_ID = s.SAK_ID
         WHERE s.personnummer = :pnr
         ORDER BY v.VEDTAK_ID DESC`,
        { pnr: fnr }
      );

      expect(result, 'Fant ingen vedtak i databasen').not.toBeNull();
      console.log(`✅ Verifisert vedtak i database: ${result.VEDTAK_ID} (type: ${result.VEDTAK_TYPE})`);
    });
  }
}
