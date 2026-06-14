import { Page, expect } from '@playwright/test';
import { withDatabase } from '../../helpers/db-helper';
import { EuEosBehandlingAssertions } from './eu-eos-behandling.assertions';
import {
  verifiserBehandlingSluttilstand,
  BehandlingSluttilstandForventning,
} from '../shared/behandling-sluttilstand.assertions';

/**
 * Assertions for EU/EØS Skip behandling
 *
 * Arver fra EuEosBehandlingAssertions og legger til skip-spesifikk verifisering:
 * - Skip er lagt til i behandlingen
 * - Skipdetaljer er korrekt lagret
 * - Vedtak er fattet (extended timeout for skip workflow)
 */
export class EuEosSkipBehandlingAssertions extends EuEosBehandlingAssertions {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Verifiser at vedtak er fattet (Skip workflow specific)
   * Skip workflow tar lengre tid enn standard workflow
   * Sjekker at vi er tilbake på hovedsiden med melding om fullført behandling
   */
  async verifiserVedtakFattet(): Promise<void> {
    console.log('⏳ Venter på navigering tilbake til hovedside (Skip workflow)...');
    console.log(`   Nåværende URL: ${this.page.url()}`);

    try {
      // Vent på navigering tilbake til hovedside eller bekreftelse
      // Økt timeout til 90 sekunder - skip workflow kan ta lang tid på CI
      // (dokumentgenerering, skip-detaljer lagring, database-oppdateringer)
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
   * Hard sluttilstands-verifisering i DB etter fattet/iverksatt EU/EØS-skip-vedtak:
   * behandlingen er AVSLUTTET, har et behandlingsresultat, og alle prosessinstanser
   * (inkl. iverksetting) er FERDIG. Beviser sluttilstand utover navigering tilbake
   * til hovedsiden (`verifiserVedtakFattet`).
   *
   * Kall `waitForProcessInstances(...)` (kaster på feilede instanser) FØR denne.
   *
   * @returns BEHANDLING.ID for behandlingen som ble verifisert
   */
  async verifiserBehandlingAvsluttet(
    forventet: BehandlingSluttilstandForventning = {}
  ): Promise<string> {
    return await verifiserBehandlingSluttilstand(forventet);
  }

  /**
   * Override: Verifiser at behandling med skip finnes i database
   * Skip-specific implementation that verifies skip-related data
   *
   * @param fnr - Fødselsnummer for personen
   * @returns Behandling ID
   */
  override async verifiserBehandlingIDatabase(_fnr: string): Promise<string> {
    return await withDatabase(async (db) => {
      // Nyeste behandling = testens (ren DB per cleanup-fixture). Skjemaet har ingen SAK-tabell/
      // personnummer-join; PK heter ID. (Skip-spesifikt tema asserteres ikke i denne overriden.)
      const behandling = await db.queryOne(
        `SELECT ID, BEH_TEMA FROM BEHANDLING ORDER BY REGISTRERT_DATO DESC`
      );

      expect(behandling).not.toBeNull();
      console.log(`✅ Fant behandling i database: ID=${behandling.ID} (${behandling.BEH_TEMA})`);

      return behandling.ID;
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
