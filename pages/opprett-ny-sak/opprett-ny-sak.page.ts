import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { OpprettNySakAssertions } from './opprett-ny-sak.assertions';
import { SAKSTYPER, SAKSTEMA, BEHANDLINGSTEMA, AARSAK, TIMEOUT_MEDIUM } from '../shared/constants';

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

  // melosys-web renders the existing-sak checkbox without an accessible label.
  private readonly eksisterendeSakCheckbox = this.page.getByLabel('', { exact: true });

  private readonly euEosTrygdeavgiftHeading = this.page.getByRole('heading', {
    name: 'EU/EØS-land - Trygdeavgift'
  });

  private readonly aarsavregningOption = this.page.getByRole('radio', {
    name: 'Årsavregning',
  });

  private readonly aarsakDropdown = this.page.getByLabel('Årsak', { exact: true });

  // Søknadsperiode (vises for EU/EØS-saker som krever periode og land)
  private readonly soknadsperiodeGroup = this.page.getByRole('group', {
    name: /Søknadsperiode/i,
  });
  private readonly soknadsperiodeFraField = this.soknadsperiodeGroup.getByRole('textbox', {
    name: 'Fra',
  });
  private readonly soknadsperiodeTilField = this.soknadsperiodeGroup.getByRole('textbox', {
    name: 'Til',
  });

  // Arbeidsland (React Select / MultiSelect, vises for EU/EØS-saker)
  private readonly arbeidslandGroup = this.page.getByRole('group', {
    name: /I hvilke land/i,
  });
  private readonly arbeidslandCombobox = this.arbeidslandGroup.getByRole('combobox');

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
   * Select Pensjonist/uføretrygdet treatment theme for an existing sak
   */
  async velgPensjonistUforetrygdet(): Promise<void> {
    await this.velgBehandlingstema(BEHANDLINGSTEMA.PENSJONIST);
  }

  /**
   * Select EU/EØS-land - Trygdeavgift section for an existing sak
   */
  async velgEuEosLandTrygdeavgift(): Promise<void> {
    await this.euEosTrygdeavgiftHeading.waitFor({ state: 'visible', timeout: TIMEOUT_MEDIUM });
    // The accordion/disclosure is exposed as a heading in melosys-web's a11y tree.
    await this.euEosTrygdeavgiftHeading.click();
  }

  /**
   * Select Årsavregning behandling for the chosen sak
   */
  async velgAarsavregningBehandling(): Promise<void> {
    await this.aarsavregningOption.waitFor({ state: 'visible', timeout: TIMEOUT_MEDIUM });
    await this.aarsavregningOption.click();
  }

  /**
   * Select existing pensjonistsak and choose Årsavregning behandling
   */
  async velgPensjonistAarsavregning(): Promise<void> {
    await this.velgEuEosLandTrygdeavgift();
    await this.velgPensjonistUforetrygdet();
    await this.velgAarsavregningBehandling();
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
   * Fill the application period (Søknadsperiode) on EU/EØS case creation.
   *
   * Uses the date textboxes directly instead of clicking through the calendar
   * widget — this is deterministic and does not depend on which month the
   * datepicker happens to default to.
   *
   * @param fra - Start date in format DD.MM.YYYY (e.g., "01.01.2024")
   * @param til - End date in format DD.MM.YYYY (e.g., "31.12.2024")
   */
  async velgSøknadsperiode(fra: string, til: string): Promise<void> {
    await this.soknadsperiodeFraField.fill(fra);
    await this.soknadsperiodeFraField.press('Enter');
    await this.soknadsperiodeTilField.fill(til);
    await this.soknadsperiodeTilField.press('Enter');
  }

  /**
   * Select work country (Arbeidsland) on EU/EØS case creation.
   *
   * Scopes to the "I hvilke land skal arbeidet/næringen utføres i?" fieldset and
   * its combobox instead of a positional CSS selector, so it survives field
   * reordering on the form.
   *
   * @param land - Country name (e.g., "Bulgaria")
   */
  async velgArbeidsland(land: string): Promise<void> {
    await this.arbeidslandCombobox.click();
    await this.arbeidslandCombobox.fill(land);
    // Escape regex-metategn slik at landnavn med spesialtegn matcher som ren tekst
    const landEscaped = land.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await this.page
      .getByRole('option', { name: new RegExp(`^${landEscaped}`, 'i') })
      .first()
      .click();
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
    await this.eksisterendeSakCheckbox.check();
    await this.velgNyVurdering();
    await this.velgAarsak(aarsak);
    await this.leggBehandlingIMine();
    await this.klikkOpprettNyBehandling();
  }
}
