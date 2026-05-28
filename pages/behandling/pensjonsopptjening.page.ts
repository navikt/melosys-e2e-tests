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
 * **Reconcile-status (2026-05-27):**
 * Bygget i melosys-web (commit d5ef9f701) rendrer seksjonen som et eget
 * menypunkt «Pensjonsopptjening» under «FRA REGISTER» i Opplysninger-sidemenyen
 * — toggle- og ÅRSAVREGNING-gated i `linkgroupsFactory.tsx`. Menypunktet er
 * en `<button>` (ikke `<a>`), så `getByRole('button', ...)` brukes for klikk-
 * målet og `getByRole('heading', { level: 2 }, ...)` for tabell-overskriften —
 * samme tekst, ulike roller diskriminerer rent.
 *
 * Tabellen har 6 kolonner: År | PGI | Kilde | Pensjonsgivende inntektstype |
 * Registrert | Oppdatert. Inntektstype-cellen rendrer `inntektTypeDekode`
 * direkte (ikke koden), med fallback til koden hvis dekoden mangler. Tooltip
 * er fjernet — beskrivelsen leses direkte i tabellen. Under tabellen vises en
 * footer-legend med forkortelses-forklaringer (FFF / JSF / KSL).
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
  inntektstype: string; // dekode-streng fra API (mockens INNTEKT_TYPE_DEKODE), fallback til koden hvis dekoden mangler
  registrert: string; // dd.MM.yyyy fra Utils.dato.formatterDatoTilNorsk, eller «—»
  oppdatert: string; // dd.MM.yyyy fra Utils.dato.formatterDatoTilNorsk, eller «—»
}

/** Em-dash brukt av web som fallback for manglende dato (U+2014). */
export const POPP_DATO_TOM = '—';

export class PensjonsopptjeningPage extends BasePage {
  readonly assertions: PensjonsopptjeningAssertions;

  // Menypunkt-button «Pensjonsopptjening» under «FRA REGISTER» i Opplysninger-
  // sidemenyen. Diskrimineres fra tabell-h2 ved rolle (button vs heading).
  private readonly menypunktButton = this.page.getByRole('button', { name: 'Pensjonsopptjening' });

  // Seksjons-overskrift «Pensjonsopptjening» (h2) i main-content etter at
  // menypunktet er klikket.
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
   * Klikk menypunktet og vent til «Pensjonsopptjening»-seksjonen er ferdig hydrert.
   * Default-aktivt menypunkt ved åpning av årsavregningen er «Person», så vi må
   * eksplisitt klikke «Pensjonsopptjening» under «FRA REGISTER» først. Etterpå
   * venter vi på h2 + (tabell|tom-tilstand) — ellers risikerer kallere å lese en
   * halvferdig DOM mens POPP-fetch fortsatt resolver.
   */
  async ventPåSeksjon(): Promise<void> {
    await this.menypunktButton.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
    await this.menypunktButton.click();

    await this.seksjonOverskrift.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
    await Promise.race([
      this.seksjonsTabell.waitFor({ state: 'visible', timeout: TIMEOUT_LONG }),
      this.tomTilstand.waitFor({ state: 'visible', timeout: TIMEOUT_LONG }),
    ]);
  }

  /**
   * Les alle rader fra Pensjonsopptjening-tabellen (6 kolonner:
   * År | PGI | Kilde | Pensjonsgivende inntektstype | Registrert | Oppdatert).
   *
   * Inntektstype-cellen viser dekode-strengen direkte (f.eks. «Sum
   * pensjonsgivende inntekt»), eller koden som fallback om dekoden mangler.
   * Registrert/Oppdatert er enten dd.MM.yyyy eller em-dash «—».
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
        celler.nth(3).textContent(),
        celler.nth(4).textContent(),
        celler.nth(5).textContent(),
      ]);

      const aarTekst = (cellTekster[0] ?? '').trim();
      const pgiTekst = (cellTekster[1] ?? '').trim();
      const kildeTekst = (cellTekster[2] ?? '').trim();
      const inntektstypeTekst = (cellTekster[3] ?? '').trim();
      const registrertTekst = (cellTekster[4] ?? '').trim();
      const oppdatertTekst = (cellTekster[5] ?? '').trim();

      const aar = Number.parseInt(aarTekst.replace(/\D/g, ''), 10);
      const pgi = Number.parseInt(pgiTekst.replace(/\D/g, ''), 10);
      if (!Number.isFinite(aar) || !Number.isFinite(pgi)) {
        throw new Error(
          `POPP-rad ${i}: kunne ikke parse aar="${aarTekst}" / pgi="${pgiTekst}" — ` +
            `kolonner kan ha endret rekkefølge i bygget, eller cellen er tom/under lasting.`,
        );
      }

      resultat.push({
        aar,
        pgi,
        kilde: kildeTekst,
        inntektstype: inntektstypeTekst,
        registrert: registrertTekst,
        oppdatert: oppdatertTekst,
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
}
