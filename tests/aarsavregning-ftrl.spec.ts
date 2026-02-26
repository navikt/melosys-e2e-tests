import { test } from '../fixtures';
import { AuthHelper } from '../helpers/auth-helper';
import { HovedsidePage } from '../pages/hovedside.page';
import { OpprettNySakPage } from '../pages/opprett-ny-sak/opprett-ny-sak.page';
import { AarsavregningPage } from '../pages/behandling/aarsavregning.page';
import { VedtakPage } from '../pages/vedtak/vedtak.page';
import {
  USER_ID_VALID,
  SAKSTYPER,
  SAKSTEMA,
  BEHANDLINGSTEMA,
  AARSAK,
  BEHANDLINGSTYPE,
} from '../pages/shared/constants';

test.describe('Årsavregning FTRL workflow', () => {
  test('should create and complete årsavregning behandling', async ({ page }) => {
    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    // Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const aarsavregning = new AarsavregningPage(page);
    const vedtak = new VedtakPage(page);

    // --- Step 1: Navigate to main page and open "Opprett ny sak" ---
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();

    // --- Step 2: Create new case ---
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgOpprettNySak();
    await opprettSak.velgSakstype(SAKSTYPER.FTRL);
    await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
    await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.YRKESAKTIV);
    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    // Select ÅRSAVREGNING behandlingstype
    await page.getByLabel('Behandlingstype').selectOption(BEHANDLINGSTYPE.ÅRSAVREGNING);
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    // --- Step 3: Open the created behandling ---
    // The link text is dynamic (includes name, dates), so match on fnr
    await page
      .getByRole('link', { name: new RegExp(`${USER_ID_VALID}`) })
      .first()
      .click();

    // --- Step 4: Fill in Årsavregning behandling ---
    await aarsavregning.ventPåSideLastet();
    await aarsavregning.velgÅr('2025');
    await aarsavregning.svarNei();
    await aarsavregning.velgBestemmelse('FTRL_KAP2_2_1');
    await aarsavregning.velgFraOgMedPeriode('mandag 6');
    await aarsavregning.velgTilOgMedPeriode('søndag 12');
    await aarsavregning.velgSkattepliktig(false);
    await aarsavregning.velgInntektskilde('ARBEIDSINNTEKT');
    await aarsavregning.fyllInnBruttoinntektMedApiVent('3213');
    await aarsavregning.klikkBekreftOgFortsett();

    // --- Step 5: Fatt vedtak ---
    await vedtak.klikkFattVedtak();
  });
});
