import { Page, Request, Response, expect } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { RegistreringUnntaksperiodeAssertions } from './registrering-unntaksperiode.assertions';

/** Én observert POST mot `/api/kontroll/{behandlingID}/unntaksperiode`. */
export interface UnntaksperiodeKontrollKall {
  url: string;
  body: string;
  status?: number;
  /**
   * Nettleseren meldte `requestfailed`. Skjer også for kall som fikk svar, når frontenden
   * forkaster responsen — bruk feltet kun til å unnta kall fra ubesvart-sjekken.
   */
  feilet?: boolean;
}

/**
 * Page Object for «Registrering av unntaksperioder» (EU/EØS,
 * behandlingstema REGISTRERING_UNNTAK_NORSK_TRYGD_*).
 *
 * Skjermen vises bare når registerkontrollen (UfmKontroll) har gitt minst ett
 * treff på en inngående A009/A010. Uten treff registreres unntaket automatisk,
 * og ingen av metodene her har noe å feste seg i.
 *
 * Datofeltene kontrolleres fortløpende: hvert tastetrykk kan gi en
 * `POST /api/kontroll/{behandlingID}/unntaksperiode` (melosys-web,
 * `saksopplysninger.jsx`).
 */
export class RegistreringUnntaksperiodePage extends BasePage {
  readonly assertions: RegistreringUnntaksperiodeAssertions;

  private readonly heading = this.page.getByRole('heading', { name: 'Registrering av unntaksperioder' });
  private readonly endrePeriodeRadio = this.page.getByRole('radio', { name: 'Godkjenn, men endre periode' });
  private readonly startdatoFelt = this.page.getByRole('textbox', { name: 'Startdato' });
  private readonly sluttdatoFelt = this.page.getByRole('textbox', { name: 'Sluttdato' });
  private readonly lagreButton = this.page.getByRole('button', { name: 'Lagre' });

  constructor(page: Page) {
    super(page);
    this.assertions = new RegistreringUnntaksperiodeAssertions(page);
  }

  /**
   * Ved mount kjører frontenden én kontroll på SED-perioden, så vi venter også
   * på at nettverket roer seg.
   */
  async ventPåSiden(): Promise<void> {
    await this.heading.waitFor({ state: 'visible', timeout: 60000 });
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    console.log('✅ «Registrering av unntaksperioder» er åpen');
  }

  hentBehandlingID(): number {
    const id = new URL(this.page.url()).searchParams.get('behandlingID');
    expect(id, `Fant ikke behandlingID i URL: ${this.page.url()}`).not.toBeNull();
    expect(
      /^[1-9]\d*$/.test(id ?? ''),
      `behandlingID i URL-en er ikke et positivt heltall: «${id}». Både en tom verdi og «0» ville blitt 0 ` +
      `og bundet 0 inn i SQL-en, der feilen først dukker opp som en manglende lovvalgsperiode.`
    ).toBe(true);
    return Number(id);
  }

  /** Valget åpner Startdato/Sluttdato og forhåndsutfyller dem med SED-perioden. */
  async velgGodkjennMenEndrePeriode(): Promise<void> {
    await this.endrePeriodeRadio.waitFor({ state: 'visible', timeout: 30000 });
    await this.endrePeriodeRadio.check();
    await this.sluttdatoFelt.waitFor({ state: 'visible', timeout: 15000 });
    console.log('✅ Valgte «Godkjenn, men endre periode» — datofeltene er åpne');
  }

  /**
   * Må kalles før man skriver i datofeltene: listen fylles fra request- og
   * response-hendelser, og kall som skjer før dette punktet er tapt.
   */
  overvåkKontrollkall(): UnntaksperiodeKontrollKall[] {
    const kall: UnntaksperiodeKontrollKall[] = [];
    // «05», «05.» og «05.0» parses til samme dato, så flere kall har identisk body. Matching
    // på body ville derfor tilordnet statusen til et vilkårlig av dem.
    const perRequest = new Map<Request, UnntaksperiodeKontrollKall>();
    const erKontrollkall = (url: string) => /\/kontroll\/\d+\/unntaksperiode(\?|$)/.test(url);

    this.page.on('request', (request: Request) => {
      if (request.method() !== 'POST' || !erKontrollkall(request.url())) return;
      const kallet: UnntaksperiodeKontrollKall = { url: request.url(), body: request.postData() ?? '' };
      perRequest.set(request, kallet);
      kall.push(kallet);
    });

    this.page.on('requestfailed', (request: Request) => {
      const kallet = perRequest.get(request);
      if (kallet) kallet.feilet = true;
    });

    this.page.on('response', (response: Response) => {
      const request = response.request();
      if (request.method() !== 'POST' || !erKontrollkall(response.url())) return;
      const body = request.postData() ?? '';
      const kallet = perRequest.get(request);
      if (kallet) {
        kallet.status = response.status();
      } else {
        kall.push({ url: response.url(), body, status: response.status() });
      }
      console.log(`   ↪ kontroll: ${body} → ${response.status()}`);
    });

    return kall;
  }

  /**
   * Hvert tastetrykk gir en halvferdig verdi («3», «31», «31.», …) som frontenden forsøker
   * å formatere og sende til kontrollen. Feltet blurres bevisst ikke — det er tilstanden
   * under skriving som testes.
   *
   * @param forventetSisteTom - Sluttdatoen på ISO-form. Ventingen må være kausal: «ingen
   *                            ubesvarte kall» er oppfylt allerede før siste request er sendt.
   */
  async skrivSluttdatoTegnForTegn(
    dato: string,
    kall: UnntaksperiodeKontrollKall[],
    forventetSisteTom: string
  ): Promise<void> {
    const sisteKall = this.page.waitForResponse(
      response => response.request().method() === 'POST' &&
                  /\/kontroll\/\d+\/unntaksperiode(\?|$)/.test(response.url()) &&
                  (response.request().postData() ?? '').includes(`"periodeTom":"${forventetSisteTom}"`),
      { timeout: 30000 }
    );

    await this.sluttdatoFelt.click();
    await this.sluttdatoFelt.fill('');
    await this.sluttdatoFelt.pressSequentially(dato, { delay: 120 });
    await sisteKall;

    // Ikke bare det siste kallet: et ubesvart kall slipper unna 5xx-sjekken.
    await expect
      .poll(() => kall.filter(k => k.status === undefined && !k.feilet).length, {
        timeout: 15000,
        message: 'Alle kontrollkall fra skrivingen skal være besvart før de inspiseres'
      })
      .toBe(0);
    console.log(`✅ Skrev sluttdato «${dato}» tegn for tegn`);
  }

  /** Tab fullfører skrivingen, slik at frontenden formaterer og kjører en siste kontroll. */
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
}
