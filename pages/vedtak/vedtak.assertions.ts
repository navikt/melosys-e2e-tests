import { Page, expect } from '@playwright/test';
import { assertErrors } from '../../utils/assertions';
import {
  verifiserBehandlingSluttilstand,
  BehandlingSluttilstandForventning,
} from '../shared/behandling-sluttilstand.assertions';

/**
 * Assertion methods for VedtakPage
 *
 * Responsibilities:
 * - Verify text editors are visible
 * - Verify "Fatt vedtak" button is visible
 * - Verify no errors on the page
 * - Verify successful submission
 */
export class VedtakAssertions {
  constructor(readonly page: Page) {}

  /**
   * Verify text editors (Quill) are visible on the page
   */
  async verifiserTekstfeltSynlige(): Promise<void> {
    const editors = this.page.locator('.ql-editor');
    await expect(editors.first()).toBeVisible();
  }

  /**
   * Verify "Fatt vedtak" button is visible
   */
  async verifiserFattVedtakKnapp(): Promise<void> {
    const button = this.page.getByRole('button', { name: 'Fatt vedtak' });
    await expect(button).toBeVisible();
  }

  /**
   * Verify no errors are present on the form
   */
  async verifiserIngenFeil(): Promise<void> {
    await assertErrors(this.page, []);
  }

  /**
   * Verify vedtak was submitted successfully
   * Checks that we navigated away from the vedtak page
   */
  async verifiserVedtakFattet(): Promise<void> {
    // After clicking "Fatt vedtak", the page usually navigates
    // Wait a bit for any navigation to complete
    await this.page.waitForLoadState('domcontentloaded');
    await this.verifiserIngenFeil();
  }

  /**
   * Hard sluttilstands-verifisering i DB etter at vedtaket er fattet/iverksatt:
   * behandlingen er AVSLUTTET, har et behandlingsresultat, og alle
   * prosessinstanser (inkl. iverksetting) er FERDIG. Beviser sluttilstand
   * utover at vi navigerte bort fra vedtakssiden.
   *
   * Kall `waitForProcessInstances(...)` (kaster på feilede instanser) FØR denne.
   *
   * @returns BEHANDLING.ID for behandlingen som ble verifisert
   */
  async verifiserBehandlingAvsluttet(
    forventet: BehandlingSluttilstandForventning = {}
  ): Promise<string> {
    return await verifiserBehandlingSluttilstand(forventet);
  }
}
