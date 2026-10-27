import { expect, test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { verifiserAarsavregningBehandling } from '../../pages/behandling/aarsavregning.assertions';
import { setupPensjonistUtenGrunnlagMedAutoAarsavregning } from './pensjonist-aarsavregning-setup';

/**
 * EU/EØS Trygdeavgift - Pensjonist årsavregning UTEN tidligere grunnlag
 * (MELOSYS-7954/7271, MELOSYS-8163)
 *
 * Når førstegangsbehandlingens periode i sin helhet ligger i et tidligere år og
 * default-togglene står, lagres det ikke noe trygdeavgiftsgrunnlag, og årsavregningen
 * auto-opprettes ved «Bekreft og send» med året forhåndsvalgt.
 *
 * melosys-web blokkerer årsavregningsflyten for EØS pensjonist når
 * melosys.arsavregning.eos_pensjonist er på (PÅ by default). «Uten grunnlag»-skjemaet
 * («Innbetalt trygdeavgift», beregn/oppgi endelig avgift) rendres derfor ikke, og
 * årsavregningen blir stående UNDER_BEHANDLING.
 *
 * NB: ingen UnleashHelper-kall her — poenget er DEFAULT toggle-state.
 */

const ÅR = '2024';

test.describe('EU/EØS Trygdeavgift - Pensjonist årsavregning uten grunnlag', () => {
  test('auto-opprettet årsavregning uten grunnlag er blokkert og skjemaet vises ikke', async ({ page }) => {
    test.setTimeout(240000);

    const auth = new AuthHelper(page);
    await auth.login();

    const { aarsavregning, behandlingId } = await setupPensjonistUtenGrunnlagMedAutoAarsavregning(page);

    await aarsavregning.ventPåSideLastet();
    // Auto-opprettet årsavregning kjenner året fra førstegangen, men velgeren er låst.
    await aarsavregning.assertions.verifiserValgtÅr(ÅR);
    await expect(page.locator('#aarVelger'), 'Årsvelgeren skal være deaktivert').toBeDisabled();

    await new EuEosBehandlingPage(page).assertions.verifiserÅrsavregningIkkeStøttet();
    await expect(
      page.getByRole('textbox', { name: 'Innbetalt trygdeavgift' }),
      '«Uten grunnlag»-skjemaet skal ikke rendres når flyten er blokkert'
    ).toHaveCount(0);

    await verifiserAarsavregningBehandling(behandlingId, {
      forventetStatus: 'UNDER_BEHANDLING',
      forventetResultatType: 'IKKE_FASTSATT',
      forventetAar: Number(ÅR),
    });
    console.log('✅ Uten-grunnlag-årsavregningen er opprettet, men blokkert');
  });
});
