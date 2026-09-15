import { expect, test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { UnleashHelper } from '../../helpers/unleash-helper';
import { setupPensjonistUtenGrunnlagMedAutoAarsavregning } from '../aarsavregning/pensjonist-aarsavregning-setup';

/**
 * MELOSYS-8163: Automatisk årsavregning ved vedtak for EU/EØS pensjonist
 *
 * Spec: specs/aarsavregning-automatisk-eos-tjenesteperson-pensjonist.md
 *
 * Vedtak for et tidligere år oppretter årsavregningen automatisk, uten innhentingsbrev. Frem til
 * melosys.arsavregning.eos_pensjonist er satt i produksjon viser årsavregningsflyten en
 * blokkerende melding. I testmiljøet er togglen på, så testen slår den av.
 *
 * Tjenesteperson-scenariet (art. 11.3b) ligger i eu-eos-art11-3b-medlemskap-offentlig-tjenesteperson.spec.ts.
 * Der er togglen av som standard, slik som i produksjon.
 */

const BLOKKERENDE_MELDING_TESTID = 'aarsavregning-ikke-stottet-sakstype';
const BLOKKERENDE_MELDING_TEKST =
  /Melosys støtter ikke årsavregning for denne kombinasjonen av sakstype.{0,2}tema/i;

/**
 * melosys-web henter featuretoggles én gang per SPA-økt fra melosys-api, som igjen ligger bak
 * sin egen Unleash-poll. Et `disableFeature`-kall rett før sjekken kan derfor treffe et vindu der
 * web fortsatt ser togglen som på. Vi reloader i en løkke i stedet for å stole på én reload.
 */
async function ventPåBlokkerendeMelding(page: import('@playwright/test').Page): Promise<void> {
  const melding = page.getByTestId(BLOKKERENDE_MELDING_TESTID);

  await expect
    .poll(
      async () => {
        if (await melding.isVisible().catch(() => false)) {
          return true;
        }
        await page.reload();
        await page.waitForLoadState('networkidle').catch(() => {});
        return melding.isVisible().catch(() => false);
      },
      {
        message: `Venter på blokkerende melding (${BLOKKERENDE_MELDING_TESTID}) — kan henge på melosys-api sin Unleash-poll-lag`,
        timeout: 45_000,
        intervals: [3_000],
      }
    )
    .toBe(true);

  await expect(melding).toHaveText(BLOKKERENDE_MELDING_TEKST);
}

test.describe('Automatisk årsavregning for EU/EØS pensjonist (MELOSYS-8163)', () => {
  test('EØS pensjonist: auto-opprettet årsavregning viser blokkerende melding før togglen er satt i produksjon', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const auth = new AuthHelper(page);
    const unleash = new UnleashHelper(request);

    // Brev-fraværet dekkes av scenario 4 i aarsavregning-innhentingsbrev-saksbehandlingsflyt.spec.ts.
    // Den blokkerende meldingen for pensjonist asserteres bare her.
    await unleash.disableFeature('melosys.arsavregning.eos_pensjonist');
    await auth.login();

    console.log('📝 EØS-pensjonist saksbehandlingsflyt → auto-opprettet årsavregning...');
    await setupPensjonistUtenGrunnlagMedAutoAarsavregning(page);

    console.log('🔍 Verifiserer blokkerende melding i årsavregningsflyten...');
    await ventPåBlokkerendeMelding(page);
    await new EuEosBehandlingPage(page).assertions.verifiserÅrsavregningIkkeStøttet();

    await waitForProcessInstances(page.request, 30);
  });
});
