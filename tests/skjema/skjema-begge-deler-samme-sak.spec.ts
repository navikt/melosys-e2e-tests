import { test, expect } from '../../fixtures';
import * as path from 'path';
import { withPgDatabase } from '../../helpers/pg-db-helper';
import { SkjemaAuthHelper } from '../../helpers/skjema-auth-helper';
import { SoknadArbeidsgiverPage } from '../../pages/skjema/soknad-arbeidsgiver.page';
import { SoknadUtsendtArbeidstakerPage } from '../../pages/skjema/soknad-utsendt-arbeidstaker.page';
import { SkjemaMottakAssertions } from '../../pages/skjema/skjema-mottak.assertions';

/**
 * T3 — «begge deler → samme sak» (kryss-tjeneste). Verifiserer hele koblingsmekanismen når
 * arbeidsgiver-delen og arbeidstaker-delen sendes SEPARAT for samme arbeidstaker, juridiske
 * enhet og overlappende periode:
 *
 *  1. Arbeidsgiver (KARAFFEL) sender KUN sin del FØRST → melosys-api oppretter sak + behandling
 *     med status AVVENT_DOK_PART (venter på arbeidstakerens del).
 *  2. Arbeidstaker (LANSEN) sender sin del (DEG SELV) med samme arbeidsgiver/periode →
 *     skjema-api kobler delene (motpart), melosys-api ruter til EKSISTERENDE sak og flipper
 *     behandlingen til VURDER_DOKUMENT — UTEN å opprette en ny sak.
 *
 * Asserter (mot Oracle + skjema-api Postgres + SAF/Joark-mock):
 *  - nøyaktig ÉN fagsak og ÉN behandling totalt (ingen dobbel sak),
 *  - status AVVENT_DOK_PART etter AG-del, VURDER_DOKUMENT etter AT-del,
 *  - begge skjema-id-er mapper til SAMME saksnummer, hver med sin egen (distinkte) JOURNALPOST_ID,
 *  - vedlegget fra AG-delen ligger på journalposten (Joark-mock),
 *  - saksnummeret er skrevet tilbake til skjema-api (innsending.saksnummer) for begge deler.
 *
 * Bruker ../fixtures (Oracle-cleanup før testen). I tillegg ryddes skjema-api sin Postgres
 * (`melosys-skjema`) FØRST i testen: tidligere innsendte søknader for samme arbeidstaker
 * (fra warm-up/andre tester) ville ellers gjøre motpart-koblingen ikke-deterministisk.
 *
 * To innlogginger (arbeidsgiver + arbeidstaker) = to browser-contexts i samme test.
 * Testbrukere (TESTBRUKERE.md scenario 1): KARAFFEL 30056928150 → Ståles Stål 999999999 →
 * LANSEN 12928056706.
 */
test.describe('skjema-web → melosys-api: begge deler kobles til samme sak', () => {
  test('AG-del først (AVVENT_DOK_PART) + AT-del → samme sak, VURDER_DOKUMENT', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(240000); // to innsendinger + async Kafka-mottak/kobling + DB-polling

    const ORGNR = '999999999'; // Ståles Stål AS
    const ARBEIDSTAKER_FNR = '12928056706'; // LANSEN LANSANSEN
    const VEDLEGG = path.resolve(__dirname, 'fixtures/vedlegg-test.pdf');
    const mottak = new SkjemaMottakAssertions();

    // Rydd skjema-api sin Postgres så motpart-koblingen blir deterministisk (kun denne testens
    // deler er SENDT for arbeidstakeren — ellers kan koblingen treffe en gammel arbeidsgiver-del).
    await withPgDatabase('melosys-skjema', (db) => db.cleanDatabase(true));

    // ---- 1. Arbeidsgiver sender KUN sin del (context 1) -----------------------------------
    const auth = new SkjemaAuthHelper(page);
    await auth.login('30056928150'); // KARAFFEL

    const agSoknad = new SoknadArbeidsgiverPage(page);
    const { skjemaId: agSkjemaId, referanse: agReferanse } =
      await agSoknad.fyllUtOgSendInnArbeidsgiversDel({
        arbeidsgiverOrgnr: ORGNR,
        arbeidstakerFnr: ARBEIDSTAKER_FNR,
        arbeidstakerEtternavn: 'LANSANSEN',
        land: 'Frankrike',
        vedleggFilsti: VEDLEGG,
      });
    console.log('📨 Arbeidsgiver-del sendt:', { agSkjemaId, agReferanse });

    const { saksnummer } = await mottak.ventPaaSakForSkjema(agSkjemaId);
    // Kun arbeidsgiver-del mottatt → behandlingen venter på arbeidstakerens del.
    await mottak.ventPaaBehandlingStatus(saksnummer, 'AVVENT_DOK_PART');
    await mottak.verifiserSakOgBehandling(saksnummer); // UTSENDT_ARBEIDSTAKER / FØRSTEGANG
    expect(await mottak.tellFagsaker(), 'kun én fagsak etter AG-del').toBe(1);
    const agJournalpostId = await mottak.ventPaaJournalpostForSkjema(agSkjemaId);
    await mottak.verifiserDelJournalfoertMedVedlegg(request, agReferanse, 'vedlegg-test.pdf');
    await mottak.ventPaaSaksnummerISkjemaApi(agSkjemaId, saksnummer);

    // ---- 2. Arbeidstaker sender sin del, DEG SELV (context 2 = ny innlogging) -------------
    const arbeidstakerContext = await browser.newContext();
    try {
      const page2 = await arbeidstakerContext.newPage();
      const auth2 = new SkjemaAuthHelper(page2);
      await auth2.login(ARBEIDSTAKER_FNR); // LANSEN

      const atSoknad = new SoknadUtsendtArbeidstakerPage(page2);
      const { skjemaId: atSkjemaId, referanse: atReferanse } =
        await atSoknad.fyllUtOgSendInnKomplettSoknad(ORGNR, 'Frankrike');
      console.log('📨 Arbeidstaker-del sendt:', { atSkjemaId, atReferanse });

      // AT-delen skal kobles til den eksisterende saken — IKKE opprette en ny.
      const { saksnummer: atSaksnummer } = await mottak.ventPaaSakForSkjema(atSkjemaId);
      expect(atSaksnummer, 'begge deler skal mappe til samme saksnummer').toBe(saksnummer);
      await mottak.ventPaaBehandlingStatus(saksnummer, 'VURDER_DOKUMENT');

      expect(await mottak.tellFagsaker(), 'fortsatt kun én fagsak etter AT-del').toBe(1);
      expect(await mottak.tellBehandlinger(saksnummer), 'fortsatt kun én behandling').toBe(1);

      const atJournalpostId = await mottak.ventPaaJournalpostForSkjema(atSkjemaId);
      expect(atJournalpostId, 'hver del journalføres på sin egen journalpost').not.toBe(
        agJournalpostId
      );

      await mottak.ventPaaSaksnummerISkjemaApi(atSkjemaId, saksnummer);

      console.log(
        `✅ Begge deler koblet til sak ${saksnummer} (AG jp ${agJournalpostId}, AT jp ${atJournalpostId})`
      );
    } finally {
      await arbeidstakerContext.close();
    }
  });
});
