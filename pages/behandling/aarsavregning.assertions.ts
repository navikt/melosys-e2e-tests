import { Page, expect } from '@playwright/test';
import { assertErrors } from '../../utils/assertions';
import { withDatabase } from '../../helpers/db-helper';

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

/**
 * Forventninger til en auto-opprettet årsavregnings-behandlings DB-sluttilstand.
 *
 * Kjernen som ALLTID asserteres (og som biter) er at det finnes en
 * ÅRSAVREGNING-behandling som er AVSLUTTET, har et behandlingsresultat, en
 * AARSAVREGNING-rad, og at alle dens prosessinstanser er FERDIG. Alt annet er
 * valgfri innstramming.
 */
export interface AarsavregningBehandlingForventning {
  /** Forventet BEHANDLING.BEH_TYPE. Default 'ÅRSAVREGNING'. */
  behType?: string;
  /**
   * Forventet BEHANDLING.STATUS. Default 'AVSLUTTET' (for en iverksatt
   * årsavregning). For en AUTO-opprettet, men ennå ikke saksbehandlet
   * årsavregning (FTRL-pensjonist-flyten) er den 'UNDER_BEHANDLING'.
   */
  forventetStatus?: string;
  /**
   * Assert BEHANDLINGSRESULTAT.RESULTAT_TYPE = denne (f.eks. FASTSATT_TRYGDEAVGIFT,
   * eller IKKE_FASTSATT for en auto-opprettet men ikke iverksatt årsavregning).
   * Utelates → kun at et behandlingsresultat finnes.
   */
  forventetResultatType?: string;
  /** Assert AARSAVREGNING.AAR = dette året (f.eks. 2024). Utelates → AAR ikke sjekket. */
  forventetAar?: number;
  /**
   * Prosess_typer som MÅ finnes (og være FERDIG) på årsavregningen.
   * Default: ingen krav om spesifikke typer (kun at alle som finnes er FERDIG).
   */
  forventedeProsesser?: string[];
}

/**
 * Hard DB-sluttilstands-verifisering for en auto-opprettet årsavregning.
 *
 * Beviser at årsavregningen ikke bare dukket opp som en UI-lenke / et job-count,
 * men faktisk ble iverksatt: behandlingen er ÅRSAVREGNING + AVSLUTTET, har et
 * behandlingsresultat, det finnes en AARSAVREGNING-rad, og alle prosessinstanser
 * er FERDIG (ingen feilede/hengende). Modellert på den sterke lokale helperen i
 * eos-pensjonist-aarsavregning-uten-grunnlag.spec.ts og på
 * pages/shared/behandling-sluttilstand.assertions.ts.
 *
 * Forutsetter at prosessinstansene er ferdige; kall `waitForProcessInstances(...)`
 * (som kaster på feilede instanser) FØR denne i testen.
 *
 * Kolonnenavn er live-verifisert (jf. discovery 2026-06-11):
 *  - BEHANDLING(ID, STATUS, BEH_TYPE)
 *  - BEHANDLINGSRESULTAT(RESULTAT_TYPE, BEHANDLING_ID)
 *  - AARSAVREGNING(AAR, BEHANDLINGSRESULTAT_ID)
 *  - PROSESSINSTANS(PROSESS_TYPE, STATUS, BEHANDLING_ID)
 *
 * @param behandlingId BEHANDLING.ID for årsavregningen (typisk lest ut av
 *   `behandlingID`-URL-paramet etter at årsavregnings-lenken er åpnet).
 * @returns BEHANDLING.ID som string
 */
export async function verifiserAarsavregningBehandling(
  behandlingId: string,
  forventet: AarsavregningBehandlingForventning = {}
): Promise<string> {
  const behType = forventet.behType ?? 'ÅRSAVREGNING';
  const forventetStatus = forventet.forventetStatus ?? 'AVSLUTTET';

  return await withDatabase(async (db) => {
    const behandling = await db.queryOne<{ ID: number; STATUS: string; BEH_TYPE: string }>(
      'SELECT ID, STATUS, BEH_TYPE FROM BEHANDLING WHERE ID = :id',
      { id: behandlingId }
    );
    expect(behandling, 'Forventet årsavregningsbehandling i DB').not.toBeNull();
    expect(behandling!.BEH_TYPE, `Behandlingen skal være ${behType}`).toBe(behType);
    expect(behandling!.STATUS, `Behandlingen skal være ${forventetStatus}`).toBe(forventetStatus);
    const id = behandling!.ID;
    console.log(`✅ Årsavregningsbehandling ${id}: ${behType} / ${forventetStatus}`);

    const resultat = await db.queryOne<{ RESULTAT_TYPE: string }>(
      'SELECT RESULTAT_TYPE FROM BEHANDLINGSRESULTAT WHERE BEHANDLING_ID = :id',
      { id }
    );
    expect(resultat, 'Forventet behandlingsresultat i DB').not.toBeNull();
    if (forventet.forventetResultatType) {
      expect(
        resultat!.RESULTAT_TYPE,
        `Resultat skal være ${forventet.forventetResultatType}`
      ).toBe(forventet.forventetResultatType);
    }
    console.log(`✅ Behandlingsresultat: ${resultat!.RESULTAT_TYPE}`);

    // BEHANDLINGSRESULTAT har behandling_id som PK (pk_resultat), så
    // AARSAVREGNING.BEHANDLINGSRESULTAT_ID er behandlingens ID direkte.
    const aarsavregning = await db.queryOne<{ AAR: number }>(
      'SELECT AAR FROM AARSAVREGNING WHERE BEHANDLINGSRESULTAT_ID = :id',
      { id }
    );
    expect(aarsavregning, 'Forventet AARSAVREGNING-rad i DB').not.toBeNull();
    if (forventet.forventetAar !== undefined) {
      expect(
        Number(aarsavregning!.AAR),
        `Årsavregningen skal gjelde ${forventet.forventetAar}`
      ).toBe(forventet.forventetAar);
    }
    console.log(`✅ AARSAVREGNING-rad funnet (år ${aarsavregning!.AAR})`);

    const prosesser = await db.query<{ PROSESS_TYPE: string; STATUS: string }>(
      'SELECT PROSESS_TYPE, STATUS FROM PROSESSINSTANS WHERE BEHANDLING_ID = :id',
      { id }
    );
    expect(
      prosesser.length,
      'Forventet minst én prosessinstans for årsavregningen'
    ).toBeGreaterThan(0);
    for (const p of prosesser) {
      expect(p.STATUS, `Prosess ${p.PROSESS_TYPE} skal være FERDIG`).toBe('FERDIG');
    }
    for (const type of forventet.forventedeProsesser ?? []) {
      expect(
        prosesser.some((p) => p.PROSESS_TYPE === type),
        `Forventet prosessinstans ${type} på årsavregningsbehandlingen`
      ).toBe(true);
    }
    console.log(`✅ ${prosesser.length} prosessinstanser FERDIG på årsavregningen`);

    return String(id);
  });
}
