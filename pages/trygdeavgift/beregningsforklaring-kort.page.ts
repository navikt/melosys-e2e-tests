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
 */
export class BeregningsforklaringKortPage extends BasePage {
  readonly assertions: BeregningsforklaringKortAssertions;

  // Usikret lokator: i dag rendres nøyaktig ett slikt kort i alle tilstander POM-en når, så
  // ingen test kan skille denne formen fra .first(). Skulle en side få to kort, er strict
  // mode-bruddet en bedre beskjed enn et stille valg av det første.
  private readonly kort = this.page.locator(
    '[aria-label="Beregningsforklaring for trygdeavgift"]',
  );

  constructor(page: Page) {
    super(page);
    this.assertions = new BeregningsforklaringKortAssertions(page, this);
  }

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
