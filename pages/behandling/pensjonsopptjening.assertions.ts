import { Page, expect } from '@playwright/test';
import { TIMEOUT_LONG } from '../shared/constants';
import type { PoppRad } from './pensjonsopptjening.page';

/**
 * Assertion methods for PensjonsopptjeningPage.
 *
 * Binder akseptansekriteriene i specs/popp-pensjonsopptjening-visning.md til kode.
 * En `Så`-linje i speken skal alltid ha en tilsvarende `verifiser…()` her.
 */
export class PensjonsopptjeningAssertions {
  constructor(readonly page: Page) {}

  /**
   * Verifiser at seksjonen «Pensjonsopptjening» vises (overskrift synlig).
   */
  async verifiserSeksjonVises(): Promise<void> {
    // Speil POM-ens seksjonOverskrift-locator (level: 2) og bruk samme
    // tidsbudsjett som ventPåSeksjon for å unngå asymmetrisk flake.
    await expect(
      this.page.getByRole('heading', { name: 'Pensjonsopptjening', level: 2 }),
    ).toBeVisible({ timeout: TIMEOUT_LONG });
  }

  /**
   * Verifiser at alle rader har samme kilde-visning.
   *
   * @param kilde - Forventet visningsnavn («Skatt», «Avgiftssystemet», «Melosys»)
   */
  async verifiserAlleRaderHarKilde(rader: PoppRad[], kilde: string): Promise<void> {
    expect(rader.length).toBeGreaterThan(0);
    for (const rad of rader) {
      expect(rad.kilde).toBe(kilde);
    }
  }

  /**
   * Verifiser antall rader som vises for et gitt år.
   */
  async verifiserAntallRaderForAar(
    rader: PoppRad[],
    aar: number,
    forventetAntall: number,
  ): Promise<void> {
    const raderForAar = rader.filter(r => r.aar === aar);
    expect(raderForAar.length).toBe(forventetAntall);
  }

  /**
   * Verifiser at radene for et gitt år inneholder alle forventede kilder.
   *
   * @param kilder - Liste over visningsnavn som skal være representert
   */
  async verifiserRaderInneholderKilder(
    rader: PoppRad[],
    aar: number,
    kilder: string[],
  ): Promise<void> {
    const kilderForAar = rader.filter(r => r.aar === aar).map(r => r.kilde);
    for (const kilde of kilder) {
      expect(kilderForAar).toContain(kilde);
    }
  }

  /**
   * Verifiser monotont synkende år (nyeste øverst). Tillater like år for
   * multi-kilde-rader for samme inntektsår.
   */
  async verifiserNyesteÅrØverst(rader: PoppRad[]): Promise<void> {
    expect(rader.length).toBeGreaterThan(0);
    for (let i = 1; i < rader.length; i++) {
      expect(rader[i - 1].aar).toBeGreaterThanOrEqual(rader[i].aar);
    }
  }

  /**
   * Verifiser at alle viste rader ligger innenfor `[fraAar, tilAar]` (inklusiv).
   * Speilen «inntil 5 år tilbake» i scenario 1, og «tilbake til avregningsåret»
   * i scenario 5.
   */
  async verifiserAarIntervall(
    rader: PoppRad[],
    fraAar: number,
    tilAar: number,
  ): Promise<void> {
    expect(rader.length).toBeGreaterThan(0);
    for (const rad of rader) {
      expect(rad.aar).toBeGreaterThanOrEqual(fraAar);
      expect(rad.aar).toBeLessThanOrEqual(tilAar);
    }
  }

  /**
   * Verifiser at tom-tilstand vises (informasjonsmelding, ingen rader).
   * Eksakt tekst fra bygg.
   */
  async verifiserTomMelding(): Promise<void> {
    await expect(
      this.page.getByText('Ingen pensjonsopptjening registrert i POPP for personen.'),
    ).toBeVisible();
  }

  /**
   * Verifiser at rad for gitt (år, kilde) viser forventede tidsstempler.
   *
   * Brukes for å speile spec-kravet om at hver rad viser «Registrert» og
   * «Oppdatert» pr kilde — spesielt når samme år har flere rader.
   *
   * @param kilde - Visningsnavn («Skatt» / «Avgiftssystemet» / «Melosys»)
   * @param forventet - Forventede dd.MM.yyyy-strenger (eller «—» for null/tom)
   */
  async verifiserRadHarTidsstempler(
    rader: PoppRad[],
    aar: number,
    kilde: string,
    forventet: { registrert: string; oppdatert: string },
  ): Promise<void> {
    const rad = rader.find(r => r.aar === aar && r.kilde === kilde);
    expect(
      rad,
      `Fant ingen rad for år=${aar} kilde="${kilde}" (rader: ${JSON.stringify(rader)})`,
    ).toBeDefined();
    expect(rad!.registrert).toBe(forventet.registrert);
    expect(rad!.oppdatert).toBe(forventet.oppdatert);
  }

  /**
   * Verifiser at en rad for (år, kilde) viser forventet inntektstype-dekode.
   * Tabellens «Pensjonsgivende inntektstype»-kolonne viser
   * `inntektTypeDekode || inntektType` direkte fra API — ingen tooltip,
   * ingen kortform-mapping i web. Dekoden kommer fra mockens
   * `INNTEKT_TYPE_DEKODE`-map (speilet i `POPP_INNTEKT_TYPE_BESKRIVELSE`),
   * eller fra det vi eksplisitt seedet via `seedPoppInntekt`.
   *
   * @param kilde - Visningsnavn («Skatt» / «Avgiftssystemet» / «Melosys»)
   * @param forventetDekode - Forventet dekode-streng (eksakt match)
   */
  async verifiserRadHarInntektstype(
    rader: PoppRad[],
    aar: number,
    kilde: string,
    forventetDekode: string,
  ): Promise<void> {
    const rad = rader.find(r => r.aar === aar && r.kilde === kilde && r.inntektstype === forventetDekode);
    expect(
      rad,
      `Fant ingen rad for år=${aar} kilde="${kilde}" inntektstype="${forventetDekode}" ` +
        `(rader: ${JSON.stringify(rader)})`,
    ).toBeDefined();
  }
}
