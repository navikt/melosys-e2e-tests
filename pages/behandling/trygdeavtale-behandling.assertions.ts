import { APIRequestContext, Page, expect } from '@playwright/test';
import { assertErrors } from '../../utils/assertions';
import { withDatabase } from '../../helpers/db-helper';
import { fetchMedlPeriode } from '../../helpers/mock-helper';
import {
  verifiserBehandlingSluttilstand,
  BehandlingSluttilstandForventning,
} from '../shared/behandling-sluttilstand.assertions';

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

  /**
   * Hard sluttilstands-verifisering i DB etter fattet/iverksatt trygdeavtale-vedtak:
   * behandlingen er AVSLUTTET, har et behandlingsresultat, og alle prosessinstanser
   * (inkl. IVERKSETT_VEDTAK_TRYGDEAVTALE) er FERDIG. Beviser sluttilstand utover at
   * vi navigerte tilbake til hovedsiden.
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
   * Verifiser hele DB-utfallet av et fattet nyvurderings-vedtak på en
   * trygdeavtale-sak (databasen renses før hver test, så NV-behandlingen er
   * den eneste NY_VURDERING-raden):
   *  - NV-behandlingen er AVSLUTTET og peker på opprinnelig behandling
   *  - behandlingsresultatet er FASTSATT_LOVVALGSLAND med forventet
   *    NY_VURDERING_BAKGRUNN (NB: BEHANDLINGSRESULTAT har PK=BEHANDLING_ID)
   *  - NV-en har fått en NY lovvalgsperiode-rad med forkortet TOM og SAMME
   *    medlperiode_id som førstegangsbehandlingen (perioden er ERSTATTET
   *    in-place i MEDL, ikke opprettet på nytt)
   *  - ingen feilede prosessinstanser, og iverksettingen
   *    (IVERKSETT_VEDTAK_TRYGDEAVTALE) er FERDIG
   *
   * @returns medlperiode_id for MEDL-mock-oppslag
   */
  async verifiserNyVurderingVedtakIDatabase(forventet: {
    fom: string; // DD.MM.YYYY
    tom: string; // DD.MM.YYYY (forkortet NV-dato)
    bakgrunn: string; // f.eks. 'NYE_OPPLYSNINGER'
    bestemmelse: string; // f.eks. 'AUS_ART9_3'
  }): Promise<number> {
    return await withDatabase(async (db) => {
      // NV-behandlingen: avsluttet og koblet til opprinnelig behandling
      const nvBehandlinger = await db.query<{
        ID: number;
        STATUS: string;
        OPPRINNELIG_BEHANDLING_ID: number | null;
      }>(
        `SELECT ID, STATUS, OPPRINNELIG_BEHANDLING_ID
         FROM BEHANDLING
         WHERE BEH_TYPE = 'NY_VURDERING'`
      );
      expect(nvBehandlinger, 'Forventet nøyaktig én NY_VURDERING-behandling').toHaveLength(1);
      const nv = nvBehandlinger[0];
      expect(nv.STATUS, 'NV-behandlingen skal være AVSLUTTET').toBe('AVSLUTTET');
      expect(
        nv.OPPRINNELIG_BEHANDLING_ID,
        'NV-behandlingen skal peke på opprinnelig behandling'
      ).not.toBeNull();
      console.log(
        `✅ NV-behandling ${nv.ID} AVSLUTTET (opprinnelig behandling: ${nv.OPPRINNELIG_BEHANDLING_ID})`
      );

      // Behandlingsresultatet (PK = BEHANDLING_ID)
      const resultat = await db.queryOne<{
        RESULTAT_TYPE: string;
        NY_VURDERING_BAKGRUNN: string | null;
      }>(
        `SELECT RESULTAT_TYPE, NY_VURDERING_BAKGRUNN
         FROM BEHANDLINGSRESULTAT
         WHERE BEHANDLING_ID = :id`,
        { id: nv.ID }
      );
      expect(resultat, 'Forventet behandlingsresultat for NV-behandlingen').not.toBeNull();
      expect(resultat!.RESULTAT_TYPE).toBe('FASTSATT_LOVVALGSLAND');
      expect(resultat!.NY_VURDERING_BAKGRUNN).toBe(forventet.bakgrunn);
      console.log(
        `✅ Behandlingsresultat: FASTSATT_LOVVALGSLAND (bakgrunn: ${resultat!.NY_VURDERING_BAKGRUNN})`
      );

      // NV-ens lovvalgsperiode: forkortet TOM (lovvalg_periode.BEH_RESULTAT_ID
      // refererer BEHANDLINGSRESULTAT, hvis PK er BEHANDLING_ID)
      const nvPeriode = await db.queryOne<{
        FOM: string;
        TOM: string;
        LOVVALG_BESTEMMELSE: string;
        MEDLPERIODE_ID: number | null;
      }>(
        `SELECT TO_CHAR(FOM_DATO, 'DD.MM.YYYY') AS FOM,
                TO_CHAR(TOM_DATO, 'DD.MM.YYYY') AS TOM,
                LOVVALG_BESTEMMELSE,
                MEDLPERIODE_ID
         FROM LOVVALG_PERIODE
         WHERE BEH_RESULTAT_ID = :id
         ORDER BY ID DESC
         FETCH FIRST 1 ROWS ONLY`,
        { id: nv.ID }
      );
      expect(nvPeriode, 'Forventet en lovvalgsperiode for NV-behandlingen').not.toBeNull();
      expect(nvPeriode!.FOM, 'FOM skal være uendret').toBe(forventet.fom);
      expect(nvPeriode!.TOM, 'TOM skal være forkortet av nyvurderingen').toBe(forventet.tom);
      expect(nvPeriode!.LOVVALG_BESTEMMELSE).toBe(forventet.bestemmelse);
      expect(
        nvPeriode!.MEDLPERIODE_ID,
        'NV-lovvalgsperioden skal være overført til MEDL (medlperiode_id satt)'
      ).toBeGreaterThan(0);

      // Førstegangsbehandlingens periode skal ha SAMME medlperiode_id
      // (MEDL-perioden erstattes in-place — det opprettes ikke en ny)
      const førstegangPeriode = await db.queryOne<{ MEDLPERIODE_ID: number | null }>(
        `SELECT MEDLPERIODE_ID
         FROM LOVVALG_PERIODE
         WHERE BEH_RESULTAT_ID = :id
         ORDER BY ID DESC
         FETCH FIRST 1 ROWS ONLY`,
        { id: nv.OPPRINNELIG_BEHANDLING_ID }
      );
      expect(
        førstegangPeriode,
        'Forventet en lovvalgsperiode for førstegangsbehandlingen'
      ).not.toBeNull();
      expect(
        nvPeriode!.MEDLPERIODE_ID,
        'NV-perioden skal gjenbruke førstegangsbehandlingens MEDL-periode (erstattet in-place)'
      ).toBe(førstegangPeriode!.MEDLPERIODE_ID);
      console.log(
        `✅ NV-lovvalgsperiode ${nvPeriode!.FOM} – ${nvPeriode!.TOM} (${nvPeriode!.LOVVALG_BESTEMMELSE}, medlperiode_id=${nvPeriode!.MEDLPERIODE_ID} — samme som førstegang)`
      );

      // Ingen feilede prosessinstanser (ren DB per fixture → ingen tidsfilter)
      const feilede = await db.query<{ PROSESS_TYPE: string }>(
        `SELECT PROSESS_TYPE FROM PROSESSINSTANS WHERE STATUS = 'FEILET'`
      );
      expect(
        feilede,
        `Forventet ingen feilede prosessinstanser, fant: ${JSON.stringify(feilede)}`
      ).toHaveLength(0);

      // Nyeste iverksetting av trygdeavtale-vedtak skal være FERDIG
      const iverksett = await db.queryOne<{ STATUS: string; SIST_FULLFORT_STEG: string }>(
        `SELECT STATUS, SIST_FULLFORT_STEG
         FROM PROSESSINSTANS
         WHERE PROSESS_TYPE = 'IVERKSETT_VEDTAK_TRYGDEAVTALE'
         ORDER BY REGISTRERT_DATO DESC
         FETCH FIRST 1 ROWS ONLY`
      );
      expect(
        iverksett,
        'Forventet en IVERKSETT_VEDTAK_TRYGDEAVTALE-prosessinstans etter NV-vedtak'
      ).not.toBeNull();
      expect(iverksett!.STATUS, 'NV-iverksettingen skal være FERDIG').toBe('FERDIG');
      console.log(
        `✅ IVERKSETT_VEDTAK_TRYGDEAVTALE FERDIG (sist fullført steg: ${iverksett!.SIST_FULLFORT_STEG}), ingen feilede prosessinstanser`
      );

      return nvPeriode!.MEDLPERIODE_ID as number;
    });
  }

  /**
   * Verifiser i MEDL-mocken at perioden er ERSTATTET in-place av nyvurderingen:
   * fortsatt GYLD, men med forkortet tilOgMed.
   *
   * @param request       - Playwright APIRequestContext (for MEDL-mock-oppslag)
   * @param medlPeriodeId - MEDL-periode-id (lovvalg_periode.medlperiode_id)
   * @param forventet     - Forventet tilstand (tilOgMed i ISO-format YYYY-MM-DD)
   */
  async verifiserMedlPeriodeErstattet(
    request: APIRequestContext,
    medlPeriodeId: number,
    forventet: { tilOgMed: string; grunnlag: string }
  ): Promise<void> {
    const periode = await fetchMedlPeriode(request, medlPeriodeId);
    expect(periode.status, `MEDL-periode ${medlPeriodeId} skal fortsatt være GYLD`).toBe('GYLD');
    expect(
      periode.tilOgMed,
      'MEDL-perioden skal være erstattet in-place med forkortet tilOgMed'
    ).toBe(forventet.tilOgMed);
    expect(periode.grunnlag).toBe(forventet.grunnlag);
    console.log(
      `✅ MEDL-periode ${medlPeriodeId} erstattet in-place: GYLD, tilOgMed=${periode.tilOgMed}, grunnlag=${periode.grunnlag}`
    );
  }
}
