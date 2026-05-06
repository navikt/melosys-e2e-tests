import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { AarsavregningPage } from '../../pages/behandling/aarsavregning.page';
import { EuEosPensjonistBehandlingPage } from '../../pages/behandling/eu-eos-pensjonist-behandling.page';
import { TrygdeavgiftPage } from '../../pages/trygdeavgift/trygdeavgift.page';
import {
  AARSAK,
  BEHANDLINGSTEMA,
  SAKSTEMA,
  SAKSTYPER,
  USER_ID_VALID,
} from '../../pages/shared/constants';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';

test.describe('EU/EØS Trygdeavgift - Pensjonist med årsavregning', () => {
  test('skal fullføre pensjonistbehandling og opprette årsavregning for samme sak', async ({ page }) => {
    test.setTimeout(180000);

    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const pensjonistBehandling = new EuEosPensjonistBehandlingPage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const aarsavregning = new AarsavregningPage(page);
    const vedtak = new VedtakPage(page);

    // Step 1: Opprett EU/EØS trygdeavgiftssak for pensjonist
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype(SAKSTYPER.EU_EOS);
    await opprettSak.velgSakstema(SAKSTEMA.TRYGDEAVGIFT);
    await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.PENSJONIST);
    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Step 2: Åpne behandlingen og fyll inn periode + bostedsland
    console.log('📝 Venter på prosessinstanser etter opprettelse av pensjonistbehandling...');
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();
    await page.getByRole('link', { name: /TRIVIELL KARAFFEL -/ }).first().click();
    await pensjonistBehandling.fyllUtPeriodeOgBostedsland('01.04.2024', '05.04.2024', 'BE');
    await pensjonistBehandling.klikkBekreftOgFortsett();

    // Step 3: Fyll inn trygdeavgift og send behandlingen
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('PENSJON');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('32313');
    await trygdeavgift.klikkBekreftOgFortsett();

    await pensjonistBehandling.assertions.verifiserBekreftOgSendSynlig();
    await pensjonistBehandling.klikkBekreftOgSend();

    // Step 4: Vent til første behandling er sendt før årsavregning opprettes
    console.log('📝 Venter på prosessinstanser etter innsending av pensjonistbehandling...');
    await waitForProcessInstances(page.request, 60);
    await hovedside.goto();

    // Step 5: Opprett årsavregning på eksisterende sak
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgPensjonistAarsavregning();
    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Step 6: Åpne årsavregning og fullfør til vedtak
    console.log('📝 Venter på prosessinstanser etter opprettelse av årsavregning...');
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();
    await page.getByRole('link', { name: /TRIVIELL KARAFFEL -/ }).first().click();

    await aarsavregning.ventPåSideLastet();
    await aarsavregning.velgÅr('2024');
    await aarsavregning.klikkBekreftOgFortsett();
    await page.getByRole('button', { name: 'Bekreft og fortsett' }).click();

    await expect(page.getByRole('button', { name: 'Fatt vedtak' })).toBeVisible();
    await vedtak.klikkFattVedtak();
  });
});
