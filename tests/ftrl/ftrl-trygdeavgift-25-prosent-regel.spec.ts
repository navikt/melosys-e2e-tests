import { Page } from '@playwright/test';
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
import { TestPeriods } from '../../helpers/date-helper';
import { UnleashHelper } from '../../helpers/unleash-helper';

/**
 * FTRL Trygdeavgift — 25%-regelen og minstebeløp
 *
 * Spec: specs/ftrl-trygdeavgift-25-prosent-regel.md
 *
 * Tester scenarioer for trygdeavgiftsberegning med 25%-regelen:
 * 1. 25%-regelen begrenser avgiften (8000 kr/md → sats viser *)
 * 2. Ordinær beregning uten begrensning (80000 kr/md → sats er numerisk)
 * 3. 25%-regelen med Full dekning (pliktig medlem, § 2-1)
 *
 * NB: MINSTEBELOEP beregningstype er definert men settes aldri i
 * melosys-trygdeavgift-beregning (se docs/MINSTEBELOEP-beregningstype-mangler.md).
 * Scenario for minstebeløp (**) legges til når backend returnerer MINSTEBELOEP.
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

  /** Frivillig medlem: Helse+Pensjon-dekning med § 2-8 a */
  async function opprettSakFrivilligHelsePensjon(page: Page, request: any): Promise<TrygdeavgiftPage> {
    await fellesOppsett(page, request);

    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const resultatPeriode = new ResultatPeriodePage(page);

    const period = TestPeriods.currentYearPeriod;
    await medlemskap.velgPeriode(period.start, period.end);
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

  /** Pliktig medlem: Full dekning med § 2-1 (midlertidig arbeid) */
  async function opprettSakPliktigFullDekning(page: Page, request: any): Promise<TrygdeavgiftPage> {
    await fellesOppsett(page, request);

    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const resultatPeriode = new ResultatPeriodePage(page);

    const period = TestPeriods.currentYearPeriod;
    await medlemskap.velgPeriode(period.start, period.end);
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

  test('25%-regelen begrenser avgiften (8000 kr/md)', async ({ page, request }) => {
    test.setTimeout(120000);
    const trygdeavgift = await opprettSakFrivilligHelsePensjon(page, request);

    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
    await trygdeavgift.velgBetalesAga(false);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('8000');

    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();
    await trygdeavgift.assertions.verifiserSatsKolonne(0, '*');
    await trygdeavgift.assertions.verifiserForklaringstekst(
      'Beregnet etter 25 %-regelen'
    );

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

  test('25%-regelen med Full dekning — pliktig medlem (8000 kr/md)', async ({ page, request }) => {
    test.setTimeout(120000);
    const trygdeavgift = await opprettSakPliktigFullDekning(page, request);

    await page.waitForLoadState('networkidle');
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('8000');

    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();
    await trygdeavgift.assertions.verifiserSatsKolonne(0, '*');
    await trygdeavgift.assertions.verifiserForklaringstekst(
      'Beregnet etter 25 %-regelen'
    );

    await trygdeavgift.klikkBekreftOgFortsett();
    const vedtak = new VedtakPage(page);
    await vedtak.klikkFattVedtak();
  });
});
