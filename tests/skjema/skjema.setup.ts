import { test as setup } from '@playwright/test';
import { SkjemaAuthHelper } from '../../helpers/skjema-auth-helper';
import { SoknadUtsendtArbeidstakerPage } from '../../pages/skjema/soknad-utsendt-arbeidstaker.page';

/**
 * Oppvarming av skjema-stacken — kjøres som et eget Playwright "setup"-prosjekt FØR de
 * tidsbegrensede skjema-testene, men KUN når skjema-tester faktisk er valgt for kjøring.
 *
 * Tidligere lå dette i global-setup.ts og ble derfor betalt på HVER kjøring, også når ingen
 * skjema-tester kjørte. Ved å gjøre det til et setup-prosjekt som skjema-spec-ene avhenger av
 * (se `dependencies: ['skjema-setup']` i playwright.config.ts), kjører oppvarmingen kun når
 * Playwright faktisk skal kjøre skjema-tester — og nøyaktig én gang for hele gruppen.
 *
 * Hvorfor i det hele tatt varme opp: kald oppstart (skjema-api JVM, wonderwall sin første
 * OIDC-veksling, skjema-web sin første render + kald create-draft-POST) gjorde at den FØRSTE
 * skjema-testen kunne time ut på 60 s og passere på retry. Vi betaler kald-start-kostnaden her —
 * utenfor test-timeouten — slik at første ekte test blir rask.
 *
 * Best-effort: hopper raskt over hvis skjema-web ikke svarer, og svelger alle feil —
 * oppvarming skal ALDRI velte testkjøringen. Skru av lokalt med SKIP_SKJEMA_WARMUP=true.
 */
setup('varm opp skjema-stacken', async ({ page }) => {
  if (process.env.SKIP_SKJEMA_WARMUP === 'true') {
    console.log('⏭️  SKIP_SKJEMA_WARMUP=true → hopper over skjema-oppvarming');
    return;
  }

  // Rask tilgjengelighetssjekk — hopp ut umiddelbart hvis skjema-stacken ikke kjører.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(SkjemaAuthHelper.BASE_URL, { redirect: 'manual', signal: controller.signal });
  } catch {
    console.log('⏭️  Skjema-web svarer ikke — hopper over oppvarming (ikke-skjema-kjøring?)');
    return;
  } finally {
    clearTimeout(timer);
  }

  console.log('🔥 Varmer opp skjema-stacken (én innlogging)...');
  try {
    const auth = new SkjemaAuthHelper(page);
    await auth.login(); // browser → wonderwall → mock-oauth2 → skjema-web → /representasjon
    // Kjør én KOMPLETT innsending, slik at alle skjema-api-endepunktene (opprett utkast, lagre
    // hvert steg, send inn) og step-renderne er JVM-varme før første ekte test. En login-only
    // oppvarming holdt ikke: første test stallet på "Start søknad" (kald create-draft-POST).
    // Bonus: varmer også melosys-api sin Kafka-consumer for mottaket.
    const soknad = new SoknadUtsendtArbeidstakerPage(page);
    const { referanse } = await soknad.fyllUtOgSendInnKomplettSoknad();
    console.log(`✅ Skjema-stacken er varmet opp (komplett innsending, ref ${referanse})`);
  } catch (e) {
    console.warn('⚠️  Skjema-oppvarming feilet (ikke-fatalt):', (e as Error).message);
  }
});
