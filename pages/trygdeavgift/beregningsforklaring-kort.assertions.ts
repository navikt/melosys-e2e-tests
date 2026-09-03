import { Locator, Page, expect } from '@playwright/test';
import type { BeregningsforklaringKortPage, Inntektsgruppe } from './beregningsforklaring-kort.page';

/** Tallene steg 3 («25 %-regelen (maksgrense)») viser for ett år, lest ut av DOM. */
export interface Maksgrensesteg {
  /** «Maks avgift = 25 % × … = X» */
  avgiftstak: number;
  /** «Sum ordinær avgift» — eller «Ordinær avgift» når posteringslinjene mangler. */
  ordinaerAvgift: number;
  /** Radene under «Hver avgiftsdel målt mot taket». Tom liste når backend ikke sendte delbeløp. */
  deler: Array<{ navn: string; beloep: number }>;
  /** Teksten i merknads-alerten nederst i steget. */
  merknad: string;
}

/** «339 600 kr» → 339600. Norsk tusenskille er hardt mellomrom ( ) fra toLocaleString. */
function lesBeloep(tekst: string): number {
  const siffer = tekst.replace(/[^\d]/g, '');
  if (siffer === '') throw new Error(`Fant ingen beløp i teksten: «${tekst}»`);
  return Number(siffer);
}

export class BeregningsforklaringKortAssertions {
  constructor(
    readonly page: Page,
    private readonly kort: BeregningsforklaringKortPage,
  ) {}

  /** Verifiserer at kortet i det hele tatt rendres (krever at en særregel slo ut). */
  async verifiserKortSynlig(): Promise<void> {
    await expect(this.kort.locator()).toBeVisible({ timeout: 10000 });
  }

  /** Verifiserer at et felt for år + inntektsgruppe finnes i kortet. */
  async verifiserFeltFinnes(aar: number, inntektsgruppe: Inntektsgruppe): Promise<void> {
    await expect(this.kort.felt(aar, inntektsgruppe)).toBeVisible({ timeout: 10000 });
  }

  /**
   * Leser ut tallene i steg 3 for ett felt, slik saksbehandleren ser dem.
   * Eksponert slik at tester kan asserte på faktiske beløp uten å hardkode selektorer.
   */
  async lesMaksgrensesteg(
    aar: number,
    inntektsgruppe: Inntektsgruppe,
  ): Promise<Maksgrensesteg> {
    const felt = this.kort.felt(aar, inntektsgruppe);
    await expect(felt).toBeVisible({ timeout: 10000 });

    const steg = felt.locator('.beregningsforklaring-kort-steg', {
      hasText: '25 %-regelen (maksgrense)',
    });
    await expect(steg).toBeVisible({ timeout: 10000 });

    const avgiftstak = lesBeloep(
      (await steg.locator('.beregningsforklaring-kort-formel').innerText()).split('=').pop() ?? '',
    );

    const ordinaerAvgift = await this.lesOrdinaerAvgift(steg);
    const deler = await this.lesDeler(steg);
    const merknad = (
      await steg.locator('.beregningsforklaring-kort-merknad').innerText()
    ).replace(/\s+/g, ' ').trim();

    return { avgiftstak, ordinaerAvgift, deler, merknad };
  }

  /**
   * Akseptansekriteriet for MELOSYS-8171: når ORDINÆR er valgt fordi ingen avgiftsdel
   * alene overstiger taket, skal kortet vise nettopp de delbeløpene som ble målt mot taket
   * — ikke summen av dem, som aldri ble sammenlignet med noe.
   *
   * Asserterer hele invarianten kortet skal holde:
   * - hver del ligger under taket (og raden viser «≤», ikke «>»)
   * - summen av delene er nøyaktig totalen som vises rett over («Sum ordinær avgift»)
   * - merknaden forklarer at taket måles pr. del, i stedet for å påstå at totalen er under taket
   *
   * Returnerer de leste tallene slik at kalleren kan logge dem.
   */
  async verifiserDelerMaaltMotTaket(
    aar: number,
    forventedeDeler: string[] = ['Helsedel', 'Pensjonsdel'],
  ): Promise<Maksgrensesteg> {
    const steg = await this.lesMaksgrensesteg(aar, 'SAMLET');

    expect(
      steg.deler.map((del) => del.navn),
      'Kortet skal vise ett delbeløp pr. avgiftsdel som ble målt mot taket',
    ).toEqual(forventedeDeler);

    for (const del of steg.deler) {
      expect(
        del.beloep,
        `${del.navn} skal ligge under taket når ORDINÆR ble valgt`,
      ).toBeLessThanOrEqual(steg.avgiftstak);
    }

    const sumDeler = steg.deler.reduce((sum, del) => sum + del.beloep, 0);
    expect(
      sumDeler,
      'Totalen kortet viser skal være summen av delene som står rett under',
    ).toBe(steg.ordinaerAvgift);

    expect(
      steg.merknad,
      'Merknaden skal forklare at taket måles pr. del',
    ).toMatch(/Hver avgiftsdel måles mot taket for seg, og ingen av dem overstiger/);

    return steg;
  }

  /**
   * Verifiserer at kortet ikke påstår at totalen ble målt mot taket når den ikke ble det.
   * Dette er selvmotsigelsen fag meldte inn: «Ordinær avgift 339 600 kr ≤ 25 %-tak 275 087 kr».
   */
  async verifiserIngenSelvmotsigendeSammenligning(aar: number): Promise<void> {
    const steg = await this.lesMaksgrensesteg(aar, 'SAMLET');
    if (steg.ordinaerAvgift <= steg.avgiftstak) return;

    expect(
      steg.merknad,
      `Kortet påstår at ${steg.ordinaerAvgift} ≤ ${steg.avgiftstak}, som ikke stemmer`,
    ).not.toMatch(/Ordinær avgift .*≤ 25 %-tak/);
  }

  /**
   * Kontrollen for svar UTEN delbeløp (eldre melosys-api, eller en gren som ikke fyller lista).
   * Da har kortet ingen tall å begrunne utfallet med, og skal si nettopp det — ikke gjenta
   * påstanden fag meldte inn, at en total som overstiger taket likevel er under det.
   */
  async verifiserMerknadUtenDelbeloep(aar: number): Promise<Maksgrensesteg> {
    const steg = await this.lesMaksgrensesteg(aar, 'SAMLET');

    expect(steg.deler, 'Uten delbeløp i svaret skal kortet ikke vise delrader').toEqual([]);
    expect(
      steg.ordinaerAvgift,
      'Kontrollen gir bare mening når totalen faktisk overstiger taket',
    ).toBeGreaterThan(steg.avgiftstak);
    expect(steg.merknad, 'Kortet skal si at delbeløpene mangler').toMatch(
      /avgiften ble ikke begrenset.*delbeløpene mangler/,
    );
    expect(
      steg.merknad,
      `Kortet påstår at ${steg.ordinaerAvgift} ≤ ${steg.avgiftstak}, som ikke stemmer`,
    ).not.toMatch(/Ordinær avgift .*≤ 25 %-tak/);

    return steg;
  }

  /** «Sum ordinær avgift» når posteringslinjene finnes, ellers «Ordinær avgift»-raden. */
  private async lesOrdinaerAvgift(steg: Locator): Promise<number> {
    const sumRad = steg.locator('.beregningsforklaring-kort-rad--sum', {
      hasText: 'Sum ordinær avgift',
    });
    if ((await sumRad.count()) > 0) {
      return lesBeloep(await sumRad.locator('.beregningsforklaring-kort-rad-verdi').innerText());
    }
    const enkelRad = steg.locator('.beregningsforklaring-kort-rad', { hasText: 'Ordinær avgift' });
    return lesBeloep(await enkelRad.first().locator('.beregningsforklaring-kort-rad-verdi').innerText());
  }

  private async lesDeler(steg: Locator): Promise<Array<{ navn: string; beloep: number }>> {
    const seksjon = steg.locator('.beregningsforklaring-kort-underseksjon', {
      hasText: 'Hver avgiftsdel målt mot taket',
    });
    if ((await seksjon.count()) === 0) return [];

    const rader = seksjon.locator('.beregningsforklaring-kort-rad');
    const antall = await rader.count();
    const deler: Array<{ navn: string; beloep: number }> = [];
    for (let i = 0; i < antall; i++) {
      const rad = rader.nth(i);
      const verdi = await rad.locator('.beregningsforklaring-kort-rad-verdi').innerText();
      // Raden er «<delbeløp> ≤ <tak>» — delbeløpet står i <strong>, og sammenligningstegnet
      // regnes ut pr. rad i melosys-web. Asserter tegnet her, så teksten ikke kan motsi tallene.
      const beloep = lesBeloep(await rad.locator('strong').innerText());
      expect(verdi, 'Delraden skal vise sammenligningen mot taket').toMatch(/[≤>]/);
      deler.push({
        navn: (await rad.locator('p').first().innerText()).trim(),
        beloep,
      });
    }
    return deler;
  }
}
