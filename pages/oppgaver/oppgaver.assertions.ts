import { Page, expect } from '@playwright/test';

/**
 * Assertions for task/oppgaver page
 */
export class OppgaverAssertions {
  constructor(private readonly page: Page) {}

  /**
   * Verify that the task section is visible on forside
   */
  async verifiserOppgaverSeksjonVises(): Promise<void> {
    // The oppgaver section should be visible on forside
    const oppgaverSection = this.page.locator('[class*="oppgave"], [class*="mine-saker"]').first();
    await expect(oppgaverSection).toBeVisible({ timeout: 10000 });
  }

  /**
   * Verify that journalføring tasks are visible
   */
  async verifiserJournalforingOppgaverVises(): Promise<void> {
    const journalOppgaver = this.page.locator('a[href*="/journalforing/"]');
    await expect(journalOppgaver.first()).toBeVisible({ timeout: 5000 });
  }

  /**
   * Verify that behandling tasks are visible
   */
  async verifiserBehandlingOppgaverVises(): Promise<void> {
    const behandlingOppgaver = this.page.locator('a[href*="/saksbehandling/"]');
    await expect(behandlingOppgaver.first()).toBeVisible({ timeout: 5000 });
  }

  /**
   * Verify specific task count
   */
  async verifiserOppgaveAntall(type: 'journalforing' | 'behandling', forventet: number): Promise<void> {
    const selector = type === 'journalforing'
      ? 'a[href*="/journalforing/"]'
      : 'a[href*="/saksbehandling/"]';

    const oppgaver = this.page.locator(selector);
    await expect(oppgaver).toHaveCount(forventet, { timeout: 5000 });
  }

  /**
   * Verify task with specific name exists
   */
  async verifiserOppgaveFinnes(navn: string): Promise<void> {
    const oppgave = this.page.getByText(new RegExp(navn, 'i'));
    await expect(oppgave).toBeVisible({ timeout: 5000 });
  }

  /**
   * Verify navigation to journalføring page
   */
  async verifiserNavigertTilJournalforing(): Promise<void> {
    await expect(this.page).toHaveURL(/\/journalforing\//, { timeout: 10000 });
  }

  /**
   * Verify navigation to behandling/saksbehandling page
   */
  async verifiserNavigertTilBehandling(): Promise<void> {
    await expect(this.page).toHaveURL(/\/saksbehandling\//, { timeout: 10000 });
  }

  /**
   * Verify empty state message is shown
   */
  async verifiserIngenOppgaverMelding(): Promise<void> {
    const ingenOppgaver = this.page.getByText(/Ingen oppgaver|Ingen saker/i);
    await expect(ingenOppgaver).toBeVisible({ timeout: 5000 });
  }
}
