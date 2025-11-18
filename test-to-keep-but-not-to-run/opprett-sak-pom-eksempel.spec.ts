import { test, expect } from '../fixtures';
import { AuthHelper } from '../helpers/auth-helper';
import { HovedsidePage } from '../pages/hovedside.page';
import { OpprettNySakPage } from '../pages/opprett-ny-sak/opprett-ny-sak.page';
import { USER_ID_VALID } from '../pages/shared/constants';

/**
 * Eksempel test som bruker Page Object Model mønster
 *
 * Dette demonstrerer:
 * 1. Bruk av POMs for bedre vedlikehold
 * 2. Separasjon av actions og assertions
 * 3. Integrasjon med eksisterende helpers (AuthHelper, fixtures)
 * 4. Database verifisering
 *
 * Sammenlign med: tests/example-workflow.spec.ts (gammel stil)
 */

test.describe('Opprett ny sak - POM Eksempel @manual', () => {
  test('skal opprette ny sak ved bruk av POM mønster', async ({ page }) => {
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

    console.log('✅ Created case successfully using POM pattern');

    // Note: Fixtures will automatically clean up the database after this test!
    // Database verification can be added when table structure is confirmed
  });

  test('skal opprette sak ved bruk av hjelpemetode', async ({ page }) => {
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

  test('skal verifisere at skjemafelt er synlige', async ({ page }) => {
    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);

    // Navigate to form
    await hovedside.gotoOgOpprettNySak();

    // Assertions: Verify initial form field
    await opprettSak.assertions.verifiserBrukerIDFelt();
    await opprettSak.assertions.verifiserIngenFeil();

    // Fill user ID to reveal more fields
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgOpprettNySak();

    // Now verify sakstype dropdown is visible
    await opprettSak.assertions.verifiserSakstypeDropdown();

    console.log('✅ Form is ready for input');
  });
});
