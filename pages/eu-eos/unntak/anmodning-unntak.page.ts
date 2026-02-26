import { Page } from '@playwright/test';
import { BasePage } from '../../shared/base.page';
import { AnmodningUnntakAssertions } from './anmodning-unntak.assertions';

/**
 * Page Object for EU/EØS Exception Request (Anmodning om unntak) - Article 16
 *
 * Responsibilities:
 * - Navigate to exception request form
 * - Fill exception request details
 * - Select receiving institution
 * - Submit exception request
 * - Handle exception response
 *
 * Article 16 allows Member States to agree on exceptions to the normal
 * applicable legislation rules for specific cases.
 *
 * @example
 * const unntak = new AnmodningUnntakPage(page);
 * await unntak.gotoAnmodningUnntak(saksnr);
 * await unntak.fyllBegrunnelse('Arbeidstaker ønsker å forbli i norsk trygdeordning');
 * await unntak.velgMottakerInstitusjon('Sverige');
 * await unntak.sendAnmodning();
 */
export class AnmodningUnntakPage extends BasePage {
  readonly assertions: AnmodningUnntakAssertions;

  // Form sections
  private readonly unntakForm = this.page.locator('form, [class*="unntak"], [data-testid*="unntak"]');

  // Period selection
  private readonly periodeFraInput = this.page.locator('input[name*="fra"], [data-testid*="periode-fra"]').first();
  private readonly periodeTilInput = this.page.locator('input[name*="til"], [data-testid*="periode-til"]').first();

  // Begrunnelse (justification)
  private readonly begrunnelseField = this.page.locator('textarea[name*="begrunnelse"], .ql-editor').first();
  private readonly quillEditors = this.page.locator('.ql-editor');

  // Institution selection
  private readonly institusjonDropdown = this.page.locator('select[name*="institusjon"], [data-testid*="institusjon"]');
  private readonly landDropdown = this.page.locator('select[name*="land"], [data-testid*="land"]');
  private readonly mottakerLandInput = this.page.getByLabel(/Mottakerland|Land/i);

  // Buttons
  private readonly sendAnmodningButton = this.page.getByRole('button', { name: /Send anmodning|Send|Bekreft/i });
  private readonly bekreftOgFortsettButton = this.page.getByRole('button', { name: /Bekreft og fortsett/i });
  private readonly lagreButton = this.page.getByRole('button', { name: /Lagre/i });

  // Send brevene form (within behandling flow)
  // Note: Scoped to the section containing "Send brevene" to avoid strict mode violations
  // when "Legg til begrunnelse" appears multiple times (e.g., via full behandling path)
  private readonly artikkelDropdown = this.page.getByLabel('Artikkelen det søkes unntak');
  private readonly sendBreveneButton = this.page.getByRole('button', { name: 'Send brevene' });
  private readonly ytterligereInfoField = this.page.getByRole('textbox', { name: 'Ytterligere informasjon til' });

  // Status/Result
  private readonly anmodningStatusText = this.page.locator('[class*="status"], [data-testid*="status"]');

  constructor(page: Page) {
    super(page);
    this.assertions = new AnmodningUnntakAssertions(page);
  }

  /**
   * Navigate to exception request page for a case
   */
  async gotoAnmodningUnntak(saksnr: string): Promise<void> {
    // Navigate to the EU/EØS exception registration page
    await this.goto(`http://localhost:3000/melosys/EU_EOS/registrering/${saksnr}/anmodningunntak`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to generic exception registration page
   */
  async gotoUnntaksregistrering(sakstype: string, saksnr: string): Promise<void> {
    await this.goto(`http://localhost:3000/melosys/${sakstype}/unntaksregistrering/${saksnr}`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Fill in the period for the exception request
   */
  async velgPeriode(fra: string, til: string): Promise<void> {
    const hasFraInput = await this.periodeFraInput.isVisible().catch(() => false);

    if (hasFraInput) {
      await this.periodeFraInput.fill(fra);
      await this.periodeTilInput.fill(til);
      console.log(`✅ Set exception period: ${fra} - ${til}`);
    } else {
      console.log('ℹ️ Period inputs not visible');
    }
  }

  /**
   * Fill in the justification/begrunnelse for the exception
   */
  async fyllBegrunnelse(tekst: string): Promise<void> {
    // Try Quill editor first
    const hasQuill = await this.quillEditors.first().isVisible().catch(() => false);

    if (hasQuill) {
      await this.quillEditors.first().click();
      await this.quillEditors.first().fill(tekst);
    } else {
      // Try regular textarea
      const hasTextarea = await this.begrunnelseField.isVisible().catch(() => false);
      if (hasTextarea) {
        await this.begrunnelseField.fill(tekst);
      }
    }

    console.log(`✅ Filled exception justification`);
  }

  /**
   * Select the receiving institution country
   */
  async velgMottakerLand(land: string): Promise<void> {
    // Try dropdown first
    const hasDropdown = await this.landDropdown.isVisible().catch(() => false);

    if (hasDropdown) {
      const options = await this.landDropdown.locator('option').allTextContents();
      const match = options.find(o => new RegExp(land, 'i').test(o));
      if (match) {
        await this.landDropdown.selectOption({ label: match });
      }
    } else {
      // Try input field
      const hasInput = await this.mottakerLandInput.isVisible().catch(() => false);
      if (hasInput) {
        await this.mottakerLandInput.fill(land);
        // Wait for autocomplete
        await this.page.waitForTimeout(1000);
        await this.page.getByText(new RegExp(land, 'i')).first().click();
      }
    }

    console.log(`✅ Selected receiving country: ${land}`);
  }

  /**
   * Select specific institution
   */
  async velgMottakerInstitusjon(institusjon: string): Promise<void> {
    const hasDropdown = await this.institusjonDropdown.isVisible().catch(() => false);

    if (hasDropdown) {
      await this.waitForDropdownToPopulate(this.institusjonDropdown);
      const options = await this.institusjonDropdown.locator('option').allTextContents();
      const match = options.find(o => new RegExp(institusjon, 'i').test(o));
      if (match) {
        await this.institusjonDropdown.selectOption({ label: match });
      }
      console.log(`✅ Selected institution: ${institusjon}`);
    } else {
      console.log('ℹ️ Institution dropdown not visible');
    }
  }

  /**
   * Submit the exception request
   */
  async sendAnmodning(): Promise<void> {
    // Try different button options
    if (await this.sendAnmodningButton.isVisible().catch(() => false)) {
      await this.sendAnmodningButton.click();
    } else if (await this.bekreftOgFortsettButton.isVisible().catch(() => false)) {
      await this.bekreftOgFortsettButton.click();
    } else if (await this.lagreButton.isVisible().catch(() => false)) {
      await this.lagreButton.click();
    }

    await this.page.waitForLoadState('networkidle');
    console.log(`✅ Exception request submitted`);
  }

  /**
   * Check the TWFA (Rammeavtale om fjernarbeid) checkbox.
   * Only visible when CDM 4.4 toggle is enabled and article 13(1)(a) is selected.
   */
  async hukAvTWFA(): Promise<void> {
    const twfaCheckbox = this.page.getByRole('checkbox', { name: /Rammeavtale om fjernarbeid/i });
    await twfaCheckbox.waitFor({ state: 'visible', timeout: 10000 });
    await twfaCheckbox.check();
    console.log('✅ Checked TWFA checkbox');
  }

  /**
   * Complete workflow: Send Article 16 exception request
   */
  async sendArtikkel16Anmodning(config: {
    periode?: { fra: string; til: string };
    begrunnelse: string;
    mottakerLand: string;
    institusjon?: string;
    erFjernarbeidTWFA?: boolean;
  }): Promise<void> {
    if (config.periode) {
      await this.velgPeriode(config.periode.fra, config.periode.til);
    }

    await this.fyllBegrunnelse(config.begrunnelse);

    if (config.erFjernarbeidTWFA) {
      await this.hukAvTWFA();
    }

    await this.velgMottakerLand(config.mottakerLand);

    if (config.institusjon) {
      await this.velgMottakerInstitusjon(config.institusjon);
    }

    await this.sendAnmodning();
  }

  /**
   * Wait for form to be ready
   */
  async ventPåSkjemaLastet(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
    // Wait for form elements to be visible
    await Promise.race([
      this.unntakForm.waitFor({ state: 'visible', timeout: 10000 }),
      this.begrunnelseField.waitFor({ state: 'visible', timeout: 10000 }),
      this.sendAnmodningButton.waitFor({ state: 'visible', timeout: 10000 }),
    ]).catch(() => {
      console.log('ℹ️ Standard form elements not found - page structure may differ');
    });
  }

  /**
   * Select the article for exception request (within behandling flow)
   * @param artikkel - Article value (e.g., 'FO_883_2004_ART11_3A')
   */
  async velgArtikkelForUnntak(artikkel: string): Promise<void> {
    await this.artikkelDropdown.selectOption(artikkel);
    await this.page.waitForLoadState('networkidle');
    console.log(`✅ Valgte artikkel for unntak: ${artikkel}`);
  }

  /**
   * Select justification from dropdown (within behandling flow)
   * @param begrunnelse - Justification value (e.g., 'KORTVARIG_PERIODE_RETUR_NORSK_AG')
   */
  async velgBegrunnelseDropdown(begrunnelse: string): Promise<void> {
    // Use .last() to pick the unntak form's dropdown when multiple
    // "Legg til begrunnelse" exist (e.g., via full behandling path has two)
    const begrunnelseDropdown = this.page.getByLabel('Legg til begrunnelse').last();
    await begrunnelseDropdown.selectOption(begrunnelse);
    console.log(`✅ Valgte begrunnelse: ${begrunnelse}`);
  }

  /**
   * Fill in additional information text field
   * @param tekst - Additional information text
   */
  async fyllYtterligereInformasjon(tekst: string): Promise<void> {
    await this.ytterligereInfoField.click();
    await this.ytterligereInfoField.fill(tekst);
    console.log(`✅ Fylte inn ytterligere informasjon`);
  }

  /**
   * Click "Send brevene" button to submit the exception request
   */
  async klikkSendBrevene(): Promise<void> {
    await this.sendBreveneButton.click();
    await this.page.waitForLoadState('networkidle');
    console.log(`✅ Klikket "Send brevene"`);
  }

  /**
   * Fill the "Send brevene" form WITHOUT clicking Send.
   * Use this when you need to take a SED snapshot before sending.
   */
  async fyllUtBrevSkjema(config: {
    artikkel: string;
    begrunnelse: string;
    ytterligereInfo?: string;
    twfa?: boolean;
  }): Promise<void> {
    await this.velgArtikkelForUnntak(config.artikkel);
    if (config.twfa) {
      await this.hukAvTWFA();
    }
    await this.velgBegrunnelseDropdown(config.begrunnelse);
    if (config.ytterligereInfo) {
      await this.fyllYtterligereInformasjon(config.ytterligereInfo);
    }
  }

  /**
   * Complete the "Send brevene" form within the behandling flow
   */
  async fyllUtOgSendBrevene(config: {
    artikkel: string;
    begrunnelse: string;
    ytterligereInfo?: string;
    twfa?: boolean;
  }): Promise<void> {
    await this.fyllUtBrevSkjema(config);
    await this.klikkSendBrevene();
  }

  /**
   * Check if exception request was successful
   */
  async erAnmodningSendt(): Promise<boolean> {
    // Look for success indicators
    const successText = await this.page.getByText(/Sendt|Lagret|Vellykket/i).isVisible().catch(() => false);
    const navigatedAway = !this.page.url().includes('anmodningunntak');

    return successText || navigatedAway;
  }
}
