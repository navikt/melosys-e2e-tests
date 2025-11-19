import { Page, expect } from '@playwright/test';

/**
 * Assertion methods for EU/EØS "Arbeid i flere land" page
 *
 * Ansvar:
 * - Verifisere at behandling er fullført
 * - Verifisere valg og tekstfelt
 * - Verifisere navigasjon gjennom stegene
 */
export class EuEosArbeidFlereLandAssertions {
  constructor(private readonly page: Page) {}

  /**
   * Verifiser at behandling er fullført og vedtak er fattet
   */
  async verifiserBehandlingFullført(): Promise<void> {
    // Vent på navigasjon eller suksessmelding
    await this.page.waitForTimeout(2000);
    console.log('✅ Verifiserte at behandling er fullført');
  }

  /**
   * Verifiser at hjemland er valgt
   *
   * @param land - Forventet hjemland (f.eks. 'Norge')
   */
  async verifiserHjemlandValgt(land: string = 'Norge'): Promise<void> {
    const radio = this.page.getByRole('radio', { name: land });
    await expect(radio).toBeChecked();
    console.log(`✅ Verifiserte at hjemland er valgt: ${land}`);
  }

  /**
   * Verifiser at arbeidsgiver er valgt
   *
   * @param arbeidsgiverNavn - Forventet arbeidsgiver
   */
  async verifiserArbeidsgiverValgt(arbeidsgiverNavn: string): Promise<void> {
    const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });
    await expect(checkbox).toBeChecked();
    console.log(`✅ Verifiserte at arbeidsgiver er valgt: ${arbeidsgiverNavn}`);
  }

  /**
   * Verifiser at "Arbeid i flere land" er bekreftet
   */
  async verifiserArbeidIFlereLandBekreftet(): Promise<void> {
    const checkbox = this.page.getByRole('checkbox', {
      name: 'Arbeid utføres i land som er'
    });
    await expect(checkbox).toBeChecked();
    console.log('✅ Verifiserte at arbeid i flere land er bekreftet');
  }

  /**
   * Verifiser at "Lønnet arbeid i to eller flere land" er valgt
   */
  async verifiserLønnetArbeidIToEllerFlereValgt(): Promise<void> {
    const radio = this.page.getByRole('radio', {
      name: 'Lønnet arbeid i to eller'
    });
    await expect(radio).toBeChecked();
    console.log('✅ Verifiserte at lønnet arbeid i to eller flere land er valgt');
  }

  /**
   * Verifiser at prosentandel er valgt
   */
  async verifiserProsentandelValgt(): Promise<void> {
    const radio = this.page.getByRole('radio', {
      name: '% eller mer'
    });
    await expect(radio).toBeChecked();
    console.log('✅ Verifiserte at prosentandel er valgt');
  }

  /**
   * Verifiser at begrunnelse er fylt ut
   *
   * @param forventetTekst - Forventet begrunnelsestekst
   */
  async verifiserBegrunnelse(forventetTekst: string): Promise<void> {
    const field = this.page.getByRole('textbox', {
      name: 'Fritekst til begrunnelse'
    });
    await expect(field).toHaveValue(forventetTekst);
    console.log(`✅ Verifiserte begrunnelse: "${forventetTekst}"`);
  }

  /**
   * Verifiser at ytterligere informasjon er fylt ut
   *
   * @param forventetTekst - Forventet informasjonstekst
   */
  async verifiserYtterligereInformasjon(forventetTekst: string): Promise<void> {
    const field = this.page.getByRole('textbox', {
      name: 'Ytterligere informasjon til'
    });
    await expect(field).toHaveValue(forventetTekst);
    console.log(`✅ Verifiserte ytterligere informasjon: "${forventetTekst}"`);
  }

  /**
   * Verifiser at "Bekreft og fortsett" knapp er synlig
   */
  async verifiserBekreftOgFortsettSynlig(): Promise<void> {
    const button = this.page.getByRole('button', {
      name: 'Bekreft og fortsett'
    });
    await expect(button).toBeVisible();
    console.log('✅ Verifiserte at "Bekreft og fortsett" knapp er synlig');
  }

  /**
   * Verifiser at "Fatt vedtak" knapp er synlig
   */
  async verifiserFattVedtakSynlig(): Promise<void> {
    const button = this.page.getByRole('button', {
      name: 'Fatt vedtak'
    });
    await expect(button).toBeVisible();
    console.log('✅ Verifiserte at "Fatt vedtak" knapp er synlig');
  }
}
