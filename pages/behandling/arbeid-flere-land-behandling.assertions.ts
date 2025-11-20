import { Page, expect } from '@playwright/test';
import { assertErrors } from '../../utils/assertions';
import { withDatabase } from '../../helpers/db-helper';

/**
 * Assertion-metoder for ArbeidFlereLandBehandlingPage
 *
 * Ansvar:
 * - Verifisere at skjemafelt er synlige og aktivert
 * - Verifisere at det ikke er feil etter innsending
 * - Verifisere database-tilstand etter behandling
 *
 * @example
 * const behandling = new ArbeidFlereLandBehandlingPage(page);
 * await behandling.fyllUtArbeidFlereLandBehandling();
 * await behandling.assertions.verifiserIngenFeil();
 * await behandling.assertions.verifiserKomplettBehandling(USER_ID_VALID, 'NO');
 */
export class ArbeidFlereLandBehandlingAssertions {
  constructor(readonly page: Page) {}

  /**
   * Verifiser at det ikke er feil på skjemaet
   */
  async verifiserIngenFeil(): Promise<void> {
    await assertErrors(this.page, []);
  }

  /**
   * Verifiser at en spesifikk feilmelding vises
   *
   * @param feilmelding - Forventet feilmeldingstekst
   */
  async verifiserFeilmelding(feilmelding: string): Promise<void> {
    await assertErrors(this.page, [feilmelding]);
  }

  /**
   * Verifiser at behandling ble opprettet i databasen
   * Sjekker BEHANDLING-tabellen for brukerens personnummer
   *
   * @param fnr - Brukerens personnummer
   * @returns Behandlings-ID hvis funnet
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

      expect(result).not.toBeNull();
      expect(result.PERSONNUMMER).toBe(fnr);
      expect(result.BEHANDLINGSTEMA).toBe('ARBEID_FLERE_LAND');
      console.log(`✅ Verifisert behandling i database: ${result.BEHANDLING_ID}`);

      return result.BEHANDLING_ID;
    });
  }

  /**
   * Verifiser at lovvalgsperiode ble opprettet i databasen
   *
   * @param fnr - Brukerens personnummer
   * @param land - Forventet landkode (f.eks. 'NO' for Norge, 'EE' for Estland)
   */
  async verifiserLovvalgsperiodeIDatabase(fnr: string, land: string): Promise<void> {
    await withDatabase(async (db) => {
      const result = await db.queryOne(
        `SELECT lp.LAND, lp.LOVVALGSLAND, s.PERSONNUMMER
         FROM LOVVALG_PERIODE lp
         JOIN BEHANDLING b ON lp.BEHANDLING_ID = b.BEHANDLING_ID
         JOIN SAK s ON b.SAK_ID = s.SAK_ID
         WHERE s.personnummer = :pnr
         ORDER BY lp.LOVVALG_PERIODE_ID DESC`,
        { pnr: fnr }
      );

      expect(result).not.toBeNull();
      expect(result.LAND).toBe(land);
      console.log(`✅ Verifisert lovvalgsperiode i database: Land = ${land}`);
    });
  }

  /**
   * Verifiser periode-datoer i databasen
   *
   * @param fnr - Brukerens personnummer
   * @param fraOgMed - Forventet startdato (DD.MM.YYYY)
   * @param tilOgMed - Forventet sluttdato (DD.MM.YYYY)
   */
  async verifiserPeriodeIDatabase(
    fnr: string,
    fraOgMed: string,
    tilOgMed: string
  ): Promise<void> {
    await withDatabase(async (db) => {
      const result = await db.queryOne(
        `SELECT
           TO_CHAR(lp.FRA_OG_MED, 'DD.MM.YYYY') as FRA_OG_MED,
           TO_CHAR(lp.TIL_OG_MED, 'DD.MM.YYYY') as TIL_OG_MED,
           s.PERSONNUMMER
         FROM LOVVALG_PERIODE lp
         JOIN BEHANDLING b ON lp.BEHANDLING_ID = b.BEHANDLING_ID
         JOIN SAK s ON b.SAK_ID = s.SAK_ID
         WHERE s.personnummer = :pnr
         ORDER BY lp.LOVVALG_PERIODE_ID DESC`,
        { pnr: fnr }
      );

      expect(result).not.toBeNull();
      expect(result.FRA_OG_MED).toBe(fraOgMed);
      expect(result.TIL_OG_MED).toBe(tilOgMed);
      console.log(`✅ Verifisert periode i database: ${fraOgMed} - ${tilOgMed}`);
    });
  }

  /**
   * Verifiser at vedtak ble fattet (VEDTAK-tabellen)
   *
   * @param fnr - Brukerens personnummer
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

      expect(result).not.toBeNull();
      console.log(`✅ Verifisert vedtak i database: ${result.VEDTAK_ID}`);
    });
  }

  /**
   * Komplett verifisering: UI + Database
   * Verifiserer at behandlingen ble fullført både i UI og database
   *
   * @param fnr - Brukerens personnummer
   * @param land - Forventet landkode (f.eks. 'NO' for Norge)
   */
  async verifiserKomplettBehandling(fnr: string, land: string): Promise<void> {
    // Verifiser UI - ingen feil
    await this.verifiserIngenFeil();

    // Verifiser database
    await this.verifiserBehandlingIDatabase(fnr);
    await this.verifiserLovvalgsperiodeIDatabase(fnr, land);
    await this.verifiserVedtakIDatabase(fnr);

    console.log('✅ "Arbeid i flere land" behandling verifisert fullstendig');
  }
}
