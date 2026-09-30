import { Page, Locator } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { JournalforingAssertions } from './journalforing.assertions';

/**
 * Page Object for the Journalføring (document registration) page
 *
 * Responsibilities:
 * - Navigate to journalpost
 * - Fill journalføring form
 * - Link to existing case or create new case
 * - Submit journalføring
 *
 * Route: /journalforing/:journalpostID/:oppgaveID
 *
 * Form structure (as discovered):
 * - Sakstype dropdown: "EU/EØS-land", "Avtaleland", "Utenfor avtaleland"
 * - Sakstema dropdown: populated based on sakstype
 * - Behandlingstema dropdown: populated based on sakstema
 * - Behandlingstype dropdown: populated based on behandlingstema
 * - Avsender type radios: PERSON, ANNEN_PERSON_ELLER_VIRKSOMHET, UTENLANDSK_TRYGDEMYNDIGHET, FRITEKST
 * - Journalfør button: submits the form
 *
 * @example
 * const journalforing = new JournalforingPage(page);
 * await journalforing.gotoJournalpost('12345', '67890');
 * await journalforing.fyllSakstype('EU/EØS-land');
 */
export class JournalforingPage extends BasePage {
  readonly assertions: JournalforingAssertions;

  // Form sections
  private readonly journalforingForm = this.page.locator('form');

  // Avsender type radio buttons (who sent the document)
  private readonly avsenderBrukerRadio = this.page.locator('input[name="avsenderType-radiogroup"][value="PERSON"]');
  private readonly avsenderAnnenRadio = this.page.locator('input[name="avsenderType-radiogroup"][value="ANNEN_PERSON_ELLER_VIRKSOMHET"]');
  private readonly avsenderUtenlandskRadio = this.page.locator('input[name="avsenderType-radiogroup"][value="UTENLANDSK_TRYGDEMYNDIGHET"]');
  private readonly avsenderFritekstRadio = this.page.locator('input[name="avsenderType-radiogroup"][value="FRITEKST"]');

  // Dropdown fields - using name attribute as discovered
  private readonly sakstypeDropdown = this.page.locator('select[name="sakstype"]');
  private readonly sakstemaDropdown = this.page.locator('select[name="sakstema"]');
  private readonly behandlingstemaDropdown = this.page.locator('select[name="opprettnysak_behandlingstema"]');
  private readonly behandlingstypeDropdown = this.page.locator('select[name="opprettnysak_behandlingstype"]');

  // Input fields
  private readonly brukerIDInput = this.page.locator('input[name="brukerID"]');
  private readonly tittelInput = this.page.getByPlaceholder('Velg eller skriv inn egen tittel');

  // Country selection - appears when behandlingstema is "Utsendt arbeidstaker" etc.
  private readonly landSelectorGroup = this.page.getByRole('group', { name: /I hvilke land/i });
  private readonly landCombobox = this.landSelectorGroup.getByRole('combobox');

  // Søknadsperiode (application period) dates
  private readonly soknadsperiodeGroup = this.page.getByRole('group', { name: /Søknadsperiode/i });
  private readonly periodeFraInputNew = this.soknadsperiodeGroup.locator('input').first();
  private readonly periodeTilInputNew = this.soknadsperiodeGroup.locator('input').nth(1);

  // Buttons
  private readonly journalførButton = this.page.getByRole('button', { name: 'Journalfør' });
  private readonly avbrytButton = this.page.getByRole('button', { name: 'Avbryt' });
  private readonly leggTilButton = this.page.getByRole('button', { name: 'Legg til' });

  // Document preview
  private readonly dokumentVisning = this.page.locator('[class*="dokument"], [class*="pdf"], iframe[src*="pdf"]');

  // Legacy locators for backwards compatibility
  private readonly knyttTilEksisterendeRadio = this.page.getByRole('radio', { name: /Knytt til eksisterende/i });
  private readonly opprettNySakRadio = this.page.getByRole('radio', { name: /Opprett ny sak/i });
  private readonly nyVurderingRadio = this.page.getByRole('radio', { name: /Ny vurdering|Andregangsbehandle/i });
  private readonly saksnummerDropdown = this.page.locator('select[name*="saksnummer"], [data-testid*="saksnummer"]');
  private readonly saksnummerSøkefelt = this.page.getByPlaceholder(/Søk etter sak|Saksnummer/i);
  private readonly mottattDatoInput = this.page.locator('input[name*="mottattDato"], [data-testid*="mottatt-dato"]');
  private readonly periodeFraInput = this.page.locator('input[name*="periodeFra"], [data-testid*="periode-fra"]');
  private readonly periodeTilInput = this.page.locator('input[name*="periodeTil"], [data-testid*="periode-til"]');

  constructor(page: Page) {
    super(page);
    this.assertions = new JournalforingAssertions(page);
  }

  /**
   * Navigate to a specific journalpost
   */
  async gotoJournalpost(journalpostID: string, oppgaveID: string): Promise<void> {
    await this.goto(`http://localhost:3000/melosys/journalforing/${journalpostID}/${oppgaveID}`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Select "Knytt til eksisterende sak" option
   */
  async velgKnyttTilEksisterendeSak(): Promise<void> {
    const isVisible = await this.knyttTilEksisterendeRadio.isVisible().catch(() => false);
    if (isVisible) {
      await this.knyttTilEksisterendeRadio.check();
    }
  }

  /**
   * Select "Opprett ny sak" option
   */
  async velgOpprettNySak(): Promise<void> {
    const isVisible = await this.opprettNySakRadio.isVisible().catch(() => false);
    if (isVisible) {
      await this.opprettNySakRadio.check();
    }
  }

  /**
   * Select "Ny vurdering" option
   */
  async velgNyVurdering(): Promise<void> {
    const isVisible = await this.nyVurderingRadio.isVisible().catch(() => false);
    if (isVisible) {
      await this.nyVurderingRadio.check();
    }
  }

  /**
   * Select case to link to (for KNYTT flow)
   */
  async velgSaksnummer(saksnr: string): Promise<void> {
    // Try dropdown first
    const hasDropdown = await this.saksnummerDropdown.isVisible().catch(() => false);
    if (hasDropdown) {
      const options = await this.saksnummerDropdown.locator('option').allTextContents();
      const match = options.find(o => o.includes(saksnr));
      if (match) {
        await this.saksnummerDropdown.selectOption({ label: match });
      }
      return;
    }

    // Try search field
    const hasSearchField = await this.saksnummerSøkefelt.isVisible().catch(() => false);
    if (hasSearchField) {
      await this.saksnummerSøkefelt.fill(saksnr);
      // Wait for autocomplete and select
      await this.page.waitForTimeout(1000);
      await this.page.getByText(new RegExp(saksnr)).first().click();
    }
  }

  /**
   * Fill sakstype dropdown
   * Valid values: "EU/EØS-land", "Avtaleland", "Utenfor avtaleland"
   */
  async fyllSakstype(sakstype: string): Promise<void> {
    await this.sakstypeDropdown.waitFor({ state: 'visible', timeout: 5000 });
    await this.sakstypeDropdown.selectOption({ label: sakstype });
  }

  /**
   * Fill sakstema dropdown (cascades from sakstype)
   */
  async fyllSakstema(sakstema: string): Promise<void> {
    await this.waitForDropdownToHaveOptions(this.sakstemaDropdown);
    await this.sakstemaDropdown.selectOption({ label: sakstema });
  }

  /**
   * Fill behandlingstema dropdown (cascades from sakstema)
   */
  async fyllBehandlingstema(tema: string): Promise<void> {
    await this.waitForDropdownToHaveOptions(this.behandlingstemaDropdown);
    await this.behandlingstemaDropdown.selectOption({ label: tema });
  }

  /**
   * Fill behandlingstype dropdown (cascades from behandlingstema)
   */
  async fyllBehandlingstype(type: string): Promise<void> {
    await this.waitForDropdownToHaveOptions(this.behandlingstypeDropdown);
    await this.behandlingstypeDropdown.selectOption({ label: type });
  }

  /**
   * Wait for a dropdown to have more than just the default "Velg..." option
   */
  private async waitForDropdownToHaveOptions(dropdown: Locator, timeout = 5000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const options = await dropdown.locator('option').all();
      // More than one option means it's populated (first option is "Velg...")
      if (options.length > 1) {
        return;
      }
      await this.page.waitForTimeout(100);
    }
    console.log('⚠️ Dropdown did not populate with options within timeout');
  }

  /**
   * Get available options from a dropdown
   */
  async getDropdownOptions(dropdownName: 'sakstype' | 'sakstema' | 'behandlingstema' | 'behandlingstype'): Promise<string[]> {
    const dropdown = {
      sakstype: this.sakstypeDropdown,
      sakstema: this.sakstemaDropdown,
      behandlingstema: this.behandlingstemaDropdown,
      behandlingstype: this.behandlingstypeDropdown,
    }[dropdownName];

    const options = await dropdown.locator('option').allTextContents();
    return options.filter((opt) => opt !== 'Velg...');
  }

  /**
   * Check if country selection is visible (appears for certain behandlingstema)
   */
  async erLandSeleksjonSynlig(): Promise<boolean> {
    return await this.landSelectorGroup.isVisible().catch(() => false);
  }

  /**
   * Select a country from the country combobox
   * @param landNavn - Name of the country, e.g. "Belgia", "Sverige", "Tyskland"
   */
  async velgLand(landNavn: string): Promise<void> {
    const isVisible = await this.erLandSeleksjonSynlig();
    if (!isVisible) {
      console.log('   ⚠️ Country selector not visible - skipping');
      return;
    }

    console.log(`   📝 Selecting country: ${landNavn}`);

    // Click on the combobox to open it
    await this.landCombobox.click();

    // Type the country name to filter
    await this.landCombobox.fill(landNavn);

    // Click on the first matching option
    const option = this.page.getByRole('option', { name: new RegExp(landNavn, 'i') });
    const hasOption = await option.first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    if (hasOption) {
      await option.click();
      console.log(`   ✅ Selected country: ${landNavn}`);
    } else {
      // Try clicking anywhere that has the country name
      const fallbackOption = this.page.locator(`text="${landNavn}"`).first();
      if (await fallbackOption.isVisible().catch(() => false)) {
        await fallbackOption.click();
        console.log(`   ✅ Selected country (fallback): ${landNavn}`);
      } else {
        console.log(`   ⚠️ Could not find option for: ${landNavn}`);
      }
    }
  }

  /**
   * Select a default EU country (Belgium - commonly used in tests)
   */
  async velgStandardLand(): Promise<void> {
    await this.velgLand('Belgia');
  }

  /**
   * Check if søknadsperiode dates are visible (required for certain behandlingstema)
   */
  async erSoknadsperiodeSynlig(): Promise<boolean> {
    return await this.soknadsperiodeGroup.isVisible().catch(() => false);
  }

  /**
   * Fill søknadsperiode dates
   * @param fra - From date in format DD.MM.YYYY
   * @param til - To date in format DD.MM.YYYY (optional)
   */
  async fyllSoknadsperiode(fra: string, til?: string): Promise<void> {
    const isVisible = await this.erSoknadsperiodeSynlig();
    if (!isVisible) {
      console.log('   ⚠️ Søknadsperiode fields not visible - skipping');
      return;
    }

    console.log(`   📝 Filling søknadsperiode: fra=${fra}, til=${til || 'not set'}`);

    // Fill "Fra" date
    await this.periodeFraInputNew.fill(fra);

    // Fill "Til" date if provided
    if (til) {
      await this.periodeTilInputNew.fill(til);
    }

    console.log(`   ✅ Søknadsperiode filled`);
  }

  /**
   * Fill søknadsperiode with default dates (today + 1 year)
   */
  async fyllStandardSoknadsperiode(): Promise<void> {
    const today = new Date();
    const oneYearLater = new Date(today);
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    const formatDate = (d: Date) => {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}.${month}.${year}`;
    };

    await this.fyllSoknadsperiode(formatDate(today), formatDate(oneYearLater));
  }

  /**
   * Set mottatt dato
   */
  async settMottattDato(dato: string): Promise<void> {
    const isVisible = await this.mottattDatoInput.isVisible().catch(() => false);
    if (isVisible) {
      await this.mottattDatoInput.fill(dato);
    }
  }

  /**
   * Submit the journalføring form
   */
  async journalførDokument(): Promise<void> {
    await this.journalførButton.click();
    // Wait for navigation or success message
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Complete workflow: Link to existing case
   */
  async knyttTilSak(saksnr: string): Promise<void> {
    await this.velgKnyttTilEksisterendeSak();
    await this.velgSaksnummer(saksnr);
    await this.journalførDokument();
  }

  /**
   * Complete workflow: Create new case and journalfør
   * This fills all required dropdowns with first available option if not provided
   *
   * @param config - Configuration with sakstype (label), sakstema, behandlingstema, behandlingstype, land
   */
  async opprettNySakOgJournalfør(config: {
    sakstype: string;
    sakstema?: string;
    behandlingstema?: string;
    behandlingstype?: string;
    land?: string;
  }): Promise<void> {
    // Fill sakstype
    console.log(`  📝 Selecting sakstype: ${config.sakstype}`);
    await this.fyllSakstype(config.sakstype);

    // Fill sakstema (use first available if not specified). Hver nedtrekksliste fylles
    // når forrige er valgt, så vent på valgene før de leses.
    await this.waitForDropdownToHaveOptions(this.sakstemaDropdown);
    const sakstemaOptions = await this.getDropdownOptions('sakstema');
    const sakstema = config.sakstema || sakstemaOptions[0];
    if (sakstema) {
      console.log(`  📝 Selecting sakstema: ${sakstema}`);
      await this.fyllSakstema(sakstema);
    }

    // Fill behandlingstema (use first available if not specified)
    await this.waitForDropdownToHaveOptions(this.behandlingstemaDropdown);
    const behandlingstemaOptions = await this.getDropdownOptions('behandlingstema');
    const behandlingstema = config.behandlingstema || behandlingstemaOptions[0];
    if (behandlingstema) {
      console.log(`  📝 Selecting behandlingstema: ${behandlingstema}`);
      await this.fyllBehandlingstema(behandlingstema);
    }

    // Fill behandlingstype (use first available if not specified)
    await this.waitForDropdownToHaveOptions(this.behandlingstypeDropdown);
    const behandlingstypeOptions = await this.getDropdownOptions('behandlingstype');
    const behandlingstype = config.behandlingstype || behandlingstypeOptions[0];
    if (behandlingstype) {
      console.log(`  📝 Selecting behandlingstype: ${behandlingstype}`);
      await this.fyllBehandlingstype(behandlingstype);
    }

    // Select country if the country selector is visible (required for "Utsendt arbeidstaker" etc.)
    const landVisible = await this.erLandSeleksjonSynlig();
    if (landVisible) {
      const land = config.land || 'Belgia';
      await this.velgLand(land);
    }

    // Fill søknadsperiode if visible (required for certain behandlingstema)
    const soknadsperiodeVisible = await this.erSoknadsperiodeSynlig();
    if (soknadsperiodeVisible) {
      await this.fyllStandardSoknadsperiode();
    }

    // Submit
    console.log(`  📝 Clicking Journalfør...`);
    await this.journalførDokument();
  }

  /**
   * Complete the full journalføring flow with EU/EØS defaults
   * This is the simplest way to complete journalføring
   */
  async fyllUtOgJournalførMedDefaults(): Promise<void> {
    await this.opprettNySakOgJournalfør({
      sakstype: 'EU/EØS-land',
    });
  }

  /**
   * Check if document preview is visible
   */
  async erDokumentSynlig(): Promise<boolean> {
    return await this.dokumentVisning.isVisible().catch(() => false);
  }

  /**
   * Wait for form to be ready
   */
  async ventPåSkjemaLastet(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
    // Wait for form or radio buttons to be visible
    await Promise.race([
      this.journalforingForm.waitFor({ state: 'visible', timeout: 10000 }),
      this.opprettNySakRadio.waitFor({ state: 'visible', timeout: 10000 }),
      this.knyttTilEksisterendeRadio.waitFor({ state: 'visible', timeout: 10000 }),
    ]).catch(() => {
      // Form structure might vary, continue anyway
    });
  }
}
