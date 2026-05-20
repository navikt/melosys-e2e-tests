import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../../pages/behandling/medlemskap.page';
import { LovvalgPage } from '../../pages/behandling/lovvalg.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import { USER_ID_VALID, SAKSTYPER, SAKSTEMA, BEHANDLINGSTEMA, AARSAK, FORRIGE_AAR } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';

/**
 * Komplett saksflyt for FTRL Pensjonist - Automatisk årsavregning
 *
 * Tester:
 * - Opprettelse av FTRL-sak med behandlingstema PENSJONIST
 * - Medlemskap: Velg land fra liste, full dekning FTRL
 * - Lovvalg: 2-1 fjerde ledd med alle vilkår oppfylt
 * - Vedtak: Fullføring av saksflyt
 * - Verifisering: Årsavregning-behandling opprettes automatisk
 */
test.describe('FTRL Pensjonist - Automatisk årsavregning', () => {
  test('skal automatisk opprette årsavregning etter vedtak på pensjonist-sak', async ({ page }) => {
    test.setTimeout(120000);

    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    // Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const medlemskap = new MedlemskapPage(page);
    const lovvalg = new LovvalgPage(page);
    const vedtak = new VedtakPage(page);

    // Step 1: Create case
    console.log('Step 1: Creating new FTRL Pensjonist case...');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgOpprettNySak();
    await opprettSak.velgSakstype(SAKSTYPER.FTRL);
    await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
    await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.PENSJONIST);
    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Vent på at asynkrone prosessinstanser fra saksopprettelsen er ferdige
    console.log('Venter på prosessinstanser etter saksopprettelse...');
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();

    // Step 2: Open behandling
    console.log('Step 2: Opening behandling...');
    await hovedside.åpneBehandling('TRIVIELL KARAFFEL -');
    await page.waitForLoadState('networkidle');

    // Step 3: Medlemskap - Velg periode (foregående år), land, full dekning
    // Perioden må ligge i et foregående år for at årsavregning skal opprettes automatisk.
    console.log('Step 3: Filling medlemskap...');
    await medlemskap.velgPeriode(`01.01.${FORRIGE_AAR}`, `31.12.${FORRIGE_AAR}`);
    await medlemskap.velgLand('Afghanistan');
    await medlemskap.velgTrygdedekning('FULL_DEKNING_FTRL');
    await medlemskap.klikkBekreftOgFortsett();

    // Step 4: Lovvalg - 2-1 fjerde ledd
    console.log('Step 4: Filling lovvalg...');
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_1');
    await lovvalg.velgBrukersSituasjon('MIDLERTIDIG_2_1_FJERDE_LEDD');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker oppholdt seg eller');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Er søkers utenlandsopphold ment');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker lovlig opphold i');
    await lovvalg.klikkBekreftOgFortsett();
    await lovvalg.klikkBekreftOgFortsett();
    await lovvalg.klikkBekreftOgFortsett();

    // Step 5: Vedtak
    console.log('Step 5: Fatting vedtak...');
    await vedtak.klikkFattVedtak();

    // Step 6: Verifiser at årsavregning er automatisk opprettet
    // Lenken dukker opp i saksoversikten når den asynkrone auto-opprettelsen er ferdig;
    // ventPåBehandlingslenke laster saksoversikten på nytt til lenken er synlig.
    console.log('Step 6: Verifying årsavregning was auto-created...');
    await waitForProcessInstances(page.request, 60);
    await hovedside.goto();

    const aarsavregningLink = await hovedside.ventPåBehandlingslenke(
      new RegExp(`${USER_ID_VALID}.*Pensjonist.*Årsavregning`)
    );
    await expect(aarsavregningLink).toBeVisible({ timeout: 15000 });
    console.log('✅ Årsavregning-behandling er automatisk opprettet');
  });
});
