import { Page, expect } from '@playwright/test';
import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../../pages/behandling/medlemskap.page';
import { ArbeidsforholdPage } from '../../pages/behandling/arbeidsforhold.page';
import { LovvalgPage } from '../../pages/behandling/lovvalg.page';
import { ResultatPeriodePage } from '../../pages/behandling/resultat-periode.page';
import { TrygdeavgiftPage } from '../../pages/trygdeavgift/trygdeavgift.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import { USER_ID_VALID } from '../../pages/shared/constants';

import { UnleashHelper } from '../../helpers/unleash-helper';

/**
 * FTRL Trygdeavgift — 25%-regelen og minstebeløp
 *
 * Spec: specs/ftrl-trygdeavgift-25-prosent-regel.md
 *
 * Tester scenarioer for trygdeavgiftsberegning med 25%-regelen:
 * 1. 25%-regelen begrenser avgiften (10000 kr/md → sats viser *, dekning helsedel/pensjonsdel)
 * 2. Ordinær beregning uten begrensning (80000 kr/md → sats er numerisk)
 * 3. 25%-regelen med Full dekning (pliktig medlem, § 2-1)
 * 4. Inntekt under minstebeløpet (4000 kr/md → sats viser **, avgift 0 nkr)
 * 5. Confluence Eksempel 1 (flere skatteforhold/inntekter, ***, helsedel/pensjonsdel)
 *
 * Oppsett scenario 1-2:
 * - Dekning: FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON (§ 2-8 a, frivillig)
 * - Periode: Inneværende år (tidl. år gir bare årsavregning-melding)
 * - Toggle: melosys.trygdeavgift.25-prosentregel
 *
 * Oppsett scenario 3:
 * - Dekning: FULL_DEKNING_FTRL (§ 2-1, pliktig)
 * - Tester pliktig-stien i BeregningService (fastsettAvgiftPliktigMed25prosentregel)
 */
test.describe('FTRL Trygdeavgift — 25%-regelen', () => {

  /** Felles oppsett: login, unleash, opprett sak, naviger til behandling */
  async function fellesOppsett(page: Page, request: any) {
    const unleash = new UnleashHelper(request);
    await unleash.enableFeature('melosys.trygdeavgift.25-prosentregel');

    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);

    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    return { opprettSak };
  }

  /** Frivillig medlem: Helse+Pensjon-dekning med § 2-8 a
   *  Bruker full årsperiode (01.01-31.12) for stabile beregninger.
   *  NB: currentYearPeriod varierer i lengde (6 mnd fremover), som
   *  påvirker om inntekt havner over/under minstebeløpet.
   */
  async function opprettSakFrivilligHelsePensjon(page: Page, request: any): Promise<TrygdeavgiftPage> {
    await fellesOppsett(page, request);

    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const resultatPeriode = new ResultatPeriodePage(page);

    const year = new Date().getFullYear();
    await medlemskap.velgPeriode(`01.01.${year}`, `31.12.${year}`);
    await medlemskap.velgFlereLandIkkeKjentHvilke();
    await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
    await medlemskap.klikkBekreftOgFortsett();

    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
    await lovvalg.klikkBekreftOgFortsett();

    await page.waitForTimeout(3000);
    await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

    const trygdeavgift = new TrygdeavgiftPage(page);
    await trygdeavgift.ventPåSideLastet();
    return trygdeavgift;
  }

  /** Pliktig medlem: Full dekning med § 2-1 (midlertidig arbeid)
   *  Bruker full årsperiode for stabile beregninger (som frivillig).
   */
  async function opprettSakPliktigFullDekning(page: Page, request: any): Promise<TrygdeavgiftPage> {
    await fellesOppsett(page, request);

    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const resultatPeriode = new ResultatPeriodePage(page);

    const year = new Date().getFullYear();
    await medlemskap.velgPeriode(`01.01.${year}`, `31.12.${year}`);
    await medlemskap.velgFlereLandIkkeKjentHvilke();
    await medlemskap.velgTrygdedekning('FULL_DEKNING_FTRL');
    await medlemskap.klikkBekreftOgFortsett();

    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    // § 2-1 Lovvalg: bestemmelse + situasjon + spørsmål
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_1');
    await lovvalg.velgBrukersSituasjon('MIDLERTIDIG_ARBEID_2_1_FJERDE_LEDD');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmål([
      'Er søkers arbeidsoppdrag i',
      'Plikter arbeidsgiver å betale',
      'Har søker lovlig opphold i'
    ]);
    await lovvalg.klikkBekreftOgFortsett();

    // Full dekning har én periode (ingen helse/pensjon-split)
    await page.waitForTimeout(3000);
    await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

    const trygdeavgift = new TrygdeavgiftPage(page);
    await trygdeavgift.ventPåSideLastet();
    return trygdeavgift;
  }

  test('25%-regelen begrenser avgiften (10000 kr/md)', async ({ page, request }) => {
    test.setTimeout(120000);
    const trygdeavgift = await opprettSakFrivilligHelsePensjon(page, request);

    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
    await trygdeavgift.velgBetalesAga(false);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('10000');

    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();
    await trygdeavgift.assertions.verifiserSatsKolonne(0, '*');
    await trygdeavgift.assertions.verifiserForklaringstekst(
      'Beregnet etter 25 %-regelen'
    );

    // Frivillig helse+pensjon: dekning splittes i helsedel og pensjonsdel
    await trygdeavgift.assertions.verifiserDekningKolonne(0, /Helsedel/);
    await trygdeavgift.assertions.verifiserDekningKolonne(1, /Pensjonsdel/);

    await trygdeavgift.klikkBekreftOgFortsett();
    const vedtak = new VedtakPage(page);
    await vedtak.klikkFattVedtak();
  });

  test('ordinær beregning uten begrensning (80000 kr/md)', async ({ page, request }) => {
    test.setTimeout(120000);
    const trygdeavgift = await opprettSakFrivilligHelsePensjon(page, request);

    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
    await trygdeavgift.velgBetalesAga(false);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('80000');

    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();
    await trygdeavgift.assertions.verifiserSatsKolonne(0, /^\d/);
    await trygdeavgift.assertions.verifiserIngenForklaringstekster();

    await trygdeavgift.klikkBekreftOgFortsett();
    const vedtak = new VedtakPage(page);
    await vedtak.klikkFattVedtak();
  });

  test('25%-regelen med Full dekning — pliktig medlem (10000 kr/md)', async ({ page, request }) => {
    test.setTimeout(120000);
    const trygdeavgift = await opprettSakPliktigFullDekning(page, request);

    await page.waitForLoadState('networkidle');
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('10000');

    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();
    await trygdeavgift.assertions.verifiserSatsKolonne(0, '*');
    await trygdeavgift.assertions.verifiserForklaringstekst(
      'Beregnet etter 25 %-regelen'
    );

    await trygdeavgift.klikkBekreftOgFortsett();
    const vedtak = new VedtakPage(page);
    await vedtak.klikkFattVedtak();
  });

  test('inntekt under minstebeløpet — avgift 0 kr (4000 kr/md)', async ({ page, request }) => {
    test.setTimeout(120000);
    const trygdeavgift = await opprettSakFrivilligHelsePensjon(page, request);

    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
    await trygdeavgift.velgBetalesAga(false);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('4000');

    // Under minstebeløpet: ingen tabell vises, kun infomelding.
    await expect(
      page.getByRole('heading', { name: 'Foreløpig beregnet trygdeavgift' })
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText('Trygdeavgift skal ikke betales da inntekten er under minstebeløpet.')
    ).toBeVisible();

    await trygdeavgift.klikkBekreftOgFortsett();
    const vedtak = new VedtakPage(page);
    await vedtak.klikkFattVedtak();
  });

  /**
   * Confluence Eksempel 1 — alle perioder beregnes etter 25%-regelen
   *
   * Gjenskaper Minas test fra q1 (Confluence: "Eksempler på fastsettelse av
   * trygdeavgift - dele opp i trygdeavgiftsperioder", Eksempel 1).
   *
   * Frivillig medlem med:
   * - Skatteforhold: skattepliktig mai-okt, ikke-skattepliktig nov-des
   * - Inntekt 1: Utenlandsk 10 000 kr/md (mai-aug)
   * - Inntekt 2: Utenlandsk 13 000 kr/md (sep-des)
   * - Inntekt 3: Næringsinntekt 3 000 kr/md (okt-des)
   *
   * Total årsinntekt: ~101 000 kr, minstebeløp 99 650 kr.
   * 25% × (101 000 − 99 650) = 337 kr → 25%-regelen begrenser alle perioder.
   */
  test('Confluence Eksempel 1 — flere skatteforhold og inntekter, 25%-regel på alle perioder', async ({ page, request }) => {
    test.setTimeout(180000);

    const year = new Date().getFullYear();
    const periodeStart = `01.05.${year}`;
    const periodeEnd = `31.12.${year}`;

    // --- Felles oppsett ---
    await fellesOppsett(page, request);

    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const resultatPeriode = new ResultatPeriodePage(page);

    // Medlemskap: 01.05 - 31.12, helse+pensjon dekning
    await medlemskap.velgPeriode(periodeStart, periodeEnd);
    await medlemskap.velgFlereLandIkkeKjentHvilke();
    await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
    await medlemskap.klikkBekreftOgFortsett();

    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
    await lovvalg.klikkBekreftOgFortsett();

    await page.waitForTimeout(3000);
    await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

    // --- Trygdeavgift ---
    const trygdeavgift = new TrygdeavgiftPage(page);
    await trygdeavgift.ventPåSideLastet();

    // Skatteforhold 1: mai-okt skattepliktig (endre tom-dato fra default)
    // Use human-like delays between operations to let React process state changes
    // and avoid race conditions with the debounced save
    const pause = () => page.waitForTimeout(800);

    await trygdeavgift.fyllInnSkatteforholdDatoer(0, periodeStart, `31.10.${year}`);
    await pause();
    await trygdeavgift.velgSkattepliktigForIndeks(0, true);
    await pause();

    // Skatteforhold 2: nov-des ikke-skattepliktig
    await trygdeavgift.leggTilSkatteforhold();
    await pause();
    await trygdeavgift.fyllInnSkatteforholdDatoer(1, `01.11.${year}`, periodeEnd);
    await pause();
    await trygdeavgift.velgSkattepliktigForIndeks(1, false);
    await pause();

    // Inntekt 1: change default dates to mai-aug
    await trygdeavgift.fyllInnInntektsperiodeDatoer(0, periodeStart, `31.08.${year}`);
    await pause();
    await trygdeavgift.velgInntektskildeForIndeks(0, 'INNTEKT_FRA_UTLANDET');
    await pause();
    await trygdeavgift.velgBetalesAgaForIndeks(0, false);
    await pause();

    // Inntekt 2: add row, set dates sep-des
    await trygdeavgift.klikkLeggTilInntekt();
    await pause();
    await trygdeavgift.fyllInnInntektsperiodeDatoer(1, `01.09.${year}`, periodeEnd);
    await pause();
    await trygdeavgift.velgInntektskildeForIndeks(1, 'INNTEKT_FRA_UTLANDET');
    await pause();
    await trygdeavgift.velgBetalesAgaForIndeks(1, false);
    await pause();

    // Inntekt 3: add row, set dates okt-des (aga auto-set for næringsinntekt)
    await trygdeavgift.klikkLeggTilInntekt();
    await pause();
    await trygdeavgift.fyllInnInntektsperiodeDatoer(2, `01.10.${year}`, periodeEnd);
    await pause();
    await trygdeavgift.velgInntektskildeForIndeks(2, 'NÆRINGSINNTEKT_FRA_NORGE');
    await pause();

    // Fill bruttoinntekt — last row triggers the definitive PUT
    await trygdeavgift.fyllInnBruttoinntektForIndeks(0, '10000');
    await pause();
    await trygdeavgift.fyllInnBruttoinntektForIndeks(1, '13000');
    await pause();
    await trygdeavgift.fyllInnBruttoinntektForIndeksMedApiVent(2, '3000');

    // Wait for any pending debounced saves to complete
    await page.waitForLoadState('networkidle');

    // --- Verifiser 25%-regelen ---
    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();

    // Alle rader skal ha '*' som sats (25%-regelen begrenser)
    const table = page.locator('table').filter({ has: page.getByText('Trygdeperiode') });
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    console.log(`Found ${rowCount} trygdeavgiftsperiode rows`);

    for (let i = 0; i < rowCount; i++) {
      await trygdeavgift.assertions.verifiserSatsKolonne(i, '*');
    }

    await trygdeavgift.assertions.verifiserForklaringstekst('Beregnet etter 25 %-regelen');

    // Flere inntektskilder slått sammen: skal vise *** med fotnote
    for (let i = 0; i < rowCount; i++) {
      await trygdeavgift.assertions.verifiserInntektskildeKolonne(i, '***');
    }
    await trygdeavgift.assertions.verifiserForklaringstekst('Mer enn en inntektskilde');

    // Frivillig helse+pensjon: dekning splittes i helsedel og pensjonsdel
    // Radene alternerer mellom helsedel og pensjonsdel
    for (let i = 0; i < rowCount; i++) {
      await trygdeavgift.assertions.verifiserDekningKolonne(i, /Helsedel|Pensjonsdel/);
    }

    // Verifiser at backend har lagret komplett data (2 skatteforhold, 3 inntekter)
    const behandlingId = new URL(page.url()).searchParams.get('behandlingID');
    const apiData: any = await page.evaluate(async (id) => {
      const resp = await fetch(`/api/behandlinger/${id}/trygdeavgift/beregning`);
      if (!resp.ok) return { error: resp.status };
      const data = await resp.json();
      return {
        skatteforhold: data.trygdeavgiftsgrunnlag?.skatteforholdsperioder?.length ?? 0,
        inntekter: data.trygdeavgiftsgrunnlag?.inntektskilder?.length ?? 0,
      };
    }, behandlingId);
    console.log(`Backend: ${apiData.skatteforhold} skatteforhold, ${apiData.inntekter} inntekter`);
    expect(apiData.skatteforhold).toBe(2);
    expect(apiData.inntekter).toBe(3);

    // Wait for any re-render debounced PUTs to complete before leaving the step.
    await page.waitForTimeout(1500);
    await page.waitForLoadState('networkidle');

    await trygdeavgift.klikkBekreftOgFortsett();
    const vedtak = new VedtakPage(page);
    await vedtak.klikkFattVedtak();
  });
});
