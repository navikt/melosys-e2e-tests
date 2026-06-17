import { Page, Locator } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { SokAssertions } from './sok.assertions';

/**
 * Page Object for search results page (/sok)
 *
 * Responsibilities:
 * - Interact with search results
 * - Navigate to cases from results
 * - Verify search results state
 *
 * @example
 * const sokPage = new SokPage(page);
 * await sokPage.ventPåResultater();
 * await sokPage.klikkSak('2024000001');
 */
export class SokPage extends BasePage {
  readonly assertions: SokAssertions;

  // Locators
  private readonly resultatHeader = this.page.locator('h1, h2').filter({ hasText: /Resultater for/i });
  private readonly ingenResultaterMelding = this.page.getByText(/Fant ingen saker/i);
  private readonly sakListe = this.page.locator('[class*="fagsak"], [class*="sak-panel"], .panel');
  private readonly tilbakeTilForsidenLink = this.page.getByRole('link', { name: /Gå til forsiden|Tilbake/i });

  constructor(page: Page) {
    super(page);
    this.assertions = new SokAssertions(page);
  }

  /**
   * Wait for search results to load
   */
  async ventPåResultater(): Promise<void> {
    // Wait for either results header or no results message
    await Promise.race([
      this.resultatHeader.waitFor({ state: 'visible', timeout: 10000 }),
      this.ingenResultaterMelding.waitFor({ state: 'visible', timeout: 10000 }),
    ]);
  }

  /**
   * Check if search returned results
   */
  async harResultater(): Promise<boolean> {
    const ingenResultater = await this.ingenResultaterMelding.isVisible().catch(() => false);
    return !ingenResultater;
  }

  /**
   * Get number of search results (cases)
   */
  async getResultatAntall(): Promise<number> {
    // Look for case links that contain saksnummer pattern
    const sakLinks = this.page.getByRole('link').filter({ hasText: /\d{4}\d+/ });
    return await sakLinks.count();
  }

  /**
   * Get all saksnummer from results
   */
  async getSaksnumre(): Promise<string[]> {
    const links = this.page.getByRole('link').filter({ hasText: /\d{4}\d+/ });
    const count = await links.count();
    const saksnumre: string[] = [];

    for (let i = 0; i < count; i++) {
      const text = await links.nth(i).textContent();
      if (text) {
        // Extract saksnummer pattern (e.g., "2024000001")
        const match = text.match(/\d{10}/);
        if (match) {
          saksnumre.push(match[0]);
        }
      }
    }

    return saksnumre;
  }

  /**
   * Click on a case by saksnummer
   */
  async klikkSak(saksnummer: string): Promise<void> {
    await this.page.getByRole('link', { name: new RegExp(saksnummer) }).first().click();
  }

  /**
   * Click on a case by index (0-based)
   */
  async klikkSakIndex(index: number): Promise<void> {
    const links = this.page.getByRole('link').filter({ hasText: /\d{4}\d+/ });
    await links.nth(index).click();
  }

  /**
   * Click on a case by user name
   */
  async klikkSakForBruker(navn: string): Promise<void> {
    await this.page.getByRole('link', { name: new RegExp(navn, 'i') }).first().click();
  }

  /**
   * Navigate back to forside
   */
  async gåTilForsiden(): Promise<void> {
    await this.tilbakeTilForsidenLink.click();
  }

  /**
   * Get the search result header text
   */
  async getResultatHeaderTekst(): Promise<string | null> {
    if (await this.resultatHeader.isVisible()) {
      return await this.resultatHeader.textContent();
    }
    return null;
  }
}
