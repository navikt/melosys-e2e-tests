import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { USER_ID_VALID } from '../../pages/shared/constants';

/**
 * Example test using Page Object Model pattern
 *
 * This demonstrates:
 * 1. Using POMs for better maintainability
 * 2. Separation of actions and assertions
 * 3. Integration with existing helpers (AuthHelper, fixtures)
 * 4. Database verification
 *
 * Compare with: tests/example-workflow.spec.ts (old style)
 */

test.describe('Opprett ny sak - POM Example', () => {
  test('should create new case using POM pattern', async ({ page }) => {
    // Setup: Authentication (still using AuthHelper - our strength!)
    const auth = new AuthHelper(page);
    await auth.login();

    // Setup: Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);

    // Actions: Navigate and create case
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();

    // Actions: Fill form using POM
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgOpprettNySak();
    await opprettSak.velgSakstype('FTRL');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('YRKESAKTIV');
    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    // Assertions: Verify using assertions class
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Assertions: Database verification (still works with our fixtures!)
    const { sakId, behandlingId } = await opprettSak.assertions.verifiserKomplettOpprettelse(USER_ID_VALID);

    console.log(`✅ Created case with ID: ${sakId}, behandling ID: ${behandlingId}`);

    // Note: Fixtures will automatically clean up the database after this test!
  });

  test('should create case using convenience method', async ({ page }) => {
    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);

    // Actions: Use convenience method for common workflow
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);

    // Assertions: Simple verification
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    console.log('✅ Created case using convenience method');
  });

  test('should verify form fields are visible', async ({ page }) => {
    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);

    // Navigate to form
    await hovedside.gotoOgOpprettNySak();

    // Assertions: Verify form is ready
    await opprettSak.assertions.verifiserBrukerIDFelt();
    await opprettSak.assertions.verifiserSakstypeDropdown();
    await opprettSak.assertions.verifiserIngenFeil();

    console.log('✅ Form is ready for input');
  });
});
