import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { TIMEOUT_LONG } from '../shared/constants';
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
  readonly seksjonOverskrift = this.page.getByRole('heading', { name: 'Pensjonsopptjening', level: 2 });

  // Tom-tilstand: Nav.Alert variant="info" med eksakt tekst (verbatim fra bygg).
  // Eksakt-match for å unngå substring-treff i aria-live-regioner / hjelpetekster.
  private readonly tomTilstand = this.page.getByText('Ingen pensjonsopptjening registrert i POPP for personen.', { exact: true });

  // Anker tabellen direkte etter overskriften — første <table> i document order
  // som følger seksjons-h2. Robust mot at bygget ikke wrapper seksjonen i en
  // ARIA-region, og uavhengig av andre tabeller på årsavregningssiden.
  private readonly seksjonsTabell = this.seksjonOverskrift.locator('xpath=following::table[1]');

  constructor(page: Page) {
    super(page);
    this.assertions = new PensjonsopptjeningAssertions(page);
  }

  /**
   * Vent til «Pensjonsopptjening»-seksjonen er ferdig hydrert.
   * Overskriften (h2) rendres synkront, men tabell/tom-tilstand kommer først
   * når POPP-fetch resolver. Vi venter på at siden settler i én av tre
   * terminal-tilstander (tabell, tom, feil), ellers risikerer kallere å lese
   * en halvferdig DOM.
   */
  async ventPåSeksjon(): Promise<void> {
    await this.seksjonOverskrift.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
    await Promise.race([
      this.seksjonsTabell.waitFor({ state: 'visible', timeout: TIMEOUT_LONG }),
      this.tomTilstand.waitFor({ state: 'visible', timeout: TIMEOUT_LONG }),
    ]);
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

    if ((await this.seksjonsTabell.count()) === 0) {
      return [];
    }

    // tbody-scope dropper header-raden uavhengig av om bygget bruker
    // <thead> eller eksplisitt role="row" på header-celler.
    const rader = this.seksjonsTabell.locator('tbody').getByRole('row');
    const antall = await rader.count();
    const resultat: PoppRad[] = [];

    for (let i = 0; i < antall; i++) {
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

      const aar = Number.parseInt(aarTekst.replace(/\D/g, ''), 10);
      const pgi = Number.parseInt(pgiTekst.replace(/\D/g, ''), 10);
      if (!Number.isFinite(aar) || !Number.isFinite(pgi)) {
        throw new Error(
          `POPP-rad ${i}: kunne ikke parse aar="${aarTekst}" / pgi="${pgiTekst}" — ` +
            `kolonner kan ha endret rekkefølge i bygget, eller cellen er tom/under lasting.`,
        );
      }

      resultat.push({ aar, pgi, kilde: kildeTekst });
    }

    return resultat;
  }

  /**
   * Sjekk om tom-tilstand (informasjonsmelding) vises.
   */
  async erTomVisning(): Promise<boolean> {
    return this.isElementVisible(this.tomTilstand, 1000);
  }
}
