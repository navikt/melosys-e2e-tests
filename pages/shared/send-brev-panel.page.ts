import { Locator, Page, expect } from '@playwright/test';

/**
 * «Send brev»-fanen i sidepanelet på behandlingssiden. Fanen finnes for alle sakstyper
 * og er synlig ved siden av stegene, også på vedtakssteget.
 */
export class SendBrevPanel {
  private readonly fane: Locator;
  private readonly mottakerDropdown: Locator;
  private readonly brevmalDropdown: Locator;
  private readonly lagreUtkastButton: Locator;

  constructor(private readonly page: Page) {
    this.fane = page.getByRole('tab', { name: 'Send brev' });
    this.mottakerDropdown = page.getByRole('combobox', { name: /^Mottaker/ });
    this.brevmalDropdown = page.getByRole('combobox', { name: 'Velg brevmal' });
    this.lagreUtkastButton = page.getByRole('button', { name: 'Lagre utkast' });
  }

  /**
   * Lagrer et brevutkast uten å sende det. Venter på POST /api/brev/utkast og på at
   * utkastet står i lista «Lagrede utkast».
   *
   * @param mottaker - Teksten i mottakerlista, f.eks. «Bruker eller brukers fullmektig»
   * @param brevmal - Teksten i brevmallista, f.eks. «Melding om forventet saksbehandlingstid»
   */
  async lagreUtkast(mottaker: string, brevmal: string): Promise<void> {
    await this.fane.click();
    await this.mottakerDropdown.selectOption({ label: mottaker });
    await this.brevmalDropdown.selectOption({ label: brevmal });
    await expect(this.lagreUtkastButton).toBeEnabled({ timeout: 10000 });

    const lagret = this.page.waitForResponse(
      r => r.url().includes('/api/brev/utkast/') && r.request().method() === 'POST',
      { timeout: 15000 }
    );
    await this.lagreUtkastButton.click();
    expect((await lagret).status(), 'Brevutkastet skal lagres').toBe(204);

    await expect(this.page.getByText('Lagrede utkast')).toBeVisible({ timeout: 10000 });
    console.log(`✅ Lagret brevutkast «${brevmal}» til ${mottaker}`);
  }
}
