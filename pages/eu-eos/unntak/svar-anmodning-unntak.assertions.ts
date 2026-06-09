import { APIRequestContext, expect, Page } from '@playwright/test';
import { withDatabase } from '../../../helpers/db-helper';
import { fetchOppgaver } from '../../../helpers/mock-helper';

/**
 * Assertions for the EU/EØS "svar på anmodning om unntak" flow (Article 16):
 * a sak has sent an A001 (anmodning om unntak) and then RECEIVES a reply SED —
 * A002 (innvilgelse / approved) or A011 (avslag / rejected) — on the SAME
 * LA_BUC_01. melosys-api routes the reply via SvarAnmodningUnntakSedRuter to the
 * ANMODNING_OM_UNNTAK_SVAR process.
 *
 * Two outcomes (BestemBehandlingsmåteSvarAnmodningUnntak):
 *  - A002 INNVILGELSE, no ytterligere info, behandling i ANMODNING_UNNTAK_SENDT
 *    → vedtak fattes automatisk (FASTSATT_LOVVALGSLAND, DELVIS_AUTOMATISERT)
 *  - A011 AVSLAG (eller A002 med ytterligere info) → behandling SVAR_ANMODNING_MOTTATT
 *    (saksbehandler må vurdere manuelt)
 *
 * Bug-klyngen testen vokter mot: MELOSYS-6836 (to oppgaver), 7124 (kan ikke sende
 * NV), 5415 (stegvelger åpnes ikke). Kjernen her er at svaret faktisk routes og
 * avanserer behandlingen uten feilede prosessinstanser, og at det opprettes
 * NØYAKTIG én behandlingsoppgave (ikke to — 6836).
 *
 * DB renses før hver test (cleanup-fixture), så nyeste/eneste rad = denne testens.
 */
export class SvarAnmodningUnntakAssertions {
  constructor(private readonly page: Page) {}

  /**
   * Verify a received A002 (innvilgelse) auto-fattet vedtak for the anmodning-sak.
   * Mirrors BestemBehandlingsmåteSvarAnmodningUnntak.vedtakFattesAutomatisk → fattVedtak.
   */
  async verifiserAutoVedtakVedInnvilgelse(request: APIRequestContext): Promise<void> {
    await withDatabase(async (db) => {
      const beh = await db.queryOne<{ ID: number; STATUS: string }>(
        `SELECT id, status FROM behandling ORDER BY id DESC FETCH FIRST 1 ROWS ONLY`, {});
      expect(beh, 'Forventet en behandling').not.toBeNull();
      expect(beh!.STATUS, 'Behandling skal være AVSLUTTET etter auto-vedtak').toBe('AVSLUTTET');

      const br = await db.queryOne<{ RESULTAT_TYPE: string; BEHANDLINGSMAATE: string }>(
        `SELECT resultat_type, behandlingsmaate FROM behandlingsresultat WHERE behandling_id = :id`, { id: beh!.ID });
      expect(br, 'Forventet et behandlingsresultat').not.toBeNull();
      expect(br!.RESULTAT_TYPE, 'Resultattype skal være FASTSATT_LOVVALGSLAND').toBe('FASTSATT_LOVVALGSLAND');
      expect(br!.BEHANDLINGSMAATE, 'Behandlingsmåte skal være DELVIS_AUTOMATISERT (auto-vedtak)').toBe('DELVIS_AUTOMATISERT');

      const fagsak = await db.queryOne<{ STATUS: string }>(
        `SELECT status FROM fagsak ORDER BY registrert_dato DESC FETCH FIRST 1 ROWS ONLY`, {});
      expect(fagsak!.STATUS, 'Fagsak skal være LOVVALG_AVKLART').toBe('LOVVALG_AVKLART');

      const lp = await db.queryOne<{ LOVVALGSLAND: string; INNVILGELSE_RESULTAT: string; MEDLPERIODE_ID: number }>(
        `SELECT lovvalgsland, innvilgelse_resultat, medlperiode_id FROM lovvalg_periode
         WHERE beh_resultat_id = :id ORDER BY id DESC FETCH FIRST 1 ROWS ONLY`, { id: beh!.ID });
      expect(lp, 'Forventet en lovvalgsperiode').not.toBeNull();
      expect(lp!.LOVVALGSLAND, 'Lovvalgsland skal være NO (Norge beholder lovvalg)').toBe('NO');
      expect(lp!.INNVILGELSE_RESULTAT, 'Lovvalgsperioden skal være INNVILGET').toBe('INNVILGET');
      expect(lp!.MEDLPERIODE_ID, 'medlperiode_id satt = MEDL-overføring').not.toBeNull();
      console.log(`✅ A002 innvilgelse: behandling ${beh!.ID} AVSLUTTET, FASTSATT_LOVVALGSLAND/DELVIS_AUTOMATISERT, lovvalg NO/INNVILGET`);
    });

    await this.verifiserSvarProsessFerdigUtenFeil();
    await this.verifiserNoyaktigEnBehandlingsoppgave(request);
  }

  /**
   * Verify a received A011 (avslag) left the behandling in SVAR_ANMODNING_MOTTATT
   * for manual ny vurdering (no auto-vedtak).
   * Mirrors BestemBehandlingsmåteSvarAnmodningUnntak else-branch.
   */
  async verifiserManuellVurderingVedAvslag(request: APIRequestContext): Promise<void> {
    await withDatabase(async (db) => {
      const beh = await db.queryOne<{ ID: number; STATUS: string }>(
        `SELECT id, status FROM behandling ORDER BY id DESC FETCH FIRST 1 ROWS ONLY`, {});
      expect(beh, 'Forventet en behandling').not.toBeNull();
      expect(beh!.STATUS, 'Behandling skal være SVAR_ANMODNING_MOTTATT (manuell vurdering)').toBe('SVAR_ANMODNING_MOTTATT');

      // Ingen vedtak fattet: resultatet står fortsatt som ANMODNING_OM_UNNTAK
      const br = await db.queryOne<{ RESULTAT_TYPE: string }>(
        `SELECT resultat_type FROM behandlingsresultat WHERE behandling_id = :id`, { id: beh!.ID });
      expect(br!.RESULTAT_TYPE, 'Ingen vedtak skal være fattet (resultat fortsatt ANMODNING_OM_UNNTAK)').toBe('ANMODNING_OM_UNNTAK');

      // Svaret er registrert som AVSLAATT lovvalgsperiode (OpprettAnmodningsperiodeSvar + lagreLovvalgsperioder)
      const lp = await db.queryOne<{ INNVILGELSE_RESULTAT: string }>(
        `SELECT innvilgelse_resultat FROM lovvalg_periode
         WHERE beh_resultat_id = :id ORDER BY id DESC FETCH FIRST 1 ROWS ONLY`, { id: beh!.ID });
      expect(lp, 'Forventet en lovvalgsperiode fra svaret').not.toBeNull();
      expect(lp!.INNVILGELSE_RESULTAT, 'Lovvalgsperioden fra avslaget skal være AVSLAATT').toBe('AVSLAATT');
      console.log(`✅ A011 avslag: behandling ${beh!.ID} SVAR_ANMODNING_MOTTATT, lovvalgsperiode AVSLAATT, ingen auto-vedtak`);
    });

    await this.verifiserSvarProsessFerdigUtenFeil();
    await this.verifiserNoyaktigEnBehandlingsoppgave(request);
  }

  /**
   * Verify the ANMODNING_OM_UNNTAK_SVAR process ran to completion and that no
   * prosessinstans feilet (the latter inherently catches the routing/lock bugs).
   */
  private async verifiserSvarProsessFerdigUtenFeil(): Promise<void> {
    await withDatabase(async (db) => {
      const svar = await db.queryOne<{ STATUS: string; SIST_FULLFORT_STEG: string }>(
        `SELECT status, sist_fullfort_steg FROM prosessinstans
         WHERE prosess_type = 'ANMODNING_OM_UNNTAK_SVAR' ORDER BY registrert_dato DESC FETCH FIRST 1 ROWS ONLY`, {});
      expect(svar, 'Forventet en ANMODNING_OM_UNNTAK_SVAR-prosessinstans (svaret ble routet)').not.toBeNull();
      expect(svar!.STATUS, 'ANMODNING_OM_UNNTAK_SVAR skal være FERDIG').toBe('FERDIG');

      const feilede = await db.query<{ PROSESS_TYPE: string; STATUS: string }>(
        `SELECT prosess_type, status FROM prosessinstans WHERE status = 'FEILET'`, {});
      expect(feilede, `Forventet ingen feilede prosessinstanser, fant: ${JSON.stringify(feilede)}`).toHaveLength(0);
      console.log(`✅ ANMODNING_OM_UNNTAK_SVAR FERDIG (steg: ${svar!.SIST_FULLFORT_STEG}), ingen feilede prosessinstanser`);
    });
  }

  /**
   * Guard against MELOSYS-6836 (to oppgaver): exactly ONE behandlingsoppgave
   * (oppgavetype BEH_SAK_MK) skal finnes for saken etter at svaret er mottatt.
   * (En egen JFR_UT-journalføringsoppgave for utgående A001 er en annen type og
   * teller ikke med.)
   */
  private async verifiserNoyaktigEnBehandlingsoppgave(request: APIRequestContext): Promise<void> {
    const oppgaver = await fetchOppgaver(request);
    const behandlingsoppgaver = oppgaver.filter((o) => o.oppgavetype === 'BEH_SAK_MK');
    expect(
      behandlingsoppgaver.length,
      `Skal være NØYAKTIG én behandlingsoppgave (MELOSYS-6836-vakt mot to oppgaver), fant: ${JSON.stringify(behandlingsoppgaver.map((o) => ({ id: o.id, status: o.status })))}`,
    ).toBe(1);
    console.log(`✅ Nøyaktig én behandlingsoppgave (BEH_SAK_MK), status=${behandlingsoppgaver[0].status} — ingen 6836-dobbel`);
  }
}
