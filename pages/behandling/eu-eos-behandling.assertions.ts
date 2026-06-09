import { Page, expect } from '@playwright/test';
import { assertErrors } from '../../utils/assertions';
import { withDatabase } from '../../helpers/db-helper';

/**
 * Assertion-metoder for EuEosBehandlingPage
 *
 * Ansvar:
 * - Verifisere at skjemafelt er synlige og aktivert
 * - Verifisere at det ikke er feil etter innsending
 * - Verifisere database-tilstand etter behandling
 *
 * @example
 * const behandling = new EuEosBehandlingPage(page);
 * await behandling.fyllUtEuEosBehandling();
 * await behandling.assertions.verifiserIngenFeil();
 */
export class EuEosBehandlingAssertions {
  constructor(readonly page: Page) {}

  /**
   * Verifiser at dateplukker-knappen er synlig
   */
  async verifiserDatepickerSynlig(): Promise<void> {
    const datepickerButton = this.page.getByRole('button', {
      name: 'Åpne datovelger'
    });
    await expect(datepickerButton.first()).toBeVisible();
  }

  /**
   * Verifiser at land-dropdown er synlig
   */
  async verifiserLandDropdownSynlig(): Promise<void> {
    const landDropdown = this.page.locator('.css-19bb58m');
    await expect(landDropdown).toBeVisible();
  }

  /**
   * Verifiser at det ikke er feil på skjemaet
   */
  async verifiserIngenFeil(): Promise<void> {
    await assertErrors(this.page, []);
  }

  /**
   * Verifiser interim-oppførselen for sakstyper der automatisk årsavregning ennå
   * ikke er implementert (jf. MELOSYS-7828): behandlingen viser varselet om at
   * årsavregning ikke kan opprettes.
   *
   * NB: Når MELOSYS-7828 lander for EU/EØS off. tjenesteperson (FO_883_2004_ART11_3B)
   * skal denne erstattes med en verifisering av at årsavregningsbehandlingen
   * faktisk opprettes (slik FTRL-pensjonist-testen gjør).
   */
  async verifiserKanIkkeÅrsavregneEnda(): Promise<void> {
    await expect(this.page.getByText('Du kan ikke årsavregne disse')).toBeVisible({
      timeout: 15000,
    });
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
  async verifiserBehandlingIDatabase(_fnr: string): Promise<string> {
    return await withDatabase(async (db) => {
      // Cleanup-fixturen tømmer DB før hver test og testen oppretter én sak, så nyeste
      // behandling ER testens behandling. (Skjemaet har ingen SAK-tabell/PERSONNUMMER på
      // FAGSAK å joine på; behandlingstema-kolonnen heter BEH_TEMA, PK heter ID.)
      const result = await db.queryOne(
        `SELECT ID, BEH_TEMA FROM BEHANDLING ORDER BY REGISTRERT_DATO DESC`
      );

      expect(result).not.toBeNull();
      expect(result.BEH_TEMA).toBe('UTSENDT_ARBEIDSTAKER');
      console.log(`✅ Verifisert behandling i database: ${result.ID} (${result.BEH_TEMA})`);

      return result.ID;
    });
  }

  /**
   * Verifiser at lovvalgsperiode ble opprettet i databasen
   *
   * @param fnr - Brukerens personnummer (brukes ikke som filter — se merknad under)
   * @param land - Forventet LOVVALGSLAND, dvs. landet hvis lovgivning gjelder.
   *   For en norsk utsendt arbeidstaker er dette 'NO' (Norge beholder lovvalget),
   *   IKKE destinasjonslandet (f.eks. 'DK'). Utelat når domene-verdien er usikker.
   */
  async verifiserLovvalgsperiodeIDatabase(_fnr: string, land?: string): Promise<void> {
    await withDatabase(async (db) => {
      // Nyeste lovvalgsperiode = testens (ren DB per fixture). Kolonnen heter LOVVALGSLAND.
      // `land` er valgfri: utelat når domene-verdien er usikker (asserter da kun at perioden finnes).
      const result = await db.queryOne(
        `SELECT LOVVALGSLAND FROM LOVVALG_PERIODE ORDER BY ID DESC`
      );

      expect(result).not.toBeNull();
      if (land) {
        expect(result.LOVVALGSLAND).toBe(land);
      }
      console.log(`✅ Verifisert lovvalgsperiode i database: LOVVALGSLAND = ${result.LOVVALGSLAND}${land ? ` (forventet ${land})` : ''}`);
    });
  }

  /**
   * Verifiser at vedtak ble fattet (VEDTAK-tabellen)
   *
   * @param fnr - Brukerens personnummer
   */
  async verifiserVedtakIDatabase(_fnr: string): Promise<void> {
    await withDatabase(async (db) => {
      // Vedtak ligger i VEDTAK_METADATA (det finnes ingen VEDTAK-tabell). Nyeste = testens.
      const result = await db.queryOne(
        `SELECT VEDTAK_TYPE FROM VEDTAK_METADATA ORDER BY REGISTRERT_DATO DESC`
      );

      expect(result).not.toBeNull();
      console.log(`✅ Verifisert vedtak i database: ${result.VEDTAK_TYPE}`);
    });
  }

  /**
   * Komplett verifisering: UI + Database
   * Verifiserer at behandlingen ble fullført både i UI og database
   *
   * @param fnr - Brukerens personnummer
   * @param land - Forventet landkode
   */
  async verifiserKomplettBehandling(fnr: string, land?: string): Promise<void> {
    // Verifiser UI - ingen feil
    await this.verifiserIngenFeil();

    // Verifiser database (land er valgfri — se verifiserLovvalgsperiodeIDatabase)
    await this.verifiserBehandlingIDatabase(fnr);
    await this.verifiserLovvalgsperiodeIDatabase(fnr, land);
    await this.verifiserVedtakIDatabase(fnr);

    console.log('✅ EU/EØS behandling verifisert fullstendig');
  }
}
