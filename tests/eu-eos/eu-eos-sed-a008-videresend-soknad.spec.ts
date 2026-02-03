import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { JournalforingPage } from '../../pages/journalforing/journalforing.page';
import { ArbeidFlereLandBehandlingPage } from '../../pages/behandling/arbeid-flere-land-behandling.page';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { createJournalforingOppgaver } from '../../helpers/mock-helper';

/**
 * EU/EØS SED A008 - Videresend søknad
 *
 * Denne testen bruker journalføringsoppgave-flyten i stedet for
 * "Opprett ny sak/behandling" for å sikre at behandlingen får JournalpostID.
 *
 * Arbeidsflyt:
 * 1. Opprett journalføringsoppgave via melosys-mock API (med vedlegg)
 * 2. Åpne oppgaven fra "Mine oppgaver" på hovedsiden
 * 3. Fyll ut journalføringsskjema og opprett behandling
 * 4. Videresend søknad til Sverige
 */
test.describe('EU/EØS SED A008 - Videresend søknad', () => {
  test('skal videresende søknad til Sverige', async ({ page }) => {
    test.setTimeout(120000);

    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const journalforing = new JournalforingPage(page);
    const behandling = new ArbeidFlereLandBehandlingPage(page);

    // === STEG 1: Opprett journalføringsoppgave via API ===
    console.log('🚀 Starter SED A008 Videresend søknad test');

    const oppgaveResult = await createJournalforingOppgaver(page.request, {
      antall: 1,
      medVedlegg: true,
      tilordnetRessurs: 'Z990693',
    });

    if (!oppgaveResult) {
      throw new Error('Kunne ikke opprette journalføringsoppgave');
    }

    // === STEG 2: Klikk på oppgaven fra hovedsiden ===
    await hovedside.goto();
    await page.waitForLoadState('networkidle');

    const oppgaveKort = page.getByText('TRIVIELL KARAFFEL');
    await oppgaveKort.waitFor({ state: 'visible', timeout: 10000 });
    await oppgaveKort.click();
    await page.waitForLoadState('networkidle');

    // === STEG 3: Fyll ut journalføringsskjema ===
    await journalforing.fyllSakstype('EU/EØS-land');
    await journalforing.fyllSakstema('Medlemskap og lovvalg');
    await journalforing.fyllBehandlingstema('Arbeid og/eller selvstendig virksomhet i flere land');

    const behandlingstypeOptions = await journalforing.getDropdownOptions('behandlingstype');
    if (behandlingstypeOptions.length > 0) {
      await journalforing.fyllBehandlingstype(behandlingstypeOptions[0]);
    }

    await journalforing.fyllSoknadsperiode('01.01.2024', '31.12.2025');
    await journalforing.velgLand('Norge');
    await journalforing.velgLand('Sverige');
    await journalforing.journalførDokument();

    await waitForProcessInstances(page.request, 30);

    // === STEG 4: Åpne behandlingen ===
    const sakKort = page.getByText('TRIVIELL KARAFFEL - 30056928150');
    await sakKort.waitFor({ state: 'visible', timeout: 10000 });
    await sakKort.click();
    await page.waitForLoadState('networkidle');

    // === STEG 5: Fullfør videresend-flyten ===
    await behandling.fyllUtVideresendSøknad('Sverige (SE)');

    console.log('✅ SED A008 Videresend søknad arbeidsflyt fullført');
  });
});
