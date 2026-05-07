import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { ArbeidsforholdPage } from '../../pages/behandling/arbeidsforhold.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import { USER_ID_VALID, AARSAK } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';

/**
 * Komplett saksflyt for EØS Medlemskap Lovvalg - Offentlig tjenesteperson art.11(3)(b)
 *
 * Tester:
 * - Opprettelse av EU_EOS-sak med sakstema MEDLEMSKAP_LOVVALG og behandlingstema ARBEID_TJENESTEPERSON_ELLER_FLY
 * - Medlemskap: Bulgaria som arbeidsland
 * - Arbeidsforhold: Velg arbeidsgiver
 * - Lovvalg: Rfo. 883/2004 art.11(3)(b)
 * - Vedtak: Fullføring av saksflyt
 * - Verifisering: Årsavregning skal IKKE opprettes (melding "Du kan ikke årsavregne disse")
 */
test.describe('EØS Medlemskap Lovvalg - Offentlig tjenesteperson 11.3b', () => {
  test('skal fullføre sak og verifisere at årsavregning ikke kan opprettes', async ({ page }) => {
    test.setTimeout(120000);

    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    // Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const vedtak = new VedtakPage(page);

    // Step 1: Create case
    console.log('Step 1: Creating new EØS Medlemskap Lovvalg Offentlig tjenesteperson case...');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgOpprettNySak();
    await opprettSak.velgSakstype('EU_EOS');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('ARBEID_TJENESTEPERSON_ELLER_FLY');
    await opprettSak.velgAarsak(AARSAK.SØKNAD);

    // Datovelger: Fra og med
    await page.getByRole('button', { name: 'Åpne datovelger' }).first().click();
    await page.getByRole('dialog').getByLabel('År').selectOption('2024');
    await page.getByRole('button', { name: /\b9\b/ }).click();
    // Datovelger: Til og med
    await page.getByRole('button', { name: 'Åpne datovelger' }).nth(1).click();
    await page.getByRole('button', { name: /\b10\b/ }).click();

    // Arbeidsland
    await page.locator('div').filter({ hasText: /^Velg\.\.\.$/ }).nth(4).click();
    await page.getByRole('option', { name: 'Bulgaria' }).click();

    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Step 2: Open behandling
    console.log('Step 2: Opening behandling...');
    await page.getByRole('link', { name: new RegExp(`${USER_ID_VALID}.*Medlemskap og lovvalg.*Offentlig`) }).click();

    // Step 3: Medlemskap - Bekreft og fortsett
    console.log('Step 3: Confirming medlemskap...');
    await page.getByRole('button', { name: 'Bekreft og fortsett' }).click();

    // Step 4: Arbeidsforhold
    console.log('Step 4: Selecting arbeidsforhold...');
    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    // Step 5: Lovvalg - art.11(3)(b)
    console.log('Step 5: Selecting lovvalg...');
    await page.getByText('Rfo. 883/2004 art.11(3)(b)').click();
    await page.getByRole('button', { name: 'Bekreft og fortsett' }).click();

    // Step 6: Bekreft og fortsett (resultat)
    console.log('Step 6: Confirming resultat...');
    await page.getByRole('button', { name: 'Bekreft og fortsett' }).click();

    // Step 7: Vedtak
    console.log('Step 7: Fatting vedtak...');
    await vedtak.klikkFattVedtak();

    // Step 8: Verifiser at årsavregning IKKE kan opprettes
    console.log('Step 8: Verifying årsavregning cannot be created...');
    await waitForProcessInstances(page.request, 60);
    await hovedside.goto();

    await page.getByRole('link', { name: new RegExp(`${USER_ID_VALID}.*Medlemskap og lovvalg.*Offentlig`) }).click();
    await expect(page.getByText('Du kan ikke årsavregne disse')).toBeVisible({ timeout: 15000 });
    console.log('✅ Bekreftet: Årsavregning kan ikke opprettes for denne sakstypen');
  });
});
