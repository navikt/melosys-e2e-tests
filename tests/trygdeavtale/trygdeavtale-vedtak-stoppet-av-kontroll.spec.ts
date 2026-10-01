import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { TrygdeavtaleBehandlingPage } from '../../pages/behandling/trygdeavtale-behandling.page';
import { TrygdeavtaleArbeidsstedPage } from '../../pages/behandling/trygdeavtale-arbeidssted.page';
import { SendBrevPanel } from '../../pages/shared/send-brev-panel.page';
import {
  fattVedtakOgForventKontrollfeil,
  hentBehandlingstilstand,
  sporForhåndskontroll,
  ventPåForhåndskontroll,
  verifiserVedtakIkkeFattet,
} from '../../pages/shared/stoppet-vedtak.assertions';
import { USER_ID_VALID } from '../../pages/shared/constants';

/**
 * MELOSYS-8307: et trygdeavtalevedtak som stoppes av vedtakskontrollen, skal ikke etterlate
 * resultattypen FASTSATT_LOVVALGSLAND uten vedtaksmetadata.
 *
 * Samme oppskrift som EØS-testen (`eu-eos-art12-vedtak-stoppet-av-kontroll.spec.ts`): et
 * brevutkast lagret på vedtakssteget gir kontrollfeilen ÅPENT_UTKAST i /fatt, mens
 * «Fatt vedtak» fortsatt er aktiv. For hånd i q2: behandle en trygdeavtalesak fram til
 * vedtakssteget, lagre et brevutkast fra «Send brev» og klikk «Fatt vedtak».
 */
test.describe('Trygdeavtale - vedtak stoppet av kontroll', () => {
  test.describe.configure({ timeout: 120_000 });

  test('stoppet vedtak etterlater ikke resultattypen', async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new TrygdeavtaleBehandlingPage(page);
    const arbeidssted = new TrygdeavtaleArbeidsstedPage(page);
    const sendBrev = new SendBrevPanel(page);

    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype('TRYGDEAVTALE');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('YRKESAKTIV');
    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

    await behandling.fyllUtPeriodeOgLand('01.01.2024', '01.01.2026', 'AU');
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
    const forhåndskontroll = sporForhåndskontroll(page);
    await behandling.innvilgeOgVelgBestemmelse('AUS_ART9_3');
    await arbeidssted.åpneArbeidsstedSeksjon();
    await arbeidssted.leggTilArbeidssted('Test');
    await arbeidssted.klikkBekreftOgFortsettHvisVises();
    await ventPåForhåndskontroll(forhåndskontroll);

    await sendBrev.lagreUtkast('Bruker eller brukers fullmektig', 'Melding om forventet saksbehandlingstid');
    const før = await hentBehandlingstilstand();

    await fattVedtakOgForventKontrollfeil(page, 'ÅPENT_UTKAST');
    await expect(page.getByText('Det finnes et åpent brevutkast')).toBeVisible({ timeout: 10000 });

    await verifiserVedtakIkkeFattet(før, 'FASTSATT_LOVVALGSLAND');
  });
});
