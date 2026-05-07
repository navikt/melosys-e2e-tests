import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../../pages/behandling/medlemskap.page';
import { LovvalgPage } from '../../pages/behandling/lovvalg.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import { USER_ID_VALID, SAKSTYPER, SAKSTEMA, BEHANDLINGSTEMA, AARSAK } from '../../pages/shared/constants';
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

    // Step 2: Open behandling
    console.log('Step 2: Opening behandling...');
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

    // Step 3: Medlemskap - Velg land, full dekning
    console.log('Step 3: Filling medlemskap...');
    // Datovelger: Fra og med
    await page.getByRole('button', { name: 'Åpne datovelger' }).first().click();
    await page.getByRole('dialog').getByLabel('År').selectOption('2025');
    await page.getByRole('button', { name: /\b16\b/ }).click();
    // Datovelger: Til og med
    await page.getByRole('button', { name: 'Åpne datovelger' }).nth(1).click();
    await page.getByRole('button', { name: /\b16\b/ }).click();
    // Land og trygdedekning
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
    console.log('Step 6: Verifying årsavregning was auto-created...');
    await waitForProcessInstances(page.request, 60);
    await hovedside.goto();

    const aarsavregningLink = page.getByRole('link', { name: new RegExp(`${USER_ID_VALID}.*Pensjonist.*Årsavregning`) });
    await expect(aarsavregningLink).toBeVisible({ timeout: 15000 });
    console.log('✅ Årsavregning-behandling er automatisk opprettet');
  });
});
