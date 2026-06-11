import { Page, expect } from '@playwright/test';
import { assertErrors } from '../../utils/assertions';

/**
 * Assertion methods for AarsavregningPage
 *
 * Responsibilities:
 * - Verify page is loaded correctly
 * - Verify form fields are visible
 * - Verify no errors on the page
 * - Verify button states
 */
export class AarsavregningAssertions {
  constructor(readonly page: Page) {}

  /**
   * Verify Årsavregning page has loaded
   * Checks that the year selector is visible
   */
  async verifiserSideLastet(): Promise<void> {
    const aarVelger = this.page.locator('#aarVelger');
    await expect(aarVelger).toBeVisible({ timeout: 10000 });
    console.log('✅ Årsavregning page is loaded');
  }

  /**
   * Verify the bestemmelse dropdown is visible
   */
  async verifiserBestemmelseDropdown(): Promise<void> {
    const dropdown = this.page.getByLabel('Bestemmelse');
    await expect(dropdown).toBeVisible();
  }

  /**
   * Verify inntektskilde dropdown is visible
   */
  async verifiserInntektskildeDropdown(): Promise<void> {
    const dropdown = this.page.getByLabel('Inntektskilde');
    await expect(dropdown).toBeVisible();
  }

  /**
   * Verify bruttoinntekt field is visible
   */
  async verifiserBruttoinntektFelt(): Promise<void> {
    const field = this.page.getByRole('textbox', { name: 'Bruttoinntekt' });
    await expect(field).toBeVisible();
  }

  /**
   * Verify "Bekreft og fortsett" button is enabled
   * This indicates the form is valid and ready to submit
   */
  async verifiserBekreftKnappAktiv(): Promise<void> {
    const button = this.page.getByRole('button', { name: 'Bekreft og fortsett' });
    await expect(button).toBeEnabled({ timeout: 15000 });
    console.log('✅ Bekreft og fortsett button is enabled');
  }

  /**
   * Verify "Bekreft og fortsett" button is disabled
   */
  async verifiserBekreftKnappDeaktivert(): Promise<void> {
    const button = this.page.getByRole('button', { name: 'Bekreft og fortsett' });
    await expect(button).toBeDisabled({ timeout: 5000 });
    console.log('✅ Bekreft og fortsett button is disabled');
  }

  /**
   * Verify no errors are present on the form
   */
  async verifiserIngenFeil(): Promise<void> {
    await assertErrors(this.page, []);
  }

  /**
   * Verifiser at årsvelgeren har forhåndsvalgt forventet år.
   * Auto-opprettede årsavregninger (prosess OPPRETT_NY_BEHANDLING_AARSAVREGNING)
   * kjenner året fra førstegangsbehandlingen, så året skal IKKE velges manuelt.
   */
  async verifiserValgtÅr(år: string): Promise<void> {
    await expect(this.page.locator('#aarVelger')).toHaveValue(år, { timeout: 10000 });
    console.log(`✅ År ${år} er forhåndsvalgt i årsvelgeren`);
  }

  /**
   * Verifiser uten-grunnlag-flyten (toggle `melosys.arsavregning.eos_pensjonist`
   * + ingen tidligere trygdeavgiftsgrunnlag): info-alert vises og
   * «Avviker innbetalt»-radioen er skjult (harInnbetaltTrygdeavgift settes
   * automatisk til true av frontenden).
   */
  async verifiserUtenGrunnlagFlyt(): Promise<void> {
    await expect(
      this.page.getByText(
        'Det er ingen informasjon om forskuddsvis fakturert trygdeavgift i Melosys.'
      )
    ).toBeVisible({ timeout: 10000 });
    await expect(
      this.page.getByRole('group', { name: /Avviker innbetalt/ })
    ).toBeHidden();
    console.log('✅ Uten-grunnlag-flyt: info-alert vises og avvik-radioen er skjult');
  }

  /**
   * Verifiser SumArsavregning-tabellen (sumArsavregningTabell.tsx).
   *
   * Beløpene er norskformaterte («201,96»); negativ differanse bruker
   * U+2212 MINUS SIGN (−), ikke bindestrek. Differanse-cellen har &nbsp;
   * mellom beløp og «kr», så vi matcher kun beløpet der.
   * Radene matches case-sensitivt slik at «Innbetalt trygdeavgift» ikke
   * også treffer raden «Tidligere innbetalt trygdeavgift».
   */
  async verifiserSumTabell(forventet: {
    endeligBeregnet: string;
    innbetalt: string;
    differanse: string;
  }): Promise<void> {
    const tabell = this.page.locator('.sumArsavregningTabell').first();
    await expect(tabell).toBeVisible({ timeout: 15000 });

    await expect(
      tabell.getByRole('row').filter({ hasText: /Endelig beregnet trygdeavgift/ })
    ).toContainText(`${forventet.endeligBeregnet} kr`);
    await expect(
      tabell.getByRole('row').filter({ hasText: /Innbetalt trygdeavgift/ })
    ).toContainText(`${forventet.innbetalt} kr`);
    await expect(
      tabell.getByRole('row').filter({ hasText: /Differanse/ })
    ).toContainText(forventet.differanse);

    console.log(
      `✅ Sum-tabell: endelig ${forventet.endeligBeregnet} / innbetalt ${forventet.innbetalt} / differanse ${forventet.differanse}`
    );
  }
}
