import { test } from '../../fixtures';
import { SkjemaAuthHelper } from '../../helpers/skjema-auth-helper';
import { SoknadUtsendtArbeidstakerPage } from '../../pages/skjema/soknad-utsendt-arbeidstaker.page';
import { SkjemaMottakAssertions } from '../../pages/skjema/skjema-mottak.assertions';

/**
 * T2 — den tverdifulle vertikale skiva: en digital A1-søknad sendt fra skjema-web skal mottas av
 * melosys-api og bli en sak + behandling.
 *
 * Flyt som verifiseres: skjema-web innsending → skjema-api publiserer `teammelosys.skjema.innsendt.v1-local`
 * → melosys-api `DigitalSøknadMottattConsumer` → M2M-kall tilbake til skjema-api for søknadsdata →
 * oppretter fagsak + behandling (UTSENDT_ARBEIDSTAKER/FØRSTEGANG) → journalfører → kaller tilbake saksnummer.
 *
 * Denne testen BRUKER ../fixtures (i motsetning til T0/T1) fordi den berører melosys-api/Oracle:
 * fixturen rydder Oracle FØR testen, så vi asserterer på en fersk sak. Krever full stack med
 * melosys-api + Kafka i tillegg til skjema:
 *   cd ../melosys-docker-compose && make full   (eller dev-skjema + melosys-api)
 *
 * Korrelasjon mot riktig sak skjer via søknads-id-en (UUID) i SKJEMA_SAK_MAPPING.
 */
test.describe('skjema-web → melosys-api mottak', () => {
  test('innsendt A1-søknad blir sak og behandling i melosys-api', async ({ page }) => {
    test.setTimeout(120000); // async Kafka-mottak + DB-polling

    const auth = new SkjemaAuthHelper(page);
    await auth.login('12928056706'); // LANSEN, arbeidstaker NOR → Frankrike

    const soknad = new SoknadUtsendtArbeidstakerPage(page);
    const { skjemaId, referanse } = await soknad.fyllUtOgSendInnKomplettSoknad('999999999', 'Frankrike');
    console.log('📨 Søknad sendt:', { skjemaId, referanse });

    const mottak = new SkjemaMottakAssertions();
    const { saksnummer } = await mottak.ventPaaSakForSkjema(skjemaId);
    await mottak.verifiserSakOgBehandling(saksnummer);
  });
});
