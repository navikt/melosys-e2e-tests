import { Page, expect } from '@playwright/test';
import { assertErrors } from '../../utils/assertions';
import { withDatabase } from '../../helpers/db-helper';

/**
 * Assertion methods for TrygdeavtaleBehandlingPage
 *
 * Responsibilities:
 * - Verify form fields are visible and enabled
 * - Verify no errors after form submission
 * - Verify database state after workflow completion
 *
 * @example
 * const behandling = new TrygdeavtaleBehandlingPage(page);
 * await behandling.fyllUtTrygdeavtaleBehandling();
 * await behandling.assertions.verifiserIngenFeil();
 */
export class TrygdeavtaleBehandlingAssertions {
  constructor(readonly page: Page) {}

  /**
   * Verify the period fields are visible
   */
  async verifiserPeriodeFelter(): Promise<void> {
    const fraOgMedField = this.page.getByRole('textbox', { name: 'Fra og med' });
    const tilOgMedField = this.page.getByRole('textbox', { name: 'Til og med Til og med' });

    await expect(fraOgMedField).toBeVisible();
    await expect(tilOgMedField).toBeVisible();
  }

  /**
   * Verify arbeidsland dropdown is visible
   */
  async verifiserArbeidslandDropdown(): Promise<void> {
    const arbeidslandDropdown = this.page.getByLabel('ArbeidslandArbeidsland');
    await expect(arbeidslandDropdown).toBeVisible();
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
   * Verify behandling was created and bestemmelse was selected
   * Checks database for LOVVALG_PERIODE with selected bestemmelse
   *
   * @param fnr - User's national ID
   * @param bestemmelse - Expected bestemmelse code (e.g., 'AUS_ART9_3')
   */
  async verifiserBestemmelseIDatabase(_fnr: string, bestemmelse: string): Promise<void> {
    await withDatabase(async (db) => {
      // Nyeste lovvalgsperiode (ren DB per fixture). Kolonnen heter LOVVALG_BESTEMMELSE.
      const result = await db.queryOne(
        `SELECT LOVVALG_BESTEMMELSE FROM LOVVALG_PERIODE ORDER BY ID DESC`
      );

      expect(result).not.toBeNull();
      expect(result.LOVVALG_BESTEMMELSE).toBe(bestemmelse);
      console.log(`✅ Verified bestemmelse in database: ${bestemmelse}`);
    });
  }

  /**
   * Verify arbeidsland was saved in database
   * Checks database for LOVVALG_PERIODE with selected land
   *
   * @param fnr - User's national ID
   * @param landkode - Expected country code (e.g., 'AU', 'SE')
   */
  async verifiserArbeidslandIDatabase(_fnr: string, landkode: string): Promise<void> {
    await withDatabase(async (db) => {
      // Nyeste lovvalgsperiode. Land lagres i LOVVALGSLAND (ingen egen LAND-kolonne i skjemaet).
      const result = await db.queryOne(
        `SELECT LOVVALGSLAND FROM LOVVALG_PERIODE ORDER BY ID DESC`
      );

      expect(result).not.toBeNull();
      expect(result.LOVVALGSLAND).toBe(landkode);
      console.log(`✅ Verified arbeidsland in database: ${landkode}`);
    });
  }

  /**
   * Verify period dates in database
   *
   * @param fnr - User's national ID
   * @param fraOgMed - Expected start date (DD.MM.YYYY)
   * @param tilOgMed - Expected end date (DD.MM.YYYY)
   */
  async verifiserPeriodeIDatabase(
    _fnr: string,
    fraOgMed: string,
    tilOgMed: string
  ): Promise<void> {
    await withDatabase(async (db) => {
      // Nyeste lovvalgsperiode (ren DB per fixture). Kolonnene heter FOM_DATO/TOM_DATO.
      const result = await db.queryOne(
        `SELECT TO_CHAR(FOM_DATO, 'DD.MM.YYYY') as FOM_DATO,
                TO_CHAR(TOM_DATO, 'DD.MM.YYYY') as TOM_DATO
         FROM LOVVALG_PERIODE ORDER BY ID DESC`
      );

      expect(result).not.toBeNull();
      expect(result.FOM_DATO).toBe(fraOgMed);
      expect(result.TOM_DATO).toBe(tilOgMed);
      console.log(`✅ Verified period in database: ${fraOgMed} - ${tilOgMed}`);
    });
  }

  /**
   * Complete verification: UI + Database
   * Verifies treatment workflow completed successfully
   *
   * @param fnr - User's national ID
   * @param bestemmelse - Expected bestemmelse code
   * @param landkode - Expected country code
   */
  async verifiserKomplettBehandling(
    fnr: string,
    bestemmelse: string,
    landkode: string
  ): Promise<void> {
    // Verify UI - no errors
    await this.verifiserIngenFeil();

    // Verify database
    await this.verifiserBestemmelseIDatabase(fnr, bestemmelse);
    await this.verifiserArbeidslandIDatabase(fnr, landkode);

    console.log('✅ Trygdeavtale behandling verified completely');
  }
}
