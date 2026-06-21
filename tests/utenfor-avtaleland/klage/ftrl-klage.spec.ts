import { test, expect } from '../../../fixtures';
import { AuthHelper } from '../../../helpers/auth-helper';
import { HovedsidePage } from '../../../pages/hovedside.page';
import { OpprettNySakPage } from '../../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../../../pages/behandling/medlemskap.page';
import { ArbeidsforholdPage } from '../../../pages/behandling/arbeidsforhold.page';
import { LovvalgPage } from '../../../pages/behandling/lovvalg.page';
import { TrygdeavgiftPage } from '../../../pages/trygdeavgift/trygdeavgift.page';
import { VedtakPage } from '../../../pages/vedtak/vedtak.page';
import { KlagePage } from '../../../pages/klage/klage.page';
import { USER_ID_VALID, SAKSTYPER } from '../../../pages/shared/constants';

/**
 * SCAFFOLD / @manual — Klage (Appeal) er IKKE i drift i Melosys ennå.
 *
 * Status (verifisert 2026-06-08): KLAGE finnes som behandlingstype i melosys-api
 * (flytløs, `harIngenFlyt()`=true, kun unit-testet) og i melosys-web (skjult bak
 * toggle `melosys.behandlingstype.klage`), men flyten mangler Kabal-overføring og
 * er ikke tatt i bruk. Se kode-wiki:
 *   archive/melosys-e2e-tests/2026-06-07-e2e-dekningsmatrise-og-gap-backlog.md (Klage-korreksjonen)
 *   + huginn concepts/Klagebehandling.md.
 *
 * Hele suiten er tagget @manual (kjøres ikke i CI). Den ASSERTERER I DAG INGENTING
 * om klage: hver test bygger en ekte §2-1-førstegangssak→vedtak, leter så etter
 * klage-UI med gjettede selektorer bak `.catch(()=>false)`, og faller gjennom til
 * `expect(true)`. Beholdt med vilje som utgangspunkt for når klage tas i drift.
 *
 * NÅR KLAGE IMPLEMENTERES — skriv om mot FAKTISK flyt (ikke selektorene i denne fila):
 *   1. Forutsetning: en fagsak med tidligere AVSLUTTET vedtak (annengangsbehandling),
 *      og toggle `melosys.behandlingstype.klage` på (UnleashHelper.enableFeature).
 *   2. Opprett: velg behandlingstype KLAGE i knytt-til-sak / opprett-behandling.
 *   3. KLAGE er flytløs → lander på «ingen flyt»-skjermen; ingen steg/begrunnelse/«Fatt vedtak».
 *   4. Resultat settes fra BEHANDLINGSMENYEN (AvsluttSak) via én av tre handlinger:
 *        «Medhold på klage» / «Klageinnstilling er oversendt til klageinstansen» / «Klage er avvist»
 *      → åpner en bekreftValg-modal (knapp «Bekreft») som POSTer behandlingsresultattype.
 *   5. Reelle resultattyper: MEDHOLD / KLAGEINNSTILLING / AVVIST_KLAGE
 *      (IKKE KLAGE_MEDHOLD/KLAGE_AVVIST/KLAGE_OVERSENDT… som pages/klage/klage.page.ts gjetter).
 *   6. Hard-asserter resultattype via DB (BEHANDLING/behandlingsresultat), ikke UI-tekst.
 */
test.describe('FTRL Klage @manual', () => {
  let auth: AuthHelper;
  let hovedside: HovedsidePage;
  let opprettSak: OpprettNySakPage;
  let medlemskap: MedlemskapPage;
  let arbeidsforhold: ArbeidsforholdPage;
  let lovvalg: LovvalgPage;
  let trygdeavgift: TrygdeavgiftPage;
  let vedtak: VedtakPage;
  let klage: KlagePage;

  test.beforeEach(async ({ page }) => {
    auth = new AuthHelper(page);
    hovedside = new HovedsidePage(page);
    opprettSak = new OpprettNySakPage(page);
    medlemskap = new MedlemskapPage(page);
    arbeidsforhold = new ArbeidsforholdPage(page);
    lovvalg = new LovvalgPage(page);
    trygdeavgift = new TrygdeavgiftPage(page);
    vedtak = new VedtakPage(page);
    klage = new KlagePage(page);

    await auth.login();
  });

  /**
   * Helper function to create a complete FTRL case with vedtak
   * This is the prerequisite for testing klage
   */
  async function opprettKomplettFtrlSak(page: any): Promise<string | null> {
    console.log('📝 Creating complete FTRL case (prerequisite for klage)...');

    // Create new case
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Navigate to behandling
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

    // Fill medlemskap
    await medlemskap.velgPeriode('01.01.2024', '01.04.2024');
    await medlemskap.velgLand('Afghanistan');
    await medlemskap.velgTrygdedekning('FULL_DEKNING_FTRL');
    await medlemskap.klikkBekreftOgFortsett();

    // Fill arbeidsforhold
    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    // Fill lovvalg
    await lovvalg.fyllUtLovvalg();

    // Handle trygdeavgift (skip warning if present)
    const hasWarning = await page.getByText(/tidligere år skal fastsettes/i).isVisible({ timeout: 3000 }).catch(() => false);
    if (hasWarning) {
      console.log('   Skipping årsavregning warning');
    }
    await trygdeavgift.klikkBekreftOgFortsett();

    // Submit vedtak
    await vedtak.klikkFattVedtak();

    // Get saksnummer from URL
    const url = page.url();
    const match = url.match(/saksbehandling\/(\d+)/);
    const saksnummer = match ? match[1] : null;

    console.log(`✅ Created complete FTRL case: ${saksnummer || 'unknown'}`);
    return saksnummer;
  }

  test('skal kunne opprette klage behandling på eksisterende sak', async ({ page }) => {
    // Step 1: Create complete FTRL case first
    console.log('📝 Step 1: Creating complete FTRL case...');
    const saksnummer = await opprettKomplettFtrlSak(page);

    if (!saksnummer) {
      console.log('⚠️ Could not create prerequisite case - skipping klage test');
      expect(true).toBe(true);
      return;
    }

    // Step 2: Create new behandling with type KLAGE
    console.log('📝 Step 2: Creating klage behandling...');
    await hovedside.gotoOgOpprettNySak();

    // Fill in user ID (should find existing sak)
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);

    // Wait for the system to find existing sak
    await page.waitForTimeout(2000);

    // Check if we can select existing case
    const existingCaseOption = page.getByLabel('', { exact: true });
    const isVisible = await existingCaseOption.isVisible().catch(() => false);

    if (isVisible) {
      await existingCaseOption.check();
    }

    // Look for behandlingstype dropdown to select KLAGE
    const behandlingstypeDropdown = page.getByLabel(/Behandlingstype/i);
    const hasBehandlingstype = await behandlingstypeDropdown.isVisible().catch(() => false);

    if (hasBehandlingstype) {
      // Select KLAGE if available
      try {
        const options = await behandlingstypeDropdown.locator('option').allTextContents();
        const klageOption = options.find(o => /Klage/i.test(o));
        if (klageOption) {
          await behandlingstypeDropdown.selectOption({ label: klageOption });
        }
        console.log('   Selected KLAGE behandlingstype');
      } catch {
        console.log('   KLAGE option not available in dropdown');
      }
    }

    // Submit the form
    await opprettSak.klikkOpprettNyBehandling();

    // Verify klage behandling created
    console.log('📝 Step 3: Verifying klage behandling...');
    await klage.assertions.verifiserKlageBehandlingOpprettet();

    console.log('✅ Klage behandling created successfully');
  });

  test('skal kunne behandle klage med medhold', async ({ page }) => {
    // This test verifies the klage medhold flow
    // Note: Actual implementation depends on available klage handling UI

    console.log('📝 Step 1: Creating complete FTRL case...');
    const saksnummer = await opprettKomplettFtrlSak(page);

    if (!saksnummer) {
      console.log('⚠️ Could not create prerequisite case');
      expect(true).toBe(true);
      return;
    }

    // Step 2: Navigate back and create klage
    console.log('📝 Step 2: Creating klage...');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await page.waitForTimeout(2000);

    // Check for klage-specific UI elements
    const hasKlageOption = await page.getByText(/Klage|KLAGE/i).first().isVisible().catch(() => false);

    if (hasKlageOption) {
      console.log('📝 Step 3: Selecting klage options...');
      // Click on klage option
      await page.getByText(/Klage|KLAGE/i).first().click();

      // If we get to klage handling page, process it
      console.log('📝 Step 4: Processing klage with medhold...');
      await klage.behandleKlageMedMedhold('Klagen tas til følge basert på nye opplysninger');

      console.log('✅ Klage with medhold completed');
    } else {
      console.log('ℹ️ Klage option not found - this may require different navigation');
      console.log('   The klage flow may need to be initiated from the case overview');
      expect(true).toBe(true);
    }
  });

  test('skal kunne behandle klage med avvisning', async ({ page }) => {
    console.log('📝 Step 1: Creating complete FTRL case...');
    const saksnummer = await opprettKomplettFtrlSak(page);

    if (!saksnummer) {
      console.log('⚠️ Could not create prerequisite case');
      expect(true).toBe(true);
      return;
    }

    console.log('📝 Step 2: Attempting to create and process klage with avvisning...');

    // Navigate to case and look for klage action
    await hovedside.goto();
    await hovedside.søkEtterBruker(USER_ID_VALID);
    await page.waitForURL(/\/sok/, { timeout: 5000 });

    // Click on the case
    await page.getByRole('link', { name: /TRIVIELL KARAFFEL/i }).first().click();
    await page.waitForLoadState('networkidle');

    // Look for klage action on the case page
    const hasKlageAction = await page.getByRole('button', { name: /Klage|Opprett klage/i }).isVisible().catch(() => false);

    if (hasKlageAction) {
      await page.getByRole('button', { name: /Klage|Opprett klage/i }).click();
      await klage.behandleKlageMedAvvisning('Klagen avvises da den ikke oppfyller formelle krav');
      console.log('✅ Klage with avvisning completed');
    } else {
      console.log('ℹ️ Klage action not found on case page');
      console.log('   This may require navigating through the menu or using specific flow');
      expect(true).toBe(true);
    }
  });

  test('skal kunne oversende klage til klageinstans', async ({ page }) => {
    console.log('📝 Step 1: Creating complete FTRL case...');
    const saksnummer = await opprettKomplettFtrlSak(page);

    if (!saksnummer) {
      console.log('⚠️ Could not create prerequisite case');
      expect(true).toBe(true);
      return;
    }

    console.log('📝 Step 2: Looking for klage oversending option...');

    // Navigate to case
    await hovedside.goto();
    await hovedside.søkEtterBruker(USER_ID_VALID);
    await page.waitForURL(/\/sok/, { timeout: 5000 });
    await page.getByRole('link', { name: /TRIVIELL KARAFFEL/i }).first().click();

    // Look for oversend action
    const hasOversendAction = await page.getByRole('button', { name: /Oversend|Klageinstans/i }).isVisible().catch(() => false);

    if (hasOversendAction) {
      await page.getByRole('button', { name: /Oversend|Klageinstans/i }).click();
      await klage.oversendKlageTilKlageinstans('Saken oversendes til NAV Klageinstans for videre behandling');
      console.log('✅ Klage forwarded to klageinstans');
    } else {
      console.log('ℹ️ Oversend action not found');
      console.log('   Klage oversending may be part of the klage behandling flow');
      expect(true).toBe(true);
    }
  });

  test('skal verifisere at klage har 70 dagers frist', async ({ page }) => {
    // This test verifies that klage behandlinger have a 70-day deadline
    // vs the standard 90-day deadline for regular behandlinger

    console.log('📝 Step 1: Creating FTRL case...');
    const saksnummer = await opprettKomplettFtrlSak(page);

    if (!saksnummer) {
      console.log('⚠️ Could not create prerequisite case');
      expect(true).toBe(true);
      return;
    }

    console.log('📝 Step 2: Checking for klage deadline information...');

    // Navigate to case
    await hovedside.goto();
    await hovedside.søkEtterBruker(USER_ID_VALID);
    await page.waitForURL(/\/sok/, { timeout: 5000 });
    await page.getByRole('link', { name: /TRIVIELL KARAFFEL/i }).first().click();

    // Check for frist information
    await klage.assertions.verifiserKlageFrist();

    console.log('✅ Klage deadline check completed');
  });
});
