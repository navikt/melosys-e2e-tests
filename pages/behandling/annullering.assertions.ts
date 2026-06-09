import {APIRequestContext, expect, Page} from '@playwright/test';
import {withDatabase} from '../../helpers/db-helper';
import {fetchMedlPeriode} from '../../helpers/mock-helper';

/**
 * Verifications for annullering of an EU/EØS (or trygdeavtale) sak.
 *
 * Encapsulates the database + MEDL-mock assertions that prove an annullering
 * was iverksatt correctly. Mirrors the backend integration test
 * `AnnuleringNyVurderingEøsOgTrygdeavtaleIT`, but verifies the outcome
 * end-to-end through the real stack.
 *
 * @example
 * const annullering = new AnnulleringPage(page);
 * await annullering.annullerSak();
 * await annullering.assertions.verifiserAnnulleringIverksatt(request, medlPeriodeId);
 */
export class AnnulleringAssertions {
    constructor(private readonly page: Page) {
    }

    /**
     * Verify (as a precondition, before annullering) that a MEDL-periode is
     * active/valid in the MEDL register. Makes the later AVST-assertion a real
     * before/after delta rather than a single-point check.
     */
    async verifiserMedlPeriodeGyldig(request: APIRequestContext, medlPeriodeId: number): Promise<void> {
        const periode = await fetchMedlPeriode(request, medlPeriodeId);
        expect(periode.status, `MEDL-periode ${medlPeriodeId} skal være GYLD før annullering`).toBe('GYLD');
        console.log(`✅ MEDL-periode ${medlPeriodeId} er GYLD (aktiv) før annullering`);
    }

    /**
     * Verify the full outcome of an annullert EU/EØS-sak (ANNULLER_SAK iverksatt):
     *  - fagsak satt til ANNULLERT
     *  - ny-vurderings-behandlingen avsluttet med behandlingsresultat ANNULLERT
     *  - ny-vurderingens lovvalgsperiode slettet (slettLovvalgsperiode), den
     *    opprinnelige perioden står igjen som INNVILGET
     *  - MEDL-perioden avvist (status GYLD → AVST) — kjernen i MELOSYS-7668
     *  - ANNULLER_SAK fullført uten feilede prosessinstanser
     *
     * @param request      - Playwright APIRequestContext (for MEDL-mock-oppslag)
     * @param medlPeriodeId - MEDL-periode-id fra den opprinnelige lovvalgsperioden
     */
    async verifiserAnnulleringIverksatt(request: APIRequestContext, medlPeriodeId: number): Promise<void> {
        // Databasen renses før hver test (cleanup-fixture), så "nyeste rad" / "eneste rad"
        // = denne testens behandling. Derfor trengs ingen tidsfilter på prosessinstans-
        // spørringene nedenfor (et SYSDATE-vindu ville bare vært sårbart for klokkeskew
        // mellom api- og oracle-containeren).
        await withDatabase(async (db) => {
            // === Fagsak satt til ANNULLERT ===
            const fagsak = await db.queryOne<{ SAKSNUMMER: string; STATUS: string }>(
                `SELECT saksnummer, status FROM fagsak ORDER BY registrert_dato DESC FETCH FIRST 1 ROWS ONLY`, {});
            expect(fagsak, 'Forventet en fagsak').not.toBeNull();
            expect(fagsak!.STATUS, 'Fagsak skal være ANNULLERT').toBe('ANNULLERT');
            console.log(`✅ Fagsak ${fagsak!.SAKSNUMMER} er ANNULLERT`);

            // === Ny-vurderings-behandlingen avsluttet med resultat ANNULLERT ===
            const nv = await db.queryOne<{ ID: number; STATUS: string }>(
                `SELECT id, status FROM behandling WHERE beh_type = 'NY_VURDERING'
                 ORDER BY id DESC FETCH FIRST 1 ROWS ONLY`, {});
            expect(nv, 'Forventet en NY_VURDERING-behandling').not.toBeNull();
            expect(nv!.STATUS, 'NV-behandlingen skal være AVSLUTTET').toBe('AVSLUTTET');

            const nvResultat = await db.queryOne<{ RESULTAT_TYPE: string }>(
                `SELECT resultat_type FROM behandlingsresultat WHERE behandling_id = :id`, {id: nv!.ID});
            expect(nvResultat, 'Forventet et behandlingsresultat for NV').not.toBeNull();
            expect(nvResultat!.RESULTAT_TYPE, 'NV-behandlingsresultat skal være ANNULLERT').toBe('ANNULLERT');
            console.log(`✅ NV-behandling ${nv!.ID} avsluttet med resultat ANNULLERT`);

            // === NV-lovvalgsperioden slettet; opprinnelig periode står igjen INNVILGET ===
            const nvPerioder = await db.query(
                `SELECT id FROM lovvalg_periode WHERE beh_resultat_id = :id`, {id: nv!.ID});
            expect(nvPerioder, 'NV-lovvalgsperioden skal være slettet ved annullering').toHaveLength(0);

            const gjenstaaende = await db.query<{ INNVILGELSE_RESULTAT: string; MEDLPERIODE_ID: number }>(
                `SELECT innvilgelse_resultat, medlperiode_id FROM lovvalg_periode ORDER BY id`, {});
            expect(gjenstaaende, 'Kun den opprinnelige lovvalgsperioden skal stå igjen').toHaveLength(1);
            expect(gjenstaaende[0].INNVILGELSE_RESULTAT).toBe('INNVILGET');
            expect(gjenstaaende[0].MEDLPERIODE_ID).toBe(medlPeriodeId);
            console.log('✅ NV-lovvalgsperiode slettet; opprinnelig periode står igjen som INNVILGET');

            // === Ingen feilede prosessinstanser + ANNULLER_SAK fullført ===
            const feilede = await db.query<{ PROSESS_TYPE: string; STATUS: string }>(
                `SELECT prosess_type, status FROM prosessinstans WHERE status = 'FEILET'`, {});
            expect(feilede, `Forventet ingen feilede prosessinstanser, fant: ${JSON.stringify(feilede)}`).toHaveLength(0);

            const annullerProsess = await db.queryOne<{ STATUS: string; SIST_FULLFORT_STEG: string }>(
                `SELECT status, sist_fullfort_steg FROM prosessinstans
                 WHERE prosess_type = 'ANNULLER_SAK'
                 ORDER BY registrert_dato DESC FETCH FIRST 1 ROWS ONLY`, {});
            expect(annullerProsess, 'Forventet en ANNULLER_SAK-prosessinstans').not.toBeNull();
            expect(annullerProsess!.STATUS, 'ANNULLER_SAK skal være FERDIG').toBe('FERDIG');
            console.log(`✅ ANNULLER_SAK FERDIG (sist steg: ${annullerProsess!.SIST_FULLFORT_STEG}), ingen feilede prosessinstanser`);
        });

        // === MEDL-perioden avvist (status GYLD → AVST) — MELOSYS-7668 ===
        const periode = await fetchMedlPeriode(request, medlPeriodeId);
        expect(periode.status, `MEDL-periode ${medlPeriodeId} skal være avvist (AVST) etter annullering`).toBe('AVST');
        console.log(`✅ MEDL-periode ${medlPeriodeId} avvist (GYLD → AVST)`);
    }
}
