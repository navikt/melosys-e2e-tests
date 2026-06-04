import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './shared/base.page';
import { MELOSYS_URL, TIMEOUT_LONG } from './shared/constants';

/**
 * Page Object for the Melosys main page (hovedside)
 *
 * Responsibilities:
 * - Navigation to main page
 * - Initiating "create new case" workflow
 * - Search functionality (future)
 *
 * Related pages:
 * - OpprettNySakPage (navigates to when clicking "Opprett ny sak")
 *
 * @example
 * const hovedside = new HovedsidePage(page);
 * await hovedside.goto();
 * await hovedside.klikkOpprettNySak();
 */
export class HovedsidePage extends BasePage {
  // Locators
  private readonly opprettNySakButton = this.page.getByRole('button', {
    name: 'Opprett ny sak/behandling',
  });

  private readonly søkField = this.page.getByPlaceholder('F.nr./d-nr./saksnr.');

  private readonly søkButton = this.page.getByRole('button', { name: 'Søk' });

  private readonly visBehandlingButton = this.page.getByRole('button', {
    name: 'Vis behandling',
  });

  private readonly gåTilForsidenLink = this.page.getByRole('link', {
    name: 'Gå til forsiden',
  });

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the main Melosys page
   */
  async goto(): Promise<void> {
    await super.goto(MELOSYS_URL);
  }

  /**
   * Click "Opprett ny sak/behandling" button
   * This will navigate to the "Opprett ny sak" page
   */
  async klikkOpprettNySak(): Promise<void> {
    await this.opprettNySakButton.click();
  }

  /**
   * Navigate to main page and click "Opprett ny sak" in one step
   * Convenience method for common workflow
   */
  async gotoOgOpprettNySak(): Promise<void> {
    await this.goto();
    await this.klikkOpprettNySak();
  }

  /**
   * Verify main page is loaded
   * Checks that the "Opprett ny sak" button is visible
   */
  async verifiserHovedside(): Promise<void> {
    await this.waitForElement(this.opprettNySakButton);
  }

  /**
   * Search for a user by their fødselsnummer, d-nummer, or saksnummer
   *
   * @param søkeord - Search term (fnr/d-nr/saksnr)
   */
  async søkEtterBruker(søkeord: string): Promise<void> {
    await this.søkField.click();
    await this.søkField.fill(søkeord);
    await this.søkButton.click();
  }

  /**
   * Click "Vis behandling" button after searching
   */
  async klikkVisBehandling(): Promise<void> {
    await this.visBehandlingButton.click();
  }

  /**
   * Click "Gå til forsiden" link to return to main page
   */
  async gåTilForsiden(): Promise<void> {
    await this.gåTilForsidenLink.click();
  }

  /**
   * Open the first case whose link text contains the given substring. The
   * hovedside link is rendered as "<NAVN> - <fnr>", so passing BRUKERNAVN_VALID
   * (or USER_ID_VALID, or any unique substring of the link) will match.
   *
   * @param søketekst - Substring to match in the link text
   */
  async åpneSak(søketekst: string): Promise<void> {
    const lenke = this.page.getByRole('link', { name: new RegExp(søketekst) }).first();
    await lenke.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
    await lenke.click();
  }

  async åpneAarsavregningForSaksnummer(saksnummer: string): Promise<void> {
    const lenker = this.page
      .locator(`a[href*="${saksnummer}"]`)
      .filter({ hasText: /Årsavregning/ });

    await expect(lenker).toHaveCount(1, { timeout: TIMEOUT_LONG });
    await lenker.first().click();
  }

  /**
   * Locate a behandling link in the saksoversikt, reloading if it is not there yet.
   *
   * The saksoversikt rows are fetched via an async API call AFTER the page's
   * DOMContentLoaded (BasePage.goto only awaits 'domcontentloaded'), so the row
   * for a just-created or just-decided behandling can lag behind the navigation.
   * A bare locator with the default 10s timeout therefore races on a loaded CI
   * runner. This waits for the link, and if it does not appear, reloads the
   * saksoversikt and retries until the time budget is spent. Reloading is safe
   * here because the hovedside is a normal page, not the client-side step wizard.
   *
   * @param navn - Accessible name (substring) or RegExp identifying the link
   * @param timeout - Total budget across reloads in ms (default 45000)
   */
  private async finnBehandlingslenke(navn: string | RegExp, timeout: number): Promise<Locator> {
    const link = this.page.getByRole('link', { name: navn }).first();
    const deadline = Date.now() + timeout;
    for (let forsøk = 1; ; forsøk++) {
      try {
        await link.waitFor({ state: 'visible', timeout: 8000 });
        return link;
      } catch {
        if (Date.now() >= deadline) {
          throw new Error(
            `Fant ikke behandlingslenke "${navn}" i saksoversikten innen ${timeout}ms`
          );
        }
        console.log(
          `⏳ Behandlingslenke ikke synlig (forsøk ${forsøk}), laster saksoversikten på nytt...`
        );
        await this.page.reload();
        await this.page.waitForLoadState('domcontentloaded');
      }
    }
  }

  /**
   * Open a behandling from the saksoversikt by matching the link's accessible name.
   * Robust against the async saksoversikt-loading race — see finnBehandlingslenke.
   *
   * @param navn - Accessible name (substring) or RegExp identifying the link
   * @param timeout - Total budget across reloads in ms (default 45000)
   */
  async åpneBehandling(navn: string | RegExp, timeout = 45000): Promise<void> {
    const link = await this.finnBehandlingslenke(navn, timeout);
    await link.click();
  }

  /**
   * Wait for a behandling link to appear in the saksoversikt and return it.
   * Use for assertions (e.g., that an auto-created årsavregning shows up) where
   * the row may lag behind navigation. Robust against the loading race via reload.
   *
   * @param navn - Accessible name (substring) or RegExp identifying the link
   * @param timeout - Total budget across reloads in ms (default 45000)
   */
  async ventPåBehandlingslenke(navn: string | RegExp, timeout = 45000): Promise<Locator> {
    return this.finnBehandlingslenke(navn, timeout);
  }
}
