import { Page, expect } from '@playwright/test';

/**
 * Assertions for search results page
 */
export class SokAssertions {
  constructor(private readonly page: Page) {}

  /**
   * Verify that search results are displayed
   */
  async verifiserResultaterVises(): Promise<void> {
    const resultatHeader = this.page.locator('h1, h2').filter({ hasText: /Resultater for/i });
    await expect(resultatHeader).toBeVisible({ timeout: 10000 });
  }

  /**
   * Verify that "no results" message is displayed
   */
  async verifiserIngenResultater(): Promise<void> {
    const ingenResultater = this.page.getByText(/Fant ingen saker/i);
    await expect(ingenResultater).toBeVisible({ timeout: 10000 });
  }

  /**
   * Verify specific saksnummer is in results
   */
  async verifiserSakIResultat(saksnummer: string): Promise<void> {
    const sakLink = this.page.getByRole('link', { name: new RegExp(saksnummer) });
    await expect(sakLink).toBeVisible({ timeout: 5000 });
  }

  /**
   * Verify user name appears in results
   */
  async verifiserBrukerIResultat(navn: string): Promise<void> {
    const brukerElement = this.page.getByText(new RegExp(navn, 'i'));
    await expect(brukerElement).toBeVisible({ timeout: 5000 });
  }

  /**
   * Verify result count matches expected
   */
  async verifiserResultatAntall(forventet: number): Promise<void> {
    const links = this.page.getByRole('link').filter({ hasText: /\d{4}\d+/ });
    await expect(links).toHaveCount(forventet, { timeout: 5000 });
  }

  /**
   * Verify we navigated to a case page
   */
  async verifiserNavigertTilSak(): Promise<void> {
    // Case pages typically have saksbehandling or behandling in URL
    await expect(this.page).toHaveURL(/saksbehandling|behandling|fagsak/i, { timeout: 10000 });
  }

  /**
   * Verify we're on the search results page
   */
  async verifiserPåSøkeside(): Promise<void> {
    await expect(this.page).toHaveURL(/\/sok/, { timeout: 5000 });
  }

  /**
   * Verify that a SED intake made the user's case searchable with an openable behandling.
   * Proves «SED fører til oppgave/sak i systemet»: ingen «Fant ingen saker», en åpnbar
   * behandling vises, og søkeoverskriften viser personens fnr (kun sifre sammenlignes så et
   * evt. formatert fnr ikke gir falsk rødt).
   */
  async verifiserBrukerSøkbarMedBehandling(fnr: string): Promise<void> {
    await expect(
      this.page.getByText(/Fant ingen saker/i),
      'SED-mottak skal gjøre bruker/sak søkbar i systemet (fikk «Fant ingen saker»)'
    ).toHaveCount(0);

    // Venter til behandlingen faktisk er rendret (gir også header tid til å vises).
    await expect(
      this.page.getByRole('button', { name: /Vis behandling/i }).first(),
      'Forventet en åpnbar behandling for personen etter SED-mottak'
    ).toBeVisible({ timeout: 10000 });

    const header =
      (await this.page.locator('h1, h2').filter({ hasText: /Resultater for/i }).first().textContent()) ?? '';
    expect(
      header.replace(/\D/g, ''),
      'Søkeresultatets overskrift skal vise den mottatte personens fnr'
    ).toContain(fnr);
  }
}
