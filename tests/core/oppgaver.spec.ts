import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { OppgaverPage } from '../../pages/oppgaver/oppgaver.page';
import { USER_ID_VALID } from '../../pages/shared/constants';
import { fetchOppgaver } from '../../helpers/mock-helper';
import type { APIRequestContext } from '@playwright/test';

/**
 * Behandling-oppgaven som opprettes for en ny sak har oppgavetype BEH_SAK_MK
 * (samme type som svar-anmodning-unntak-assertionen sjekker, MELOSYS-6836-vakten).
 * Live-verifisert via fetchOppgaver under denne testkjøringen.
 */
const BEHANDLING_OPPGAVETYPE = 'BEH_SAK_MK';

/**
 * Hent behandling-oppgavene (oppgavetype BEH_SAK_MK) fra melosys-mock og assert
 * at minst én finnes — altså at saken faktisk ga en behandling-oppgave av riktig TYPE,
 * ikke bare at «en eller annen oppgave» finnes.
 */
async function verifiserBehandlingOppgaveAvRiktigType(request: APIRequestContext): Promise<void> {
  const oppgaver = await fetchOppgaver(request);
  // Engangslogging av faktiske oppgavetyper for live-verifisering av type-strengen.
  console.log(`   Oppgavetyper i mock: ${JSON.stringify(oppgaver.map((o) => o.oppgavetype))}`);
  const behandlingsoppgaver = oppgaver.filter((o) => o.oppgavetype === BEHANDLING_OPPGAVETYPE);
  expect(
    behandlingsoppgaver.length,
    `Opprettet sak skal gi minst én behandling-oppgave av type ${BEHANDLING_OPPGAVETYPE}, fant: ${JSON.stringify(oppgaver.map((o) => o.oppgavetype))}`,
  ).toBeGreaterThan(0);
  console.log(`✅ Fant ${behandlingsoppgaver.length} behandling-oppgave(r) av riktig type (${BEHANDLING_OPPGAVETYPE})`);
}

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

  test('skal vise behandling-oppgave etter opprettelse av sak', async ({ page, request }) => {
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

    // Step 3: Assert at det faktisk finnes en behandling-oppgave av RIKTIG TYPE (BEH_SAK_MK)
    // i mock — ikke bare at «en eller annen oppgave» vises på forsiden.
    console.log('📝 Step 3: Verifying behandling-oppgave of correct type exists...');
    await verifiserBehandlingOppgaveAvRiktigType(request);
  });

  test('skal kunne navigere til behandling fra oppgave', async ({ page, request }) => {
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

    // Step 3: Behandling-oppgaven SKAL finnes (ingen stille søk-fallback). Verifiser at
    // den faktisk ble opprettet i mock med riktig type før vi klikker på den på forsiden;
    // testen skal FEILE hvis happy-path ikke kan kjøres.
    console.log('📝 Step 3: Verifying behandling-oppgave exists before navigating...');
    await verifiserBehandlingOppgaveAvRiktigType(request);

    console.log('📝 Step 4: Clicking on behandling oppgave...');
    await oppgaver.klikkBehandlingOppgaveIndex(0);

    console.log('📝 Step 5: Verifying navigation...');
    await oppgaver.assertions.verifiserNavigertTilBehandling();
    console.log('✅ Successfully navigated to behandling from oppgave');
  });

  test('skal vise oppgave-antall', async ({ page, request }) => {
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

    // Step 3: Get task counts (UI-tellere logges for kontekst)
    console.log('📝 Step 3: Getting task counts...');
    const journalCount = await oppgaver.getJournalforingOppgaveAntall();
    const behandlingCount = await oppgaver.getBehandlingOppgaveAntall();

    console.log(`   Journalføring oppgaver: ${journalCount}`);
    console.log(`   Behandling oppgaver: ${behandlingCount}`);

    // Vi opprettet én sak, så det skal finnes en behandling-oppgave av riktig TYPE (BEH_SAK_MK)
    // i mock — ikke bare et tall > 0 i UI-telleren.
    await verifiserBehandlingOppgaveAvRiktigType(request);

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
