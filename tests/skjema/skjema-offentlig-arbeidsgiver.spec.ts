import { test, expect } from '../../fixtures';
import { SkjemaAuthHelper } from '../../helpers/skjema-auth-helper';
import { SoknadArbeidsgiverPage } from '../../pages/skjema/soknad-arbeidsgiver.page';
import { SkjemaMottakAssertions } from '../../pages/skjema/skjema-mottak.assertions';

/**
 * MELOSYS-7670 — offentlig arbeidsgiver gir forenklet flyt og behandlingstema for offentlig
 * tjenesteperson. skjema-api avgjør i Enhetsregisteret om arbeidsgiveren er offentlig (juridisk
 * hovedenhet med organisasjonsform STAT og sektorkode 6100) og legger svaret i skjemaets metadata.
 *
 * Flyt som verifiseres:
 *  1. skjema-web hopper over steget «Arbeidsgiverens virksomhet i Norge»: steg 1 går rett til
 *     utenlandsoppdraget som «Steg 2 av 10» i stedet for «Steg 3 av 11».
 *  2. melosys-api leser registerklassifiseringen fra metadata og oppretter behandlingen med
 *     behandlingstema ARBEID_TJENESTEPERSON_ELLER_FLY i stedet for UTSENDT_ARBEIDSTAKER.
 *
 * Bruker ../fixtures (Oracle-cleanup før testen). Krever full stack med melosys-api + Kafka, og
 * mock-imaget med den offentlige testorganisasjonen (melosys-docker-compose, MELOSYS-7670).
 * Testbrukere (TESTBRUKERE.md scenario 6): SIRI 10908012327 (HR-sjef) → Det Offentlige
 * Testdirektoratet 666666666 (STAT/6100 i EREG-mocken) → på vegne av PETRA 15899434509
 * (arbeidstaker NOR → Tyskland, fullmakt til SIRI).
 */
test.describe('skjema-web → melosys-api: offentlig arbeidsgiver', () => {
  test('offentlig arbeidsgiver hopper over virksomhetssteget og får behandlingstema for tjenesteperson', async ({
    page,
  }) => {
    test.setTimeout(120000); // 10 steg + async Kafka-mottak + DB-polling

    const auth = new SkjemaAuthHelper(page);
    await auth.login('10908012327'); // SIRI SANSEN, HR-sjef

    const soknad = new SoknadArbeidsgiverPage(page);
    const { skjemaId, referanse } = await soknad.fyllUtOgSendInnBeggeDeler({
      arbeidsgiverOrgnr: '666666666', // Det Offentlige Testdirektoratet (STAT / 6100)
      arbeidstakerFnr: '15899434509', // PETRA PETRANSEN
      land: 'Tyskland',
      offentligArbeidsgiver: true,
    });
    expect(referanse).toMatch(/^[A-Z0-9]{5,6}$/);
    console.log('📨 Søknad for offentlig arbeidsgiver sendt:', { skjemaId, referanse });

    const mottak = new SkjemaMottakAssertions();
    const { saksnummer } = await mottak.ventPaaSakForSkjema(skjemaId);
    await mottak.verifiserSakOgBehandling(saksnummer, {
      behTema: 'ARBEID_TJENESTEPERSON_ELLER_FLY',
    });

    // Drain-at-source: la mottakssagaen (sak + journalføring) bli ferdig før neste tests cleanup.
    await mottak.ventPaaJournalpostForSkjema(skjemaId);
  });
});
