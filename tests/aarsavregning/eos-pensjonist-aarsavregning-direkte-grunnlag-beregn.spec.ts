import { expect, test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { UnleashHelper } from '../../helpers/unleash-helper';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { setupPensjonistMedAarsavregning } from './pensjonist-aarsavregning-setup';

/**
 * MELOSYS-8163: melosys-web blokkerer årsavregningsflyten for EØS pensjonist når
 * melosys.arsavregning.eos_pensjonist er på (standard i testmiljøet). Årsavregningen kan
 * opprettes manuelt, men saksbehandleren kan verken velge år eller bekrefte steget.
 */
test.describe('EU/EØS Trygdeavgift - Pensjonist med årsavregning', () => {
  test('manuelt opprettet årsavregning for samme sak er blokkert når togglen er på', async ({ page, request }) => {
    test.setTimeout(180000);

    const auth = new AuthHelper(page);
    const unleash = new UnleashHelper(request);
    await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');
    await auth.login();

    const { aarsavregning } = await setupPensjonistMedAarsavregning(page);

    await aarsavregning.ventPåSideLastet();
    await new EuEosBehandlingPage(page).assertions.verifiserÅrsavregningIkkeStøttet();
    await expect(page.locator('#aarVelger'), 'Årsvelgeren skal være deaktivert').toBeDisabled();
  });
});
