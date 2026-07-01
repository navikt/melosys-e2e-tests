import { test, expect } from '@playwright/test';
import { SkjemaAuthHelper } from '../../helpers/skjema-auth-helper';
import { SoknadUtsendtArbeidstakerPage } from '../../pages/skjema/soknad-utsendt-arbeidstaker.page';

/**
 * MELOSYS-8170 — varsel-lenken ruter arbeidstaker rett til DEG SELV med arbeidsgivers orgnr
 * forhåndsutfylt.
 *
 * Når arbeidsgiver (eller rådgiver) har sendt inn sin del UTEN fullmakt, får arbeidstaker et varsel
 * med en lenke. Fra og med 8170 bærer lenken `?representasjonstype=DEG_SELV&arbeidsgiverOrgnr=<AG>`,
 * så arbeidstaker lander rett på /oversikt med organisasjonsnummeret ferdig utfylt og EREG-resolvet
 * — hen slipper å taste det inn selv. Bekreftelsen må fortsatt hukes av før søknaden kan startes.
 *
 * Dette dekker frontend-halvdelen av 8170 ende-til-ende (skjema-web + skjema-api + EREG-mock):
 * deeplink-landing → forhåndsutfylt orgnr → EREG-resolvet arbeidsgiver → bekreftelse-gating → start.
 * Backend-halvdelen (at varselet faktisk BYGGER denne lenken) dekkes av enhetstest i skjema-api
 * (ArbeidstakerVarslingServiceTest).
 *
 * Ren @playwright/test (ingen sak opprettes i melosys-api, så ingen Oracle/Unleash-fixture trengs).
 * Krever skjema-stacken oppe:
 *   cd ../melosys-docker-compose && make dev-skjema
 *   SKIP_EESSI_GATE=true npx playwright test tests/skjema/ --project=chromium
 *
 * Testbruker: 12928056706 (LANSEN, arbeidstaker), arbeidsgiver 999999999 (Ståles Stål AS).
 */
test.describe('skjema-web: 8170 varsel-lenke preutfyller arbeidsgivers orgnr', () => {
  test('arbeidstaker følger varsel-lenken og lander på DEG SELV med orgnr forhåndsutfylt', async ({
    page,
  }) => {
    const auth = new SkjemaAuthHelper(page);
    await auth.login('12928056706');

    const soknad = new SoknadUtsendtArbeidstakerPage(page);
    // Verifiserer forhåndsutfylling + EREG-resolving + bekreftelse-gating, og starter søknaden.
    const skjemaId = await soknad.startSoknadViaVarselLenke('999999999', 'Ståles Stål AS');

    // En gyldig skjema-id (UUID) beviser at hele preutfyll → bekreft → start-flyten gikk igjennom
    // skjema-api (uten at testen tastet inn orgnr).
    expect(skjemaId).toMatch(/^[0-9a-f-]{36}$/i);
    console.log('✅ 8170: varsel-lenke preutfylte orgnr og startet DEG SELV-søknad:', skjemaId);
  });
});
