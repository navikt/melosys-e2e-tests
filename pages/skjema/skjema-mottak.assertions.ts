import { expect } from '@playwright/test';
import { withDatabase } from '../../helpers/db-helper';

/**
 * Assertions for at en digital A1-søknad sendt fra skjema-web blir mottatt av melosys-api
 * (via Kafka `teammelosys.skjema.innsendt.v1-local`) og ender som sak + behandling i Oracle.
 *
 * Korrelasjon: melosys-api lagrer søknads-id-en (UUID) i SKJEMA_SAK_MAPPING.SKJEMA_ID (Oracle RAW(16))
 * sammen med saksnummeret det opprettet. Vi slår opp via HEXTORAW(<uuid uten bindestrek>).
 */
export class SkjemaMottakAssertions {
  /**
   * Poll Oracle til melosys-api har konsumert Kafka-meldingen og opprettet mappingen for skjema-id-en.
   * @returns saksnummeret melosys-api opprettet, og journalpost-id (om journalføring er ferdig).
   */
  async ventPaaSakForSkjema(
    skjemaId: string,
    timeoutMs = 45000
  ): Promise<{ saksnummer: string; journalpostId: string | null }> {
    const hex = skjemaId.replace(/-/g, '').toUpperCase();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const row = await withDatabase(async (db) =>
        db.queryOne<{ SAKSNUMMER: string; JOURNALPOST_ID: string | null }>(
          `SELECT SAKSNUMMER, JOURNALPOST_ID FROM SKJEMA_SAK_MAPPING WHERE SKJEMA_ID = HEXTORAW(:hex)`,
          { hex }
        )
      );
      if (row?.SAKSNUMMER) {
        console.log(`✅ melosys-api opprettet sak ${row.SAKSNUMMER} for skjema ${skjemaId}`);
        return { saksnummer: row.SAKSNUMMER, journalpostId: row.JOURNALPOST_ID ?? null };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(
      `Fant ingen SKJEMA_SAK_MAPPING for skjema-id ${skjemaId} innen ${timeoutMs} ms — ` +
        'melosys-api konsumerte ikke Kafka-meldingen (sjekk DigitalSøknadMottattConsumer + M2M-kall mot skjema-api).'
    );
  }

  /**
   * Verifiser at saksnummeret peker på en fagsak med en utsendt-arbeidstaker-førstegangsbehandling.
   */
  async verifiserSakOgBehandling(saksnummer: string): Promise<void> {
    await withDatabase(async (db) => {
      const fagsak = await db.queryOne<{ SAKSNUMMER: string; STATUS: string }>(
        `SELECT SAKSNUMMER, STATUS FROM FAGSAK WHERE SAKSNUMMER = :s`,
        { s: saksnummer }
      );
      expect(fagsak, `FAGSAK ${saksnummer} skal finnes`).not.toBeNull();

      const beh = await db.queryOne<{ ID: number; BEH_TEMA: string; BEH_TYPE: string; STATUS: string }>(
        `SELECT ID, BEH_TEMA, BEH_TYPE, STATUS FROM BEHANDLING
         WHERE SAKSNUMMER = :s ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY`,
        { s: saksnummer }
      );
      expect(beh, `BEHANDLING for ${saksnummer} skal finnes`).not.toBeNull();
      expect(beh!.BEH_TEMA, 'behandlingstema').toBe('UTSENDT_ARBEIDSTAKER');
      expect(beh!.BEH_TYPE, 'behandlingstype').toBe('FØRSTEGANG');

      console.log(
        `✅ Fagsak ${saksnummer} (${fagsak!.STATUS}) / behandling ${beh!.ID} ` +
          `(${beh!.BEH_TEMA}/${beh!.BEH_TYPE}, ${beh!.STATUS})`
      );
    });
  }
}
