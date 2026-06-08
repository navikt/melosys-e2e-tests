import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { USER_ID_VALID } from '../../pages/shared/constants';

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
    const visBehandlingButton = page.getByRole('button', { name: 'Vis behandling' });
    const hasResults = await visBehandlingButton.isVisible({ timeout: 3000 }).catch(() => false);

    // DB er deterministisk tom per cleanup-fixture, så ukjent FNR SKAL ikke gi treff.
    expect(hasResults, 'Ukjent FNR skal ikke gi søketreff').toBe(false);
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

  // @manual: happy-path er i praksis unåbar — etter opprettStandardSak + verifiserBehandlingOpprettet
  // står vi på forsiden (/melosys/$), så saksnummer-regexen mot page.url() blir alltid null og
  // søke-blokken hoppes over (testen passerte via expect(true)). Hardning krever en pålitelig
  // saksnummer-kilde (f.eks. DB) + sok.assertions.verifiserSakIResultat(...). Krever lokal kjøring
  // for å verifisere. Se e2e-audit 2026-06-08.
  test('skal søke etter sak med saksnummer @manual', async ({ page }) => {
    // Step 1: Create a case and capture saksnummer
    console.log('📝 Step 1: Creating a case...');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Get saksnummer from URL (format: /FTRL/saksbehandling/2024000001 or /saksbehandling/MEL-XX)
    const url = page.url();
    console.log(`   Current URL: ${url}`);

    // Try different saksnummer patterns
    let saksnummer: string | null = null;
    let match = url.match(/saksbehandling\/(\d{10,})/); // 10+ digit number
    if (!match) {
      match = url.match(/saksbehandling\/(MEL-\d+)/); // MEL-XX format
    }

    if (match) {
      saksnummer = match[1];
      console.log(`   Found saksnummer: ${saksnummer}`);
    }

    // If we found a saksnummer, search for it
    if (saksnummer) {
      // Step 2: Go back and search by saksnummer
      console.log('📝 Step 2: Searching by saksnummer...');
      await hovedside.goto();
      await hovedside.søkEtterBruker(saksnummer);
      await page.waitForLoadState('networkidle');

      // Step 3: Verify we can navigate to the case
      console.log('📝 Step 3: Verifying search results...');
      const visBehandlingButton = page.getByRole('button', { name: 'Vis behandling' });
      const foundResults = await visBehandlingButton.isVisible({ timeout: 5000 }).catch(() => false);

      if (foundResults) {
        console.log('✅ Successfully found case by saksnummer search');
      } else {
        console.log('ℹ️ Vis behandling not shown (may be navigated directly)');
      }
    } else {
      console.log('⚠️ Could not extract saksnummer from URL');
    }

    // @manual TODO: happy-path unåbar (saksnummer=null fra forside-URL). Hent saksnummer fra DB
    // og bruk sok.assertions.verifiserSakIResultat(saksnummer). Inntil da feiler testen tydelig
    // ved manuell kjøring i stedet for å passere tomt.
    expect(saksnummer, 'Kunne ikke hente saksnummer (se @manual-merknad over)').not.toBeNull();
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
