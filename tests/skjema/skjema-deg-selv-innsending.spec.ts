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

    // Drain-at-source: vent til melosys-api har kjørt HELE mottakssagaen (sak + journalføring i
    // Oracle) FØR testen avslutter. Uten dette lever Kafka-meldingen videre og konsumeres først
    // etter at NESTE tests cleanup har tømt Oracle. To skadevarianter: (1) sak opprettes etter
    // clean → stray fagsak velter tellinger i etterfølgende tester (f.eks. skjema-begge-deler
    // «kun én fagsak», CI run 28596547580); (2) journalførings-halen krysser grensen → naboens
    // clean sletter sak/behandling midt i sagaen → melosys-api logger ERROR → docker-logs-fixturen
    // feller en urelatert nabotest. Å draine helt til JOURNALPOST_ID er satt dekker begge.
    await new SkjemaMottakAssertions().ventPaaJournalpostForSkjema(skjemaId);
    console.log('✅ Mottakssaga ferdig i melosys-api (sak + journalpost, drain OK)');
  });
});
