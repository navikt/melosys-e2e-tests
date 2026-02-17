import { Page, expect } from '@playwright/test';
import { BasePage } from '../shared/base.page';

/**
 * Page Object for Oppsummering (Summary) section and EndreBehandling modal
 *
 * Responsibilities:
 * - Open the "Endre behandling" modal
 * - Verify behandlingstema editability and fakturaserie message
 * - Close the modal
 *
 * UI structure (from endreBehandlingModal.tsx):
 * - "Endre" button opens the modal
 * - Modal contains selects for: Sakstype, Sakstema, Behandlingstema, Behandlingstype
 * - When harBehandlingMedTrygdeavgift is true:
 *   - Behandlingstema select is readOnly
 *   - Message: "Du kan ikke endre behandlingstema når saken har en tilknyttet fakturaserie."
 * - "Avbryt" button closes the modal
 *
 * @example
 * const oppsummering = new OppsummeringPage(page);
 * await oppsummering.klikkEndre();
 * await oppsummering.verifiserBehandlingstemaRedigerbar();
 * await oppsummering.verifiserIngenFakturaserieMelding();
 * await oppsummering.lukkModal();
 */
export class OppsummeringPage extends BasePage {
  private readonly endreButton = this.page.getByRole('button', { name: 'Endre' });
  private readonly avbrytButton = this.page.getByRole('button', { name: 'Avbryt' });
  private readonly fakturaserieMelding = this.page.getByText('tilknyttet fakturaserie');
  private readonly behandlingstemaSelect = this.page.getByLabel('Behandlingstema');

  constructor(page: Page) {
    super(page);
  }

  /**
   * Click the "Endre" button to open the EndreBehandling modal
   */
  async klikkEndre(): Promise<void> {
    await this.endreButton.click();
    // Wait for modal to be visible
    await this.page.getByText('Sakstype').waitFor({ state: 'visible' });
    console.log('✅ Opened EndreBehandling modal');
  }

  /**
   * Verify that the Behandlingstema select is editable (not read-only)
   * This confirms bugfix Feil 1: field should be editable before ferdigbehandling
   */
  async verifiserBehandlingstemaRedigerbar(): Promise<void> {
    await expect(this.behandlingstemaSelect).toBeVisible();
    await expect(this.behandlingstemaSelect).toBeEnabled();
    console.log('✅ Behandlingstema is editable');
  }

  /**
   * Verify that the "tilknyttet fakturaserie" message is NOT visible
   * This confirms bugfix Feil 1: no false warning about fakturaserie
   */
  async verifiserIngenFakturaserieMelding(): Promise<void> {
    await expect(this.fakturaserieMelding).not.toBeVisible();
    console.log('✅ No "tilknyttet fakturaserie" message visible');
  }

  /**
   * Close the modal by clicking "Avbryt"
   */
  async lukkModal(): Promise<void> {
    await this.avbrytButton.click();
    console.log('✅ Closed EndreBehandling modal');
  }
}
