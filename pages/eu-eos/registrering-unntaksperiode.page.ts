import { Page, Request, Response, expect } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { RegistreringUnntaksperiodeAssertions } from './registrering-unntaksperiode.assertions';

/**
 * Én observert POST mot live-kontrollen
 * (`POST /api/kontroll/{behandlingID}/unntaksperiode`).
 */
export interface UnntaksperiodeKontrollKall {
  url: string;
  body: string;
  status?: number;
}

/**
 * Page Object for «Registrering av unntaksperioder» (EU/EØS,
 * behandlingstema REGISTRERING_UNNTAK_NORSK_TRYGD_*).
 *
 * Siden vises når en inngående A009/A010 IKKE kan registreres automatisk, dvs.
 * når registerkontrollen (UfmKontroll) har gitt minst ett treff — f.eks.
 * PERIODEN_OVER_24_MD. Da opprettes en oppgave i stedet for automatisk
 * godkjenning (BestemBehandlingsmåteSed), og saksbehandler må ta stilling til
 * unntaksperioden i UI-et:
 *
 *   ( ) Godkjenn unntaksperiode        ← deaktivert så lenge det finnes kontrollfeil
 *   ( ) Godkjenn, men endre periode    ← åpner Startdato/Sluttdato + begrunnelse
 *   ( ) Ikke godkjenn
 *
 * Datofeltene er «live»: hvert tastetrykk trigger en
 * `POST /api/kontroll/{behandlingID}/unntaksperiode` (saksopplysninger.jsx:88-96),
 * som er kjernen i «Invalid date»-feilen denne POM-en brukes til å vokte.
 *
 * @example
 * const unntak = new RegistreringUnntaksperiodePage(page);
 * await unntak.ventPåSiden();
 * await unntak.velgGodkjennMenEndrePeriode();
 * const kall = unntak.overvåkKontrollkall();
 * await unntak.skrivSluttdatoTegnForTegn('31.12.2027');
 */
export class RegistreringUnntaksperiodePage extends BasePage {
  readonly assertions: RegistreringUnntaksperiodeAssertions;

  private readonly heading = this.page.getByRole('heading', { name: 'Registrering av unntaksperioder' });
  private readonly godkjennRadio = this.page.getByRole('radio', { name: 'Godkjenn unntaksperiode' });
  private readonly endrePeriodeRadio = this.page.getByRole('radio', { name: 'Godkjenn, men endre periode' });
  private readonly ikkeGodkjennRadio = this.page.getByRole('radio', { name: 'Ikke godkjenn' });
  private readonly startdatoFelt = this.page.getByRole('textbox', { name: 'Startdato' });
  private readonly sluttdatoFelt = this.page.getByRole('textbox', { name: 'Sluttdato' });
  private readonly begrunnelseSelect = this.page.getByRole('combobox', { name: 'Begrunnelse for endret periode' });
  private readonly lagreButton = this.page.getByRole('button', { name: 'Lagre' });

  constructor(page: Page) {
    super(page);
    this.assertions = new RegistreringUnntaksperiodeAssertions(page);
  }

  /**
   * Vent til registreringssiden er lastet. Ved mount kjører frontenden én
   * kontroll på SED-perioden, så vi venter også på at nettverket roer seg.
   */
  async ventPåSiden(): Promise<void> {
    await this.heading.waitFor({ state: 'visible', timeout: 60000 });
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    console.log('✅ «Registrering av unntaksperioder» er åpen');
  }

  /**
   * behandlingID fra URL-en (`?behandlingID=123`).
   */
  hentBehandlingID(): number {
    const id = new URL(this.page.url()).searchParams.get('behandlingID');
    expect(id, `Fant ikke behandlingID i URL: ${this.page.url()}`).not.toBeNull();
    return Number(id);
  }

  /**
   * Velg «Godkjenn, men endre periode», som åpner Startdato/Sluttdato-feltene.
   */
  async velgGodkjennMenEndrePeriode(): Promise<void> {
    await this.endrePeriodeRadio.waitFor({ state: 'visible', timeout: 30000 });
    await this.endrePeriodeRadio.check();
    await this.sluttdatoFelt.waitFor({ state: 'visible', timeout: 15000 });
    console.log('✅ Valgte «Godkjenn, men endre periode» — datofeltene er åpne');
  }

  /**
   * Start overvåking av live-kontrollkallene. Returnerer en liste som fylles
   * fortløpende med request-body og responsstatus for hver
   * `POST /api/kontroll/{behandlingID}/unntaksperiode`.
   *
   * Må kalles FØR man skriver i datofeltene.
   */
  overvåkKontrollkall(): UnntaksperiodeKontrollKall[] {
    const kall: UnntaksperiodeKontrollKall[] = [];
    const erKontrollkall = (url: string) => /\/kontroll\/\d+\/unntaksperiode(\?|$)/.test(url);

    this.page.on('request', (request: Request) => {
      if (request.method() === 'POST' && erKontrollkall(request.url())) {
        kall.push({ url: request.url(), body: request.postData() ?? '' });
      }
    });

    this.page.on('response', (response: Response) => {
      if (response.request().method() !== 'POST' || !erKontrollkall(response.url())) return;
      const body = response.request().postData() ?? '';
      const treff = kall.find(k => k.status === undefined && k.body === body);
      if (treff) {
        treff.status = response.status();
      } else {
        kall.push({ url: response.url(), body, status: response.status() });
      }
      console.log(`   ↪ kontroll: ${body} → ${response.status()}`);
    });

    return kall;
  }

  /**
   * Skriv en dato tegn for tegn i Sluttdato-feltet — slik en saksbehandler
   * gjør. Hvert tastetrykk gir en halvferdig verdi ("3", "31", "31.", …) som
   * frontenden forsøker å formatere og sende til live-kontrollen.
   *
   * Feltet blurres bevisst IKKE her: poenget er tilstanden mens man skriver.
   */
  async skrivSluttdatoTegnForTegn(dato: string): Promise<void> {
    await this.sluttdatoFelt.click();
    await this.sluttdatoFelt.fill('');
    await this.sluttdatoFelt.pressSequentially(dato, { delay: 120 });
    // La de siste kallene rekke å bli sendt/besvart før vi inspiserer dem.
    await this.page.waitForTimeout(1500);
    console.log(`✅ Skrev sluttdato «${dato}» tegn for tegn`);
  }

  /**
   * Sett en gyldig periode og fullfør skrivingen (blur), slik at frontenden
   * formaterer verdiene og kjører en siste kontroll.
   */
  async settPeriode(startdato: string, sluttdato: string): Promise<void> {
    await this.startdatoFelt.click();
    await this.startdatoFelt.fill('');
    await this.startdatoFelt.pressSequentially(startdato, { delay: 60 });
    await this.startdatoFelt.press('Tab');

    await this.sluttdatoFelt.click();
    await this.sluttdatoFelt.fill('');
    await this.sluttdatoFelt.pressSequentially(sluttdato, { delay: 60 });
    await this.sluttdatoFelt.press('Tab');

    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    console.log(`✅ Satte periode ${startdato} – ${sluttdato}`);
  }

  /**
   * Velg begrunnelse for endret periode (verdien i nedtrekkslisten).
   * Default er PERIODE_FEILREGISTRERT, som allerede er forhåndsvalgt.
   */
  async velgBegrunnelse(term: string): Promise<void> {
    await this.begrunnelseSelect.waitFor({ state: 'visible', timeout: 15000 });
    await this.selectByVisibleText(this.begrunnelseSelect, term);
    console.log(`✅ Valgte begrunnelse «${term}»`);
  }

  /**
   * Lagre registreringen. Venter på det kritiske godkjenningskallet
   * (`POST /saksflyt/unntaksperioder/{id}/godkjenn`).
   */
  async lagre(): Promise<void> {
    await expect(this.lagreButton).toBeEnabled({ timeout: 30000 });
    const responsePromise = this.page.waitForResponse(
      response => response.url().includes('/saksflyt/unntaksperioder/') &&
                  response.url().includes('/godkjenn') &&
                  response.request().method() === 'POST',
      { timeout: 60000 }
    );
    await this.lagreButton.click();
    const response = await responsePromise;
    expect(response.status(), 'Godkjenning av unntaksperioden skal gå gjennom').toBeLessThan(300);
    console.log(`✅ Lagret registrering av unntaksperiode → ${response.status()}`);
  }

  // Eksponert for assertions/tester som trenger å sjekke tilstanden på feltene.
  get godkjennUnntaksperiodeRadio() { return this.godkjennRadio; }
  get ikkeGodkjennUnntaksperiodeRadio() { return this.ikkeGodkjennRadio; }
  get lagreKnapp() { return this.lagreButton; }
  get sluttdato() { return this.sluttdatoFelt; }
  get startdato() { return this.startdatoFelt; }
}
