import { expect, test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { withDatabase } from '../../helpers/db-helper';
import { setupPensjonistUtenGrunnlagMedAutoAarsavregning } from './pensjonist-aarsavregning-setup';

/**
 * EU/EØS Trygdeavgift - Pensjonist årsavregning UTEN tidligere grunnlag
 * (MELOSYS-7954/7271, gap: eos-pensjonist-uten-grunnlag-aarsavregning)
 *
 * Når førstegangsbehandlingens periode i sin helhet ligger i et tidligere år
 * og default-togglene står (ikke-tidligere-perioder PÅ), lagres det IKKE noe
 * trygdeavgiftsgrunnlag — og årsavregningen auto-opprettes ved «Bekreft og
 * send» (prosess OPPRETT_NY_BEHANDLING_AARSAVREGNING). Årsavregningen åpner da
 * i «uten grunnlag»-flyten (toggle `melosys.arsavregning.eos_pensjonist`, PÅ
 * by default): «Avviker innbetalt»-radioen er skjult, «Innbetalt trygdeavgift»
 * er et påkrevd felt, og saksbehandler velger mellom:
 *  - «Beregn endelig trygdeavgift» (OPPLYSNINGER_ENDRET, forhåndsvalgt)
 *  - «Oppgi endelig beregnet trygdeavgift» (MANUELL_ENDELIG_AVGIFT)
 *
 * Testverdiene er bevisst valgt slik at |differansen| < minstegrensen (100 kr)
 * → ingen fakturering/refusjon-sideeffekter, og UI-teksten om minstegrensen
 * kan asserteres deterministisk.
 *
 * NB: ingen UnleashHelper-kall her — hele poenget er DEFAULT toggle-state
 * (i motsetning til de to eksisterende pensjonist-årsavregningstestene).
 */

const TESTDATA = {
  år: '2024',
  innbetalt: '4800',
  bruttoinntekt: '23313',
  inntektskilde: 'PENSJON',
  manueltBeløp: '4750',
} as const;

// Differanse-beløpene bruker U+2212 MINUS SIGN (−) slik UI-et formaterer dem.
const DIFFERANSE_BEREGN = '−48,00';
const DIFFERANSE_OPPGI = '−50,00';

/**
 * Felles DB-fasit for begge variantene: behandling/resultat/prosesser +
 * AARSAVREGNING-raden (kolonneverdier verifisert live i discovery 2026-06-11).
 */
async function verifiserAarsavregningIDatabase(
  behandlingId: string,
  forventet: {
    endeligAvgiftValg: 'OPPLYSNINGER_ENDRET' | 'MANUELL_ENDELIG_AVGIFT';
    beregnetAvgiftBelop: number | null;
    manueltAvgiftBeloep: number | null;
    tilFaktureringBeloep: number;
  }
): Promise<void> {
  await withDatabase(async (db) => {
    const behandling = await db.queryOne<{ STATUS: string; BEH_TYPE: string }>(
      'SELECT STATUS, BEH_TYPE FROM BEHANDLING WHERE ID = :id',
      { id: behandlingId }
    );
    expect(behandling, 'Forventet årsavregningsbehandling i DB').not.toBeNull();
    expect(behandling!.BEH_TYPE, 'Behandlingen skal være ÅRSAVREGNING').toBe('ÅRSAVREGNING');
    expect(behandling!.STATUS, 'Behandlingen skal være AVSLUTTET').toBe('AVSLUTTET');
    console.log('✅ Behandling: ÅRSAVREGNING / AVSLUTTET');

    const resultat = await db.queryOne<{ RESULTAT_TYPE: string }>(
      'SELECT RESULTAT_TYPE FROM BEHANDLINGSRESULTAT WHERE BEHANDLING_ID = :id',
      { id: behandlingId }
    );
    expect(resultat, 'Forventet behandlingsresultat i DB').not.toBeNull();
    expect(resultat!.RESULTAT_TYPE, 'Resultat skal være FASTSATT_TRYGDEAVGIFT').toBe(
      'FASTSATT_TRYGDEAVGIFT'
    );
    console.log('✅ Behandlingsresultat: FASTSATT_TRYGDEAVGIFT');

    const aarsavregning = await db.queryOne<{
      AAR: number;
      BEREGNET_AVGIFT_BELOP: number | null;
      MANUELT_AVGIFT_BELOEP: number | null;
      TIL_FAKTURERING_BELOEP: number;
      ENDELIG_AVGIFT_VALG: string;
      HAR_INNBETALT_TRYGDEAVGIFT: number;
      INNBETALT_TRYGDEAVGIFT: number;
    }>(
      // BEHANDLINGSRESULTAT har behandling_id som PK (pk_resultat), så
      // AARSAVREGNING.BEHANDLINGSRESULTAT_ID er behandlingens ID direkte.
      `SELECT AAR,
              BEREGNET_AVGIFT_BELOP,
              MANUELT_AVGIFT_BELOEP,
              TIL_FAKTURERING_BELOEP,
              ENDELIG_AVGIFT_VALG,
              HAR_INNBETALT_TRYGDEAVGIFT,
              INNBETALT_TRYGDEAVGIFT
         FROM AARSAVREGNING
        WHERE BEHANDLINGSRESULTAT_ID = :id`,
      { id: behandlingId }
    );
    expect(aarsavregning, 'Forventet AARSAVREGNING-rad i DB').not.toBeNull();
    expect(Number(aarsavregning!.AAR), 'Årsavregningen skal gjelde 2024').toBe(2024);
    expect(
      aarsavregning!.ENDELIG_AVGIFT_VALG,
      `Endelig avgift-valg skal være ${forventet.endeligAvgiftValg}`
    ).toBe(forventet.endeligAvgiftValg);
    expect(
      Number(aarsavregning!.HAR_INNBETALT_TRYGDEAVGIFT),
      'HAR_INNBETALT_TRYGDEAVGIFT skal være satt (auto-true i uten-grunnlag-flyten)'
    ).toBe(1);
    expect(
      Number(aarsavregning!.INNBETALT_TRYGDEAVGIFT),
      'Innbetalt trygdeavgift skal være 4800'
    ).toBe(4800);

    if (forventet.beregnetAvgiftBelop === null) {
      expect(
        aarsavregning!.BEREGNET_AVGIFT_BELOP,
        'BEREGNET_AVGIFT_BELOP skal være null (manuelt oppgitt avgift)'
      ).toBeNull();
    } else {
      expect(
        Number(aarsavregning!.BEREGNET_AVGIFT_BELOP),
        `BEREGNET_AVGIFT_BELOP skal være ${forventet.beregnetAvgiftBelop}`
      ).toBeCloseTo(forventet.beregnetAvgiftBelop, 2);
    }
    if (forventet.manueltAvgiftBeloep === null) {
      expect(
        aarsavregning!.MANUELT_AVGIFT_BELOEP,
        'MANUELT_AVGIFT_BELOEP skal være null (beregnet avgift)'
      ).toBeNull();
    } else {
      expect(
        Number(aarsavregning!.MANUELT_AVGIFT_BELOEP),
        `MANUELT_AVGIFT_BELOEP skal være ${forventet.manueltAvgiftBeloep}`
      ).toBeCloseTo(forventet.manueltAvgiftBeloep, 2);
    }
    expect(
      Number(aarsavregning!.TIL_FAKTURERING_BELOEP),
      `TIL_FAKTURERING_BELOEP skal være ${forventet.tilFaktureringBeloep}`
    ).toBeCloseTo(forventet.tilFaktureringBeloep, 2);
    console.log(
      `✅ AARSAVREGNING-rad: ${aarsavregning!.ENDELIG_AVGIFT_VALG}, til fakturering ${aarsavregning!.TIL_FAKTURERING_BELOEP}`
    );

    const prosesser = await db.query<{ PROSESS_TYPE: string; STATUS: string }>(
      'SELECT PROSESS_TYPE, STATUS FROM PROSESSINSTANS WHERE BEHANDLING_ID = :id',
      { id: behandlingId }
    );
    expect(prosesser.length, 'Forventet prosessinstanser for årsavregningen').toBeGreaterThan(0);
    for (const p of prosesser) {
      expect(p.STATUS, `Prosess ${p.PROSESS_TYPE} skal være FERDIG`).toBe('FERDIG');
    }
    for (const type of [
      'OPPRETT_NY_BEHANDLING_AARSAVREGNING',
      'IVERKSETT_VEDTAK_AARSAVREGNING',
      'OPPRETT_OG_DISTRIBUER_BREV',
    ]) {
      expect(
        prosesser.some(p => p.PROSESS_TYPE === type),
        `Forventet prosessinstans ${type} på årsavregningsbehandlingen`
      ).toBe(true);
    }
    console.log(`✅ ${prosesser.length} prosessinstanser FERDIG på årsavregningen`);

    const feilede = await db.query<{ PROSESS_TYPE: string }>(
      "SELECT PROSESS_TYPE FROM PROSESSINSTANS WHERE STATUS = 'FEILET'",
      {}
    );
    expect(
      feilede.map(p => p.PROSESS_TYPE),
      'Ingen prosessinstanser skal være FEILET'
    ).toEqual([]);
  });
}

test.describe('EU/EØS Trygdeavgift - Pensjonist årsavregning uten grunnlag', () => {
  test('skal beregne endelig trygdeavgift i uten-grunnlag-flyten (OPPLYSNINGER_ENDRET)', async ({ page }) => {
    test.setTimeout(240000);

    const auth = new AuthHelper(page);
    await auth.login();

    const { aarsavregning, vedtak, behandlingId } =
      await setupPensjonistUtenGrunnlagMedAutoAarsavregning(page);

    await aarsavregning.ventPåSideLastet();
    // Auto-opprettet årsavregning kjenner året fra førstegangen — IKKE velg år.
    await aarsavregning.assertions.verifiserValgtÅr(TESTDATA.år);
    await aarsavregning.assertions.verifiserUtenGrunnlagFlyt();

    // svarNei er adaptiv: i uten-grunnlag-flyten er avvik-radioen skjult, så
    // kallet fungerer som synkronisering på at skjemaet er ferdig rendret.
    await aarsavregning.svarNei();
    await aarsavregning.fyllInnInnbetaltTrygdeavgift(TESTDATA.innbetalt);

    // «Beregn endelig trygdeavgift» (OPPLYSNINGER_ENDRET) er forhåndsvalgt.
    // Helseutgift-perioden (01.04–05.04.2024, Belgia) er låst/forhåndsutfylt.
    await aarsavregning.velgSkattepliktig(false);
    await aarsavregning.velgInntektskilde(TESTDATA.inntektskilde);
    await aarsavregning.fyllInnBruttoinntektMedApiVent(TESTDATA.bruttoinntekt);

    await aarsavregning.assertions.verifiserSumTabell({
      endeligBeregnet: '4 752,00',
      innbetalt: '4 800,00',
      differanse: DIFFERANSE_BEREGN,
    });

    await aarsavregning.klikkBekreftPåResultatside();
    await vedtak.assertions.verifiserFattVedtakKnapp();

    // |differanse| < 100 kr → ingen fakturering/refusjon, kun minstegrense-info.
    await expect(
      page.getByText('Beløpet er under minstegrensen for fakturering/refusjon (100 kr).')
    ).toBeVisible();

    await vedtak.klikkFattVedtak();

    console.log('📝 Venter på iverksetting av årsavregningsvedtaket...');
    await waitForProcessInstances(page.request, 60);

    await verifiserAarsavregningIDatabase(behandlingId, {
      endeligAvgiftValg: 'OPPLYSNINGER_ENDRET',
      beregnetAvgiftBelop: 4752,
      manueltAvgiftBeloep: null,
      tilFaktureringBeloep: -48,
    });

    console.log('✅ Uten-grunnlag-årsavregning (Beregn) fullført og verifisert i DB');
  });

  test('skal oppgi endelig trygdeavgift manuelt med obligatorisk begrunnelse (MANUELL_ENDELIG_AVGIFT)', async ({ page }) => {
    test.setTimeout(240000);

    const auth = new AuthHelper(page);
    await auth.login();

    const { aarsavregning, vedtak, behandlingId } =
      await setupPensjonistUtenGrunnlagMedAutoAarsavregning(page);

    await aarsavregning.ventPåSideLastet();
    await aarsavregning.assertions.verifiserValgtÅr(TESTDATA.år);
    await aarsavregning.assertions.verifiserUtenGrunnlagFlyt();

    await aarsavregning.svarNei();
    await aarsavregning.fyllInnInnbetaltTrygdeavgift(TESTDATA.innbetalt);

    // Bytt til manuell endelig avgift: perioder/skatt/inntekt-seksjonene
    // forsvinner og kun «Endelig beregnet trygdeavgift»-feltet gjenstår.
    await aarsavregning.velgOppgiEndeligTrygdeavgift();
    await aarsavregning.fyllInnEndeligBeregnetTrygdeavgift(TESTDATA.manueltBeløp);

    await aarsavregning.assertions.verifiserSumTabell({
      endeligBeregnet: '4 750,00',
      innbetalt: '4 800,00',
      differanse: DIFFERANSE_OPPGI,
    });

    await aarsavregning.klikkBekreftPåResultatside();
    await vedtak.assertions.verifiserFattVedtakKnapp();

    // MANUELL_ENDELIG_AVGIFT krever begrunnelse: uten fritekst er «Fatt vedtak»
    // en no-op (submit stoppes av validering). Verifiser at kravet vises...
    await expect(
      page.getByText('Følgende punkter må begrunnes i fritekstfeltet')
    ).toBeVisible();
    await expect(
      page.getByText('hvorfor du har lagt inn «Endelig beregnet trygdeavgift» manuelt')
    ).toBeVisible();
    await expect(
      page.getByText('Beløpet er under minstegrensen for fakturering/refusjon (100 kr).')
    ).toBeVisible();

    // ...fyll innledning + obligatorisk begrunnelse, og fatt vedtak.
    // klikkFattVedtak venter på POST /api/saksflyt/vedtak/{id}/fatt — uten den
    // ville en stille no-op (manglende begrunnelse) passert grønt.
    await vedtak.fyllInnFritekst('E2E: årsavregning uten grunnlag, manuelt endelig avgiftsbeløp.');
    await vedtak.fyllInnBegrunnelse(
      'E2E: Endelig trygdeavgift er lagt inn manuelt (4750 kr) for å verifisere MANUELL_ENDELIG_AVGIFT-flyten.'
    );
    await vedtak.klikkFattVedtak();

    console.log('📝 Venter på iverksetting av årsavregningsvedtaket...');
    await waitForProcessInstances(page.request, 60);

    await verifiserAarsavregningIDatabase(behandlingId, {
      endeligAvgiftValg: 'MANUELL_ENDELIG_AVGIFT',
      beregnetAvgiftBelop: null,
      manueltAvgiftBeloep: 4750,
      tilFaktureringBeloep: -50,
    });

    console.log('✅ Uten-grunnlag-årsavregning (Oppgi) fullført og verifisert i DB');
  });
});
