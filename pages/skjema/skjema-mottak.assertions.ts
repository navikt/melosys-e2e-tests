import { APIRequestContext, expect } from '@playwright/test';
import { withDatabase } from '../../helpers/db-helper';
import { withPgDatabase } from '../../helpers/pg-db-helper';

/**
 * Assertions for at en digital «Utsendt arbeidstaker»-søknad sendt fra skjema-web blir mottatt av melosys-api
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
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const row = await this.hentMapping(skjemaId);
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

  /** Slå opp én SKJEMA_SAK_MAPPING-rad på skjema-id (Oracle RAW(16) → HEXTORAW). */
  private async hentMapping(
    skjemaId: string
  ): Promise<{ SAKSNUMMER: string; JOURNALPOST_ID: string | null } | null> {
    const hex = skjemaId.replace(/-/g, '').toUpperCase();
    return withDatabase((db) =>
      db.queryOne<{ SAKSNUMMER: string; JOURNALPOST_ID: string | null }>(
        `SELECT SAKSNUMMER, JOURNALPOST_ID FROM SKJEMA_SAK_MAPPING WHERE SKJEMA_ID = HEXTORAW(:hex)`,
        { hex }
      )
    );
  }

  /**
   * Poll til journalføring er ferdig (SKJEMA_SAK_MAPPING.JOURNALPOST_ID satt) og returner journalpost-id-en.
   * Journalføringen er et eget asynkront saga-steg etter at sak/behandling er opprettet.
   */
  async ventPaaJournalpostForSkjema(skjemaId: string, timeoutMs = 45000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const row = await this.hentMapping(skjemaId);
      if (row?.JOURNALPOST_ID) return row.JOURNALPOST_ID;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(
      `JOURNALPOST_ID ble ikke satt for skjema ${skjemaId} innen ${timeoutMs} ms — journalføringen (OpprettOgFerdigstillJournalpostDigitalSøknad) fullførte ikke.`
    );
  }

  /**
   * Verifiser at saksnummeret peker på en fagsak med en utsendt-arbeidstaker-behandling.
   * @param forventet.behType  default FØRSTEGANG.
   */
  async verifiserSakOgBehandling(
    saksnummer: string,
    forventet: { behTema?: string; behType?: string } = {}
  ): Promise<void> {
    const behTema = forventet.behTema ?? 'UTSENDT_ARBEIDSTAKER';
    const behType = forventet.behType ?? 'FØRSTEGANG';
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
      expect(beh!.BEH_TEMA, 'behandlingstema').toBe(behTema);
      expect(beh!.BEH_TYPE, 'behandlingstype').toBe(behType);

      console.log(
        `✅ Fagsak ${saksnummer} (${fagsak!.STATUS}) / behandling ${beh!.ID} ` +
          `(${beh!.BEH_TEMA}/${beh!.BEH_TYPE}, ${beh!.STATUS})`
      );
    });
  }

  /** Antall fagsaker totalt (databasen ryddes per test, så dette er saker opprettet i testen). */
  async tellFagsaker(): Promise<number> {
    return withDatabase(async (db) => {
      const row = await db.queryOne<{ ANTALL: number }>(`SELECT COUNT(*) AS ANTALL FROM FAGSAK`);
      return Number(row?.ANTALL ?? 0);
    });
  }

  /** Antall behandlinger på en fagsak. */
  async tellBehandlinger(saksnummer: string): Promise<number> {
    return withDatabase(async (db) => {
      const row = await db.queryOne<{ ANTALL: number }>(
        `SELECT COUNT(*) AS ANTALL FROM BEHANDLING WHERE SAKSNUMMER = :s`,
        { s: saksnummer }
      );
      return Number(row?.ANTALL ?? 0);
    });
  }

  /**
   * Poll til den nyeste behandlingen på saken har forventet status. Statusovergangene skjer i
   * asynkrone saga-steg (AG-del-mottak setter AVVENT_DOK_PART, AT-del-mottak setter VURDER_DOKUMENT).
   */
  async ventPaaBehandlingStatus(
    saksnummer: string,
    forventetStatus: string,
    timeoutMs = 45000
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let sisteStatus: string | null = null;
    while (Date.now() < deadline) {
      sisteStatus = await withDatabase((db) =>
        db
          .queryOne<{ STATUS: string }>(
            `SELECT STATUS FROM BEHANDLING WHERE SAKSNUMMER = :s ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY`,
            { s: saksnummer }
          )
          .then((r) => r?.STATUS ?? null)
      );
      if (sisteStatus === forventetStatus) {
        console.log(`✅ Behandling på ${saksnummer} har status ${forventetStatus}`);
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(
      `Behandlingen på ${saksnummer} fikk ikke status ${forventetStatus} innen ${timeoutMs} ms (siste status: ${sisteStatus}).`
    );
  }

  /**
   * Poll skjema-api (Postgres `melosys-skjema`.innsending) til saksnummeret fra melosys-api er
   * registrert tilbake via M2M-callback (POST /m2m/api/skjema/{id}/saksnummer).
   */
  async ventPaaSaksnummerISkjemaApi(
    skjemaId: string,
    forventetSaksnummer: string,
    timeoutMs = 30000
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let sisteVerdi: string | null = null;
    while (Date.now() < deadline) {
      sisteVerdi = await withPgDatabase('melosys-skjema', (db) =>
        db
          .queryOne<{ saksnummer: string | null }>(
            `SELECT saksnummer FROM innsending WHERE skjema_id = $1::uuid`,
            [skjemaId]
          )
          .then((r) => r?.saksnummer ?? null)
      );
      if (sisteVerdi === forventetSaksnummer) {
        console.log(`✅ skjema-api registrerte saksnummer ${forventetSaksnummer} for skjema ${skjemaId}`);
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(
      `skjema-api (innsending.saksnummer) fikk ikke saksnummer ${forventetSaksnummer} for skjema ${skjemaId} ` +
        `innen ${timeoutMs} ms (siste verdi: ${sisteVerdi}). Sjekk SEND_SAKSNUMMER_TIL_MELOSYS_SKJEMA_API-steget.`
    );
  }

  /**
   * Verifiser at en innsendt del er journalført i Joark/SAF-mock og at det opplastede vedlegget
   * ligger på journalposten. Journalposten finnes via eksternReferanseId = referansenummeret, og
   * melosys-api setter vedleggets dokument-tittel = filnavnet (OpprettOgFerdigstillJournalpostDigitalSøknad).
   */
  async verifiserDelJournalfoertMedVedlegg(
    request: APIRequestContext,
    referanse: string,
    vedleggFilnavn: string,
    timeoutMs = 30000
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let sisteFunn = 'ingen journalpost';
    while (Date.now() < deadline) {
      const response = await request.get('http://localhost:8083/testdata/verification/journalpost');
      if (response.ok()) {
        const journalposter = (await response.json()) as Array<{
          journalpostId: string;
          journalposttype: string | null;
          eksternReferanseId: string | null;
          dokumentModellList?: Array<{ tittel: string | null; dokumentTilknyttetJournalpost: string | null }>;
        }>;
        const jp = journalposter.find(
          (j) => j.eksternReferanseId === referanse && j.journalposttype === 'INNGAAENDE'
        );
        if (jp) {
          const dokumenter = jp.dokumentModellList ?? [];
          const harVedlegg = dokumenter.some((d) => d.tittel === vedleggFilnavn);
          if (harVedlegg) {
            console.log(
              `✅ Vedlegg «${vedleggFilnavn}» journalført på journalpost ${jp.journalpostId} (ref ${referanse})`
            );
            return;
          }
          sisteFunn = `journalpost ${jp.journalpostId} uten vedlegg-dokument (dok: ${dokumenter
            .map((d) => d.tittel)
            .join(', ')})`;
        }
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(
      `Fant ikke vedlegget «${vedleggFilnavn}» på en INNGAAENDE journalpost med eksternReferanseId ${referanse} ` +
        `innen ${timeoutMs} ms (siste funn: ${sisteFunn}).`
    );
  }
}
