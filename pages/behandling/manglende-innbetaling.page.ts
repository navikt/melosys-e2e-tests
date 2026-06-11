import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { TIMEOUT_LONG } from '../shared/constants';

/**
 * Page Object for steget «Manglende innbetaling» i MANGLENDE_INNBETALING_TRYGDEAVGIFT-
 * behandlingen (FTRL frivillig medlemskap, § 2-15 andre ledd).
 *
 * Behandlingen opprettes automatisk av melosys-api når faktureringskomponenten melder
 * MANGLENDE_INNBETALING på en fakturaserie for frivillig medlemskap. Steget viser en
 * radiogruppe:
 *   - «Innbetaling mangler for hele medlemskapsperioden.»  → hopper rett til
 *     opphørsvedtak-steget «Opphør av frivillig medlemskap etter § 2-15»
 *   - «Innbetaling mangler for deler av medlemskapsperioden.» → full revurderingsflyt
 *     (Inngang → ... → Vedtak)
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
    name: /Innbetaling mangler for hele medlemskapsperioden/,
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
   * Velg «Innbetaling mangler for hele medlemskapsperioden.»
   *
   * Radio-valget lagres via API (avklartefakta/innbetalingsstatus) — vent på at
   * nettverket roer seg før Bekreft, slik at lagringen er fullført.
   */
  async velgInnbetalingManglerHelePerioden(): Promise<void> {
    await this.helePeriodenRadio.check();
    await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch((e) => {
      console.log(`  ⚠️ networkidle etter radio-valg timet ut (fortsetter): ${e.message}`);
    });
    console.log('✅ Valgt: innbetaling mangler for HELE medlemskapsperioden');
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
}
