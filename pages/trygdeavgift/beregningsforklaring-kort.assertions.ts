import { Locator, Page, expect } from '@playwright/test';
import type { BeregningsforklaringKortPage, Inntektsgruppe } from './beregningsforklaring-kort.page';

/** Tallene steg 3 («25 %-regelen (maksgrense)») viser for ett år, lest ut av DOM. */
export interface Maksgrensesteg {
  /** «Maks avgift = 25 % × … = X» */
  avgiftstak: number;
  /** Totalen steget viser. */
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

  /** Verifiserer at kortet rendres. Krever at en særregel slo ut. */
  async verifiserKortSynlig(): Promise<void> {
    await expect(this.kort.locator()).toBeVisible({ timeout: 10000 });
  }

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
    const deler = await this.lesDeler(steg, avgiftstak);
    const merknad = (
      await steg.locator('.beregningsforklaring-kort-merknad').innerText()
    ).replace(/\s+/g, ' ').trim();

    return { avgiftstak, ordinaerAvgift, deler, merknad };
  }

  /**
   * Akseptansekriteriet: når ORDINÆR er valgt fordi ingen avgiftsdel alene overstiger taket,
   * skal kortet vise nettopp de delbeløpene som ble målt mot taket — ikke summen av dem, som
   * aldri ble sammenlignet med noe.
   *
   * Steget rendrer én av fire gjensidig utelukkende merknader, så et krav om «måles pr.
   * del»-merknaden utelukker samtidig grenen som påsto «Ordinær avgift … ≤ 25 %-tak …».
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
      sumDeler,
      'Scenarioet forutsetter at summen av delene overstiger taket',
    ).toBeGreaterThan(steg.avgiftstak);

    expect(
      steg.merknad,
      'Merknaden skal forklare at taket måles pr. del',
    ).toMatch(/måles mot taket for seg/i);

    return steg;
  }

  /**
   * Kontrollen for svar uten delbeløp (melosys-api før feltet fantes, eller en gren som ikke
   * fyller lista). Da har kortet ingen tall å begrunne utfallet med og skal si nettopp det,
   * ikke påstå at en total over taket likevel er under det.
   */
  async verifiserMerknadUtenDelbeloep(aar: number): Promise<Maksgrensesteg> {
    const steg = await this.lesMaksgrensesteg(aar, 'SAMLET');

    expect(steg.deler, 'Uten delbeløp i svaret skal kortet ikke vise delrader').toEqual([]);
    expect(
      steg.ordinaerAvgift,
      'Kontrollen gir bare mening når totalen faktisk overstiger taket',
    ).toBeGreaterThan(steg.avgiftstak);
    expect(steg.merknad, 'Kortet skal si at delbeløpene mangler').toMatch(
      /delbeløpene mangler/i,
    );
    expect(
      steg.merknad,
      `Kortet påstår at ${steg.ordinaerAvgift} ≤ ${steg.avgiftstak}, som ikke stemmer`,
    ).not.toMatch(/≤ 25 %-tak/);

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

  private async lesDeler(
    steg: Locator,
    avgiftstak: number,
  ): Promise<Array<{ navn: string; beloep: number }>> {
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
      // Raden er «<delbeløp> ≤ <tak>»: delbeløpet står i <strong>, taket til høyre for tegnet.
      const beloep = lesBeloep(await rad.locator('strong').innerText());

      // Måles mot taket fra formel-linja over steget, ikke mot raden selv — en gal parsing av
      // raden ville ellers bekrefte seg selv.
      expect(
        lesBeloep(verdi.split(/[≤>]/).pop() ?? ''),
        'Delraden skal måle mot samme tak som formelen over steget',
      ).toBe(avgiftstak);

      // Tegnet regnes ut pr. rad i melosys-web, så raden må vise nøyaktig det tegnet tallene
      // tilsier.
      expect(
        verdi,
        `Delraden viser ${beloep} mot tak ${avgiftstak}, men tegnet stemmer ikke med tallene`,
      ).toContain(beloep > avgiftstak ? '>' : '≤');
      deler.push({
        navn: (await rad.locator('p').first().innerText()).trim(),
        beloep,
      });
    }
    return deler;
  }
}
