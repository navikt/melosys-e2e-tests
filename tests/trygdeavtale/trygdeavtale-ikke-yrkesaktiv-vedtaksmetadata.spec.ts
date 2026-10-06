import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { runAndWaitForProcessInstances } from '../../helpers/api-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { IkkeYrkesaktivBehandlingPage } from '../../pages/behandling/ikke-yrkesaktiv-behandling.page';
import { verifiserBehandlingSluttilstand } from '../../pages/shared/behandling-sluttilstand.assertions';
import { verifiserVedtaksmetadata } from '../../pages/shared/vedtaksmetadata.assertions';
import {
  AARSAK,
  ARBEIDSLAND,
  BEHANDLINGSTEMA,
  SAKSTEMA,
  SAKSTYPER,
  USER_ID_VALID,
} from '../../pages/shared/constants';

/**
 * MELOSYS-8337: et fattet vedtak for en ikke-yrkesaktiv på en trygdeavtalesak skal lagre
 * vedtaksmetadata (vedtaksdato, vedtakstype og klagefrist), slik vedtak for andre
 * behandlingstema gjør.
 *
 * Flyt: opprett trygdeavtalesak med behandlingstema IKKE_YRKESAKTIV → oppgi periode og
 * Australia → innvilg med art. 11 → fatt vedtak → iverksettingen går ferdig.
 */
test.describe('Trygdeavtale - ikke-yrkesaktiv vedtaksmetadata (MELOSYS-8337)', () => {
  test('fattet vedtak lagrer vedtaksmetadata', async ({ page }) => {
    test.setTimeout(180000);

    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const ikkeYrkesaktiv = new IkkeYrkesaktivBehandlingPage(page);

    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype(SAKSTYPER.TRYGDEAVTALE);
    await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
    await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.IKKE_YRKESAKTIV);
    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    await opprettSak.leggBehandlingIMine();
    await runAndWaitForProcessInstances(
      page.request,
      async () => {
        await opprettSak.klikkOpprettNyBehandling();
        await opprettSak.assertions.verifiserBehandlingOpprettet();
      },
      { timeoutSeconds: 30 }
    );

    await hovedside.goto();
    await hovedside.åpneBehandling('TRIVIELL KARAFFEL -');

    await ikkeYrkesaktiv.fyllUtSøknadsopplysninger('01.01.2024', '31.12.2025', ARBEIDSLAND.AUSTRALIA);
    await ikkeYrkesaktiv.bekreftOgFortsett();
    await ikkeYrkesaktiv.innvilgOgVelgBestemmelse('AUS_ART11');

    await runAndWaitForProcessInstances(page.request, () => ikkeYrkesaktiv.fattVedtak(), {
      timeoutSeconds: 60,
    });

    const behandlingId = await verifiserBehandlingSluttilstand({
      forventetResultatType: 'FASTSATT_LOVVALGSLAND',
      forventetIverksettProsess: 'IVERKSETT_VEDTAK_IKKE_YRKESAKTIV',
    });
    await verifiserVedtaksmetadata(behandlingId, { vedtakstype: 'FØRSTEGANGSVEDTAK' });
  });
});
