import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { AarsavregningPage } from '../../pages/behandling/aarsavregning.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import {
  USER_ID_VALID,
  SAKSTYPER,
  SAKSTEMA,
  BEHANDLINGSTEMA,
  AARSAK,
  BEHANDLINGSTYPE,
} from '../../pages/shared/constants';
import { runAndWaitForProcessInstances } from '../../helpers/api-helper';

test.describe('Årsavregning FTRL - Komplett arbeidsflyt', () => {
  test('skal opprette og fullføre årsavregning behandling', async ({ page }) => {
    // Øk test timeout til 120 sekunder (vedtak kan ta lang tid på CI)
    test.setTimeout(120000);

    // Oppsett
    const auth = new AuthHelper(page);
    await auth.login();

    // Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const aarsavregning = new AarsavregningPage(page);
    const vedtak = new VedtakPage(page);

    // --- Steg 1: Naviger til hovedside og åpne "Opprett ny sak" ---
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();

    // --- Steg 2: Opprett ny sak ---
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgOpprettNySak();
    await opprettSak.velgSakstype(SAKSTYPER.FTRL);
    await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
    await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.YRKESAKTIV);
    await opprettSak.velgBehandlingstype(BEHANDLINGSTYPE.ÅRSAVREGNING);
    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    await opprettSak.leggBehandlingIMine();
    await runAndWaitForProcessInstances(
      page.request,
      async () => {
        await opprettSak.klikkOpprettNyBehandling();
        await opprettSak.assertions.verifiserBehandlingOpprettet();
      }, { timeoutSeconds: 30 }
    );

    // --- Steg 3: Åpne behandlingen ---
    await hovedside.goto();

    // Lenketeksten er dynamisk (inkluderer navn, datoer), match på fnr
    await page
      .getByRole('link', { name: new RegExp(`${USER_ID_VALID}`) })
      .first()
      .click();

    // --- Steg 4: Fyll inn årsavregning ---
    await aarsavregning.ventPåSideLastet();
    await aarsavregning.velgÅr('2025');
    await aarsavregning.svarNei();
    await aarsavregning.velgBestemmelse('FTRL_KAP2_2_1');
    await aarsavregning.velgFraOgMedPeriode('06.01.2025');
    await aarsavregning.velgTilOgMedPeriode('12.01.2025');
    await aarsavregning.velgSkattepliktig(false);
    await aarsavregning.velgInntektskilde('ARBEIDSINNTEKT');
    await aarsavregning.fyllInnBruttoinntektMedApiVent('3213');
    await aarsavregning.klikkBekreftOgFortsett();

    // --- Steg 5: Fatt vedtak ---
    // --- Steg 6: Hard sluttilstand - vent på iverksetting + verifiser DB end-state ---
    // Årsavregningsbehandlingen er nyeste behandling (ren DB per fixture): skal være
    // AVSLUTTET med behandlingsresultat og alle prosessinstanser FERDIG.
    await runAndWaitForProcessInstances(
      page.request,
      () => vedtak.klikkFattVedtak(),
      { timeoutSeconds: 60 }
    );
    await vedtak.assertions.verifiserBehandlingAvsluttet();
  });
});
