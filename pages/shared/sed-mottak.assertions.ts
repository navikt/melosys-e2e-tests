import { APIRequestContext, expect } from '@playwright/test';
import { withDatabase } from '../../helpers/db-helper';
import { fetchStoredJournalposter, JournalpostInfo } from '../../helpers/mock-helper';

/**
 * Gjenbrukbare verifikasjoner for SED-mottaks-kjeden (MOTTAK_SED) — det største
 * enkelt-prosesstypet i produksjon (~37 % av alt prosessarbeid).
 *
 * Tidligere stoppet sed-mottak-testene på «fagsak/oppgave finnes». Disse to
 * funksjonene løfter dem til å bevise at den innkommende SED-en faktisk
 *  (P2) RUTES til riktig utfall — en behandling med riktig BEH_TEMA + at rutingens
 *       oppfølgingsprosess er FERDIG og ingen prosessinstans har FEILET — og
 *  (P3) JOURNALFØRES — at det ble opprettet en INNGAAENDE EESSI-journalpost i SAF.
 *
 * En feilruting (feil tema, feil/uteblitt oppfølgingsprosess, FEILET prosess) eller
 * manglende journalpost får testen til å feile.
 */

export interface SedRutingForventning {
  /**
   * Forventet BEHANDLING.BEH_TEMA som SED-en skal rutes til (rutingsutfallet).
   * Live-verifisert 2026-06-15:
   *  - A003, lovvalgsland ≠ NO → BESLUTNING_LOVVALG_ANNET_LAND
   *  - A003, lovvalgsland = NO → BESLUTNING_LOVVALG_NORGE
   *  - A009                    → REGISTRERING_UNNTAK_NORSK_TRYGD_UTSTASJONERING
   *  - A001                    → ANMODNING_OM_UNNTAK_HOVEDREGEL
   */
  forventetTema: string;
  /**
   * En PROSESS_TYPE som rutingen MÅ ha opprettet og fullført for behandlingen
   * (f.eks. ARBEID_FLERE_LAND_NY_SAK for A003, REGISTRERING_UNNTAK_NY_SAK for A009,
   * ANMODNING_OM_UNNTAK_MOTTAK_NY_SAK for A001) — selve beviset på at SED-en ble
   * rutet videre og ikke bare mottatt.
   */
  rutingProsess: string;
  /** Forventet BEHANDLING.BEH_TYPE (default FØRSTEGANG). */
  forventetBehType?: string;
}

export interface SedRutingResultat {
  behandlingId: number;
  saksnummer: string;
}

/**
 * P2 — verifiser at en innkommende SED ble RUTET til riktig utfall i melosys-api.
 *
 * Asserterer (alt biter):
 *  - det ble opprettet nøyaktig forventet behandling med riktig BEH_TEMA + BEH_TYPE
 *  - MOTTAK_SED-prosessen er FERDIG (selve mottaket fullført)
 *  - rutingens oppfølgingsprosess (`rutingProsess`) er FERDIG for behandlingen
 *  - INGEN prosessinstans er FEILET
 *
 * Databasen renses før hver test (cleanup-fixture), så nyeste behandling (høyest ID)
 * = denne testens behandling — samme konvensjon som de øvrige POM-ene.
 *
 * Kolonner live-verifisert 2026-06-15:
 *  - BEHANDLING(ID, STATUS, BEH_TYPE, BEH_TEMA, SAKSNUMMER)
 *  - PROSESSINSTANS(PROSESS_TYPE, STATUS, BEHANDLING_ID)  [MOTTAK_SED har BEHANDLING_ID = null]
 *
 * @returns behandlingId + saksnummer for den rutede behandlingen (brukes til journalpost-oppslag)
 */
export async function verifiserSedRutetTilTema(
  forventet: SedRutingForventning
): Promise<SedRutingResultat> {
  return await withDatabase(async (db) => {
    const beh = await db.queryOne<{ ID: number; BEH_TYPE: string; BEH_TEMA: string; SAKSNUMMER: string }>(
      `SELECT ID, BEH_TYPE, BEH_TEMA, SAKSNUMMER FROM BEHANDLING ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY`
    );
    expect(beh, 'Forventet en behandling opprettet av SED-mottaket').not.toBeNull();
    expect(beh!.BEH_TEMA, `SED skal rutes til tema ${forventet.forventetTema}`).toBe(forventet.forventetTema);
    expect(
      beh!.BEH_TYPE,
      `Behandlingstype skal være ${forventet.forventetBehType ?? 'FØRSTEGANG'}`
    ).toBe(forventet.forventetBehType ?? 'FØRSTEGANG');
    console.log(`✅ Behandling ${beh!.ID} (${beh!.SAKSNUMMER}) rutet til tema ${beh!.BEH_TEMA}`);

    // === Ingen feilede prosessinstanser ===
    const feilede = await db.query<{ PROSESS_TYPE: string }>(
      `SELECT prosess_type FROM prosessinstans WHERE status = 'FEILET'`
    );
    expect(feilede, `Forventet ingen feilede prosessinstanser, fant: ${JSON.stringify(feilede)}`).toHaveLength(0);

    // === MOTTAK_SED selv er FERDIG (knyttes ikke til behandling — BEHANDLING_ID = null) ===
    const mottak = await db.queryOne<{ STATUS: string }>(
      `SELECT status FROM prosessinstans WHERE prosess_type = 'MOTTAK_SED'
       ORDER BY registrert_dato DESC FETCH FIRST 1 ROWS ONLY`
    );
    expect(mottak, 'Forventet en MOTTAK_SED-prosessinstans').not.toBeNull();
    expect(mottak!.STATUS, 'MOTTAK_SED skal være FERDIG').toBe('FERDIG');

    // === Rutingens oppfølgingsprosess er FERDIG for behandlingen ===
    const ruting = await db.queryOne<{ STATUS: string }>(
      `SELECT status FROM prosessinstans WHERE prosess_type = :pt AND behandling_id = :id
       ORDER BY registrert_dato DESC FETCH FIRST 1 ROWS ONLY`,
      { pt: forventet.rutingProsess, id: beh!.ID }
    );
    expect(
      ruting,
      `Forventet en ${forventet.rutingProsess}-prosessinstans for behandling ${beh!.ID} (rutingsutfallet)`
    ).not.toBeNull();
    expect(ruting!.STATUS, `${forventet.rutingProsess} skal være FERDIG`).toBe('FERDIG');
    console.log(`✅ MOTTAK_SED + ${forventet.rutingProsess} FERDIG, ingen feilede prosessinstanser`);

    return { behandlingId: beh!.ID, saksnummer: beh!.SAKSNUMMER };
  });
}

/**
 * P3 — verifiser journalførings-bivirkningen: at SED-mottaket faktisk produserte en
 * INNGAAENDE EESSI-journalpost i SAF-mocken, knyttet til sakens saksnummer.
 *
 * Dekker MOTTAK_SED_JOURNALFØRING / SED_MOTTAK_FERDIGSTILL_JOURNALPOST-bivirkningen
 * (~15 % av prod-volumet) — at journalføringen er REELL, ikke antatt. Asserterer
 * journalposttype (INNGAAENDE), kanal (EESSI), journalstatus (J), sakId-tilknytning
 * og at tittelen gjenspeiler SED-typen.
 *
 * Journalposten opprettes som del av mottaket, men finnes via kort poll for å
 * unngå sjeldne race-er. Live-verifisert 2026-06-15 (tittel «A003 - Mottatt fra SE»).
 *
 * @param request    - Playwright APIRequestContext
 * @param forventet.saksnummer - behandlingens saksnummer (fra verifiserSedRutetTilTema)
 * @param forventet.sedType    - SED-typen som skal gjenspeiles i tittelen (f.eks. 'A003')
 */
export async function verifiserInngaaendeSedJournalfoert(
  request: APIRequestContext,
  forventet: { saksnummer: string; sedType: string; timeoutMs?: number }
): Promise<JournalpostInfo> {
  const timeoutMs = forventet.timeoutMs ?? 15000;
  const deadline = Date.now() + timeoutMs;

  let inngaaende: JournalpostInfo | undefined;
  while (Date.now() < deadline) {
    const jps = await fetchStoredJournalposter(request);
    inngaaende = jps.find(
      (jp) =>
        jp.journalposttype === 'INNGAAENDE' &&
        jp.kanal === 'EESSI' &&
        jp.sakId === forventet.saksnummer
    );
    if (inngaaende) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  expect(
    inngaaende,
    `Forventet en INNGAAENDE EESSI-journalpost for sak ${forventet.saksnummer}`
  ).toBeTruthy();
  expect(inngaaende!.journalStatus, 'Journalposten skal være journalført (status J)').toBe('J');
  expect(
    inngaaende!.tittel,
    `Journalpost-tittelen skal gjenspeile SED-typen ${forventet.sedType}`
  ).toContain(forventet.sedType);
  console.log(
    `✅ INNGAAENDE EESSI-journalpost ${inngaaende!.journalpostId} for ${forventet.saksnummer}: "${inngaaende!.tittel}"`
  );
  return inngaaende!;
}
