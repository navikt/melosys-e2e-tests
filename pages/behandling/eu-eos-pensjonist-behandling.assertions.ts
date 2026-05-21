import { Page, expect } from '@playwright/test';
import { TIMEOUT_LONG } from '../shared/constants';

export class EuEosPensjonistBehandlingAssertions {
  constructor(readonly page: Page) {}

  async verifiserBekreftOgSendSynlig(): Promise<void> {
    await expect(this.page.getByRole('button', { name: 'Bekreft og send' })).toBeVisible({
      timeout: TIMEOUT_LONG,
    });
  }
}
