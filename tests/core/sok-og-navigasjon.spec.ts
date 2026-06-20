import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { USER_ID_VALID } from '../../pages/shared/constants';
import { withDatabase } from '../../helpers/db-helper';

/**
 * Test suite for search and navigation functionality
 *
 * Tests cover:
 * - Search by FNR (fødselsnummer)
 * - Search by organization number
 * - Search by case number (saksnummer)
 * - Navigation from search results to case
 * - Empty search results handling
 */
test.describe('Søk og navigasjon', () => {
  let auth: AuthHelper;
  let hovedside: HovedsidePage;
  let opprettSak: OpprettNySakPage;

  test.beforeEach(async ({ page }) => {
    auth = new AuthHelper(page);
    hovedside = new HovedsidePage(page);
    opprettSak = new OpprettNySakPage(page);

    await auth.login();
  });

  test('skal søke etter person med gyldig fødselsnummer og finne sak', async ({ page }) => {
    // Step 1: First create a case so we have something to search for
    console.log('📝 Step 1: Creating a case to search for...');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Step 2: Go back to main page
    console.log('📝 Step 2: Returning to main page...');
    await hovedside.goto();

    // Step 3: Search for the user by FNR
    console.log('📝 Step 3: Searching by FNR...');
    await hovedside.søkEtterBruker(USER_ID_VALID);

    // Step 4: Wait for "Vis behandling" button which appears after search
    console.log('📝 Step 4: Verifying search found results...');
    await page.waitForLoadState('networkidle');

    // Søk på FNR for nyopprettet sak SKAL gi treff: "Vis behandling"-knappen vises.
    // (Robust: testene 'navigere til sak' og 'tilbake til forsiden' klikker samme knapp.)
    const visBehandlingButton = page.getByRole('button', { name: 'Vis behandling' });
    await expect(visBehandlingButton, 'Søk på FNR for opprettet sak skal gi treff').toBeVisible({ timeout: 10000 });
    console.log('✅ Successfully found case by FNR search - Vis behandling button appeared');
  });

  test('skal vise ingen resultater for ukjent bruker', async ({ page }) => {
    // Use an FNR that shouldn't have any cases
    const ukjentFnr = '01019012345';

    // Step 1: Go to main page
    console.log('📝 Step 1: Navigating to main page...');
    await hovedside.goto();

    // Step 2: Search for unknown user
    console.log('📝 Step 2: Searching for unknown FNR...');
    await hovedside.søkEtterBruker(ukjentFnr);
    await page.waitForLoadState('networkidle');

    // Step 3: Verify no "Vis behandling" button (no results found)
    console.log('📝 Step 3: Verifying no results...');
    // DB er deterministisk tom per cleanup-fixture, så ukjent FNR SKAL ikke gi treff.
    // toHaveCount(0) er robust mot strict-mode: med isVisible().catch(()=>false) ville flere
    // treff ha kastet og blitt svelget til false → en regresjon med treff hadde passert.
    const visBehandlingButton = page.getByRole('button', { name: 'Vis behandling' });
    await expect(visBehandlingButton, 'Ukjent FNR skal ikke gi søketreff').toHaveCount(0);
    console.log('✅ Correctly showed no results for unknown user');
  });

  test('skal navigere til sak fra søkeresultat', async ({ page }) => {
    // Step 1: Create a case first
    console.log('📝 Step 1: Creating a case...');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Step 2: Go back and search
    console.log('📝 Step 2: Searching for the case...');
    await hovedside.goto();
    await hovedside.søkEtterBruker(USER_ID_VALID);
    await page.waitForLoadState('networkidle');

    // Step 3: Click "Vis behandling" button to navigate to case
    console.log('📝 Step 3: Clicking Vis behandling...');
    await hovedside.klikkVisBehandling();

    // Step 4: Verify navigation
    console.log('📝 Step 4: Verifying navigation to case...');
    await expect(page).toHaveURL(/saksbehandling|behandling/, { timeout: 10000 });

    console.log('✅ Successfully navigated to case from search');
  });

  // Tidligere @manual: happy-path var unåbar fordi saksnummer ble forsøkt lest fra forside-URL-en
  // (/melosys/$), som alltid ga null. Nå hentes saksnummer pålitelig fra DB (cleanup-fixture ⇒
  // nyeste FAGSAK-rad er denne testens sak), så søket faktisk kjøres og verifiseres. Tag fjernet.
  test('skal søke etter sak med saksnummer', async ({ page }) => {
    // Step 1: Create a case
    console.log('📝 Step 1: Creating a case...');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Step 2: Hent saksnummer fra DB (cleanup-fixture ⇒ nyeste rad er denne testens sak)
    console.log('📝 Step 2: Fetching saksnummer from DB...');
    const saksnummer = await withDatabase(async (db) => {
      const rad = await db.queryOne<{ SAKSNUMMER: string }>(
        `SELECT saksnummer FROM FAGSAK ORDER BY registrert_dato DESC FETCH FIRST 1 ROWS ONLY`,
        {},
      );
      return rad?.SAKSNUMMER ?? null;
    });
    expect(saksnummer, 'Forventet et saksnummer i FAGSAK etter opprettet sak').not.toBeNull();
    console.log(`   Saksnummer: ${saksnummer}`);

    // Step 3: Søk på saksnummer fra forsiden
    console.log('📝 Step 3: Searching by saksnummer...');
    await hovedside.goto();
    await hovedside.søkEtterBruker(saksnummer!);
    await page.waitForLoadState('networkidle');

    // Step 4: Søk på saksnummer SKAL gi treff på saken — "Vis behandling"-knappen vises.
    console.log('📝 Step 4: Verifying saksnummer search found the case...');
    const visBehandlingButton = page.getByRole('button', { name: 'Vis behandling' });
    await expect(
      visBehandlingButton,
      'Søk på saksnummer skal gi treff på saken',
    ).toBeVisible({ timeout: 10000 });

    // ... og knappen SKAL navigere til behandlingen.
    await hovedside.klikkVisBehandling();
    await expect(page).toHaveURL(/saksbehandling|behandling/, { timeout: 10000 });
    console.log('✅ Successfully found and navigated to case by saksnummer search');
  });

  test('skal kunne navigere tilbake til forsiden fra søkeresultater', async ({ page }) => {
    // Step 1: Create a case
    console.log('📝 Step 1: Creating a case...');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Step 2: Search and navigate to case
    console.log('📝 Step 2: Searching...');
    await hovedside.goto();
    await hovedside.søkEtterBruker(USER_ID_VALID);
    await page.waitForLoadState('networkidle');

    // Step 3: Navigate to the behandling via Vis behandling button
    console.log('📝 Step 3: Navigating to behandling...');
    await hovedside.klikkVisBehandling();
    await expect(page).toHaveURL(/saksbehandling|behandling/, { timeout: 10000 });

    // Step 4: Go back to forside
    console.log('📝 Step 4: Navigating back to forside...');
    await hovedside.gåTilForsiden();

    // Step 5: Verify we're back on forside
    console.log('📝 Step 5: Verifying on forside...');
    await hovedside.verifiserHovedside();

    console.log('✅ Successfully navigated back to forside');
  });
});
