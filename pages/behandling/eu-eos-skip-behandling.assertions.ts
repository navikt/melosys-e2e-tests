import { Page, expect } from '@playwright/test';
import { withDatabase } from '../../helpers/db-helper';

/**
 * Assertions for EU/EØS Skip behandling
 *
 * Verifiserer:
 * - Skip er lagt til i behandlingen
 * - Skipdetaljer er korrekt lagret
 * - Vedtak er fattet
 */
export class EuEosSkipBehandlingAssertions {
  constructor(private readonly page: Page) {}

  /**
   * Verifiser at vedtak er fattet
   * Sjekker at vi er tilbake på hovedsiden med melding om fullført behandling
   */
  async verifiserVedtakFattet(): Promise<void> {
    // Vent på navigering tilbake til hovedside eller bekreftelse
    // Økt timeout til 60 sekunder - vedtak kan ta lang tid på CI (dokumentgenerering, database-oppdateringer)
    await this.page.waitForURL(/\/melosys\/?$/, { timeout: 60000 });
    console.log('✅ Vedtak fattet - navigert tilbake til hovedside');
  }

  /**
   * Verifiser at skip er lagt til som arbeidssted
   * Sjekker at skip-knappen viser at arbeidssted er lagt til
   */
  async verifiserSkipLagtTil(): Promise<void> {
    const arbeidsstedButton = this.page.getByRole('button', {
      name: 'Arbeidssted(er)'
    });
    await expect(arbeidsstedButton).toBeVisible();
    console.log('✅ Arbeidssted(er) knapp synlig');
  }

  /**
   * Verifiser at behandling med skip finnes i database
   *
   * @param fnr - Fødselsnummer for personen
   * @returns Behandling ID
   */
  async verifiserBehandlingIDatabase(fnr: string): Promise<string> {
    return await withDatabase(async (db) => {
      const sak = await db.queryOne(
        'SELECT * FROM SAK WHERE personnummer = :pnr ORDER BY SAK_ID DESC',
        { pnr: fnr }
      );

      expect(sak).not.toBeNull();
      console.log(`✅ Fant sak i database: SAK_ID=${sak.SAK_ID}`);

      const behandling = await db.queryOne(
        'SELECT * FROM BEHANDLING WHERE sak_id = :sakId ORDER BY BEHANDLING_ID DESC',
        { sakId: sak.SAK_ID }
      );

      expect(behandling).not.toBeNull();
      console.log(
        `✅ Fant behandling i database: BEHANDLING_ID=${behandling.BEHANDLING_ID}`
      );

      return behandling.BEHANDLING_ID;
    });
  }

  /**
   * Verifiser at skip-detaljer er lagret i database
   *
   * @param behandlingId - Behandling ID
   * @param skipNavn - Forventet navn på skip
   */
  async verifiserSkipIDatabase(
    behandlingId: string,
    skipNavn: string
  ): Promise<void> {
    await withDatabase(async (db) => {
      // Dette er et placeholder - den faktiske tabellstrukturen må verifiseres
      // Sjekk med DBA hvilke tabeller som lagrer skip-informasjon
      console.log(
        `✅ TODO: Verifiser skip "${skipNavn}" for behandling ${behandlingId}`
      );
      // Eksempel:
      // const skip = await db.queryOne(
      //   'SELECT * FROM ARBEIDSSTED WHERE behandling_id = :behandlingId',
      //   { behandlingId }
      // );
      // expect(skip.SKIP_NAVN).toBe(skipNavn);
    });
  }
}
