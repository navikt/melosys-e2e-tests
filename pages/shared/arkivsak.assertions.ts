import { expect } from '@playwright/test';
import { withDatabase } from '../../helpers/db-helper';

/**
 * Behavior-equivalence-assertion for MELOSYS-7821 (avvikling av Basic auth mot Sak →
 * token-basert arkivsak-tilgang).
 *
 * Arkivsak-oppslaget mot «Sak» (det auth-bytten gjelder) er forutsetningen for at en
 * melosys-fagsak kan kobles til en arkivsak. Den koblingen lagres i
 * `FAGSAK.GSAK_SAKSNUMMER` (GSAK/arkivsak-nummeret). Dette er det nærmeste E2E-observerbare
 * beviset på at Sak-integrasjonen ga et brukbart resultat — uavhengig av OM kallet brukte
 * Basic auth eller token (mekanismen er ikke synlig i den mockede stacken, jf. speken).
 *
 * Faller arkivsak-oppslaget bort (f.eks. fordi det nye token-/SAF-`saker`-sporet ikke gir en
 * arkivsak), blir `GSAK_SAKSNUMMER` null og journalføringen mister sin sak-tilknytning →
 * denne asserten slår testen RØD.
 *
 * DB-kolonner live-verifisert 2026-06-24:
 *  - FAGSAK(SAKSNUMMER, GSAK_SAKSNUMMER NUMBER, STATUS, REGISTRERT_DATO) — FAGSAK har ingen
 *    ID-kolonne; PK = SAKSNUMMER.
 *  - BEHANDLING(ID, SAKSNUMMER, ...) — BEHANDLING.SAKSNUMMER peker på FAGSAK.SAKSNUMMER.
 *
 * Oppgi enten `saksnummer` (Scenario 1 — fra `verifiserSedRutetTilTema`) eller `behandlingId`
 * (Scenario 2 — fra URL etter at behandlingen er åpnet). Returnerer GSAK-nummeret.
 */
export async function verifiserArkivsakKoblet(opts: {
  saksnummer?: string;
  behandlingId?: string | number;
}): Promise<number> {
  if (!opts.saksnummer && opts.behandlingId == null) {
    throw new Error('verifiserArkivsakKoblet krever enten saksnummer eller behandlingId');
  }

  return await withDatabase(async (db) => {
    const fagsak = opts.saksnummer
      ? await db.queryOne<{ SAKSNUMMER: string; GSAK_SAKSNUMMER: number | null }>(
          `SELECT SAKSNUMMER, GSAK_SAKSNUMMER FROM FAGSAK WHERE SAKSNUMMER = :sn`,
          { sn: opts.saksnummer }
        )
      : await db.queryOne<{ SAKSNUMMER: string; GSAK_SAKSNUMMER: number | null }>(
          `SELECT f.SAKSNUMMER, f.GSAK_SAKSNUMMER
             FROM FAGSAK f
             JOIN BEHANDLING b ON b.SAKSNUMMER = f.SAKSNUMMER
            WHERE b.ID = :id`,
          { id: Number(opts.behandlingId) }
        );

    const beskrivelse = opts.saksnummer
      ? `sak ${opts.saksnummer}`
      : `behandling ${opts.behandlingId}`;

    expect(fagsak, `Forventet en FAGSAK for ${beskrivelse}`).not.toBeNull();
    expect(
      fagsak!.GSAK_SAKSNUMMER,
      `Forventet at ${beskrivelse} er koblet til en arkivsak (FAGSAK.GSAK_SAKSNUMMER satt) — ` +
        `beviset på at arkivsak-oppslaget mot Sak ga et brukbart resultat`
    ).not.toBeNull();
    expect(
      Number(fagsak!.GSAK_SAKSNUMMER),
      `Arkivsak-nummeret (GSAK_SAKSNUMMER) skal være et positivt tall`
    ).toBeGreaterThan(0);

    console.log(
      `✅ Arkivsak koblet: ${fagsak!.SAKSNUMMER} → GSAK ${fagsak!.GSAK_SAKSNUMMER} (${beskrivelse})`
    );
    return Number(fagsak!.GSAK_SAKSNUMMER);
  });
}
