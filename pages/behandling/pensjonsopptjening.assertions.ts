import { Page, expect } from '@playwright/test';
import { PensjonsopptjeningPage, PoppRad } from './pensjonsopptjening.page';

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
    await expect(
      this.page.getByRole('heading', { name: 'Pensjonsopptjening' }),
    ).toBeVisible();
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
   * Verifiser at den første raden har år ≥ alle øvrige (nyeste først).
   */
  async verifiserNyesteÅrØverst(rader: PoppRad[]): Promise<void> {
    expect(rader.length).toBeGreaterThan(0);
    const førsteAar = rader[0].aar;
    for (const rad of rader) {
      expect(førsteAar).toBeGreaterThanOrEqual(rad.aar);
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
}
