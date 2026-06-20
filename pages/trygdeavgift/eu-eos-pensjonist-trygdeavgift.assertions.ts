import { Page, expect } from '@playwright/test';
import type { Trygdeavgiftsperiode } from './eu-eos-pensjonist-trygdeavgift.page';

/**
 * Assertion-metoder for EuEosPensjonistTrygdeavgiftPage
 *
 * Ansvar:
 * - Verifisere at infomeldinger er synlige/ikke synlige
 * - Verifisere at beregningstabellen er synlig/ikke synlig
 * - Verifisere 25%-regel-markering (*)
 * - Verifisere sammenslåtte inntektskilder-markering (***)
 */
export class EuEosPensjonistTrygdeavgiftAssertions {
  constructor(readonly page: Page) {}

  async verifiserInfomeldingMinstebeløpSynlig(): Promise<void> {
    await expect(
      this.page.getByText('Trygdeavgift skal ikke betales da inntekten er under minstebeløpet.'),
    ).toBeVisible();
  }

  async verifiserInfomeldingMinstebeløpIkkeSynlig(): Promise<void> {
    await expect(
      this.page.getByText('Trygdeavgift skal ikke betales da inntekten er under minstebeløpet.'),
    ).not.toBeVisible();
  }

  async verifiserTrygdeavgiftsTabellSynlig(): Promise<void> {
    await expect(this.page.getByRole('columnheader', { name: 'Trygdeperiode' })).toBeVisible();
  }

  /**
   * Verifiserer "under minstebeløp"-modus: infomeldingen er synlig OG
   * beregningstabellen er fraværende.
   *
   * Rekkefølgen håndheves bevisst: infomeldingen ventes på først (garanterer at
   * beregningen er fullført og React har ferdig-rendret), deretter sjekkes at
   * tabellen ikke finnes med `toHaveCount(0)`. I motsetning til `not.toBeVisible()`
   * — som returnerer umiddelbart hvis elementet ikke er der akkurat nå og dermed kan
   * bestå for tidlig — feiler `toHaveCount(0)` hvis tabellen dukker opp i en sen
   * React-render innen default-timeout.
   */
  async verifiserMinstebeløpModus(): Promise<void> {
    await this.verifiserInfomeldingMinstebeløpSynlig();
    await expect(this.page.getByRole('columnheader', { name: 'Trygdeperiode' })).toHaveCount(0);
  }

  /**
   * Verifiserer 25%-regel-markering:
   * - `*` i sats-kolonnen
   * - fotnote "* Beregnet etter 25 %-regelen"
   */
  async verifiser25ProsentRegelMarkering(): Promise<void> {
    await expect(this.page.getByRole('cell', { name: '*' })).toBeVisible();
    await expect(this.page.getByText('* Beregnet etter 25 %-regelen')).toBeVisible();
  }

  /**
   * Verifiserer sammenslåtte inntektskilder-markering:
   * - `***` i inntektskilde-kolonnen
   * - fotnote "*** Mer enn en inntekt"
   */
  async verifiserSammenslåtteInntektskilderMarkering(): Promise<void> {
    await expect(this.page.getByRole('cell', { name: '***' })).toBeVisible();
    await expect(this.page.getByText('*** Mer enn en inntekt')).toBeVisible();
  }

  /**
   * Verifiserer det FAKTISKE beregnede avgiftsbeløpet fra
   * `BeregnetTrygdeavgift`-responsen (ikke bare UI-markeringen):
   *  - minst én periode finnes
   *  - hver periode har `beregningsregel === forventetRegel`
   *  - `avgiftPerMd > 0` (det beregnes faktisk en avgift)
   *  - intern konsistens: avgiftPerMd ≈ bruttoinntektPerMd × sats
   *    (sats-enkodingen utledes av verdien selv — en trygdeavgiftssats angitt i
   *    prosent er > 1, en brøk er ≤ 1 — så testen tåler at API-et bytter enkoding;
   *    toleranse er romslig nok til avrunding/min.beløp-gulv).
   *
   * @param perioder  trygdeavgiftsperioder fra page.hentTrygdeavgiftsperioder()
   * @param forventetRegel  'ORDINÆR' | 'TJUEFEM_PROSENT_REGEL'
   * @param bruttoinntektPerMd  månedsinntekten testen la inn (for konsistenssjekk)
   */
  verifiserBeregnetAvgift(
    perioder: Trygdeavgiftsperiode[],
    forventetRegel: 'ORDINÆR' | 'TJUEFEM_PROSENT_REGEL',
    bruttoinntektPerMd: number,
  ): void {
    expect(perioder.length, 'Forventet minst én trygdeavgiftsperiode i beregningen').toBeGreaterThan(
      0,
    );

    for (const p of perioder) {
      expect(p.beregningsregel, `Periode skal bruke beregningsregel ${forventetRegel}`).toBe(
        forventetRegel,
      );
      expect(
        p.avgiftPerMd,
        'Det skal være beregnet en positiv månedlig avgift (avgiftPerMd)',
      ).toBeGreaterThan(0);

      expect(p.avgiftssats, 'Perioden skal ha en avgiftssats').not.toBeNull();
      const sats = p.avgiftssats as number;
      const satsSomBrøk = sats > 1 ? sats / 100 : sats;
      const forventetAvgift = bruttoinntektPerMd * satsSomBrøk;
      // Romslig relativ toleranse (5 %) for å tåle avrunding og evt. min.beløp-gulv,
      // men streng nok til å fange feil enhet / feil størrelsesorden.
      const toleranse = Math.max(forventetAvgift * 0.05, 1);
      expect(
        Math.abs(p.avgiftPerMd - forventetAvgift),
        `avgiftPerMd (${p.avgiftPerMd}) skal være konsistent med sats ${p.avgiftssats} × ${bruttoinntektPerMd} ≈ ${forventetAvgift.toFixed(2)}`,
      ).toBeLessThanOrEqual(toleranse);
    }

    console.log(
      `✅ Beregnet avgift (${forventetRegel}): ${perioder
        .map((p) => `${p.avgiftPerMd} kr/md @ sats ${p.avgiftssats}`)
        .join(', ')}`,
    );
  }

  /**
   * Verifiserer det FAKTISKE beløpet bak 25%-regel-markeringen.
   *
   * 25%-regelen oppgir IKKE en avgiftssats i responsen (avgiftssats === null) —
   * avgiften beregnes som 25 % av differansen, ikke som sats × inntekt. Derfor:
   *  - hver periode har `beregningsregel === 'TJUEFEM_PROSENT_REGEL'`
   *  - `avgiftPerMd > 0`
   *  - taket er aktivt: `avgiftPerMd` er VESENTLIG under hva ordinær sats
   *    (`ordinærSatsProsent`, f.eks. 5.1 %) × inntekt ville gitt.
   *
   * @param perioder  trygdeavgiftsperioder fra page.hentTrygdeavgiftsperioder()
   * @param bruttoinntektPerMd  månedsinntekten testen la inn
   * @param ordinærSatsProsent  ordinær trygdeavgiftssats i prosent (kalibrert, f.eks. 5.1)
   */
  verifiser25ProsentRegelAvgift(
    perioder: Trygdeavgiftsperiode[],
    bruttoinntektPerMd: number,
    ordinærSatsProsent: number,
  ): void {
    expect(perioder.length, 'Forventet minst én trygdeavgiftsperiode i beregningen').toBeGreaterThan(
      0,
    );

    const ordinærAvgift = bruttoinntektPerMd * (ordinærSatsProsent / 100);
    for (const p of perioder) {
      expect(p.beregningsregel, 'Periode skal bruke 25%-regelen').toBe('TJUEFEM_PROSENT_REGEL');
      expect(
        p.avgiftPerMd,
        'Det skal være beregnet en positiv månedlig avgift (avgiftPerMd)',
      ).toBeGreaterThan(0);
      // Taket skal faktisk begrense: minst 20 % lavere enn ordinær sats ville gitt.
      expect(
        p.avgiftPerMd,
        `25%-regelen skal begrense avgiften (${p.avgiftPerMd}) godt under ordinær sats × inntekt (${ordinærAvgift.toFixed(0)})`,
      ).toBeLessThan(ordinærAvgift * 0.8);
    }

    console.log(
      `✅ 25%-regel-avgift: ${perioder
        .map((p) => `${p.avgiftPerMd} kr/md (ordinær ville gitt ~${ordinærAvgift.toFixed(0)})`)
        .join(', ')}`,
    );
  }
}
