import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { KlageAssertions } from './klage.assertions';

/**
 * ⚠️ SPEKULATIV STILLAS-POM — IKKE bruk som fasit. Klage er ikke i drift (se
 * tests/ftrl/klage/ftrl-klage.spec.ts-headeren). Selektorene under er GJETTET og
 * matcher IKKE faktisk melosys-web-markup: det finnes ingen `select[name*="klage"]`,
 * ingen Medhold/Avvis-radios, intet begrunnelse-felt og ingen «Fatt vedtak»-klageskjerm.
 * Den ekte flyten er behandlingsmeny (AvsluttSak) → bekreftValg-modal, og de reelle
 * resultattypene er MEDHOLD / KLAGEINNSTILLING / AVVIST_KLAGE — IKKE KLAGE_MEDHOLD osv.
 * Skriv om mot faktisk flyt når klage tas i drift.
 *
 * Page Object for Klage (Appeal) handling
 *
 * Responsibilities:
 * - Create klage behandling on existing case
 * - Select klage result (medhold, avvist, oversendt)
 * - Submit klage decision
 *
 * Klage results (FAKTISKE Behandlingsresultattyper):
 * - MEDHOLD: Appeal granted
 * - AVVIST_KLAGE: Appeal dismissed
 * - KLAGEINNSTILLING: Appeal forwarded to klageinstans (Kabal — ennå manuelt)
 *
 * @example
 * const klage = new KlagePage(page);
 * await klage.velgKlageResultat('MEDHOLD');
 * await klage.fyllBegrunnelse('Klage innvilget');
 * await klage.fattKlageVedtak();
 */
export class KlagePage extends BasePage {
  readonly assertions: KlageAssertions;

  // Klage result dropdown/radio
  private readonly klageResultatDropdown = this.page.locator('select[name*="klage"], [data-testid*="klage-resultat"]');
  private readonly klageMedholdRadio = this.page.getByRole('radio', { name: /Medhold/i });
  private readonly klageAvvistRadio = this.page.getByRole('radio', { name: /Avvis/i });
  private readonly klageOversendtRadio = this.page.getByRole('radio', { name: /Oversend|Klageinstans/i });

  // Text editors (Quill)
  private readonly quillEditors = this.page.locator('.ql-editor');
  private readonly begrunnelseField = this.page.locator('textarea[name*="begrunnelse"], .ql-editor').first();

  // Submit button
  private readonly fattVedtakButton = this.page.getByRole('button', { name: /Fatt vedtak/i });
  private readonly bekreftOgFortsettButton = this.page.getByRole('button', { name: /Bekreft og fortsett/i });

  constructor(page: Page) {
    super(page);
    this.assertions = new KlageAssertions(page);
  }

  /**
   * Select klage result
   * @param resultat - 'MEDHOLD' | 'AVVIST' | 'OVERSENDT'
   */
  async velgKlageResultat(resultat: 'MEDHOLD' | 'AVVIST' | 'OVERSENDT'): Promise<void> {
    // Try dropdown first
    const hasDropdown = await this.klageResultatDropdown.isVisible().catch(() => false);

    if (hasDropdown) {
      const optionMap = {
        'MEDHOLD': 'KLAGE_MEDHOLD',
        'AVVIST': 'KLAGE_AVVIST',
        'OVERSENDT': 'KLAGE_OVERSENDT_TIL_KLAGEINSTANSER',
      };
      await this.klageResultatDropdown.selectOption(optionMap[resultat]);
      console.log(`✅ Selected klage result: ${resultat}`);
      return;
    }

    // Try radio buttons
    switch (resultat) {
      case 'MEDHOLD':
        await this.klageMedholdRadio.check();
        break;
      case 'AVVIST':
        await this.klageAvvistRadio.check();
        break;
      case 'OVERSENDT':
        await this.klageOversendtRadio.check();
        break;
    }

    console.log(`✅ Selected klage result: ${resultat}`);
  }

  /**
   * Fill begrunnelse/reasoning text
   */
  async fyllBegrunnelse(tekst: string): Promise<void> {
    // Try Quill editor first
    const hasQuill = await this.quillEditors.first().isVisible().catch(() => false);

    if (hasQuill) {
      await this.quillEditors.first().click();
      await this.quillEditors.first().fill(tekst);
    } else {
      await this.begrunnelseField.fill(tekst);
    }

    console.log(`✅ Filled begrunnelse`);
  }

  /**
   * Submit klage decision (Fatt vedtak)
   */
  async fattKlageVedtak(): Promise<void> {
    const isVisible = await this.fattVedtakButton.isVisible().catch(() => false);

    if (isVisible) {
      await this.fattVedtakButton.click();
    } else {
      // Try alternative button
      await this.bekreftOgFortsettButton.click();
    }

    await this.page.waitForLoadState('networkidle');
    console.log(`✅ Klage vedtak submitted`);
  }

  /**
   * Complete klage with medhold (appeal granted)
   */
  async behandleKlageMedMedhold(begrunnelse: string = 'Klagen tas til følge'): Promise<void> {
    await this.velgKlageResultat('MEDHOLD');
    await this.fyllBegrunnelse(begrunnelse);
    await this.fattKlageVedtak();
  }

  /**
   * Complete klage with avvisning (appeal dismissed)
   */
  async behandleKlageMedAvvisning(begrunnelse: string = 'Klagen avvises'): Promise<void> {
    await this.velgKlageResultat('AVVIST');
    await this.fyllBegrunnelse(begrunnelse);
    await this.fattKlageVedtak();
  }

  /**
   * Forward klage to klageinstans (appeals authority)
   */
  async oversendKlageTilKlageinstans(begrunnelse: string = 'Klagen oversendes til klageinstans'): Promise<void> {
    await this.velgKlageResultat('OVERSENDT');
    await this.fyllBegrunnelse(begrunnelse);
    await this.fattKlageVedtak();
  }
}
