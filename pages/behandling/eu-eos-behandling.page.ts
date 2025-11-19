import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { EuEosBehandlingAssertions } from './eu-eos-behandling.assertions';

/**
 * Page Object for EU/EØS behandling workflow
 *
 * Ansvar:
 * - Fylle inn periode (med dateplukker)
 * - Velge land (EU/EØS-land)
 * - Bekrefte første steg
 * - Velge yrkesaktiv/selvstendig
 * - Velge arbeidsgiver(e)
 * - Velge arbeidstype (lønnet arbeid)
 * - Svare på spørsmål (Ja/Nei)
 * - Innvilge/avslå søknad
 * - Fatte vedtak
 *
 * Relaterte sider:
 * - OpprettNySakPage (navigerer fra)
 * - Komplett arbeidsflyt (siste steg)
 *
 * @example
 * const behandling = new EuEosBehandlingPage(page);
 * await behandling.fyllInnFraTilDato('01.01.2024', '01.01.2026');
 * await behandling.velgLand('Danmark');
 * await behandling.klikkBekreftOgFortsett();
 * await behandling.velgYrkesaktiv();
 * await behandling.klikkBekreftOgFortsett();
 */
export class EuEosBehandlingPage extends BasePage {
  readonly assertions: EuEosBehandlingAssertions;

  // Locators - Periode
  private readonly åpneDatepickerButton = this.page.getByRole('button', {
    name: 'Åpne datovelger'
  });

  private readonly årDropdown = this.page.getByRole('dialog').getByLabel('År');

  private readonly fraDatoField = this.page.getByRole('textbox', { name: 'Fra' });
  private readonly tilDatoField = this.page.getByRole('textbox', { name: 'Til' });

  // Locators - Land
  private readonly landDropdown = this.page.locator('.css-19bb58m');

  // Locators - Yrkesaktiv/Selvstendig
  private readonly yrkesaktivRadio = this.page.getByRole('radio', {
    name: 'Yrkesaktiv',
    exact: true
  });

  private readonly selvstendigRadio = this.page.getByRole('radio', {
    name: 'Selvstendig',
    exact: true
  });

  // Locators - Arbeidstype
  private readonly lønnetArbeidRadio = this.page.getByRole('radio', {
    name: 'Lønnet arbeid'
  });

  private readonly ulønnetArbeidRadio = this.page.getByRole('radio', {
    name: 'Ulønnet arbeid'
  });

  // Locators - Søknadsresultat
  private readonly innvilgeSøknadRadio = this.page.getByRole('radio', {
    name: 'Ja, jeg vil innvilge søknaden'
  });

  private readonly avslåSøknadRadio = this.page.getByRole('radio', {
    name: 'Nei, jeg vil avslå søknaden'
  });

  // Felles knapper
  private readonly bekreftOgFortsettButton = this.page.getByRole('button', {
    name: 'Bekreft og fortsett'
  });

  private readonly fattVedtakButton = this.page.getByRole('button', {
    name: 'Fatt vedtak'
  });

  constructor(page: Page) {
    super(page);
    this.assertions = new EuEosBehandlingAssertions(page);
  }

  /**
   * Åpne dateplukker og velg år og dag
   * Brukes for startdato
   *
   * @param år - År (f.eks. '2024')
   * @param dag - Dag som tekst (f.eks. 'fredag 1', 'lørdag 15')
   */
  async velgPeriodeMedDatepicker(år: string, dag: string): Promise<void> {
    await this.åpneDatepickerButton.first().click();
    console.log('✅ Åpnet dateplukker');

    await this.årDropdown.selectOption(år);
    console.log(`✅ Valgte år: ${år}`);

    await this.page.getByRole('button', { name: dag, exact: true }).click();
    console.log(`✅ Valgte dag: ${dag}`);
  }

  /**
   * Fyll inn startdato i tekstfelt
   *
   * @param dato - Dato i format DD.MM.YYYY (f.eks. '01.01.2024')
   */
  async fyllInnStartdato(dato: string): Promise<void> {
    await this.fraDatoField.click();
    await this.fraDatoField.fill(dato);
    await this.fraDatoField.press('Enter');
    console.log(`✅ Fylte inn startdato: ${dato}`);
  }

  /**
   * Fyll inn sluttdato i tekstfelt
   *
   * @param dato - Dato i format DD.MM.YYYY (f.eks. '01.01.2026')
   */
  async fyllInnSluttdato(dato: string): Promise<void> {
    await this.tilDatoField.click();
    await this.tilDatoField.fill(dato);
    await this.tilDatoField.press('Enter');
    console.log(`✅ Fylte inn sluttdato: ${dato}`);
  }

  /**
   * Fyll inn både startdato og sluttdato
   * Hjelpemetode som kombinerer startdato og sluttdato
   *
   * @param fraDato - Startdato i format DD.MM.YYYY (f.eks. '01.01.2024')
   * @param tilDato - Sluttdato i format DD.MM.YYYY (f.eks. '01.01.2026')
   */
  async fyllInnFraTilDato(fraDato: string, tilDato: string): Promise<void> {
    await this.fyllInnStartdato(fraDato);
    await this.fyllInnSluttdato(tilDato);
    console.log(`✅ Fylte inn periode: ${fraDato} - ${tilDato}`);
  }

  /**
   * Velg land fra dropdown
   * Bruker CSS-locator da denne dropdown-komponenten ikke har god label
   *
   * @param landNavn - Navn på land (f.eks. 'Danmark', 'Sverige')
   */
  async velgLand(landNavn: string): Promise<void> {
    await this.landDropdown.click();
    await this.page.getByRole('option', { name: landNavn }).click();
    // Vent litt for at siden skal oppdatere seg (kan trigge visning av andre felter)
    await this.page.waitForTimeout(500);
    console.log(`✅ Valgte land: ${landNavn}`);
  }

  /**
   * Velg andre land fra dropdown (for "Arbeid i flere land")
   * Dette er en multi-select dropdown - klikk samme dropdown igjen for å legge til flere land
   *
   * @param landNavn - Navn på land (f.eks. 'Norge')
   */
  async velgAndreLand(landNavn: string): Promise<void> {
    // For "Arbeid i flere land" er det en multi-select dropdown
    // Klikk samme dropdown igjen for å legge til flere land
    await this.landDropdown.click();

    // Velg landet fra listen
    await this.page.getByRole('option', { name: landNavn, exact: true }).click();
    console.log(`✅ Valgte andre land: ${landNavn}`);
  }

  /**
   * Velg "Yrkesaktiv" radio-knapp
   */
  async velgYrkesaktiv(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.yrkesaktivRadio.waitFor({ state: 'visible' });
    await this.yrkesaktivRadio.check();
    console.log('✅ Valgte: Yrkesaktiv');
  }

  /**
   * Velg "Selvstendig" radio-knapp
   */
  async velgSelvstendig(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.selvstendigRadio.waitFor({ state: 'visible' });
    await this.selvstendigRadio.check();
    console.log('✅ Valgte: Selvstendig');
  }

  /**
   * Velg arbeidsgiver(e) med checkbox
   *
   * @param arbeidsgiverNavn - Navn på arbeidsgiver (f.eks. 'Ståles Stål AS')
   */
  async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
    console.log(`🔍 Leter etter arbeidsgiver checkbox: "${arbeidsgiverNavn}"`);

    // Debug: Se hva som finnes på siden
    const pageContent = await this.page.content();
    console.log(`📄 Sidelengde: ${pageContent.length} bytes`);

    // Debug: Tell hvor mange checkboxer som finnes
    const allCheckboxes = await this.page.getByRole('checkbox').count();
    console.log(`✓ Fant ${allCheckboxes} checkboxer totalt på siden`);

    // Debug: Vis URL for å bekrefte hvilket steg vi er på
    console.log(`🔗 Nåværende URL: ${this.page.url()}`);

    const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });

    // Vent på at checkbox er synlig og stabil før sjekking (unngår race condition)
    // Økt timeout til 30 sekunder for å håndtere treg lasting på Virksomhet-steget
    try {
      await checkbox.waitFor({ state: 'visible', timeout: 30000 });
      await checkbox.check();
      console.log(`✅ Valgte arbeidsgiver: ${arbeidsgiverNavn}`);
    } catch (error) {
      // Debug: Hvis det feiler, vis hva som faktisk finnes på siden
      console.error(`❌ Kunne ikke finne checkbox "${arbeidsgiverNavn}"`);
      console.error(`📸 Tar screenshot for debugging...`);
      await this.page.screenshot({ path: 'debug-missing-checkbox.png', fullPage: true });

      // List alle checkboxer som finnes
      const checkboxes = await this.page.getByRole('checkbox').all();
      console.error(`📋 Tilgjengelige checkboxer (${checkboxes.length}):`);
      for (const cb of checkboxes) {
        const label = await cb.getAttribute('aria-label') || await cb.getAttribute('name') || 'ingen label';
        console.error(`   - ${label}`);
      }

      throw error;
    }
  }

  /**
   * Velg "Lønnet arbeid" radio-knapp
   */
  async velgLønnetArbeid(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.lønnetArbeidRadio.waitFor({ state: 'visible' });
    await this.lønnetArbeidRadio.check();
    console.log('✅ Valgte: Lønnet arbeid');
  }

  /**
   * Velg "Ulønnet arbeid" radio-knapp
   */
  async velgUlønnetArbeid(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.ulønnetArbeidRadio.waitFor({ state: 'visible' });
    await this.ulønnetArbeidRadio.check();
    console.log('✅ Valgte: Ulønnet arbeid');
  }

  /**
   * Svar "Ja" på første synlige spørsmål
   * Brukes når det bare er ett spørsmål på siden
   */
  async svarJa(): Promise<void> {
    const jaRadio = this.page.getByRole('radio', { name: 'Ja' });
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await jaRadio.waitFor({ state: 'visible' });
    await jaRadio.check();
    console.log('✅ Svarte: Ja');
  }

  /**
   * Svar "Nei" på første synlige spørsmål
   */
  async svarNei(): Promise<void> {
    const neiRadio = this.page.getByRole('radio', { name: 'Nei' });
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await neiRadio.waitFor({ state: 'visible' });
    await neiRadio.check();
    console.log('✅ Svarte: Nei');
  }

  /**
   * Velg "Ja, jeg vil innvilge søknaden"
   */
  async innvilgeSøknad(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.innvilgeSøknadRadio.waitFor({ state: 'visible' });
    await this.innvilgeSøknadRadio.check();
    console.log('✅ Valgte: Innvilge søknaden');
  }

  /**
   * Velg "Nei, jeg vil avslå søknaden"
   */
  async avslåSøknad(): Promise<void> {
    // Vent på at radio-knapp er synlig og stabil før sjekking (unngår race condition)
    await this.avslåSøknadRadio.waitFor({ state: 'visible' });
    await this.avslåSøknadRadio.check();
    console.log('✅ Valgte: Avslå søknaden');
  }

  /**
   * Klikk "Bekreft og fortsett" knapp
   * Venter på at siden er klar etter navigasjon
   */
  async klikkBekreftOgFortsett(): Promise<void> {
    console.log('🔄 Klikker "Bekreft og fortsett"...');
    const urlBefore = this.page.url();

    // Check if button is enabled before clicking
    const isEnabled = await this.bekreftOgFortsettButton.isEnabled();
    console.log(`  Knapp aktivert: ${isEnabled}`);

    await this.bekreftOgFortsettButton.click();

    // Vent på at React state oppdaterer og nettverket blir stille
    // Dette sikrer at neste steg er helt ferdig lastet før vi fortsetter
    await this.page.waitForTimeout(500);
    await this.page.waitForLoadState('networkidle', { timeout: 15000 });

    const urlAfter = this.page.url();
    console.log(`✅ Klikket Bekreft og fortsett`);
    console.log(`  URL før:  ${urlBefore}`);
    console.log(`  URL etter: ${urlAfter}`);
    console.log(`  URL endret: ${urlBefore !== urlAfter}`);
  }

  /**
   * Klikk "Fatt vedtak" knapp for å fullføre behandlingen
   * EU/EØS fatter vedtak direkte uten egen vedtaksside
   */
  async fattVedtak(): Promise<void> {
    // Vent på at nettverket er stille før vi fatter vedtak
    // Dette sikrer at alle tidligere API-kall er fullført
    await this.page.waitForLoadState('networkidle', { timeout: 10000 });

    // Vent på at "Fatt vedtak"-knappen er synlig og aktivert
    await this.fattVedtakButton.waitFor({ state: 'visible', timeout: 10000 });

    await this.fattVedtakButton.click();
    console.log('✅ Fattet vedtak');
  }

  /**
   * Fullfør periode-seksjonen
   * Hjelpemetode for første steg
   *
   * @param år - År (default: '2024')
   * @param dag - Dag (default: 'fredag 1')
   * @param sluttdato - Sluttdato (default: '01.01.2026')
   * @param land - Land (default: 'Danmark')
   */
  async fyllUtPeriodeOgLand(
    år: string = '2024',
    dag: string = 'fredag 1',
    sluttdato: string = '01.01.2026',
    land: string = 'Danmark'
  ): Promise<void> {
    await this.velgPeriodeMedDatepicker(år, dag);
    await this.fyllInnSluttdato(sluttdato);
    await this.velgLand(land);
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Fullfør yrkesaktiv/selvstendig-seksjonen
   * Hjelpemetode for andre steg
   *
   * @param erYrkesaktiv - true for Yrkesaktiv, false for Selvstendig (default: true)
   */
  async velgYrkesaktivEllerSelvstendigOgFortsett(erYrkesaktiv: boolean = true): Promise<void> {
    if (erYrkesaktiv) {
      await this.velgYrkesaktiv();
    } else {
      await this.velgSelvstendig();
    }
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Fullfør arbeidsgiver-seksjonen
   * Hjelpemetode for tredje steg
   *
   * @param arbeidsgiverNavn - Navn på arbeidsgiver (default: 'Ståles Stål AS')
   */
  async velgArbeidsgiverOgFortsett(arbeidsgiverNavn: string = 'Ståles Stål AS'): Promise<void> {
    await this.velgArbeidsgiver(arbeidsgiverNavn);
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Fullfør arbeidstype-seksjonen
   * Hjelpemetode for fjerde steg
   *
   * @param erLønnetArbeid - true for Lønnet arbeid, false for Ulønnet arbeid (default: true)
   */
  async velgArbeidstype(erLønnetArbeid: boolean = true): Promise<void> {
    if (erLønnetArbeid) {
      await this.velgLønnetArbeid();
    } else {
      await this.velgUlønnetArbeid();
    }
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Svar "Ja" på et spørsmål og gå videre
   * Hjelpemetode for spørsmålssteg
   */
  async svarJaOgFortsett(): Promise<void> {
    await this.svarJa();
    await this.svarJa();
    await this.klikkBekreftOgFortsett();
  }

  /**
   * Innvilg søknad og fatt vedtak
   * Hjelpemetode for siste steg
   */
  async innvilgeOgFattVedtak(): Promise<void> {
    await this.innvilgeSøknad();
    await this.klikkBekreftOgFortsett();
    await this.fattVedtak();
  }

  /**
   * Fullfør hele EU/EØS behandlingsflyt med standardverdier
   * Hjelpemetode for komplett arbeidsflyt
   */
  async fyllUtEuEosBehandling(): Promise<void> {
    await this.fyllUtPeriodeOgLand();
    await this.velgYrkesaktivEllerSelvstendigOgFortsett();
    await this.velgArbeidsgiverOgFortsett();
    await this.velgArbeidstype();
    await this.svarJaOgFortsett(); // Første spørsmål
    await this.svarJaOgFortsett(); // Andre spørsmål
    await this.innvilgeOgFattVedtak();
  }
}
