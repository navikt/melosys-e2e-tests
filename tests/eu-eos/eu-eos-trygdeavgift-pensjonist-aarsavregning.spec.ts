import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { UnleashHelper } from '../../helpers/unleash-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { TrygdeavgiftPensjonistBehandlingPage } from '../../pages/behandling/trygdeavgift-pensjonist-behandling.page';
import { AarsavregningPage } from '../../pages/behandling/aarsavregning.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import { waitForProcessInstances } from '../../helpers/api-helper';
import {
  USER_ID_VALID,
  SAKSTYPER,
  SAKSTEMA,
  BEHANDLINGSTEMA,
  AARSAK,
  BOSTEDSLAND,
  INNTEKTSKILDE,
} from '../../pages/shared/constants';

test.describe('EU/EØS Trygdeavgift Pensjonist - Førstegangsbehandling + Årsavregning', () => {
  test('skal opprette pensjonist førstegangsbehandling og deretter årsavregning', async ({ page, request }) => {
    // Vedtak + årsavregning can take a long time on CI
    test.setTimeout(180000);

    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    // Disable feature toggle that hides the second step of the wizard
    const unleash = new UnleashHelper(request);
    await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

    // Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const pensjonistBehandling = new TrygdeavgiftPensjonistBehandlingPage(page);
    const aarsavregning = new AarsavregningPage(page);
    const vedtak = new VedtakPage(page);

    // ═══════════════════════════════════════════════════════════════════
    // DEL 1: Førstegangsbehandling — EU/EØS Trygdeavgift Pensjonist
    // ═══════════════════════════════════════════════════════════════════

    // --- Steg 1: Naviger til hovedside og opprett ny sak ---
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();

    // --- Steg 2: Fyll ut saksopprettelse ---
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgOpprettNySak();
    await opprettSak.velgSakstype(SAKSTYPER.EU_EOS);
    await opprettSak.velgSakstema(SAKSTEMA.TRYGDEAVGIFT);
    await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.PENSJONIST);
    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // --- Steg 3: Vent på prosessinstanser ---
    console.log('📝 Venter på prosessinstanser etter saksopprettelse...');
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();

    // --- Steg 4: Åpne behandlingen ---
    await page
      .getByRole('link', { name: new RegExp(`${USER_ID_VALID}`) })
      .first()
      .click();

    // --- Steg 5: Fyll ut førstegangsbehandling wizard ---
    // Step 1: Periode og Bostedsland
    await pensjonistBehandling.ventPåSideLastet();
    await pensjonistBehandling.fyllInnFraOgMed('01.01.2023');
    await pensjonistBehandling.fyllInnTilOgMed('31.12.2023');
    await pensjonistBehandling.velgBostedsland(BOSTEDSLAND.FAROEYENE);
    await pensjonistBehandling.klikkBekreftOgFortsett();

    // Step 2: Yrkesaktiv, Inntektskilde, Bruttoinntekt
    await pensjonistBehandling.svarNeiYrkesaktiv();
    await pensjonistBehandling.velgInntektskilde(INNTEKTSKILDE.PENSJON);
    await pensjonistBehandling.fyllInnBruttoinntektMedApiVent('200000');

    // Step 3: Submit
    await pensjonistBehandling.klikkBekreftOgSend();
    console.log('✅ DEL 1 fullført: Førstegangsbehandling Bekreft og send');

    // --- Steg 6: Vent på vedtak prosessinstanser ---
    console.log('📝 Venter på prosessinstanser etter førstegangsvedtak...');
    await waitForProcessInstances(page.request, 60);

    // ═══════════════════════════════════════════════════════════════════
    // DEL 2: Årsavregning på samme sak
    // ═══════════════════════════════════════════════════════════════════

    // --- Steg 7: Gå til hovedside og opprett ny behandling (årsavregning) ---
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();

    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgFørsteEksisterendeSak();
    await opprettSak.velgÅrsavregningRadio();
    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // --- Steg 8: Vent på prosessinstanser ---
    console.log('📝 Venter på prosessinstanser etter årsavregning-opprettelse...');
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();

    // --- Steg 9: Åpne årsavregning-behandlingen ---
    await page
      .getByRole('link', { name: new RegExp(`${USER_ID_VALID}`) })
      .first()
      .click();

    // --- Steg 10: Fyll ut årsavregning ---
    await aarsavregning.ventPåSideLastet();
    await aarsavregning.velgÅr('2023');
    await aarsavregning.svarJa(); // Ja, har betalt trygdeavgift
    await aarsavregning.fyllInnTrygdeavgiftFra('5000');
    await aarsavregning.velgSkattepliktig(false); // Nei
    await aarsavregning.velgInntektskilde(INNTEKTSKILDE.PENSJON);
    await aarsavregning.fyllInnBruttoinntektMedApiVent('200000');
    await aarsavregning.klikkBekreftOgFortsett();

    // --- Steg 11: Fatt vedtak ---
    await vedtak.klikkFattVedtak();
    console.log('✅ DEL 2 fullført: Årsavregning vedtak fattet');
  });
});
