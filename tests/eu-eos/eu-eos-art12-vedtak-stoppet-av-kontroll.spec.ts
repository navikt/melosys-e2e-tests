import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { SendBrevPanel } from '../../pages/shared/send-brev-panel.page';
import {
  fattVedtakOgForventKontrollfeil,
  hentBehandlingstilstand,
  sporForhåndskontroll,
  ventPåForhåndskontroll,
  verifiserVedtakIkkeFattet,
} from '../../pages/shared/stoppet-vedtak.assertions';
import { USER_ID_VALID } from '../../pages/shared/constants';
import { runAndWaitForProcessInstances } from '../../helpers/api-helper';

/**
 * MELOSYS-8307: et EØS-vedtak som stoppes av vedtakskontrollen, skal ikke etterlate
 * resultattypen FASTSATT_LOVVALGSLAND uten vedtaksmetadata.
 *
 * Forhåndskontrollen på vedtakssteget deaktiverer «Fatt vedtak» når den finner feil.
 * Kontrollen i /fatt slår derfor bare til når tilstanden endrer seg etter forhåndskontrollen.
 * Et brevutkast lagret fra «Send brev»-fanen gjør det: utkastet gir kontrollfeilen
 * ÅPENT_UTKAST, men forhåndskontrollen kjøres ikke på nytt, så knappen er fortsatt aktiv.
 *
 * Slik gjør du det samme for hånd i q2:
 * 1. Behandle en art. 12.1-sak fram til vedtakssteget og velg mottakerinstitusjon.
 * 2. Åpne «Send brev» i sidepanelet, velg mottaker og brevmal, og klikk «Lagre utkast».
 * 3. Klikk «Fatt vedtak». Siden viser «Det finnes et åpent brevutkast …», og /fatt svarer 400.
 * 4. Last behandlingen på nytt og se på GET /api/behandlinger/{id}/resultat i nettverksfanen:
 *    `behandlingsresultatTypeKode` skal være IKKE_FASTSATT og `vedtakstype` null.
 *    Uten fiksen er typen FASTSATT_LOVVALGSLAND.
 */
test.describe('EU/EØS art. 12 - vedtak stoppet av kontroll', () => {
  test.describe.configure({ timeout: 120_000 });

  test('stoppet vedtak etterlater ikke resultattypen', async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new EuEosBehandlingPage(page);
    const sendBrev = new SendBrevPanel(page);

    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype('EU_EOS');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('UTSENDT_ARBEIDSTAKER');
    await behandling.fyllInnFraTilDato('01.01.2024', '31.12.2025');
    await behandling.velgLand('Danmark');
    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await runAndWaitForProcessInstances(
      page.request,
      () => opprettSak.klikkOpprettNyBehandling(),
      { timeoutSeconds: 30 }
    );
    await hovedside.goto();
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    await page.waitForLoadState('networkidle');

    await behandling.klikkBekreftOgFortsett();
    await behandling.velgYrkesaktivEllerSelvstendigOgFortsett(true);
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
    await behandling.velgArbeidstype(true);
    await behandling.svarJaOgFortsett();
    await behandling.svarJaOgFortsett();
    await behandling.innvilgeSøknad();
    const forhåndskontroll = sporForhåndskontroll(page);
    await behandling.klikkBekreftOgFortsett();
    await behandling.velgMottakerInstitusjon();
    await ventPåForhåndskontroll(forhåndskontroll);

    await sendBrev.lagreUtkast('Bruker eller brukers fullmektig', 'Melding om forventet saksbehandlingstid');
    const før = await hentBehandlingstilstand();

    await fattVedtakOgForventKontrollfeil(page, 'ÅPENT_UTKAST');
    await expect(page.getByText('Det finnes et åpent brevutkast')).toBeVisible({ timeout: 10000 });

    await verifiserVedtakIkkeFattet(før, 'FASTSATT_LOVVALGSLAND');
  });
});
