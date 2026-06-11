import { APIRequestContext, Page, expect } from '@playwright/test';
import { DatabaseHelper, withDatabase } from '../../helpers/db-helper';
import { fetchMedlPeriode } from '../../helpers/mock-helper';

/**
 * Assertion methods for TrygdeavtaleUnntaksregistreringPage
 *
 * Verifiserer DB-utfallet av unntaksregistrering på en trygdeavtale-sak
 * (prosess REGISTRERE_UNNTAK_FRA_MEDLEMSKAP: LAGRE_LOVVALGSPERIODE_MEDL →
 * AVSLUTT_SAK_OG_BEHANDLING) + MEDL-perioden i mock-registeret.
 *
 * Databasen renses før hver test (cleanup-fixture), så testens sak/behandling
 * er de eneste radene — ingen tidsfilter trengs.
 */
export class TrygdeavtaleUnntaksregistreringAssertions {
  constructor(readonly page: Page) {}

  /**
   * Verifiser hele DB-utfallet av et GODKJENT registrert unntak:
   *  - behandlingen er AVSLUTTET, fagsaken LOVVALG_AVKLART (TRYGDEAVTALE/UNNTAK)
   *  - behandlingsresultat REGISTRERT_UNNTAK / GODKJENT / fastsatt av forventet land
   *  - prosessinstansen REGISTRERE_UNNTAK_FRA_MEDLEMSKAP er FERDIG med
   *    SIST_FULLFORT_STEG=AVSLUTT_SAK_OG_BEHANDLING, og ingen prosesser FEILET
   *  - lovvalgsperioden er INNVILGET/UNNTATT/UTEN_DEKNING med riktig
   *    bestemmelse og MEDLPERIODE_ID satt (= overført til MEDL)
   *
   * @returns medlperiode_id for MEDL-mock-oppslag
   */
  async verifiserGodkjentUnntakIDatabase(forventet: {
    fom: string; // DD.MM.YYYY
    tom: string; // DD.MM.YYYY
    land: string; // f.eks. 'AU'
    bestemmelse: string; // f.eks. 'AUS_ART9_3'
  }): Promise<number> {
    return await withDatabase(async (db) => {
      await this.verifiserBehandlingOgProsess(db);

      const fagsak = await db.queryOne<{
        STATUS: string;
        FAGSAK_TYPE: string;
        TEMA: string;
      }>(`SELECT STATUS, FAGSAK_TYPE, TEMA FROM FAGSAK`);
      expect(fagsak, 'Forventet en fagsak').not.toBeNull();
      expect(fagsak!.FAGSAK_TYPE).toBe('TRYGDEAVTALE');
      expect(fagsak!.TEMA).toBe('UNNTAK');
      expect(fagsak!.STATUS, 'Fagsaken skal være LOVVALG_AVKLART etter godkjent unntak').toBe(
        'LOVVALG_AVKLART'
      );
      console.log('✅ Fagsak: TRYGDEAVTALE/UNNTAK → LOVVALG_AVKLART');

      const resultat = await db.queryOne<{
        RESULTAT_TYPE: string;
        UTFALL_REGISTRERING_UNNTAK: string;
        FASTSATT_AV_LAND: string;
      }>(
        `SELECT RESULTAT_TYPE, UTFALL_REGISTRERING_UNNTAK, FASTSATT_AV_LAND
         FROM BEHANDLINGSRESULTAT`
      );
      expect(resultat, 'Forventet et behandlingsresultat').not.toBeNull();
      expect(resultat!.RESULTAT_TYPE).toBe('REGISTRERT_UNNTAK');
      expect(resultat!.UTFALL_REGISTRERING_UNNTAK).toBe('GODKJENT');
      expect(resultat!.FASTSATT_AV_LAND).toBe(forventet.land);
      console.log(
        `✅ Behandlingsresultat: REGISTRERT_UNNTAK/GODKJENT (fastsatt av ${resultat!.FASTSATT_AV_LAND})`
      );

      const perioder = await db.query<{
        FOM: string;
        TOM: string;
        LOVVALGSLAND: string;
        LOVVALG_BESTEMMELSE: string;
        INNVILGELSE_RESULTAT: string;
        MEDLEMSKAPSTYPE: string;
        TRYGDE_DEKNING: string;
        MEDLPERIODE_ID: number | null;
      }>(
        `SELECT TO_CHAR(FOM_DATO, 'DD.MM.YYYY') AS FOM,
                TO_CHAR(TOM_DATO, 'DD.MM.YYYY') AS TOM,
                LOVVALGSLAND, LOVVALG_BESTEMMELSE, INNVILGELSE_RESULTAT,
                MEDLEMSKAPSTYPE, TRYGDE_DEKNING, MEDLPERIODE_ID
         FROM LOVVALG_PERIODE`
      );
      expect(perioder, 'Forventet nøyaktig én lovvalgsperiode').toHaveLength(1);
      const periode = perioder[0];
      expect(periode.FOM).toBe(forventet.fom);
      expect(periode.TOM).toBe(forventet.tom);
      expect(periode.LOVVALGSLAND).toBe(forventet.land);
      expect(periode.LOVVALG_BESTEMMELSE).toBe(forventet.bestemmelse);
      expect(periode.INNVILGELSE_RESULTAT).toBe('INNVILGET');
      expect(periode.MEDLEMSKAPSTYPE, 'Registrert unntak skal gi UNNTATT medlemskap').toBe(
        'UNNTATT'
      );
      expect(periode.TRYGDE_DEKNING).toBe('UTEN_DEKNING');
      expect(
        periode.MEDLPERIODE_ID,
        'Lovvalgsperioden skal være overført til MEDL (medlperiode_id satt)'
      ).toBeGreaterThan(0);
      console.log(
        `✅ Lovvalgsperiode ${periode.FOM} – ${periode.TOM}: ${periode.LOVVALG_BESTEMMELSE}, ` +
          `UNNTATT/UTEN_DEKNING (medlperiode_id=${periode.MEDLPERIODE_ID})`
      );

      return periode.MEDLPERIODE_ID as number;
    });
  }

  /**
   * Verifiser hele DB-utfallet av et IKKE_GODKJENT unntak:
   *  - behandlingen er AVSLUTTET, fagsaken AVSLUTTET
   *  - behandlingsresultat FERDIGBEHANDLET / IKKE_GODKJENT
   *  - prosessinstansen REGISTRERE_UNNTAK_FRA_MEDLEMSKAP er FERDIG
   *  - INGEN lovvalgsperiode er opprettet (og dermed ingen MEDL-periode)
   */
  async verifiserIkkeGodkjentUnntakIDatabase(forventet: { land: string }): Promise<void> {
    await withDatabase(async (db) => {
      await this.verifiserBehandlingOgProsess(db);

      const fagsak = await db.queryOne<{ STATUS: string; FAGSAK_TYPE: string; TEMA: string }>(
        `SELECT STATUS, FAGSAK_TYPE, TEMA FROM FAGSAK`
      );
      expect(fagsak, 'Forventet en fagsak').not.toBeNull();
      expect(fagsak!.FAGSAK_TYPE).toBe('TRYGDEAVTALE');
      expect(fagsak!.TEMA).toBe('UNNTAK');
      expect(fagsak!.STATUS, 'Fagsaken skal være AVSLUTTET etter ikke-godkjent unntak').toBe(
        'AVSLUTTET'
      );
      console.log('✅ Fagsak: TRYGDEAVTALE/UNNTAK → AVSLUTTET');

      const resultat = await db.queryOne<{
        RESULTAT_TYPE: string;
        UTFALL_REGISTRERING_UNNTAK: string;
        FASTSATT_AV_LAND: string;
      }>(
        `SELECT RESULTAT_TYPE, UTFALL_REGISTRERING_UNNTAK, FASTSATT_AV_LAND
         FROM BEHANDLINGSRESULTAT`
      );
      expect(resultat, 'Forventet et behandlingsresultat').not.toBeNull();
      expect(resultat!.RESULTAT_TYPE).toBe('FERDIGBEHANDLET');
      expect(resultat!.UTFALL_REGISTRERING_UNNTAK).toBe('IKKE_GODKJENT');
      expect(resultat!.FASTSATT_AV_LAND).toBe(forventet.land);
      console.log('✅ Behandlingsresultat: FERDIGBEHANDLET/IKKE_GODKJENT');

      // Ikke godkjent → ingen lovvalgsperiode skal lagres (frontendens
      // lovvalgsperiode-POST avvises med 400 av api-et)
      const perioder = await db.query<{ ID: number }>(`SELECT ID FROM LOVVALG_PERIODE`);
      expect(
        perioder,
        'Ikke-godkjent unntak skal IKKE gi noen lovvalgsperiode'
      ).toHaveLength(0);
      console.log('✅ Ingen lovvalgsperiode opprettet (som forventet ved IKKE_GODKJENT)');
    });
  }

  /**
   * Felles vakt: nøyaktig én behandling som er AVSLUTTET, prosessen
   * REGISTRERE_UNNTAK_FRA_MEDLEMSKAP FERDIG med sist fullført steg
   * AVSLUTT_SAK_OG_BEHANDLING, og ingen feilede prosessinstanser.
   */
  private async verifiserBehandlingOgProsess(db: DatabaseHelper): Promise<void> {
    const behandlinger = await db.query<{ ID: number; STATUS: string }>(
      `SELECT ID, STATUS FROM BEHANDLING`
    );
    expect(behandlinger, 'Forventet nøyaktig én behandling').toHaveLength(1);
    expect(behandlinger[0].STATUS, 'Behandlingen skal være AVSLUTTET').toBe('AVSLUTTET');
    console.log(`✅ Behandling ${behandlinger[0].ID} AVSLUTTET`);

    const feilede = await db.query<{ PROSESS_TYPE: string }>(
      `SELECT PROSESS_TYPE FROM PROSESSINSTANS WHERE STATUS = 'FEILET'`
    );
    expect(
      feilede,
      `Forventet ingen feilede prosessinstanser, fant: ${JSON.stringify(feilede)}`
    ).toHaveLength(0);

    const prosess = await db.queryOne<{ STATUS: string; SIST_FULLFORT_STEG: string }>(
      `SELECT STATUS, SIST_FULLFORT_STEG
       FROM PROSESSINSTANS
       WHERE PROSESS_TYPE = 'REGISTRERE_UNNTAK_FRA_MEDLEMSKAP'`
    );
    expect(prosess, 'Forventet en REGISTRERE_UNNTAK_FRA_MEDLEMSKAP-prosessinstans').not.toBeNull();
    expect(prosess!.STATUS).toBe('FERDIG');
    expect(prosess!.SIST_FULLFORT_STEG).toBe('AVSLUTT_SAK_OG_BEHANDLING');
    console.log(
      '✅ REGISTRERE_UNNTAK_FRA_MEDLEMSKAP FERDIG (sist fullført steg: AVSLUTT_SAK_OG_BEHANDLING)'
    );
  }

  /**
   * Verifiser i MEDL-mocken at det godkjente unntaket er skrevet som en
   * ENDELIG, gyldig periode. NB: registrering-unntak skriver GYLD/ENDL
   * direkte — IKKE «under avklaring» (UAVK/FORL gjelder anmodnings-/
   * utpekingsflytene).
   *
   * @param request       - Playwright APIRequestContext (for MEDL-mock-oppslag)
   * @param medlPeriodeId - MEDL-periode-id (lovvalg_periode.medlperiode_id)
   * @param forventet     - Forventet tilstand (datoer i ISO-format YYYY-MM-DD)
   */
  async verifiserMedlPeriodeEndelig(
    request: APIRequestContext,
    medlPeriodeId: number,
    forventet: { lovvalgsland: string; grunnlag: string; fraOgMed: string; tilOgMed: string }
  ): Promise<void> {
    const periode = await fetchMedlPeriode(request, medlPeriodeId);
    expect(periode.status, `MEDL-periode ${medlPeriodeId} skal være GYLD`).toBe('GYLD');
    expect(periode.lovvalg, 'Registrert unntak skal gi ENDELIG lovvalgsbeslutning i MEDL').toBe(
      'ENDL'
    );
    expect(periode.lovvalgsland).toBe(forventet.lovvalgsland);
    expect(periode.grunnlag).toBe(forventet.grunnlag);
    expect(periode.fraOgMed).toBe(forventet.fraOgMed);
    expect(periode.tilOgMed).toBe(forventet.tilOgMed);
    console.log(
      `✅ MEDL-periode ${medlPeriodeId}: GYLD/ENDL, lovvalgsland=${periode.lovvalgsland}, ` +
        `grunnlag=${periode.grunnlag}, ${periode.fraOgMed} – ${periode.tilOgMed}`
    );
  }
}
