import { test, expect } from '@playwright/test';
import { SkjemaAuthHelper } from '../../helpers/skjema-auth-helper';
import { SoknadUtsendtArbeidstakerPage } from '../../pages/skjema/soknad-utsendt-arbeidstaker.page';

/**
 * T1 — full happy-path innsending av digital A1-søknad (utsendt arbeidstaker), variant DEG SELV.
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
  test('innbygger fyller ut og sender inn A1-søknad som DEG SELV', async ({ page }) => {
    const auth = new SkjemaAuthHelper(page);
    await auth.login('12928056706');

    const soknad = new SoknadUtsendtArbeidstakerPage(page);
    const referanse = await soknad.fyllUtOgSendInnKomplettSoknad('999999999', 'Frankrike');

    // Kvitteringen viser et referansenummer (alfanumerisk kode) — beviser at innsendingen
    // ble persistert i skjema-api.
    expect(referanse).toMatch(/^[A-Z0-9]{5,6}$/);
    console.log('✅ Søknad sendt inn, referanse:', referanse);
  });
});
