import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { TIMEOUT_LONG, TIMEOUT_MEDIUM } from '../shared/constants';
import { PensjonsopptjeningAssertions } from './pensjonsopptjening.assertions';

/**
 * Page Object for the «Pensjonsopptjening»-section in the årsavregning
 * behandling page (MELOSYS-8073).
 *
 * Spec (kontrakt): specs/popp-pensjonsopptjening-visning.md
 *
 * **Reconcile-status (2026-05-26):**
 * Bygget i melosys-web rendrer seksjonen **direkte** i `aarsavregning/
 * saksbehandling.tsx` som egen seksjon i main-content (toggle + ÅRSAVREGNING-
 * gated) — IKKE via det legacy menypanelet. Dette fjernet menypanel-gating-
 * timing-risiko og forenkler test-flyten: ingen sidemeny å klikke, seksjonen
 * er der så lenge togglen er på og behandlingstypen er ÅRSAVREGNING.
 * Bygget bruker ikke `data-testid` — selektorer er tekst-/role-baserte.
 *
 * Forutsetter at saksbehandler allerede står inne i en årsavregningsbehandling.
 *
 * @example
 * const popp = new PensjonsopptjeningPage(page);
 * await popp.ventPåSeksjon();
 * const rader = await popp.lesRader();
 */
export interface PoppRad {
  aar: number;
  pgi: number;
  kilde: string; // visningsnavn — «Skatt» / «Avgiftssystemet» / «Melosys» / rå-enum hvis ukjent
}

export class PensjonsopptjeningPage extends BasePage {
  readonly assertions: PensjonsopptjeningAssertions;

  // Seksjons-overskrift «Pensjonsopptjening» (h2) direkte i main-content på årsavregningssiden.
  private readonly seksjonOverskrift = this.page.getByRole('heading', { name: 'Pensjonsopptjening', level: 2 });

  // Tom-tilstand: Nav.Alert variant="info" med eksakt tekst (verbatim fra bygg).
  private readonly tomTilstand = this.page.getByText('Ingen pensjonsopptjening registrert i POPP for personen.');

  // Feil-tilstand: Nav.Alert variant="warning" (synlig hvis API svarer 5xx).
  private readonly feilTilstand = this.page.getByText('Kunne ikke hente pensjonsopptjening fra POPP.');

  constructor(page: Page) {
    super(page);
    this.assertions = new PensjonsopptjeningAssertions(page);
  }

  /**
   * Vent til «Pensjonsopptjening»-seksjonen er rendret på årsavregningssiden.
   * Seksjonen rendres direkte i main-content — ingen sidemeny å klikke.
   */
  async ventPåSeksjon(): Promise<void> {
    await this.seksjonOverskrift.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
  }

  /**
   * Les alle rader fra Pensjonsopptjening-tabellen.
   *
   * Bygget rendrer en `<table>` (eller `Nav.Table`) under seksjons-overskriften.
   * Vi finner tbody-rader og parser kolonnene År / PGI / Kilde.
   *
   * @returns Liste av rader i samme rekkefølge som de vises (typisk nyeste år
   *   øverst). Tom liste hvis tom-tilstand er aktiv eller ingen tabell rendret.
   */
  async lesRader(): Promise<PoppRad[]> {
    if (await this.erTomVisning()) {
      return [];
    }

    // Lokaliser tabellen via dens posisjon i seksjons-panelet. Vi ankrer på
    // overskriften og finner nærmeste tabell i samme region.
    const seksjon = this.page.getByRole('region').filter({ has: this.seksjonOverskrift }).first();
    const tabell = seksjon.getByRole('table');

    // Hvis seksjonen ikke har en region-wrapper, falle tilbake til main + heading.
    const tabellLocator = (await tabell.count()) > 0
      ? tabell
      : this.page.locator('main').getByRole('table').last();

    if ((await tabellLocator.count()) === 0) {
      return [];
    }

    const rader = tabellLocator.getByRole('row');
    const antall = await rader.count();
    const resultat: PoppRad[] = [];

    // Hopp over header-rad (i = 0).
    for (let i = 1; i < antall; i++) {
      const rad = rader.nth(i);
      const celler = rad.getByRole('cell');
      const cellTekster = await Promise.all([
        celler.nth(0).textContent(),
        celler.nth(1).textContent(),
        celler.nth(2).textContent(),
      ]);

      const aarTekst = (cellTekster[0] ?? '').trim();
      const pgiTekst = (cellTekster[1] ?? '').trim();
      const kildeTekst = (cellTekster[2] ?? '').trim();

      resultat.push({
        aar: Number.parseInt(aarTekst.replace(/\D/g, ''), 10),
        pgi: Number.parseInt(pgiTekst.replace(/\D/g, ''), 10),
        kilde: kildeTekst,
      });
    }

    return resultat;
  }

  /**
   * Sjekk om tom-tilstand (informasjonsmelding) vises.
   */
  async erTomVisning(): Promise<boolean> {
    return this.isElementVisible(this.tomTilstand, 1000);
  }

  /**
   * Sjekk om feil-tilstand vises (warning-melding).
   */
  async erFeilVisning(): Promise<boolean> {
    return this.isElementVisible(this.feilTilstand, 1000);
  }
}
