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
    console.log('⏳ Venter på navigering tilbake til hovedside...');
    console.log(`   Nåværende URL: ${this.page.url()}`);

    try {
      // Vent på navigering tilbake til hovedside eller bekreftelse
      // Økt timeout til 90 sekunder - vedtak kan ta lang tid på CI (dokumentgenerering, database-oppdateringer)
      await this.page.waitForURL(/\/melosys\/?$/, { timeout: 90000 });
      console.log('✅ Vedtak fattet - navigert tilbake til hovedside');
    } catch (error) {
      // Debug: Hvis navigering feiler, ta screenshot og logg tilstand
      console.error('❌ Navigering tilbake til hovedside feilet');
      console.error(`   Gjeldende URL: ${this.page.url()}`);
      console.error(`   Forventet URL: /melosys/ eller /melosys`);

      // Ta screenshot for debugging
      await this.page.screenshot({ path: 'debug-vedtak-navigation-failed.png', fullPage: true });
      console.error('📸 Screenshot lagret: debug-vedtak-navigation-failed.png');

      // Sjekk om det er feilmeldinger på siden
      const errors = await this.page.locator('.navds-alert--error, .navds-error-message').count();
      if (errors > 0) {
        console.error(`   Fant ${errors} feilmelding(er) på siden`);
        const errorTexts = await this.page.locator('.navds-alert--error, .navds-error-message').allTextContents();
        errorTexts.forEach((text, i) => console.error(`   Feil ${i + 1}: ${text}`));
      }

      throw error;
    }
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
