import { test, expect } from '../../fixtures';
import { SkjemaAuthHelper } from '../../helpers/skjema-auth-helper';
import { SoknadArbeidsgiverPage } from '../../pages/skjema/soknad-arbeidsgiver.page';
import { SoknadUtsendtArbeidstakerPage } from '../../pages/skjema/soknad-utsendt-arbeidstaker.page';
import { SkjemaMottakAssertions } from '../../pages/skjema/skjema-mottak.assertions';
import { STATLIG_ARBEIDSSTED_NAVN } from '../../pages/skjema/skjema-utils';

/**
 * Statlig arbeidsgiver og statsansatte (MELOSYS-7670 og MELOSYS-7694). skjema-api avgjør i
 * Enhetsregisteret om arbeidsgiveren er statlig (juridisk hovedenhet med organisasjonsform STAT
 * og sektorkode 6100), og i AAREG om arbeidstakeren har et arbeidsforhold der i perioden.
 * Begge svarene legges i skjemaets metadata og styrer spørsmålsflyten.
 *
 * melosys-api leser registerklassifiseringen fra metadata og oppretter behandlingen med
 * behandlingstema ARBEID_TJENESTEPERSON_ELLER_FLY i stedet for UTSENDT_ARBEIDSTAKER.
 *
 * Statsansattflyten styres av togglen melosys.skjema.statsansatt-flyt. skjema-api kjører med
 * local-profilen i e2e, der alle toggles er på.
 *
 * Bruker ../fixtures (Oracle-cleanup før testen). Krever full stack med melosys-api + Kafka, og
 * mock-imaget med den statlige testorganisasjonen Det Offentlige Testdirektoratet 666666666
 * (TESTBRUKERE.md i melosys-docker-compose, scenario 6 og 7).
 */
test.describe('skjema-web → melosys-api: statlig arbeidsgiver', () => {
  test('statlig arbeidsgiver får forkortet flyt, AAREG-varsel og behandlingstema for tjenesteperson', async ({
    page,
  }) => {
    test.setTimeout(120000); // 9 steg + async Kafka-mottak + DB-polling

    const auth = new SkjemaAuthHelper(page);
    await auth.login('10908012327'); // SIRI SANSEN, HR-sjef

    // PETRA har ikke arbeidsforhold hos 666666666 i AAREG-mocken, så arbeidstakers del følger
    // vanlig flyt og periodesteget viser AAREG-varselet.
    const soknad = new SoknadArbeidsgiverPage(page);
    const { skjemaId, referanse } = await soknad.fyllUtOgSendInnBeggeDeler({
      arbeidsgiverOrgnr: '666666666', // Det Offentlige Testdirektoratet (STAT / 6100)
      arbeidstakerFnr: '15899434509', // PETRA PETRANSEN
      land: 'Tyskland',
      statligArbeidsgiver: true,
    });
    expect(referanse).toMatch(/^[A-Z0-9]{5,6}$/);
    console.log('📨 Søknad for statlig arbeidsgiver sendt:', { skjemaId, referanse });

    const mottak = new SkjemaMottakAssertions();
    const { saksnummer } = await mottak.ventPaaSakForSkjema(skjemaId);
    await mottak.verifiserSakOgBehandling(saksnummer, {
      behTema: 'ARBEID_TJENESTEPERSON_ELLER_FLY',
    });

    // Drain-at-source: la mottakssagaen (sak + journalføring) bli ferdig før neste tests cleanup.
    await mottak.ventPaaJournalpostForSkjema(skjemaId);
  });

  test('statsansatt sender arbeidstakers del først med arbeidssted og lønn', async ({ page }) => {
    test.setTimeout(120000); // 8 steg + async Kafka-mottak + DB-polling

    const auth = new SkjemaAuthHelper(page);
    await auth.login('77777777777'); // JUNIOR, arbeidsforhold hos 666666666 i AAREG-mocken

    const soknad = new SoknadUtsendtArbeidstakerPage(page);
    const { skjemaId, referanse } = await soknad.fyllUtOgSendInnSomStatsansatt('666666666', 'Tyskland');
    expect(referanse).toMatch(/^[A-Z0-9]{5,6}$/);
    console.log('📨 Arbeidstakers del for statsansatt sendt:', { skjemaId, referanse });

    // Delen er komplett alene og venter ikke på arbeidsgivers del (MELOSYS-8314). Arbeidsstedet
    // finnes bare i arbeidstakers del, og skal likevel følge med inn i saksbehandlingen.
    const mottak = new SkjemaMottakAssertions();
    const { saksnummer } = await mottak.ventPaaSakForSkjema(skjemaId);
    await mottak.verifiserSakOgBehandling(saksnummer, {
      behTema: 'ARBEID_TJENESTEPERSON_ELLER_FLY',
    });
    await mottak.verifiserArbeidsstedPaaLand(saksnummer, STATLIG_ARBEIDSSTED_NAVN);

    // Drain-at-source: la mottakssagaen (sak + journalføring) bli ferdig før neste tests cleanup.
    await mottak.ventPaaJournalpostForSkjema(skjemaId);
  });
});
