import { test, expect } from '../../fixtures';
import { SkjemaAuthHelper } from '../../helpers/skjema-auth-helper';
import { SamletVirksomhet, SoknadArbeidsgiverPage } from '../../pages/skjema/soknad-arbeidsgiver.page';
import { SkjemaMottakAssertions } from '../../pages/skjema/skjema-mottak.assertions';

/**
 * MELOSYS-7672 — et norskregistrert utenlandsk foretak (NUF) må oppgi opplysninger om foretakets
 * samlede virksomhet uavhengig av antall ansatte. skjema-api avgjør i Enhetsregisteret om
 * arbeidsgiverens hovedenhet er et NUF (enhetstype NUF og sektorkode 2100) og legger svaret i
 * skjemaets metadata.
 *
 * Flyt som verifiseres:
 *  1. skjema-web viser de seks feltene i stedet for spørsmålet om vanlig drift på steget
 *     «Arbeidsgiverens virksomhet i Norge», selv om foretaket har 50 ansatte og ikke er bemanningsbyrå.
 *  2. melosys-api tar imot metadata med NUF-flagget og mapper feltene til `juridiskArbeidsgiverNorge`
 *     i mottatte opplysninger.
 *
 * Bruker ../fixtures (Oracle-cleanup før testen). Krever full stack med melosys-api + Kafka, og
 * mock-imaget med NUF-organisasjonen (melosys-docker-compose, MELOSYS-7672).
 * Testbrukere (TESTBRUKERE.md scenario 8): KARAFFEL 30056928150 (daglig leder) → Bjørns Brønnboring
 * Ltd NUF 555555555 (NUF/2100, 50 ansatte i EREG-mocken) → på vegne av PETRA 15899434509
 * (arbeidstaker NOR → Tyskland, fullmakt til KARAFFEL).
 */
test.describe('skjema-web → melosys-api: arbeidsgiver som er NUF', () => {
  test('NUF med 50 ansatte oppgir samlet virksomhet som havner i mottatte opplysninger', async ({ page }) => {
    test.setTimeout(120000); // 11 steg + async Kafka-mottak + DB-polling

    const auth = new SkjemaAuthHelper(page);
    await auth.login('30056928150'); // KARAFFEL TRIVIELL, daglig leder

    const samletVirksomhet: SamletVirksomhet = {
      antallAdministrativtAnsatte: 3,
      antallUtsendteArbeidstakere: 10,
      andelAnsatteRekruttertINorge: 20,
      andelOmsetningINorge: 15,
      andelOppdragUtfortINorge: 10,
      andelOppdragskontrakterInngattINorge: 5,
    };

    const soknad = new SoknadArbeidsgiverPage(page);
    const { skjemaId, referanse } = await soknad.fyllUtOgSendInnBeggeDeler({
      arbeidsgiverOrgnr: '555555555', // Bjørns Brønnboring Ltd NUF (NUF / 2100, 50 ansatte)
      arbeidstakerFnr: '15899434509', // PETRA PETRANSEN
      land: 'Tyskland',
      samletVirksomhet,
    });
    expect(referanse).toMatch(/^[A-Z0-9]{5,6}$/);
    console.log('📨 Søknad for NUF sendt:', { skjemaId, referanse });

    const mottak = new SkjemaMottakAssertions();
    const { saksnummer } = await mottak.ventPaaSakForSkjema(skjemaId);
    await mottak.verifiserSakOgBehandling(saksnummer);
    await mottak.verifiserJuridiskArbeidsgiverNorge(saksnummer, {
      erOffentligVirksomhet: false,
      antallAnsatte: 50,
      antallAdmAnsatte: samletVirksomhet.antallAdministrativtAnsatte,
      antallUtsendte: samletVirksomhet.antallUtsendteArbeidstakere,
      andelRekruttertINorge: samletVirksomhet.andelAnsatteRekruttertINorge,
      andelOmsetningINorge: samletVirksomhet.andelOmsetningINorge,
      andelOppdragINorge: samletVirksomhet.andelOppdragUtfortINorge,
      andelKontrakterINorge: samletVirksomhet.andelOppdragskontrakterInngattINorge,
    });

    // Drain-at-source: la mottakssagaen (sak + journalføring) bli ferdig før neste tests cleanup.
    await mottak.ventPaaJournalpostForSkjema(skjemaId);
  });
});
