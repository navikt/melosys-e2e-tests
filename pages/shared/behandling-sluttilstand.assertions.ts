import { expect } from '@playwright/test';
import { withDatabase } from '../../helpers/db-helper';

/**
 * Forventninger til en behandlings DB-sluttilstand etter et fattet/iverksatt vedtak.
 *
 * Alt unntatt `behandlingId` er valgfritt: utelat felt du ikke kan binde med
 * sikkerhet. Kjernen som ALLTID asserteres (og som biter) er at behandlingen er
 * AVSLUTTET, har et behandlingsresultat, og at alle prosessinstanser er FERDIG.
 */
export interface BehandlingSluttilstandForventning {
  /**
   * Query på denne BEHANDLING.ID. Utelates → nyeste behandling brukes.
   * (Cleanup-fixturen renser DB per test, så nyeste behandling ER testens —
   * for nyvurderinger er det NV-behandlingen, som er det vi vil verifisere.)
   */
  behandlingId?: string | null;
  /** Assert BEHANDLINGSRESULTAT.RESULTAT_TYPE = denne (f.eks. MEDLEM_I_FOLKETRYGDEN). */
  forventetResultatType?: string;
  /** Assert BEHANDLINGSRESULTAT.TRYGDEAVGIFT_TYPE = denne (f.eks. FORELØPIG). */
  forventetTrygdeavgiftType?: string;
  /** En PROSESS_TYPE som MÅ finnes og være FERDIG (f.eks. IVERKSETT_VEDTAK_FTRL). */
  forventetIverksettProsess?: string;
}

/**
 * Hard sluttilstands-verifisering for en fattet/iverksatt behandling.
 *
 * Beviser sluttilstand utover URL/synlighet: behandlingen er faktisk AVSLUTTET
 * i databasen, har et behandlingsresultat, og alle prosessinstanser (inkl.
 * iverksettingen) er FERDIG (ingen feilede/hengende). Dette er standarden de
 * ferske gap-testene holder — gjenbrukbart for å løfte de eldre happy-path-testene.
 *
 * Forutsetter at prosessinstansene er ferdige; kall `waitForProcessInstances(...)`
 * (som kaster på feilede instanser) FØR denne i testen.
 *
 * Kolonnenavn er live-verifisert (jf. ftrl-yrkesaktiv-2-2 + trygdeavtale-NV-assertions):
 *  - BEHANDLING(ID, STATUS, REGISTRERT_DATO)
 *  - BEHANDLINGSRESULTAT(RESULTAT_TYPE, TRYGDEAVGIFT_TYPE, BEHANDLING_ID)
 *  - PROSESSINSTANS(PROSESS_TYPE, STATUS, SIST_FULLFORT_STEG, BEHANDLING_ID)
 *
 * @returns BEHANDLING.ID for behandlingen som ble verifisert
 */
export async function verifiserBehandlingSluttilstand(
  forventet: BehandlingSluttilstandForventning = {}
): Promise<string> {
  return await withDatabase(async (db) => {
    const behandling = forventet.behandlingId
      ? await db.queryOne<{ ID: number; STATUS: string }>(
          `SELECT ID, STATUS FROM BEHANDLING WHERE ID = :id`,
          { id: forventet.behandlingId }
        )
      : await db.queryOne<{ ID: number; STATUS: string }>(
          `SELECT ID, STATUS FROM BEHANDLING ORDER BY REGISTRERT_DATO DESC FETCH FIRST 1 ROWS ONLY`
        );

    expect(behandling, 'Forventet behandling i DB').not.toBeNull();
    expect(
      behandling!.STATUS,
      'Behandling skal være AVSLUTTET etter fattet/iverksatt vedtak'
    ).toBe('AVSLUTTET');
    const id = behandling!.ID;
    console.log(`✅ Behandling ${id} AVSLUTTET`);

    const resultat = await db.queryOne<{ RESULTAT_TYPE: string; TRYGDEAVGIFT_TYPE: string | null }>(
      `SELECT RESULTAT_TYPE, TRYGDEAVGIFT_TYPE FROM BEHANDLINGSRESULTAT WHERE BEHANDLING_ID = :id`,
      { id }
    );
    expect(resultat, 'Forventet behandlingsresultat i DB').not.toBeNull();
    if (forventet.forventetResultatType) {
      expect(
        resultat!.RESULTAT_TYPE,
        `Resultat skal være ${forventet.forventetResultatType}`
      ).toBe(forventet.forventetResultatType);
    }
    if (forventet.forventetTrygdeavgiftType) {
      expect(
        resultat!.TRYGDEAVGIFT_TYPE,
        `Trygdeavgift skal være ${forventet.forventetTrygdeavgiftType}`
      ).toBe(forventet.forventetTrygdeavgiftType);
    }
    console.log(
      `✅ Behandlingsresultat: ${resultat!.RESULTAT_TYPE}${
        resultat!.TRYGDEAVGIFT_TYPE ? ` / trygdeavgift ${resultat!.TRYGDEAVGIFT_TYPE}` : ''
      }`
    );

    const prosesser = await db.query<{ PROSESS_TYPE: string; STATUS: string; SIST_FULLFORT_STEG: string }>(
      `SELECT PROSESS_TYPE, STATUS, SIST_FULLFORT_STEG FROM PROSESSINSTANS WHERE BEHANDLING_ID = :id`,
      { id }
    );
    expect(
      prosesser.length,
      'Forventet minst én prosessinstans for behandlingen'
    ).toBeGreaterThan(0);
    for (const p of prosesser) {
      expect(
        p.STATUS,
        `Prosess ${p.PROSESS_TYPE} skal være FERDIG (sist steg: ${p.SIST_FULLFORT_STEG})`
      ).toBe('FERDIG');
    }
    if (forventet.forventetIverksettProsess) {
      const iverksett = prosesser.find(p => p.PROSESS_TYPE === forventet.forventetIverksettProsess);
      expect(
        iverksett,
        `Forventet ${forventet.forventetIverksettProsess}-prosessinstans`
      ).toBeTruthy();
    }
    console.log(`✅ ${prosesser.length} prosessinstanser FERDIG`);

    return String(id);
  });
}
