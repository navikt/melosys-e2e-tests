import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { TIMEOUT_LONG } from '../shared/constants';

/**
 * Page Object for steget «Manglende innbetaling» i MANGLENDE_INNBETALING_TRYGDEAVGIFT-
 * behandlingen (FTRL frivillig medlemskap, § 2-15 andre ledd).
 *
 * Behandlingen opprettes automatisk av melosys-api når faktureringskomponenten melder
 * MANGLENDE_INNBETALING på en fakturaserie for frivillig medlemskap. Steget viser en
 * radiogruppe med 4 valg (ManglendeInnbetalingHandlingsvalg-enum):
 *   - «Hele perioden skal opphøres»    → hopper rett til opphørsvedtak-steget
 *     «Opphør av frivillig medlemskap etter § 2-15»
 *   - «Deler av perioden skal opphøres» → full revurderingsflyt (Inngang → ... → Vedtak)
 *   - «Vedtaket skal endres.»
 *   - «Behandlingen skal avsluttes.»
 *
 * @example
 * const manglendeInnbetaling = new ManglendeInnbetalingPage(page);
 * await manglendeInnbetaling.ventPaaSteg();
 * await manglendeInnbetaling.velgInnbetalingManglerHelePerioden();
 * await manglendeInnbetaling.bekreftOgGaaTilOpphoersvedtak();
 * // Deretter: VedtakPage.klikkFattVedtak() på opphørssteget
 */
export class ManglendeInnbetalingPage extends BasePage {
  // h1 rendres kun når steget er aktivt (komponenten returnerer null ellers)
  private readonly stegHeading = this.page.getByRole('heading', {
    name: 'Manglende innbetaling',
  });

  private readonly helePeriodenRadio = this.page.getByRole('radio', {
    name: /Hele perioden skal opphøres/,
  });

  private readonly delerAvPeriodenRadio = this.page.getByRole('radio', {
    name: /Deler av perioden skal opphøres/,
  });

  private readonly bekreftButton = this.page.getByRole('button', {
    name: 'Bekreft og fortsett',
  });

  // Opphørsvedtak-steget som «hele perioden»-valget hopper rett til
  private readonly opphoerHeading = this.page.getByRole('heading', {
    name: 'Opphør av frivillig medlemskap etter § 2-15',
  });

  constructor(page: Page) {
    super(page);
  }

  /**
   * Vent på at steget «Manglende innbetaling» er synlig etter navigering til behandlingen
   */
  async ventPaaSteg(): Promise<void> {
    await this.stegHeading.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
    console.log('✅ Steg «Manglende innbetaling» er synlig');
  }

  /**
   * Velg «Hele perioden skal opphøres»
   *
   * Valget lagres ikke ved radio-onChange, kun ved «Bekreft og fortsett»
   * (se bekreftOgGaaTilOpphoersvedtak/bekreftOgGaaTilRevurderingsflyt).
   */
  async velgInnbetalingManglerHelePerioden(): Promise<void> {
    await this.helePeriodenRadio.check();
    console.log('✅ Valgt: HELE perioden skal opphøres');
  }

  /**
   * Velg «Deler av perioden skal opphøres»
   *
   * Valget lagres ikke ved radio-onChange, kun ved «Bekreft og fortsett»
   * (se bekreftOgGaaTilRevurderingsflyt).
   */
  async velgInnbetalingManglerDelerAvPerioden(): Promise<void> {
    if (await this.delerAvPeriodenRadio.isChecked()) {
      console.log('✅ DELER av perioden skal opphøres var allerede valgt');
      return;
    }
    await this.delerAvPeriodenRadio.check();
    console.log('✅ Valgt: DELER av perioden skal opphøres');
  }

  async bekreftOgGaaTilRevurderingsflyt(): Promise<void> {
    await this.clickStepButtonWithRetry(this.bekreftButton, {
      waitForContent: this.page.getByRole('heading', { name: 'Oppgi opplysninger fra søknaden' }),
    });
  }

  /**
   * Klikk «Bekreft og fortsett» og vent på opphørsvedtak-steget
   * («Opphør av frivillig medlemskap etter § 2-15»)
   */
  async bekreftOgGaaTilOpphoersvedtak(): Promise<void> {
    await this.clickStepButtonWithRetry(this.bekreftButton, {
      waitForContent: this.opphoerHeading,
    });
    console.log('✅ På opphørsvedtak-steget («Opphør av frivillig medlemskap etter § 2-15»)');
  }

  /**
   * Fyll begrunnelsesfriteksten på opphørsvedtak-steget og vent på at autolagringen
   * (debounced 1000 ms POST /resultat/fritekst fra VurderingVedtakOpphoer) fullfører
   * FØR vedtaket fattes — ellers kan debounce-kallet kanselleres ved stegovergang.
   *
   * MELOSYS-8141: autolagringen sendte tidligere payload uten innledningFritekst og ga
   * NPE/500 i melosys-api. Feiler med tydelig melding hvis autolagringen gir HTTP-feil.
   *
   * @param tekst - begrunnelsestekst (kun ASCII — matches mot rå request-payload)
   */
  async fyllInnBegrunnelseFritekstMedAutolagring(tekst: string): Promise<void> {
    const autolagring = this.page.waitForResponse(
      (response) =>
        response.url().includes('/resultat/fritekst') &&
        response.request().method() === 'POST' &&
        (response.request().postData() ?? '').includes(tekst),
      { timeout: 15000 }
    );

    // Eneste Quill-editor på opphørssteget er begrunnelsesfeltet («Fritekst til begrunnelse»)
    const editor = this.page.locator('.vurderingVedtakOpphoer .ql-editor');
    await editor.click();
    await editor.fill(tekst);

    const respons = await autolagring;
    if (respons.status() >= 400) {
      throw new Error(
        `Autolagring av begrunnelsesfritekst feilet: POST ${respons.url()} -> ` +
        `${respons.status()} (MELOSYS-8141-regresjon?)`
      );
    }
    console.log(`✅ Begrunnelsesfritekst autolagret (HTTP ${respons.status()})`);
  }
}
