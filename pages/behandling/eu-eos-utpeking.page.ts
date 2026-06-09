import { Page, expect } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { EuEosUtpekingAssertions } from './eu-eos-utpeking.assertions';

/**
 * Page Object for the EU/EØS "vurder utpeking"-behandling (behandlingstema
 * BESLUTNING_LOVVALG_NORGE).
 *
 * Denne behandlingen opprettes når en innkommende A003 peker ut Norge som
 * kompetent land ("Norge utpekt"). Saksbehandler går gjennom 4 steg:
 *   1. Inngang     – "Kontroller inngangsvilkår" (vilkårene er allerede oppfylt)
 *   2. Virksomhet  – velg virksomhet(er) personen jobber for
 *   3. Vurdering   – "Vurder lovvalgsbeslutningen (A003)": Godkjenn / Ikke godkjenn.
 *                    Grunnlag (lovvalgsbestemmelse) og lovvalgsperiode er
 *                    forhåndsutfylt fra SED-en.
 *   4. Vedtak      – "Omfattet av norsk trygdelovgivning": fritekstbegrunnelse +
 *                    Fatt vedtak. Ved godkjenning sender melosys-api en utgående
 *                    A012 (godkjenning av lovvalgsbeslutning) på den eksisterende
 *                    bucen.
 *
 * Steg-overgangene bruker BasePage.clickStepButtonWithRetry (heading-change-retry)
 * for å være robust mot CI-flaking i stegvelger-wizarden.
 *
 * @example
 * const utpeking = new EuEosUtpekingPage(page);
 * await utpeking.godkjennUtpekingOgFattVedtak();
 * await utpeking.assertions.verifiserA012Sendt(request, sedFør, jpFør);
 * await utpeking.assertions.verifiserGodkjentUtpekingIverksatt(request);
 */
export class EuEosUtpekingPage extends BasePage {
  readonly assertions: EuEosUtpekingAssertions;

  private readonly bekreftOgFortsettButton = this.page.getByRole('button', { name: 'Bekreft og fortsett' });
  private readonly fattVedtakButton = this.page.getByRole('button', { name: 'Fatt vedtak' });
  private readonly godkjennRadio = this.page.getByRole('radio', { name: 'Godkjenn', exact: true });
  private readonly ikkeGodkjennRadio = this.page.getByRole('radio', { name: 'Ikke godkjenn' });
  private readonly begrunnelseField = this.page.getByRole('textbox', { name: 'Fritekstfelt til begrunnelse' });

  private readonly inngangHeading = this.page.getByRole('heading', { name: 'Kontroller inngangsvilkår' });
  private readonly virksomhetHeading = this.page.getByRole('heading', { name: 'Virksomhet' });
  private readonly vurderingHeading = this.page.getByRole('heading', { name: 'Vurder lovvalgsbeslutningen (A003)' });
  private readonly vedtakHeading = this.page.getByRole('heading', { name: 'Omfattet av norsk trygdelovgivning' });

  constructor(page: Page) {
    super(page);
    this.assertions = new EuEosUtpekingAssertions(page);
  }

  /**
   * Steg 1 (Inngang): bekreft at inngangsvilkårene er oppfylt.
   */
  async bekreftInngang(): Promise<void> {
    await this.inngangHeading.waitFor({ state: 'visible', timeout: 30000 });
    await this.clickStepButtonWithRetry(this.bekreftOgFortsettButton, {
      verifyHeadingChange: true,
      waitForContent: this.virksomhetHeading,
    });
    console.log('✅ Inngang bekreftet');
  }

  /**
   * Steg 2 (Virksomhet): velg virksomhet. "Bekreft og fortsett" er deaktivert
   * til minst én virksomhet er valgt.
   *
   * @param navn - Navn på virksomhet (default: 'Ståles Stål AS')
   */
  async velgVirksomhetOgFortsett(navn: string = 'Ståles Stål AS'): Promise<void> {
    const checkbox = this.page.getByRole('checkbox', { name: navn });
    await checkbox.waitFor({ state: 'visible', timeout: 30000 });
    await checkbox.check();
    await expect(this.bekreftOgFortsettButton).toBeEnabled({ timeout: 15000 });
    await this.clickStepButtonWithRetry(this.bekreftOgFortsettButton, {
      verifyHeadingChange: true,
      waitForContent: this.vurderingHeading,
    });
    console.log(`✅ Valgte virksomhet: ${navn}`);
  }

  /**
   * Steg 3 (Vurdering): godkjenn lovvalgsbeslutningen. Grunnlag
   * (lovvalgsbestemmelse) og lovvalgsperiode er forhåndsutfylt fra SED-en, så
   * det eneste valget er Godkjenn / Ikke godkjenn. "Bekreft og fortsett" er
   * deaktivert til et valg er gjort.
   */
  async godkjennUtpekingOgFortsett(): Promise<void> {
    await this.godkjennRadio.waitFor({ state: 'visible', timeout: 30000 });
    await this.godkjennRadio.check();
    await expect(this.bekreftOgFortsettButton).toBeEnabled({ timeout: 15000 });
    await this.clickStepButtonWithRetry(this.bekreftOgFortsettButton, {
      verifyHeadingChange: true,
      waitForContent: this.vedtakHeading,
    });
    console.log('✅ Godkjente utpekingen');
  }

  /**
   * Steg 4 (Vedtak): fyll inn fritekstbegrunnelse og fatt vedtak. Venter på det
   * kritiske vedtaks-API-kallet (POST /api/saksflyt/vedtak/{id}/fatt).
   *
   * @param begrunnelse - Påkrevd fritekstbegrunnelse for vedtaket
   */
  async fyllBegrunnelseOgFattVedtak(begrunnelse: string): Promise<void> {
    await this.begrunnelseField.waitFor({ state: 'visible', timeout: 30000 });
    await this.begrunnelseField.click();
    await this.begrunnelseField.fill(begrunnelse);
    await this.begrunnelseField.press('Tab');

    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await this.fattVedtakButton.waitFor({ state: 'visible', timeout: 10000 });

    const responsePromise = this.page.waitForResponse(
      response => response.url().includes('/api/saksflyt/vedtak/') &&
                  response.url().includes('/fatt') &&
                  response.request().method() === 'POST' &&
                  (response.status() === 200 || response.status() === 204),
      { timeout: 60000 }
    );
    await this.fattVedtakButton.click();
    const response = await responsePromise;
    console.log(`✅ Vedtak fattet (godkjent utpeking) → ${response.status()}`);
  }

  /**
   * Kjør hele "godkjent utpeking → vedtak"-flyten med standardverdier.
   *
   * @param opts.virksomhet  - Virksomhet å velge (default: 'Ståles Stål AS')
   * @param opts.begrunnelse - Fritekstbegrunnelse for vedtaket
   */
  async godkjennUtpekingOgFattVedtak(opts?: { virksomhet?: string; begrunnelse?: string }): Promise<void> {
    await this.bekreftInngang();
    await this.velgVirksomhetOgFortsett(opts?.virksomhet);
    await this.godkjennUtpekingOgFortsett();
    await this.fyllBegrunnelseOgFattVedtak(
      opts?.begrunnelse ?? 'Norge godkjenner utpekingen. Personen har bostedsadresse i Norge i perioden.'
    );
  }
}
