import { test, expect } from '../../fixtures';
import { SkjemaAuthHelper } from '../../helpers/skjema-auth-helper';
import { SamletVirksomhet, SoknadArbeidsgiverPage } from '../../pages/skjema/soknad-arbeidsgiver.page';
import { SkjemaMottakAssertions } from '../../pages/skjema/skjema-mottak.assertions';

/**
 * MELOSYS-8251 — private arbeidsgivere med færre enn 20 ansatte må oppgi opplysninger om
 * foretakets samlede virksomhet. skjema-api henter antall ansatte for den juridiske enheten fra
 * Enhetsregisteret og legger det i skjemaets metadata.
 *
 * Flyt som verifiseres:
 *  1. skjema-web viser infoboksen «… er registrert med færre enn 20 ansatte» og de seks feltene på
 *     steget «Arbeidsgiverens virksomhet i Norge», selv om arbeidsgiveren ikke er bemanningsbyrå.
 *  2. melosys-api mapper feltene og antall ansatte fra EREG til `juridiskArbeidsgiverNorge` i
 *     mottatte opplysninger (sidemenyen «Samlet virksomhet i Norge»).
 *
 * Bruker ../fixtures (Oracle-cleanup før testen). Krever full stack med melosys-api + Kafka, og
 * mock-imaget der Steinars Stein AS har 5 ansatte (melosys-docker-compose, MELOSYS-8251).
 * Testbrukere (TESTBRUKERE.md): KARAFFEL 30056928150 (daglig leder) → Steinars Stein AS 888888888
 * → på vegne av LANSEN 12928056706 (arbeidstaker NOR → Frankrike, fullmakt til KARAFFEL).
 */
test.describe('skjema-web → melosys-api: arbeidsgiver med færre enn 20 ansatte', () => {
  test('arbeidsgiver med få ansatte oppgir samlet virksomhet som havner i mottatte opplysninger', async ({
    page,
  }) => {
    test.setTimeout(120000); // 11 steg + async Kafka-mottak + DB-polling

    const auth = new SkjemaAuthHelper(page);
    await auth.login('30056928150'); // KARAFFEL TRIVIELL, daglig leder

    const samletVirksomhet: SamletVirksomhet = {
      antallAdministrativtAnsatte: 2,
      antallUtsendteArbeidstakere: 1,
      andelAnsatteRekruttertINorge: 80,
      andelOmsetningINorge: 60,
      andelOppdragUtfortINorge: 70,
      andelOppdragskontrakterInngattINorge: 90,
    };

    const soknad = new SoknadArbeidsgiverPage(page);
    const { skjemaId, referanse } = await soknad.fyllUtOgSendInnBeggeDeler({
      arbeidsgiverOrgnr: '888888888', // Steinars Stein AS (5 ansatte i EREG-mocken)
      arbeidstakerFnr: '12928056706', // LANSEN LANSANSEN
      land: 'Frankrike',
      samletVirksomhet,
    });
    expect(referanse).toMatch(/^[A-Z0-9]{5,6}$/);
    console.log('📨 Søknad for arbeidsgiver med få ansatte sendt:', { skjemaId, referanse });

    const mottak = new SkjemaMottakAssertions();
    const { saksnummer } = await mottak.ventPaaSakForSkjema(skjemaId);
    await mottak.verifiserSakOgBehandling(saksnummer);
    await mottak.verifiserJuridiskArbeidsgiverNorge(saksnummer, {
      erOffentligVirksomhet: false,
      antallAnsatte: 5,
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
