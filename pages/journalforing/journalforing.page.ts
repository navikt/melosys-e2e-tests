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
 * @example
 * const journalforing = new JournalforingPage(page);
 * await journalforing.gotoJournalpost('12345', '67890');
 * await journalforing.velgOpprettNySak();
 * await journalforing.fyllSakstype('FTRL');
 */
export class JournalforingPage extends BasePage {
  readonly assertions: JournalforingAssertions;

  // Form sections
  private readonly journalforingForm = this.page.locator('form, [class*="journalforing"]');

  // Radio buttons for action type
  private readonly knyttTilEksisterendeRadio = this.page.getByRole('radio', { name: /Knytt til eksisterende/i });
  private readonly opprettNySakRadio = this.page.getByRole('radio', { name: /Opprett ny sak/i });
  private readonly nyVurderingRadio = this.page.getByRole('radio', { name: /Ny vurdering|Andregangsbehandle/i });

  // Case selection (for KNYTT)
  private readonly saksnummerDropdown = this.page.locator('select[name*="saksnummer"], [data-testid*="saksnummer"]');
  private readonly saksnummerSøkefelt = this.page.getByPlaceholder(/Søk etter sak|Saksnummer/i);

  // New case fields (for OPPRETT)
  private readonly sakstypeDropdown = this.page.locator('select[name*="sakstype"]');
  private readonly sakstemaDropdown = this.page.locator('select[name*="sakstema"]');
  private readonly behandlingstemaDropdown = this.page.locator('select[name*="behandlingstema"]');
  private readonly behandlingstypeDropdown = this.page.locator('select[name*="behandlingstype"]');

  // Date fields
  private readonly mottattDatoInput = this.page.locator('input[name*="mottattDato"], [data-testid*="mottatt-dato"]');
  private readonly periodeFraInput = this.page.locator('input[name*="periodeFra"], [data-testid*="periode-fra"]');
  private readonly periodeTilInput = this.page.locator('input[name*="periodeTil"], [data-testid*="periode-til"]');

  // Submit button
  private readonly journalførButton = this.page.getByRole('button', { name: /Journalfør|Bekreft|Lagre/i });

  // Document preview
  private readonly dokumentVisning = this.page.locator('[class*="dokument"], [class*="pdf"], iframe[src*="pdf"]');

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
      await this.saksnummerDropdown.selectOption({ label: new RegExp(saksnr) });
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
   * Fill sakstype dropdown (for OPPRETT flow)
   */
  async fyllSakstype(sakstype: string): Promise<void> {
    await this.sakstypeDropdown.waitFor({ state: 'visible', timeout: 5000 });
    await this.sakstypeDropdown.selectOption({ label: new RegExp(sakstype, 'i') });
  }

  /**
   * Fill sakstema dropdown (for OPPRETT flow)
   */
  async fyllSakstema(sakstema: string): Promise<void> {
    await this.waitForDropdownToPopulate(this.sakstemaDropdown);
    await this.sakstemaDropdown.selectOption({ label: new RegExp(sakstema, 'i') });
  }

  /**
   * Fill behandlingstema dropdown (for OPPRETT flow)
   */
  async fyllBehandlingstema(tema: string): Promise<void> {
    await this.waitForDropdownToPopulate(this.behandlingstemaDropdown);
    await this.behandlingstemaDropdown.selectOption({ label: new RegExp(tema, 'i') });
  }

  /**
   * Fill behandlingstype dropdown (for OPPRETT flow)
   */
  async fyllBehandlingstype(type: string): Promise<void> {
    await this.waitForDropdownToPopulate(this.behandlingstypeDropdown);
    await this.behandlingstypeDropdown.selectOption({ label: new RegExp(type, 'i') });
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
   */
  async opprettNySakOgJournalfør(config: {
    sakstype: string;
    sakstema?: string;
    behandlingstema?: string;
    behandlingstype?: string;
  }): Promise<void> {
    await this.velgOpprettNySak();
    await this.fyllSakstype(config.sakstype);

    if (config.sakstema) {
      await this.fyllSakstema(config.sakstema);
    }
    if (config.behandlingstema) {
      await this.fyllBehandlingstema(config.behandlingstema);
    }
    if (config.behandlingstype) {
      await this.fyllBehandlingstype(config.behandlingstype);
    }

    await this.journalførDokument();
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
