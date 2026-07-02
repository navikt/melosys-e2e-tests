import { test, expect } from '@playwright/test';
import { SkjemaAuthHelper } from '../../helpers/skjema-auth-helper';
import { SoknadUtsendtArbeidstakerPage } from '../../pages/skjema/soknad-utsendt-arbeidstaker.page';
import { SkjemaMottakAssertions } from '../../pages/skjema/skjema-mottak.assertions';

/**
 * T1 — full happy-path innsending av digital «Utsendt arbeidstaker»-søknad, variant DEG SELV.
 *
 * Innbygger logger inn, fyller ut alle stegene i arbeidstakerdelen og sender inn. Verifiserer at
 * søknaden går igjennom skjema-api (utkast opprettes, hvert steg lagres, innsending gir kvittering
 * med referansenummer). Dette er det første scenariet som faktisk produserer en innsendt søknad —
 * grunnlaget for T2 (Kafka-mottak → sak/behandling i melosys-api).
 *
 * Ren @playwright/test (ingen Oracle/Unleash-fixture). Krever stacken oppe:
 *   cd ../melosys-docker-compose && make dev-skjema
 *   SKIP_EESSI_GATE=true npx playwright test tests/skjema/ --project=chromium
 *
 * Testbruker: 12928056706 (LANSEN, arbeidstaker NOR → Frankrike), arbeidsgiver 999999999 (Ståles Stål).
 */
test.describe('skjema-web innsending', () => {
  test('innbygger fyller ut og sender inn «Utsendt arbeidstaker»-søknad som DEG SELV', async ({ page }) => {
    test.setTimeout(90000); // innsending + drain (venter på at melosys-api konsumerer Kafka-meldingen)

    const auth = new SkjemaAuthHelper(page);
    await auth.login('12928056706');

    const soknad = new SoknadUtsendtArbeidstakerPage(page);
    const { skjemaId, referanse } = await soknad.fyllUtOgSendInnKomplettSoknad('999999999', 'Frankrike');

    // Kvitteringen viser et referansenummer (alfanumerisk kode) — beviser at innsendingen
    // ble persistert i skjema-api.
    expect(referanse).toMatch(/^[A-Z0-9]{5,6}$/);
    console.log('✅ Søknad sendt inn, referanse:', referanse);

    // Drain-at-source: vent til melosys-api har konsumert Kafka-meldingen (SKJEMA_SAK_MAPPING
    // opprettet) FØR testen avslutter. Uten dette lever meldingen videre og konsumeres først
    // etter at NESTE tests cleanup har tømt Oracle → en stray fagsak som velter tellingen i
    // etterfølgende tester (f.eks. skjema-begge-deler «kun én fagsak»). Se
    // memory/skjema_begge_deler_flake_kafka_leak.md.
    await new SkjemaMottakAssertions().ventPaaSakForSkjema(skjemaId);
    console.log('✅ Kafka-melding konsumert av melosys-api (drain OK)');
  });
});
