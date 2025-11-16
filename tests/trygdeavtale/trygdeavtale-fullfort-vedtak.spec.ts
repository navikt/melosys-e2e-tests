import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { TrygdeavtaleBehandlingPage } from '../../pages/behandling/trygdeavtale-behandling.page';
import { TrygdeavtaleArbeidsstedPage } from '../../pages/behandling/trygdeavtale-arbeidssted.page';
import { USER_ID_VALID } from '../../pages/shared/constants';

/**
 * Complete Trygdeavtale workflow test
 *
 * Workflow:
 * 1. Create new Trygdeavtale case
 * 2. Fill in period and select arbeidsland (Australia)
 * 3. Select arbeidsgiver
 * 4. Approve søknad and select bestemmelse
 * 5. Add arbeidssted (workplace)
 * 6. Submit vedtak directly from behandling page (no separate vedtak page for Trygdeavtale)
 *
 * This test covers the complete flow from case creation to vedtak for Trygdeavtale.
 * Note: Unlike FTRL, Trygdeavtale does NOT have a separate vedtak page with text fields.
 */
test.describe('Trygdeavtale - Complete workflow', () => {
  test('should complete trygdeavtale workflow and submit vedtak', async ({ page }) => {
    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    // Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new TrygdeavtaleBehandlingPage(page);
    const arbeidssted = new TrygdeavtaleArbeidsstedPage(page);

    // Step 1: Navigate to hovedside and create new case
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();

    // Step 2: Fill in case creation form (Trygdeavtale)
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype('TRYGDEAVTALE');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('YRKESAKTIV');
    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    // Step 3: Verify case creation and navigate to behandling
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Click on user link to enter behandling (this is specific to Trygdeavtale workflow)
    // The link text contains the user's name from test data (e.g., "TRIVIELL KARAFFEL")
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

    // Step 4: Fill in period and arbeidsland
    await behandling.fyllInnPeriode('01.01.2024', '01.01.2026');
    await behandling.velgArbeidsland('AU'); // Australia
    await behandling.klikkBekreftOgFortsett();

    // Step 5: Select arbeidsgiver
    // Click html to ensure page is loaded (from recorded test)
    await page.locator('html').click();
    await behandling.velgArbeidsgiver('Ståles Stål AS');
    await behandling.klikkBekreftOgFortsett();

    // Step 6: Approve søknad and select bestemmelse
    await behandling.innvilgeSøknad();
    await behandling.velgBestemmelse('AUS_ART9_3');
    await behandling.klikkBekreftOgFortsett();

    // Step 7: Add arbeidssted (workplace)
    await arbeidssted.åpneArbeidsstedSeksjon();
    await arbeidssted.leggTilArbeidssted('Test');

    // Step 8: Handle potential "Bekreft og fortsett" for warnings (e.g., family members)
    await arbeidssted.klikkBekreftOgFortsettHvisVises();

    // Step 9: Submit vedtak directly from behandling page
    // Note: Trygdeavtale does NOT have a separate vedtak page like FTRL
    await arbeidssted.fattVedtak();

    console.log('✅ Trygdeavtale workflow completed successfully');
  });

  test('should complete trygdeavtale workflow with convenience methods', async ({ page }) => {
    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    // Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new TrygdeavtaleBehandlingPage(page);
    const arbeidssted = new TrygdeavtaleArbeidsstedPage(page);

    // Create case
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

    // Navigate to behandling
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

    // Complete behandling using convenience methods
    await behandling.fyllUtPeriodeOgLand('01.01.2024', '01.01.2026', 'AU');
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
    await behandling.innvilgeOgVelgBestemmelse('AUS_ART9_3');

    // Complete arbeidssted and submit vedtak
    await arbeidssted.fyllUtArbeidsstedOgFattVedtak('Test');

    console.log('✅ Trygdeavtale workflow completed with convenience methods');
  });
});
