import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { EuEosVedtakAssertions } from './eu-eos-vedtak.assertions';

/**
 * Page Object for EU/EØS Vedtak (Decision) section
 *
 * Ansvar:
 * - Fylle inn fritekstfelt til begrunnelse
 * - Fylle inn ytterligere informasjon til arbeidsgiver
 * - Sende orienteringsbrev
 * - Forhåndsvise dokumenter
 * - Fatte vedtak
 *
 * Relaterte sider:
 * - EuEosBehandlingPage (navigerer fra)
 * - Komplett arbeidsflyt (siste steg)
 *
 * VIKTIG: Denne siden vises ETTER at "Ja, jeg vil innvilge søknaden" er valgt
 * og "Bekreft og fortsett" er klikket. Den håndterer vedtaksseksjonen med
 * tekstfelt og dokumentforhåndsvisning.
 *
 * @example
 * const vedtak = new EuEosVedtakPage(page);
 * await vedtak.fyllInnBegrunnelse('Testing testing');
 * await vedtak.fyllInnYtterligereInformasjon('Jonas tester masse');
 * await vedtak.sendOrienteringsbrev();
 * await vedtak.forhåndsvisInnvilgelseDokument();
 * await vedtak.forhåndsvisOrienteringDokument();
 * await vedtak.klikkFattVedtak();
 */
export class EuEosVedtakPage extends BasePage {
  readonly assertions: EuEosVedtakAssertions;

  // Locators - Tekstfelt
  private readonly begrunnelseField = this.page.getByRole('textbox', {
    name: 'Fritekstfelt til begrunnelse'
  });

  private readonly ytterligereInformasjonField = this.page.getByRole('textbox', {
    name: 'Ytterligere informasjon til'
  });

  // Locators - Orienteringsbrev
  private readonly sendOrienteringsbrevCheckbox = this.page.getByRole('checkbox', {
    name: 'Send orienteringsbrev til'
  });

  // Locators - Dokumentforhåndsvisning
  private readonly innvilgelseDokumentLink = this.page.getByText('Innvilgelse yrkesaktiv');
  private readonly orienteringDokumentLink = this.page.getByText('Orientering til arbeidsgiver');

  // Locators - Knapper
  private readonly fattVedtakButton = this.page.getByRole('button', {
    name: 'Fatt vedtak'
  });

  constructor(page: Page) {
    super(page);
    this.assertions = new EuEosVedtakAssertions(page);
  }

  /**
   * Fyll inn fritekstfelt til begrunnelse
   * Dette er en påkrevd fritekst for å begrunne vedtaket
   *
   * VIKTIG: Presser Tab etter utfylling for å trigge validering og flytte fokus
   *
   * @param tekst - Begrunnelsestekst (f.eks. 'Testing testing')
   */
  async fyllInnBegrunnelse(tekst: string): Promise<void> {
    await this.begrunnelseField.click();
    await this.begrunnelseField.fill(tekst);
    await this.begrunnelseField.press('Tab');
    console.log(`✅ Fylte inn begrunnelse: "${tekst}"`);
  }

  /**
   * Fyll inn ytterligere informasjon til arbeidsgiver
   * Valgfritt felt for ekstra informasjon
   *
   * @param tekst - Informasjonstekst (f.eks. 'Jonas tester masse')
   */
  async fyllInnYtterligereInformasjon(tekst: string): Promise<void> {
    await this.ytterligereInformasjonField.fill(tekst);
    console.log(`✅ Fylte inn ytterligere informasjon: "${tekst}"`);
  }

  /**
   * Kryss av for å sende orienteringsbrev til arbeidsgiver
   */
  async sendOrienteringsbrev(): Promise<void> {
    await this.sendOrienteringsbrevCheckbox.check();
    console.log('✅ Krysset av: Send orienteringsbrev til arbeidsgiver');
  }

  /**
   * Forhåndsvis innvilgelsesdokument (åpner popup)
   * Klikker på "Innvilgelse yrkesaktiv" link
   *
   * @returns Promise that resolves to the popup page
   */
  async forhåndsvisInnvilgelseDokument(): Promise<Page> {
    const popupPromise = this.page.waitForEvent('popup');
    await this.innvilgelseDokumentLink.click();
    const popup = await popupPromise;
    console.log('✅ Åpnet innvilgelsesdokument i popup');
    return popup;
  }

  /**
   * Forhåndsvis orienteringsdokument til arbeidsgiver (åpner popup)
   * Klikker på "Orientering til arbeidsgiver" link
   *
   * @returns Promise that resolves to the popup page
   */
  async forhåndsvisOrienteringDokument(): Promise<Page> {
    const popupPromise = this.page.waitForEvent('popup');
    await this.orienteringDokumentLink.click();
    const popup = await popupPromise;
    console.log('✅ Åpnet orienteringsdokument i popup');
    return popup;
  }

  /**
   * Klikk "Fatt vedtak" knapp for å fullføre behandlingen
   * Dette er det siste steget i EU/EØS-arbeidsflyten
   */
  async klikkFattVedtak(): Promise<void> {
    await this.fattVedtakButton.click();
    console.log('✅ Fattet vedtak - EU/EØS-arbeidsflyt fullført');
  }

  /**
   * Fullfør hele vedtaksseksjonen med standardverdier
   * Hjelpemetode for komplett vedtaksflyt
   *
   * @param begrunnelse - Begrunnelsestekst (default: 'Testing testing')
   * @param ytterligereInfo - Ytterligere info (default: 'Ekstra informasjon')
   * @param sendOrientering - Send orienteringsbrev (default: true)
   * @param forhåndsvisDokumenter - Forhåndsvis dokumenter (default: false)
   */
  async fyllUtVedtak(
    begrunnelse: string = 'Testing testing',
    ytterligereInfo: string = 'Ekstra informasjon',
    sendOrientering: boolean = true,
    forhåndsvisDokumenter: boolean = false
  ): Promise<void> {
    await this.fyllInnBegrunnelse(begrunnelse);
    await this.fyllInnYtterligereInformasjon(ytterligereInfo);

    if (sendOrientering) {
      await this.sendOrienteringsbrev();
    }

    if (forhåndsvisDokumenter) {
      await this.forhåndsvisInnvilgelseDokument();
      await this.forhåndsvisOrienteringDokument();
    }

    await this.klikkFattVedtak();
  }
}
