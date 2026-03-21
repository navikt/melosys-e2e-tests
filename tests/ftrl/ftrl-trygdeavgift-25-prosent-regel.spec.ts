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
 * 1. 25%-regelen begrenser avgiften (8000 kr/md → sats viser **)
 * 2. Ordinær beregning uten begrensning (80000 kr/md → sats er numerisk)
 *
 * NB: MINSTEBELOEP beregningstype er definert men brukes ikke ennå i
 * melosys-trygdeavgift-beregning. Scenario for minstebeløp (*) legges til
 * når backend implementerer dette.
 *
 * Oppsett:
 * - Dekning: FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON (§ 2-8 a krever dette)
 * - Periode: Inneværende år (tidl. år gir bare årsavregning-melding)
 * - Toggle: melosys.trygdeavgift.25-prosentregel (FakeUnleash.enableAll)
 */
test.describe('FTRL Trygdeavgift — 25%-regelen', () => {

  async function opprettSakOgNavigerTilTrygdeavgift(page: Page, request: any): Promise<TrygdeavgiftPage> {
    const unleash = new UnleashHelper(request);
    await unleash.enableFeature('melosys.trygdeavgift.25-prosentregel');

    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const resultatPeriode = new ResultatPeriodePage(page);

    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

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

  test('25%-regelen begrenser avgiften (8000 kr/md)', async ({ page, request }) => {
    test.setTimeout(120000);
    const trygdeavgift = await opprettSakOgNavigerTilTrygdeavgift(page, request);

    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
    await trygdeavgift.velgBetalesAga(false);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('8000');

    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();
    await trygdeavgift.assertions.verifiserSatsKolonne(0, '**');
    await trygdeavgift.assertions.verifiserForklaringstekst(
      'Trygdeavgiften kan maks utgjøre 25 % av inntekten som overstiger minstebeløpet'
    );

    await trygdeavgift.klikkBekreftOgFortsett();
    const vedtak = new VedtakPage(page);
    await vedtak.klikkFattVedtak();
  });

  test('ordinær beregning uten begrensning (80000 kr/md)', async ({ page, request }) => {
    test.setTimeout(120000);
    const trygdeavgift = await opprettSakOgNavigerTilTrygdeavgift(page, request);

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
});
