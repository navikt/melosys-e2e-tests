import { test, expect } from '../../fixtures';
import { Page, APIRequestContext } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { JournalforingPage } from '../../pages/journalforing/journalforing.page';
import { ArbeidFlereLandBehandlingPage } from '../../pages/behandling/arbeid-flere-land-behandling.page';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { createJournalforingOppgaver, fetchStoredSedDocuments, findNewNavFormatSed, RinaDocumentInfo } from '../../helpers/mock-helper';
import { UnleashHelper } from '../../helpers/unleash-helper';
import { USER_ID_KOSOVO, PERSON_NAME_KOSOVO } from '../../pages/shared/constants';

/**
 * EU/EØS Kosovo statsborgerskap i SED A008 (MELOSYS-7558)
 *
 * Tester at Kosovo-statsborgerskap (XK) håndteres korrekt i SED basert på CDM-versjon:
 * - CDM 4.4 (toggle PÅ): Kosovo (XK) bevares i SED
 * - CDM 4.3 (toggle AV): Kosovo konverteres til Ukjent (XU)
 *
 * Bruker journalføringsoppgave-flyten med en Kosovo-person (TREIG SALMANSEN).
 */

/**
 * Extract nationality country codes from a SED nav object.
 */
function extractLandkoder(nav: Record<string, unknown>): string[] {
  const bruker = nav?.bruker as Record<string, unknown> | undefined;
  const person = bruker?.person as Record<string, unknown> | undefined;
  const statsborgerskap = person?.statsborgerskap as
    | { land: string }
    | { land: string }[]
    | undefined;

  expect(statsborgerskap).toBeDefined();

  return Array.isArray(statsborgerskap)
    ? statsborgerskap.map((s) => s.land)
    : [statsborgerskap!.land];
}

/**
 * Shared flow: create journalføringsoppgave for Kosovo person,
 * fill journalføring form, open behandling, and videresend søknad.
 *
 * Returns the SED documents snapshot taken before videresending,
 * so the caller can find the new SED and run assertions.
 */
async function opprettOgVideresendSøknad(
  page: Page,
  request: APIRequestContext
): Promise<RinaDocumentInfo[]> {
  const auth = new AuthHelper(page);
  await auth.login();

  const hovedside = new HovedsidePage(page);
  const journalforing = new JournalforingPage(page);
  const behandling = new ArbeidFlereLandBehandlingPage(page);

  // === STEG 1: Opprett journalføringsoppgave for Kosovo-person ===
  const oppgaveResult = await createJournalforingOppgaver(page.request, {
    antall: 1,
    medVedlegg: true,
    tilordnetRessurs: 'Z990693',
    brukerIdent: USER_ID_KOSOVO,
  });

  if (!oppgaveResult) {
    throw new Error('Kunne ikke opprette journalføringsoppgave');
  }

  // === STEG 2: Klikk på oppgaven fra hovedsiden ===
  await hovedside.goto();
  await page.waitForLoadState('networkidle');

  const oppgaveKort = page.getByText(PERSON_NAME_KOSOVO);
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
  const sakKort = page.getByText(`${PERSON_NAME_KOSOVO} - ${USER_ID_KOSOVO}`);
  await sakKort.waitFor({ state: 'visible', timeout: 10000 });
  await sakKort.click();
  await page.waitForLoadState('networkidle');

  // === STEG 5: Fullfør videresend-flyten ===
  const docsBefore = await fetchStoredSedDocuments(request, 'A008');
  await behandling.fyllUtVideresendSøknad('Sverige (SE)');

  return docsBefore;
}

test.describe('EU/EØS Kosovo statsborgerskap i SED A008 (MELOSYS-7558)', () => {

  test('CDM 4.4 toggle PÅ - Kosovo statsborgerskap bevart', async ({ page, request }) => {
    test.setTimeout(120000);

    const unleash = new UnleashHelper(request);
    await unleash.enableFeature('melosys.cdm-4-4');

    console.log('Starter Kosovo statsborgerskap test (CDM 4.4 PÅ)');
    const docsBefore = await opprettOgVideresendSøknad(page, request);

    const sedContent = await findNewNavFormatSed(request, 'A008', docsBefore);
    console.log(`Verifiserer SED A008 (CDM 4.4): sedVer=${sedContent.sedVer}`);

    expect(sedContent.sed).toBe('A008');
    expect(sedContent.sedVer).toBe('4');
    expect(sedContent.sedGVer).toBe('4');

    const nav = sedContent.nav as Record<string, unknown>;
    const landkoder = extractLandkoder(nav);
    expect(landkoder).toContain('XK');

    console.log(`Kosovo statsborgerskap (XK) bevart i CDM 4.4: ${JSON.stringify(landkoder)}`);
  });

  test('CDM 4.4 toggle AV - Kosovo konvertert til ukjent', async ({ page, request }) => {
    test.setTimeout(120000);

    const unleash = new UnleashHelper(request);
    await unleash.disableFeature('melosys.cdm-4-4');

    console.log('Starter Kosovo statsborgerskap test (CDM 4.4 AV)');
    const docsBefore = await opprettOgVideresendSøknad(page, request);

    const sedContent = await findNewNavFormatSed(request, 'A008', docsBefore);
    console.log(`Verifiserer SED A008 (CDM 4.3): sedVer=${sedContent.sedVer}`);

    expect(sedContent.sed).toBe('A008');
    expect(sedContent.sedVer).toBe('3');
    expect(sedContent.sedGVer).toBe('4');

    const nav = sedContent.nav as Record<string, unknown>;
    const landkoder = extractLandkoder(nav);
    expect(landkoder).toContain('XU');
    expect(landkoder).not.toContain('XK');

    console.log(`Kosovo konvertert til Ukjent (XU) i CDM 4.3: ${JSON.stringify(landkoder)}`);
  });
});
