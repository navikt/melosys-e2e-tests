import { Page, Locator } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { OppgaverAssertions } from './oppgaver.assertions';

/**
 * Page Object for the task list on the main page (forside)
 *
 * Responsibilities:
 * - View and interact with task lists (journalføring and behandling)
 * - Navigate to tasks
 * - Get task counts
 *
 * @example
 * const oppgaver = new OppgaverPage(page);
 * await oppgaver.ventPåOppgaverLastet();
 * await oppgaver.klikkJournalforingOppgave('Søknad om medlemskap');
 */
export class OppgaverPage extends BasePage {
  readonly assertions: OppgaverAssertions;

  // Main task sections
  private readonly mineOppgaverHeader = this.page.getByRole('heading', { name: /Mine oppgaver/i });
  private readonly oppgaveTeller = this.page.locator('[class*="oppgave-teller"], [class*="badge"]').first();

  // Journalføring oppgaver section
  private readonly journalforingSection = this.page.locator('[class*="journalforing"], [data-testid*="journalforing"]').first();
  private readonly journalforingOppgaver = this.page.locator('[class*="journalforing-oppgave"], a[href*="/journalforing/"]');

  // Behandling oppgaver section
  private readonly behandlingSection = this.page.locator('[class*="behandling-oppgaver"], [data-testid*="behandling"]').first();
  private readonly behandlingOppgaver = this.page.locator('[class*="behandling-oppgave"], a[href*="/saksbehandling/"]');

  // Empty state messages
  private readonly ingenJournalforingOppgaver = this.page.getByText(/Ingen journalføringsoppgaver|Ingen oppgaver/i);
  private readonly ingenBehandlingOppgaver = this.page.getByText(/Ingen behandlingsoppgaver|Ingen saker/i);

  constructor(page: Page) {
    super(page);
    this.assertions = new OppgaverAssertions(page);
  }

  /**
   * Wait for task lists to be loaded
   */
  async ventPåOppgaverLastet(): Promise<void> {
    // Wait for page to settle - tasks load via API
    await this.page.waitForLoadState('networkidle');
    // Give a moment for React to render
    await this.page.waitForTimeout(1000);
  }

  /**
   * Get total task count from the header badge (if visible)
   */
  async getTotalOppgaveAntall(): Promise<number> {
    const isVisible = await this.oppgaveTeller.isVisible().catch(() => false);
    if (!isVisible) return 0;

    const text = await this.oppgaveTeller.textContent();
    const match = text?.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  /**
   * Get number of journalføring tasks
   */
  async getJournalforingOppgaveAntall(): Promise<number> {
    return await this.journalforingOppgaver.count();
  }

  /**
   * Get number of behandling tasks
   */
  async getBehandlingOppgaveAntall(): Promise<number> {
    return await this.behandlingOppgaver.count();
  }

  /**
   * Check if there are any tasks at all
   */
  async harOppgaver(): Promise<boolean> {
    const journalCount = await this.getJournalforingOppgaveAntall();
    const behandlingCount = await this.getBehandlingOppgaveAntall();
    return journalCount > 0 || behandlingCount > 0;
  }

  /**
   * Click on a journalføring task by title/name
   */
  async klikkJournalforingOppgave(tittel: string): Promise<void> {
    const oppgave = this.page.locator(`a[href*="/journalforing/"]`).filter({ hasText: tittel });
    await oppgave.first().click();
  }

  /**
   * Click on a journalføring task by index (0-based)
   */
  async klikkJournalforingOppgaveIndex(index: number): Promise<void> {
    await this.journalforingOppgaver.nth(index).click();
  }

  /**
   * Click on a behandling task by user name
   */
  async klikkBehandlingOppgave(navn: string): Promise<void> {
    const oppgave = this.page.locator(`a[href*="/saksbehandling/"]`).filter({ hasText: new RegExp(navn, 'i') });
    await oppgave.first().click();
  }

  /**
   * Click on a behandling task by index (0-based)
   */
  async klikkBehandlingOppgaveIndex(index: number): Promise<void> {
    await this.behandlingOppgaver.nth(index).click();
  }

  /**
   * Get all journalføring task titles
   */
  async getJournalforingOppgaveTitler(): Promise<string[]> {
    const count = await this.journalforingOppgaver.count();
    const titler: string[] = [];

    for (let i = 0; i < count; i++) {
      const text = await this.journalforingOppgaver.nth(i).textContent();
      if (text) titler.push(text.trim());
    }

    return titler;
  }

  /**
   * Get all behandling task user names
   */
  async getBehandlingOppgaveNavn(): Promise<string[]> {
    const count = await this.behandlingOppgaver.count();
    const navn: string[] = [];

    for (let i = 0; i < count; i++) {
      const text = await this.behandlingOppgaver.nth(i).textContent();
      if (text) navn.push(text.trim());
    }

    return navn;
  }

  /**
   * Check if empty state is shown for journalføring
   */
  async harIngenJournalforingOppgaver(): Promise<boolean> {
    return await this.ingenJournalforingOppgaver.isVisible().catch(() => false);
  }

  /**
   * Check if empty state is shown for behandling
   */
  async harIngenBehandlingOppgaver(): Promise<boolean> {
    return await this.ingenBehandlingOppgaver.isVisible().catch(() => false);
  }
}
