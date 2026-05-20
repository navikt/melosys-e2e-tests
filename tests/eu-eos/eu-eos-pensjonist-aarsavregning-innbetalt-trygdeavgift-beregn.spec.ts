import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { UnleashHelper } from '../../helpers/unleash-helper';
import {
  PENSJONIST_AARSAVREGNING_TEST_DATA,
  setupPensjonistMedAarsavregning,
} from './pensjonist-aarsavregning-setup';

test.describe('EU/EØS Trygdeavgift - Pensjonist årsavregning med avvik', () => {
  test('skal fullføre pensjonistbehandling og årsavregning med innbetalt avvik', async ({ page, request }) => {
    test.setTimeout(180000);

    const auth = new AuthHelper(page);
    const unleash = new UnleashHelper(request);
    await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');
    await auth.login();

    const { aarsavregning, vedtak } = await setupPensjonistMedAarsavregning(page);

    await aarsavregning.ventPåSideLastet();
    await aarsavregning.velgÅr(PENSJONIST_AARSAVREGNING_TEST_DATA.år);
    await aarsavregning.velgAvvikerInnbetalt(true);
    await aarsavregning.fyllInnInnbetaltTrygdeavgift(
      PENSJONIST_AARSAVREGNING_TEST_DATA.innbetaltAvvik
    );
    await aarsavregning.velgSkattepliktig(false);
    await aarsavregning.velgInntektskilde(PENSJONIST_AARSAVREGNING_TEST_DATA.inntektskilde);
    await aarsavregning.fyllInnBruttoinntektMedApiVent(
      PENSJONIST_AARSAVREGNING_TEST_DATA.aarsavregningBruttoinntekt
    );
    await aarsavregning.klikkBekreftOgFortsett();

    await vedtak.assertions.verifiserFattVedtakKnapp();
    await vedtak.klikkFattVedtak();
  });
});
