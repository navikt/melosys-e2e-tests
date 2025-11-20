import { Page } from '@playwright/test';
import { EuEosBehandlingPage } from './eu-eos-behandling.page';
import { EuEosSkipBehandlingAssertions } from './eu-eos-skip-behandling.assertions';

/**
 * Page Object for EU/EØS Skip (Ship) behandling workflow
 *
 * Arver fra EuEosBehandlingPage og legger til skip-spesifikk funksjonalitet:
 * - Velge yrkesaktiv på sokkel
 * - Legge til arbeidssted på skip
 * - Fylle inn skipdetaljer (navn, flaggstat, fartsområde)
 * - Svare på maritime spørsmål
 *
 * Relaterte sider:
 * - EuEosBehandlingPage (base class)
 * - OpprettNySakPage (navigerer fra)
 *
 * @example
 * const skipBehandling = new EuEosSkipBehandlingPage(page);
 * await skipBehandling.velgYrkesaktivPaSokkel();
 * await skipBehandling.klikkBekreftOgFortsett();
 * await skipBehandling.leggTilSkipOgFyllUtDetaljer('Hilda', 'UTENRIKS', 'Frankrike (FR)');
 * await skipBehandling.klikkBekreftOgFortsett();
 */
export class EuEosSkipBehandlingPage extends EuEosBehandlingPage {
  override readonly assertions: EuEosSkipBehandlingAssertions;

  // Locators - Yrkesaktiv på sokkel
  private readonly yrkesaktivPaSokkelRadio = this.page.getByRole('radio', {
    name: 'Yrkesaktiv på sokkel eller'
  });

  // Locators - Arbeidssted
  private readonly arbeidsstedButton = this.page.getByRole('button', {
    name: 'Arbeidssted(er)'
  });

  private readonly leggTilSkipButton = this.page.getByRole('button', {
    name: 'Legg til nytt arbeidssted på skip'
  });

  // Locators - Skip detaljer
  private readonly skipNavnField = this.page.getByRole('textbox', {
    name: 'Navn på skip'
  });

  private readonly fartsomradeDropdown = this.page.getByLabel('Fartsområde');

  private readonly flaggstatCombobox = this.page.getByRole('combobox', {
    name: 'Flaggstat'
  });

  // Locators - Skip spørsmål
  private readonly norskSokkelRadio = this.page.getByRole('radio', {
    name: 'På norsk sokkel eller'
  });

  private readonly skipRegistrertIEttLandRadio = this.page.getByRole('radio', {
    name: 'På skip registrert i ett land'
  });

  private readonly skipRadio = this.page.getByRole('radio', {
    name: 'Skip',
    exact: true
  });

  private readonly arbeiderPaNorskSkipRadio = this.page.getByRole('radio', {
    name: 'Arbeider på norsk skip'
  });

  private readonly arbeiderPaUtenlandskSkipRadio = this.page.getByRole('radio', {
    name: 'Arbeider på utenlandsk skip,'
  });

  constructor(page: Page) {
    super(page);
    this.assertions = new EuEosSkipBehandlingAssertions(page);
  }

  /**
   * Velg "Yrkesaktiv på sokkel eller" radio-knapp
   * Brukes for skip/sokkel-arbeidsforhold
   */
  async velgYrkesaktivPaSokkel(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.yrkesaktivPaSokkelRadio.waitFor({ state: 'visible' });
    await this.yrkesaktivPaSokkelRadio.check();
    console.log('✅ Valgte: Yrkesaktiv på sokkel eller');
  }

  /**
   * Klikk "Arbeidssted(er)" knapp
   * Åpner seksjon for å legge til arbeidssted
   */
  async klikkArbeidssted(): Promise<void> {
    await this.arbeidsstedButton.click();
    console.log('✅ Klikket Arbeidssted(er)');
  }

  /**
   * Klikk "Legg til nytt arbeidssted på skip"
   * Åpner skjema for skipdetaljer
   */
  async leggTilNyttSkip(): Promise<void> {
    await this.leggTilSkipButton.click();
    console.log('✅ Klikket Legg til nytt arbeidssted på skip');
  }

  /**
   * Fyll inn navn på skip
   *
   * @param navn - Skipets navn (f.eks. 'Hilda', 'Titanic')
   */
  async fyllInnSkipNavn(navn: string): Promise<void> {
    await this.skipNavnField.click();
    await this.skipNavnField.fill(navn);
    // Trigger blur to ensure any API saves complete
    await this.skipNavnField.blur();
    await this.page.waitForTimeout(300);
    console.log(`✅ Fylte inn skipnavn: ${navn}`);
  }

  /**
   * Velg fartsområde for skipet
   *
   * @param fartsomrade - 'UTENRIKS' eller 'INNENRIKS'
   */
  async velgFartsomrade(fartsomrade: 'UTENRIKS' | 'INNENRIKS'): Promise<void> {
    await this.fartsomradeDropdown.selectOption(fartsomrade);
    // Allow time for any triggered API calls or field enabling
    await this.page.waitForTimeout(300);
    console.log(`✅ Valgte fartsområde: ${fartsomrade}`);
  }

  /**
   * Velg flaggstat (flaggland) for skipet
   * Bruker combobox med søk
   *
   * @param land - Land med format "LandNavn (Kode)" (f.eks. 'Frankrike (FR)')
   */
  async velgFlaggstat(land: string): Promise<void> {
    await this.flaggstatCombobox.click();
    await this.flaggstatCombobox.fill(land);
    // Press Enter to confirm selection and trigger any API calls
    await this.flaggstatCombobox.press('Enter');
    await this.page.waitForTimeout(300);
    console.log(`✅ Valgte flaggstat: ${land}`);
  }

  /**
   * Velg "På norsk sokkel eller" radio-knapp
   *
   * @remarks
   * Alternative scenario method - not used in current test flow.
   * Current test uses foreign ship scenario with `velgFlagglandSomArbeidsland()`.
   * Keep for future Norwegian continental shelf test scenarios.
   */
  async velgNorskSokkel(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.norskSokkelRadio.waitFor({ state: 'visible' });
    await this.norskSokkelRadio.check();
    console.log('✅ Valgte: På norsk sokkel eller');
  }

  /**
   * Velg "På skip registrert i ett land" radio-knapp
   */
  async velgSkipRegistrertIEttLand(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.skipRegistrertIEttLandRadio.waitFor({ state: 'visible' });
    await this.skipRegistrertIEttLandRadio.check();
    console.log('✅ Valgte: På skip registrert i ett land');
  }

  /**
   * Velg flaggland som arbeidsland
   * Dette er en dynamisk radio-knapp basert på valgt flaggstat
   *
   * @param land - Landnavn (f.eks. 'Frankrike')
   */
  async velgFlagglandSomArbeidsland(land: string): Promise<void> {
    const flagglandRadio = this.page.getByRole('radio', {
      name: `${land} - Flaggland`
    });
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await flagglandRadio.waitFor({ state: 'visible' });
    await flagglandRadio.check();
    console.log(`✅ Valgte: ${land} - Flaggland`);
  }

  /**
   * Velg "Skip" som arbeidssted
   */
  async velgSkip(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.skipRadio.waitFor({ state: 'visible' });
    await this.skipRadio.check();
    console.log('✅ Valgte: Skip');
  }

  /**
   * Velg "Arbeider på norsk skip" spørsmål
   *
   * @remarks
   * Alternative scenario method - not used in current test flow.
   * Current test uses foreign ship scenario with `velgArbeiderPaUtenlandskSkip()`.
   * Keep for future Norwegian ship employment test scenarios.
   */
  async velgArbeiderPaNorskSkip(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.arbeiderPaNorskSkipRadio.waitFor({ state: 'visible' });
    await this.arbeiderPaNorskSkipRadio.check();
    console.log('✅ Valgte: Arbeider på norsk skip');
  }

  /**
   * Velg "Arbeider på utenlandsk skip" spørsmål
   */
  async velgArbeiderPaUtenlandskSkip(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.arbeiderPaUtenlandskSkipRadio.waitFor({ state: 'visible' });
    await this.arbeiderPaUtenlandskSkipRadio.check();
    console.log('✅ Valgte: Arbeider på utenlandsk skip');
  }

  /**
   * Hjelpemetode: Legg til skip og fyll ut alle detaljer
   * Kombinerer flere steg i én metode
   *
   * VIKTIG: Rekkefølgen er kritisk! Enkelte felt blir først aktivert etter tidligere valg.
   *
   * @param skipNavn - Navn på skipet (f.eks. 'Hilda')
   * @param fartsomrade - 'UTENRIKS' eller 'INNENRIKS'
   * @param flaggstat - Flaggland med format "Land (Kode)" (f.eks. 'Frankrike (FR)')
   * @param flagglandNavn - Bare landnavnet for radio-knapp (f.eks. 'Frankrike')
   */
  async leggTilSkipOgFyllUtDetaljer(
    skipNavn: string,
    fartsomrade: 'UTENRIKS' | 'INNENRIKS',
    flaggstat: string,
    flagglandNavn: string
  ): Promise<void> {
    await this.klikkArbeidssted();
    await this.leggTilNyttSkip();
    await this.fyllInnSkipNavn(skipNavn);
    await this.velgFartsomrade(fartsomrade);
    await this.velgFlaggstat(flaggstat);
    // VIKTIG: Må velge "Skip" først for å aktivere de andre valgene
    await this.velgSkip();
    // Wait for dependent fields to become enabled after Skip selection
    await this.page.waitForTimeout(300);
    await this.velgFlagglandSomArbeidsland(flagglandNavn);
    await this.velgSkipRegistrertIEttLand();
    console.log('✅ Fullførte skipdetaljer');
  }

  /**
   * Fullfør hele skip-arbeidsflyt med standardverdier
   * Hjelpemetode for komplett skip-behandling
   *
   * @param skipNavn - Navn på skipet (default: 'Hilda')
   * @param arbeidsgiverNavn - Navn på arbeidsgiver (default: 'Ståles Stål AS')
   */
  async fyllUtSkipBehandling(
    skipNavn: string = 'Hilda',
    arbeidsgiverNavn: string = 'Ståles Stål AS'
  ): Promise<void> {
    // Steg 1: Bekreft periode/land (allerede fylt ved opprettelse)
    await this.klikkBekreftOgFortsett();

    // Steg 2: Velg yrkesaktiv på sokkel
    await this.velgYrkesaktivPaSokkel();
    await this.klikkBekreftOgFortsett();

    // Steg 3: Legg til skip med detaljer
    await this.leggTilSkipOgFyllUtDetaljer(
      skipNavn,
      'UTENRIKS',
      'Frankrike (FR)',
      'Frankrike'
    );
    await this.klikkBekreftOgFortsett();

    // Steg 4: Velg arbeidsgiver
    await this.velgArbeidsgiver(arbeidsgiverNavn);
    await this.klikkBekreftOgFortsett();

    // Steg 5: Velg land (Norge)
    const norgeRadio = this.page.getByRole('radio', { name: 'Norge' });
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await norgeRadio.waitFor({ state: 'visible' });
    await norgeRadio.check();
    await this.klikkBekreftOgFortsett();

    // Steg 6: Vurdering skip - velg EN situasjon (radio buttons)
    // For utenlandsk skip med norsk arbeidsgiver:
    await this.velgArbeiderPaUtenlandskSkip();
    await this.klikkBekreftOgFortsett();

    // Steg 7: Fatt vedtak
    await this.fattVedtak();

    console.log('✅ Fullførte skip-behandling');
  }
}
