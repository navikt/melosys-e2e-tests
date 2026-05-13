import { test } from '../../fixtures';
import {
  PENSJONIST_AARSAVREGNING_TEST_DATA,
  setupPensjonistMedAarsavregning,
} from './pensjonist-aarsavregning-setup';

test.describe('EU/EØS Trygdeavgift - Pensjonist årsavregning med avvik', () => {
  test('skal fullføre pensjonistbehandling og årsavregning med innbetalt avvik', async ({ page }) => {
    test.setTimeout(180000);

    const { aarsavregning, vedtak } = await setupPensjonistMedAarsavregning(page);

    await aarsavregning.ventPåSideLastet();
    await aarsavregning.velgÅr(PENSJONIST_AARSAVREGNING_TEST_DATA.år);
    await aarsavregning.velgAvvikerInnbetalt(true);
    await aarsavregning.fyllInnInnbetaltTrygdeavgiftMedApiVent(
      PENSJONIST_AARSAVREGNING_TEST_DATA.innbetaltAvvik
    );
    await aarsavregning.velgSkattepliktig(false);
    await aarsavregning.velgInntektskilde(PENSJONIST_AARSAVREGNING_TEST_DATA.inntektskilde);
    await aarsavregning.fyllInnBruttoinntektMedApiVent(
      PENSJONIST_AARSAVREGNING_TEST_DATA.bruttoinntektAvvik
    );
    await aarsavregning.klikkBekreftOgFortsett();

    await vedtak.assertions.verifiserFattVedtakKnapp();
    await vedtak.klikkFattVedtak();
  });
});
