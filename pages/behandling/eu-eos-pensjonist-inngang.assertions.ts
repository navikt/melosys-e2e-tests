import { Page, expect } from '@playwright/test';

/**
 * Assertion-metoder for EuEosPensjonistInngangPage
 *
 * Ansvar:
 * - Verifisere at siden er lastet korrekt
 */
export class EuEosPensjonistInngangAssertions {
  constructor(readonly page: Page) {}

  async verifiserSideLastet(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Oppgi opplysninger fra attest / S1', level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  }
}
