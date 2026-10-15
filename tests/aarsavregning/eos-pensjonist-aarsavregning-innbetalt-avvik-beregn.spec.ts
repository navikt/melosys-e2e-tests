import { expect, test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { UnleashHelper } from '../../helpers/unleash-helper';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { setupPensjonistMedAarsavregning } from './pensjonist-aarsavregning-setup';

/**
 * MELOSYS-8163: melosys-web blokkerer årsavregningsflyten for EØS pensjonist når
 * melosys.arsavregning.eos_pensjonist er på (standard i testmiljøet). Saksbehandleren kommer
 * ikke til «Innbetalt trygdeavgift», så avvik kan ikke registreres.
 */
test.describe('EU/EØS Trygdeavgift - Pensjonist årsavregning med avvik', () => {
  test('innbetalt avvik kan ikke registreres når årsavregningen er blokkert', async ({ page, request }) => {
    test.setTimeout(180000);

    const auth = new AuthHelper(page);
    const unleash = new UnleashHelper(request);
    await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');
    await auth.login();

    const { aarsavregning } = await setupPensjonistMedAarsavregning(page);

    await aarsavregning.ventPåSideLastet();
    await new EuEosBehandlingPage(page).assertions.verifiserÅrsavregningIkkeStøttet();
    await expect(page.locator('#aarVelger'), 'Årsvelgeren skal være deaktivert').toBeDisabled();
    await expect(
      page.locator('.innbetaltTrygdeavgiftRadioGroup'),
      'Spørsmålet om innbetalt trygdeavgift skal ikke vises'
    ).toHaveCount(0);
  });
});
