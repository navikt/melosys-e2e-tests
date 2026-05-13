import { test } from '../../fixtures';
import {
  PENSJONIST_AARSAVREGNING_TEST_DATA,
  setupPensjonistMedAarsavregning,
} from './pensjonist-aarsavregning-setup';

test.describe('EU/EØS Trygdeavgift - Pensjonist med årsavregning', () => {
  test('skal fullføre pensjonistbehandling og opprette årsavregning for samme sak', async ({ page }) => {
    test.setTimeout(180000);

    const { aarsavregning, vedtak } = await setupPensjonistMedAarsavregning(page);

    await aarsavregning.ventPåSideLastet();
    await aarsavregning.velgÅr(PENSJONIST_AARSAVREGNING_TEST_DATA.år);
    await aarsavregning.klikkBekreftOgFortsett();
    await aarsavregning.klikkBekreftPaaResultatside();

    await vedtak.assertions.verifiserFattVedtakKnapp();
    await vedtak.klikkFattVedtak();
  });
});
