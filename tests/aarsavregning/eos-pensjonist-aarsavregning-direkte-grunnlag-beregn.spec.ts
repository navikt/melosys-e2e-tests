import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { UnleashHelper } from '../../helpers/unleash-helper';
import {
  PENSJONIST_AARSAVREGNING_TEST_DATA,
  setupPensjonistMedAarsavregning,
} from './pensjonist-aarsavregning-setup';

test.describe('EU/EØS Trygdeavgift - Pensjonist med årsavregning', () => {
  // MELOSYS-8163: melosys-web blokkerer årsavregningsflyten for EØS pensjonist når
  // melosys.arsavregning.eos_pensjonist er på (useErÅrsavregningIkkeStøttetSakstype). Togglen er på
  // som standard, så flyten kan ikke fullføres. Blokkeringen verifiseres i
  // tests/eu-eos/aarsavregning-automatisk-eos-pensjonist.spec.ts. Ta testen i bruk igjen når
  // blokkeringen fjernes.
  test.fixme('skal fullføre pensjonistbehandling og opprette årsavregning for samme sak', async ({ page, request }) => {
    test.setTimeout(180000);

    const auth = new AuthHelper(page);
    const unleash = new UnleashHelper(request);
    await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');
    await auth.login();

    const { aarsavregning, vedtak } = await setupPensjonistMedAarsavregning(page);

    await aarsavregning.ventPåSideLastet();
    await aarsavregning.velgÅr(PENSJONIST_AARSAVREGNING_TEST_DATA.år);
    // Dette scenariet bruker tidligere grunnlag direkte og går derfor via en egen resultatside.
    await aarsavregning.klikkBekreftOgFortsett();
    await aarsavregning.klikkBekreftPåResultatside();

    await vedtak.assertions.verifiserFattVedtakKnapp();
    await vedtak.klikkFattVedtak();
  });
});
