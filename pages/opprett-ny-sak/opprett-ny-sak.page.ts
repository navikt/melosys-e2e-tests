import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { OpprettNySakAssertions } from './opprett-ny-sak.assertions';
import { SAKSTYPER, SAKSTEMA, BEHANDLINGSTEMA, AARSAK } from '../shared/constants';

/**
 * Page Object for creating a new case in Melosys
 *
 * Responsibilities:
 * - Fill in user identification (fødselsnummer)
 * - Select case type, theme, and treatment type
 * - Submit case creation form
 *
 * Related pages:
 * - HovedsidePage (navigates from here)
 * - BehandlingPage (navigates to after creation)
 *
 * @example
 * const opprettSak = new OpprettNySakPage(page);
 * await opprettSak.fyllInnBrukerID('30056928150');
 * await opprettSak.velgSakstype('FTRL');
 * await opprettSak.klikkOpprettNyBehandling();
 * await opprettSak.assertions.verifiserBehandlingOpprettet();
 */
export class OpprettNySakPage extends BasePage {
  readonly assertions: OpprettNySakAssertions;

  // Locators
  private readonly brukerIDField = this.page.getByRole('textbox', {
    name: 'Brukers f.nr. eller d-nr.:',
  });

  private readonly opprettNySakRadio = this.page.getByRole('radio', {
    name: 'Opprett ny sak',
  });

  private readonly nyVurderingRadio = this.page.getByRole('radio', {
    name: 'Ny vurdering',
  });

  private readonly sakstypeDropdown = this.page.getByLabel('Sakstype');

  private readonly sakstemaDropdown = this.page.getByLabel('Sakstema');

  private readonly behandlingstemaDropdown = this.page.getByLabel('Behandlingstema');

  private readonly behandlingstypeDropdown = this.page.getByLabel('Behandlingstype');

  private readonly aarsakDropdown = this.page.getByLabel('Årsak', { exact: true });

  private readonly leggIMineCheckbox = this.page.getByRole('checkbox', {
    name: 'Legg behandlingen i mine',
  });

  private readonly opprettNyBehandlingButton = this.page.getByRole('button', {
    name: 'Opprett ny behandling',
  });

  constructor(page: Page) {
    super(page);
    this.assertions = new OpprettNySakAssertions(page);
  }

  /**
   * Fill in the user's national ID number (fødselsnummer)
   *
   * @param fnr - 11-digit national ID (e.g., "30056928150")
   */
  async fyllInnBrukerID(fnr: string): Promise<void> {
    await this.brukerIDField.click();
    await this.brukerIDField.fill(fnr);
  }

  /**
   * Select "Opprett ny sak" radio button if visible
   * This radio button is sometimes pre-selected or hidden
   */
  async velgOpprettNySak(): Promise<void> {
    await this.checkRadioIfExists(this.opprettNySakRadio);
  }

  /**
   * Select "Ny vurdering" radio button
   * Used for creating a reassessment of an existing case
   */
  async velgNyVurdering(): Promise<void> {
    await this.nyVurderingRadio.check();
  }

  /**
   * Select case type (Sakstype)
   *
   * @param sakstype - Case type value (e.g., 'FTRL', 'AVTALELAND')
   */
  async velgSakstype(sakstype: string): Promise<void> {
    await this.sakstypeDropdown.selectOption(sakstype);
  }

  /**
   * Select case theme (Sakstema)
   *
   * @param sakstema - Case theme value (e.g., 'MEDLEMSKAP_LOVVALG')
   */
  async velgSakstema(sakstema: string): Promise<void> {
    await this.sakstemaDropdown.selectOption(sakstema);
  }

  /**
   * Select treatment theme (Behandlingstema)
   *
   * @param behandlingstema - Treatment theme value (e.g., 'YRKESAKTIV', 'SELVSTENDIG')
   */
  async velgBehandlingstema(behandlingstema: string): Promise<void> {
    await this.behandlingstemaDropdown.selectOption(behandlingstema);
  }

  /**
   * Select treatment type (Behandlingstype)
   *
   * @param behandlingstype - Treatment type value (e.g., 'ÅRSAVREGNING')
   */
  async velgBehandlingstype(behandlingstype: string): Promise<void> {
    await this.behandlingstypeDropdown.selectOption(behandlingstype);
  }

  /**
   * Select reason (Årsak)
   *
   * @param aarsak - Reason value (e.g., 'SØKNAD')
   */
  async velgAarsak(aarsak: string): Promise<void> {
    await this.aarsakDropdown.selectOption(aarsak);
  }

  /**
   * Check "Legg behandlingen i mine saker" checkbox
   */
  async leggBehandlingIMine(): Promise<void> {
    await this.leggIMineCheckbox.check();
  }

  /**
   * Click "Opprett ny behandling" button to submit the form
   */
  async klikkOpprettNyBehandling(): Promise<void> {
    await this.opprettNyBehandlingButton.click();
  }

  /**
   * Complete workflow to create a new case with common defaults
   * Convenience method for standard case creation
   *
   * @param fnr - User's national ID
   * @param sakstype - Case type (default: FTRL)
   */
  async opprettStandardSak(
    fnr: string,
    sakstype: string = SAKSTYPER.FTRL
  ): Promise<void> {
    await this.fyllInnBrukerID(fnr);
    await this.velgOpprettNySak();
    await this.velgSakstype(sakstype);
    await this.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
    await this.velgBehandlingstema(BEHANDLINGSTEMA.YRKESAKTIV);
    await this.velgAarsak(AARSAK.SØKNAD);
    await this.leggBehandlingIMine();
    await this.klikkOpprettNyBehandling();
  }

  /**
   * Complete workflow to create a new reassessment (Ny vurdering)
   * Convenience method for reassessment creation
   *
   * @param fnr - User's national ID
   * @param aarsak - Reason for reassessment (e.g., 'SØKNAD')
   */
  async opprettNyVurdering(fnr: string, aarsak: string = AARSAK.SØKNAD): Promise<void> {
    await this.fyllInnBrukerID(fnr);
    // The checkbox for selecting existing case (unnamed label)
    await this.page.getByLabel('', { exact: true }).check();
    await this.velgNyVurdering();
    await this.velgAarsak(aarsak);
    await this.leggBehandlingIMine();
    await this.klikkOpprettNyBehandling();
  }
}
