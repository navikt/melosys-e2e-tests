import { Locator, Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { BeregningsforklaringKortAssertions } from './beregningsforklaring-kort.assertions';

/** Inntektsgruppene forklaringskortet kan ha ett felt for. Speiler Beregningsinntektsgruppe i melosys-web. */
export type Inntektsgruppe = 'SAMLET' | 'HELSEDEL' | 'PENSJONSDEL' | 'MISJONAER';

/**
 * Page Object for «Beregningsforklaring»-kortet i trygdeavgiftssteget.
 *
 * Kortet er en ExpansionCard som er lukket by default, og som melosys-web kun rendrer
 * når minst én inntektsgruppe traff en særregel (25 %-regelen eller minstebeløpet) —
 * se forklaringerSomSkalVises i melosys-web. Er kortet synlig, inneholder det ett felt
 * per år+inntektsgruppe, med id `beregningsforklaring-kort-<år>-<inntektsgruppe>`.
 *
 * @example
 * const kort = new BeregningsforklaringKortPage(page);
 * await kort.aapneKort();
 * await kort.assertions.verifiserDelerMaaltMotTaket(2027);
 */
export class BeregningsforklaringKortPage extends BasePage {
  readonly assertions: BeregningsforklaringKortAssertions;

  // .first(): beregningsforklaringKort.tsx regner eksplisitt med flere kort på samme side
  // (årsavregningens beregnetTrygdeavgiftDetaljer). Trygdeavgiftssteget har bare ett, men uten
  // .first() ville POM-en kastet strict mode-brudd om den gjenbrukes der.
  private readonly kort = this.page
    .locator('[aria-label="Beregningsforklaring for trygdeavgift"]')
    .first();

  constructor(page: Page) {
    super(page);
    this.assertions = new BeregningsforklaringKortAssertions(page, this);
  }

  /** Selve ExpansionCard-en. */
  locator(): Locator {
    return this.kort;
  }

  /** Feltet for ett år og én inntektsgruppe. Id-en bygges likt som feltId() i melosys-web. */
  felt(aar: number, inntektsgruppe: Inntektsgruppe): Locator {
    return this.kort.locator(`#beregningsforklaring-kort-${aar}-${inntektsgruppe}`);
  }

  /** Åpner kortet hvis det er lukket. Kaster hvis kortet ikke rendres i det hele tatt. */
  async aapneKort(): Promise<void> {
    await this.kort.waitFor({ state: 'visible', timeout: 10000 });
    const knapp = this.kort.locator('button').first();
    if ((await knapp.getAttribute('aria-expanded')) !== 'true') {
      await knapp.click();
    }
    await this.kort.locator('.beregningsforklaring-kort-felt').first().waitFor({
      state: 'visible',
      timeout: 5000,
    });
  }
}
