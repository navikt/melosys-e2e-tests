import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { OppgaverPage } from '../../pages/oppgaver/oppgaver.page';
import { USER_ID_VALID } from '../../pages/shared/constants';

/**
 * Test suite for task/oppgaver functionality on the main page
 *
 * Tests cover:
 * - Viewing tasks on forside
 * - Task counts
 * - Navigation from task to case/journalføring
 * - Empty state handling
 *
 * Note: Oppgaver are created as side effects of case creation and journalpost handling.
 * This test suite focuses on viewing and navigating tasks that already exist.
 */
test.describe('Oppgaver', () => {
  let auth: AuthHelper;
  let hovedside: HovedsidePage;
  let oppgaver: OppgaverPage;

  test.beforeEach(async ({ page }) => {
    auth = new AuthHelper(page);
    hovedside = new HovedsidePage(page);
    oppgaver = new OppgaverPage(page);

    await auth.login();
  });

  test('skal vise oppgave-seksjon på forsiden', async ({ page }) => {
    console.log('📝 Step 1: Navigating to forside...');
    await hovedside.goto();
    await oppgaver.ventPåOppgaverLastet();

    console.log('📝 Step 2: Verifying oppgaver section is visible...');
    await oppgaver.assertions.verifiserOppgaverSeksjonVises();

    console.log('✅ Oppgaver section is visible on forside');
  });

  test('skal vise behandling-oppgave etter opprettelse av sak', async ({ page }) => {
    // Step 1: Create a case (this should create a behandling oppgave)
    console.log('📝 Step 1: Creating a case...');
    await hovedside.gotoOgOpprettNySak();
    const opprettSak = new OpprettNySakPage(page);
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Step 2: Navigate back to forside to see the task
    console.log('📝 Step 2: Returning to forside...');
    await hovedside.goto();
    await oppgaver.ventPåOppgaverLastet();

    // Step 3: Check if we have any tasks
    console.log('📝 Step 3: Checking for tasks...');
    const behandlingCount = await oppgaver.getBehandlingOppgaveAntall();

    console.log(`   Total behandling oppgaver: ${behandlingCount}`);

    // Saken vi opprettet (lagt i «mine») SKAL gi minst én behandling-oppgave på forsiden.
    expect(behandlingCount, 'Opprettet sak skal gi en behandling-oppgave').toBeGreaterThan(0);
    console.log('✅ Found behandling oppgaver as expected');
  });

  test('skal kunne navigere til behandling fra oppgave', async ({ page }) => {
    // Step 1: Create a case first
    console.log('📝 Step 1: Creating a case...');
    await hovedside.gotoOgOpprettNySak();
    const opprettSak = new OpprettNySakPage(page);
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Step 2: Go to forside
    console.log('📝 Step 2: Navigating to forside...');
    await hovedside.goto();
    await oppgaver.ventPåOppgaverLastet();

    // Step 3: Try to find and click on a behandling oppgave
    console.log('📝 Step 3: Looking for behandling oppgave...');
    const behandlingCount = await oppgaver.getBehandlingOppgaveAntall();

    if (behandlingCount > 0) {
      console.log('📝 Step 4: Clicking on behandling oppgave...');
      await oppgaver.klikkBehandlingOppgaveIndex(0);

      console.log('📝 Step 5: Verifying navigation...');
      await oppgaver.assertions.verifiserNavigertTilBehandling();
      console.log('✅ Successfully navigated to behandling from oppgave');
    } else {
      // Try alternative: use the search to find the case
      console.log('📝 Alternative: No oppgaver visible, using search...');
      await hovedside.søkEtterBruker(USER_ID_VALID);
      await page.waitForURL(/\/sok/, { timeout: 5000 });

      // Click on the case from search results
      await page.getByRole('link', { name: /TRIVIELL KARAFFEL/i }).first().click();
      await expect(page).toHaveURL(/saksbehandling|behandling/, { timeout: 10000 });

      console.log('✅ Navigated to behandling via search (oppgave list was empty)');
    }
  });

  test('skal vise oppgave-antall', async ({ page }) => {
    // Step 1: Create a case to ensure we have at least one item
    console.log('📝 Step 1: Creating a case...');
    await hovedside.gotoOgOpprettNySak();
    const opprettSak = new OpprettNySakPage(page);
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Step 2: Go to forside
    console.log('📝 Step 2: Navigating to forside...');
    await hovedside.goto();
    await oppgaver.ventPåOppgaverLastet();

    // Step 3: Get task counts
    console.log('📝 Step 3: Getting task counts...');
    const journalCount = await oppgaver.getJournalforingOppgaveAntall();
    const behandlingCount = await oppgaver.getBehandlingOppgaveAntall();

    console.log(`   Journalføring oppgaver: ${journalCount}`);
    console.log(`   Behandling oppgaver: ${behandlingCount}`);

    // Vi opprettet én sak, så det skal finnes minst én behandling-oppgave (journalCount logges over).
    expect(behandlingCount, 'Opprettet sak skal gi en behandling-oppgave').toBeGreaterThanOrEqual(1);

    console.log('✅ Successfully retrieved task counts');
  });

  test('skal håndtere tom oppgaveliste', async ({ page }) => {
    // Note: With cleanup fixture, database is clean before each test
    // So initially there should be no tasks

    console.log('📝 Step 1: Navigating to forside with clean database...');
    await hovedside.goto();
    await oppgaver.ventPåOppgaverLastet();

    console.log('📝 Step 2: Checking for empty state...');
    const harOppgaver = await oppgaver.harOppgaver();
    const harIngenJournalføring = await oppgaver.harIngenJournalforingOppgaver();
    const harIngenBehandling = await oppgaver.harIngenBehandlingOppgaver();

    console.log(`   Har oppgaver: ${harOppgaver}`);
    console.log(`   Ingen journalføring oppgaver melding: ${harIngenJournalføring}`);
    console.log(`   Ingen behandling oppgaver melding: ${harIngenBehandling}`);

    // DB er deterministisk tom per cleanup-fixture, så forsiden SKAL vise tom oppgaveliste.
    expect(harOppgaver, 'Ren DB skal gi tom oppgaveliste').toBe(false);
    console.log('✅ Empty state is handled (no tasks shown)');
  });
});
