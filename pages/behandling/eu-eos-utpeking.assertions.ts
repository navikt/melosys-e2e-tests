import { APIRequestContext, expect, Page } from '@playwright/test';
import { withDatabase } from '../../helpers/db-helper';
import {
  fetchMedlPeriode,
  findNewNavFormatSed,
  findNewUtgaaendeJournalpost,
  JournalpostInfo,
  RinaDocumentInfo,
} from '../../helpers/mock-helper';

/**
 * Verifikasjoner for en godkjent "Norge utpekt"-utpeking (BESLUTNING_LOVVALG_NORGE).
 *
 * Beviser ende-til-ende at Norge, etter en innkommende A003 som peker ut Norge,
 * svarer med en utgående A012 OG fastsetter et (foreløpig) norsk lovvalg med en
 * tilhørende MEDL-periode.
 *
 * @example
 * // FØR vedtak (snapshot):
 * const sedFør = await fetchStoredSedDocuments(request, 'A012');
 * const jpFør = await fetchStoredJournalposter(request);
 * // ... godkjenn utpeking + fatt vedtak ...
 * await utpeking.assertions.verifiserA012Sendt(request, sedFør, jpFør);
 * await utpeking.assertions.verifiserGodkjentUtpekingIverksatt(request);
 */
export class EuEosUtpekingAssertions {
  constructor(private readonly page: Page) {}

  /**
   * Verifiser at Norge sendte en utgående A012 (godkjenning av lovvalgsbeslutning)
   * på den eksisterende bucen, og at en utgående EESSI-journalpost ble opprettet.
   *
   * @param request   - Playwright APIRequestContext
   * @param sedFør    - Snapshot av A012-dokumenter tatt FØR vedtak
   * @param jpFør     - Snapshot av journalposter tatt FØR vedtak
   */
  async verifiserA012Sendt(
    request: APIRequestContext,
    sedFør: RinaDocumentInfo[],
    jpFør: JournalpostInfo[]
  ): Promise<void> {
    const a012 = await findNewNavFormatSed(request, 'A012', sedFør, 30000);
    expect(a012.sed, 'Utgående svar-SED skal være A012 (godkjenning av lovvalgsbeslutning)').toBe('A012');
    console.log('✅ A012 sendt (NAV-format) på eksisterende BUC');

    const journalpost = await findNewUtgaaendeJournalpost(request, jpFør, 30000);
    expect(journalpost, 'Forventet en UTGAAENDE EESSI-journalpost for A012-svaret').not.toBeNull();
    console.log(`✅ UTGAAENDE EESSI-journalpost opprettet for A012: ${journalpost!.journalpostId}`);
  }

  /**
   * Verifiser at den godkjente utpekingen ble iverksatt:
   *  - behandlingsresultat: FASTSATT_LOVVALGSLAND, utfall_utpeking GODKJENT, fastsatt av NO
   *  - lovvalgsperiode: Norge (NO), art.13(1)(a), INNVILGET, knyttet til en MEDL-periode
   *  - MEDL-periode opprettet i registeret med foreløpig norsk lovvalg
   *    (status UAVK, lovvalg FORL, lovvalgsland NOR) — speiler at vedtaket er en
   *    MIDLERTIDIG_LOVVALGSBESLUTNING
   *  - IVERKSETT_VEDTAK_EOS fullført uten feilede prosessinstanser
   *
   * @param request - Playwright APIRequestContext (for MEDL-mock-oppslag)
   */
  async verifiserGodkjentUtpekingIverksatt(request: APIRequestContext): Promise<void> {
    // Databasen renses før hver test (cleanup-fixture), så "nyeste rad" = denne testens
    // behandling. Derfor trengs ingen tidsfilter på spørringene under.
    const medlPeriodeId = await withDatabase(async (db) => {
      // === Behandlingsresultat: godkjent utpeking, norsk lovvalg fastsatt ===
      const br = await db.queryOne<{
        RESULTAT_TYPE: string; UTFALL_UTPEKING: string; FASTSATT_AV_LAND: string;
      }>(
        `SELECT resultat_type, utfall_utpeking, fastsatt_av_land FROM behandlingsresultat
         ORDER BY behandling_id DESC FETCH FIRST 1 ROWS ONLY`, {});
      expect(br, 'Forventet et behandlingsresultat').not.toBeNull();
      expect(br!.RESULTAT_TYPE, 'Resultattype skal være FASTSATT_LOVVALGSLAND').toBe('FASTSATT_LOVVALGSLAND');
      expect(br!.UTFALL_UTPEKING, 'Utfall av utpeking skal være GODKJENT').toBe('GODKJENT');
      expect(br!.FASTSATT_AV_LAND, 'Lovvalget skal være fastsatt av Norge').toBe('NO');
      console.log('✅ Behandlingsresultat: FASTSATT_LOVVALGSLAND / utpeking GODKJENT / fastsatt av NO');

      // === Lovvalgsperiode: Norge, art.13(1)(a), innvilget, knyttet til MEDL ===
      const lp = await db.queryOne<{
        LOVVALGSLAND: string; LOVVALG_BESTEMMELSE: string; INNVILGELSE_RESULTAT: string; MEDLPERIODE_ID: number;
      }>(
        `SELECT lovvalgsland, lovvalg_bestemmelse, innvilgelse_resultat, medlperiode_id
         FROM lovvalg_periode ORDER BY id DESC FETCH FIRST 1 ROWS ONLY`, {});
      expect(lp, 'Forventet en lovvalgsperiode').not.toBeNull();
      expect(lp!.LOVVALGSLAND, 'Lovvalgsperioden skal peke på Norge').toBe('NO');
      expect(lp!.LOVVALG_BESTEMMELSE, 'Lovvalgsbestemmelse skal være art.13(1)(a)').toBe('FO_883_2004_ART13_1A');
      expect(lp!.INNVILGELSE_RESULTAT, 'Lovvalgsperioden skal være INNVILGET').toBe('INNVILGET');
      expect(lp!.MEDLPERIODE_ID, 'Lovvalgsperioden skal være knyttet til en MEDL-periode').toBeTruthy();
      console.log(`✅ Lovvalgsperiode: NO / art.13(1)(a) / INNVILGET / MEDL-periode ${lp!.MEDLPERIODE_ID}`);

      // === Ingen feilede prosessinstanser + IVERKSETT_VEDTAK_EOS fullført ===
      const feilede = await db.query<{ PROSESS_TYPE: string }>(
        `SELECT prosess_type FROM prosessinstans WHERE status = 'FEILET'`, {});
      expect(feilede, `Forventet ingen feilede prosessinstanser, fant: ${JSON.stringify(feilede)}`).toHaveLength(0);

      const iverksett = await db.queryOne<{ STATUS: string }>(
        `SELECT status FROM prosessinstans WHERE prosess_type = 'IVERKSETT_VEDTAK_EOS'
         ORDER BY registrert_dato DESC FETCH FIRST 1 ROWS ONLY`, {});
      expect(iverksett, 'Forventet en IVERKSETT_VEDTAK_EOS-prosessinstans').not.toBeNull();
      expect(iverksett!.STATUS, 'IVERKSETT_VEDTAK_EOS skal være FERDIG').toBe('FERDIG');
      console.log('✅ IVERKSETT_VEDTAK_EOS FERDIG, ingen feilede prosessinstanser');

      return lp!.MEDLPERIODE_ID;
    });

    // === MEDL-periode i registeret: foreløpig norsk medlemskap opprettet ===
    const medl = await fetchMedlPeriode(request, medlPeriodeId);
    expect(medl.medlem, 'MEDL-periode skal markere personen som medlem').toBe(true);
    expect(medl.lovvalgsland, 'MEDL-periode skal ha norsk lovvalgsland (NOR)').toBe('NOR');
    // Foreløpig lovvalg (FORL) + uavklart status (UAVK) speiler at vedtaket er en
    // MIDLERTIDIG_LOVVALGSBESLUTNING — ikke et endelig (GYLD) medlemskap.
    expect(medl.lovvalg, 'MEDL-periode skal ha foreløpig lovvalg (FORL)').toBe('FORL');
    expect(medl.status, 'MEDL-periode skal være uavklart (UAVK) ved foreløpig lovvalgsbeslutning').toBe('UAVK');
    console.log(`✅ MEDL-periode ${medlPeriodeId}: medlem=true, NOR, foreløpig (FORL/UAVK)`);
  }
}
