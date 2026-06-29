import { test, expect } from '../../fixtures';
import { SkjemaAuthHelper } from '../../helpers/skjema-auth-helper';
import { SoknadArbeidsgiverPage } from '../../pages/skjema/soknad-arbeidsgiver.page';
import { SkjemaMottakAssertions } from '../../pages/skjema/skjema-mottak.assertions';

/**
 * T1c — innsending via rollevalg RÅDGIVER med fullmakt (RADGIVER_MED_FULLMAKT). En rådgiver fyller
 * ut «Utsendt arbeidstaker»-søknaden på vegne av et rådgivingsfirma, for en arbeidsgiver (via
 * Altinn-tilgang) og en arbeidstaker (via fullmakt) — begge deler.
 *
 * Den nye UI-delen vs. T1b er rådgiverfirma-valget (`/representasjon/velg-radgiverfirma`): et fritt
 * org.nr-/EREG-oppslag (ikke Altinn-begrenset), så enhver innlogget bruker kan opptre som rådgiver.
 * Resten av oversikten (arbeidsgiver + arbeidstaker) og stegene er identiske med arbeidsgiver-flyten.
 *
 * Cross-service (../fixtures, Oracle): verifiserer at søknaden blir sak + behandling i melosys-api,
 * og — det rådgiver-spesifikke — at rådgiverfirmaet og rådgiver-med-fullmakt-representasjonen
 * fulgte med hele veien (SKJEMA_SAK_MAPPING.ORIGINAL_DATA, som er hele mottatt M2M-DTO inkl. metadata).
 *
 * Testbruker: KARAFFEL 30056928150 opptrer som rådgiver for rådgivingsfirma Skatteetaten 974761076,
 * arbeidsgiver Ståles Stål 999999999, arbeidstaker LANSEN 12928056706.
 */
test.describe('skjema-web → melosys-api: rådgiver med fullmakt', () => {
  test('rådgiver fyller ut begge deler → sak + rådgiverfirma/fullmakt i mottatte data', async ({
    page,
  }) => {
    test.setTimeout(120000); // 11 steg + async Kafka-mottak + DB-polling

    const auth = new SkjemaAuthHelper(page);
    await auth.login('30056928150'); // KARAFFEL — opptrer som rådgiver

    const soknad = new SoknadArbeidsgiverPage(page);
    const { skjemaId, referanse } = await soknad.fyllUtOgSendInnRadgiverBeggeDeler({
      radgiverfirmaOrgnr: '974761076', // Skatteetaten (EREG-oppslag)
      radgiverfirmaNavn: 'Skatteetaten',
      arbeidsgiverOrgnr: '999999999', // Ståles Stål AS (Altinn-tilgang)
      arbeidstakerFnr: '12928056706', // LANSEN LANSANSEN (fullmakt)
      land: 'Frankrike',
    });
    expect(referanse).toMatch(/^[A-Z0-9]{5,6}$/);
    console.log('📨 Rådgiver-søknad sendt:', { skjemaId, referanse });

    const mottak = new SkjemaMottakAssertions();
    const { saksnummer } = await mottak.ventPaaSakForSkjema(skjemaId);
    await mottak.verifiserSakOgBehandling(saksnummer); // UTSENDT_ARBEIDSTAKER / FØRSTEGANG

    // Det rådgiver-spesifikke: rådgivingsfirmaet (orgnr + navn) og rådgiver-med-fullmakt-
    // representasjonen er bevart i dataene melosys-api mottok.
    await mottak.verifiserOriginalDataInneholder(skjemaId, [
      'RADGIVER_MED_FULLMAKT',
      '974761076',
      'Skatteetaten',
    ]);
  });
});
