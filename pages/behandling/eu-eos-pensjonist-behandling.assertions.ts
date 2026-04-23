import { Page, expect } from '@playwright/test';

export class EuEosPensjonistBehandlingAssertions {
  constructor(readonly page: Page) {}

  async verifiserSideLastet(): Promise<void> {
    await expect(this.page.getByRole('textbox', { name: 'Fra og med' })).toBeVisible({
      timeout: 10000,
    });
  }

  async verifiserBekreftOgSendSynlig(): Promise<void> {
    await expect(this.page.getByRole('button', { name: 'Bekreft og send' })).toBeVisible({
      timeout: 10000,
    });
  }
}
