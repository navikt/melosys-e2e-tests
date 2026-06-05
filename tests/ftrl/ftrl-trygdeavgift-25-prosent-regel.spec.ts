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
import {
  AARSAK,
  BEHANDLINGSTEMA,
  SAKSTEMA,
  SAKSTYPER,
  USER_ID_VALID,
} from '../../pages/shared/constants';

import { UnleashHelper } from '../../helpers/unleash-helper';
import { hentMinstebeløp } from '../../helpers/trygdeavgift-beregning-helper';

const TESTÅR = 2026;

/**
 * FTRL Trygdeavgift — 25%-regelen og minstebeløp
 *
 * Spec: specs/ftrl-trygdeavgift-25-prosent-regel.md
 *
 * Tester scenarioer for trygdeavgiftsberegning med 25%-regelen:
 * 1. 25%-regelen begrenser avgiften (sats viser *, dekning helsedel/pensjonsdel)
 * 2. Ordinær beregning uten begrensning (sats er numerisk)
 * 3. 25%-regelen med Full dekning (pliktig medlem, § 2-1)
 * 4. Inntekt under minstebeløpet (sats viser **, avgift 0 nkr)
 * 5. Confluence Eksempel 1 (flere skatteforhold/inntekter, ***, helsedel/pensjonsdel)
 *
 * Minstebeløp-sensitive tester henter faktisk minstebeløp via hentMinstebeløp()
 * for å være robuste mot G-justering år for år.
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

  test('25%-regelen begrenser avgiften', async ({ page, request }) => {
    test.setTimeout(120000);
    const trygdeavgift = await opprettSakFrivilligHelsePensjon(page, request);

    // Litt over minstebeløpet, men lav nok til at 25%-regelen treffer.
    // Ratio 1.21 speiler det forholdet som fungerte med tidligere hardkodet
    // verdi (10000 kr/md ved minstebeløp ~99k/år).
    const månedligMinstebeløp = Math.floor((await hentMinstebeløp(request, TESTÅR)) / 12);
    const månedsinntekt = String(Math.floor(månedligMinstebeløp * 1.21));

    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
    await trygdeavgift.velgBetalesAga(false);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(månedsinntekt);

    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();
    await trygdeavgift.assertions.verifiserSatsKolonne(0, '*');
    await trygdeavgift.assertions.verifiserForklaringstekst(
      'Beregnet etter 25 %-regelen'
    );

    // Frivillig helse+pensjon: dekning splittes i helsedel og pensjonsdel
    await trygdeavgift.assertions.verifiserDekningKolonne(0, /Helsedel/);
    await trygdeavgift.assertions.verifiserDekningKolonne(1, /Pensjonsdel/);

    await trygdeavgift.klikkBekreftOgFortsett();

    // Verifiser at backend har lagret riktig BEREGNINGSREGEL — dette er grunnlaget
    // for at dokgen-mapperne i melosys-api PR #3333 sender riktige DTO-felter
    // (beregningsregel + minstebeløp) til brevmalen.
    await trygdeavgift.assertions.verifiserDbTrygdeavgiftsperioder([
      { beregningsregel: 'TJUEFEM_PROSENT_REGEL', trygdesatsErNull: true, avgiftsdel: 'HELSE' },
      { beregningsregel: 'TJUEFEM_PROSENT_REGEL', trygdesatsErNull: true, avgiftsdel: 'PENSJON' },
    ]);

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

    // Ordinær beregning: TRYGDESATS skal ha tallverdi, BEREGNINGSREGEL = ORDINÆR.
    // AVGIFTSDEL er null for ordinære perioder (ikke splittet på helse/pensjon
    // — den splittingen skjer kun ved 25%-regel/MINSTEBELOEP).
    await trygdeavgift.assertions.verifiserDbTrygdeavgiftsperioder([
      { beregningsregel: 'ORDINÆR', trygdesatsErNull: false, avgiftsdel: null },
      { beregningsregel: 'ORDINÆR', trygdesatsErNull: false, avgiftsdel: null },
    ]);

    const vedtak = new VedtakPage(page);
    await vedtak.klikkFattVedtak();
  });

  test('25%-regelen med Full dekning — pliktig medlem', async ({ page, request }) => {
    test.setTimeout(120000);
    const trygdeavgift = await opprettSakPliktigFullDekning(page, request);

    // Litt over minstebeløpet, men lav nok til at 25%-regelen treffer.
    // Ratio 1.21 speiler det forholdet som fungerte med tidligere hardkodet
    // verdi (10000 kr/md ved minstebeløp ~99k/år).
    const månedligMinstebeløp = Math.floor((await hentMinstebeløp(request, TESTÅR)) / 12);
    const månedsinntekt = String(Math.floor(månedligMinstebeløp * 1.21));

    await page.waitForLoadState('networkidle');
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(månedsinntekt);

    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();
    await trygdeavgift.assertions.verifiserSatsKolonne(0, '*');
    await trygdeavgift.assertions.verifiserForklaringstekst(
      'Beregnet etter 25 %-regelen'
    );

    await trygdeavgift.klikkBekreftOgFortsett();

    // Full dekning (pliktig § 2-1): kun én periode, ingen helse/pensjon-split.
    // AVGIFTSDEL er typisk null for full dekning. TRYGDESATS er null pga 25%-regel.
    await trygdeavgift.assertions.verifiserDbTrygdeavgiftsperioder([
      { beregningsregel: 'TJUEFEM_PROSENT_REGEL', trygdesatsErNull: true, avgiftsdel: null },
    ]);

    const vedtak = new VedtakPage(page);
    await vedtak.klikkFattVedtak();
  });

  test('inntekt under minstebeløpet — avgift 0 kr', async ({ page, request }) => {
    test.setTimeout(120000);
    const trygdeavgift = await opprettSakFrivilligHelsePensjon(page, request);

    // Henter faktisk minstebeløp fra melosys-trygdeavgift-beregning og legger oss
    // trygt under, slik at testen tåler G-justering år for år.
    const månedligMinstebeløp = Math.floor((await hentMinstebeløp(request, TESTÅR)) / 12);
    const månedsinntekt = String(månedligMinstebeløp - 100);

    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
    await trygdeavgift.velgBetalesAga(false);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(månedsinntekt);

    // Under minstebeløpet: ingen tabell vises, kun infomelding.
    await expect(
      page.getByRole('heading', { name: 'Foreløpig beregnet trygdeavgift' })
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText('Trygdeavgift skal ikke betales da inntekten er under minstebeløpet.')
    ).toBeVisible();

    await trygdeavgift.klikkBekreftOgFortsett();

    // Minstebeløp: én samlet periode (ikke helse/pensjon-splittet siden ingen
    // avgift skal betales). BEREGNINGSREGEL = MINSTEBELØP, TRYGDESATS = null,
    // AVGIFTSDEL = null.
    await trygdeavgift.assertions.verifiserDbTrygdeavgiftsperioder([
      { beregningsregel: 'MINSTEBELØP', trygdesatsErNull: true, avgiftsdel: null },
    ]);

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
    await trygdeavgift.assertions.verifiserForklaringstekst('Mer enn en inntekt');

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

    // Alle perioder ender på 25%-regel (per Confluence Eksempel 1). Backend slår
    // sammen til 2 perioder (HELSE + PENSJON) for frivillig helse+pensjon-dekning.
    await trygdeavgift.assertions.verifiserDbTrygdeavgiftsperioder([
      { beregningsregel: 'TJUEFEM_PROSENT_REGEL', trygdesatsErNull: true, avgiftsdel: 'HELSE' },
      { beregningsregel: 'TJUEFEM_PROSENT_REGEL', trygdesatsErNull: true, avgiftsdel: 'PENSJON' },
    ]);

    const vedtak = new VedtakPage(page);
    await vedtak.klikkFattVedtak();
  });
});

/**
 * FTRL Pensjonist — 25%-regelen
 *
 * Dekker stegvelger 2 fra MELOSYS-7989: visning av 25%-regel for FTRL Pensjonist-saker.
 * Pensjonist-flyten har 5 steg (uten Virksomhet): Inngang → Bestemmelse → Perioder
 * → Trygdeavgift → Vedtak. Pliktig medlem etter § 2-5.
 */
test.describe('FTRL Pensjonist — 25%-regelen', () => {
  test('25%-regelen for FTRL Pensjonist', async ({ page, request }) => {
    test.setTimeout(120000);

    // Pensjonist-forskuddet beregnes for perioden «i dag → 31.12», som KRYMPER
    // utover året. Backend teller hele kalendermåneder fra startmåneden t.o.m.
    // desember (= 12 − getMonth()), og avkorter IKKE minstebeløpet for delår.
    // Derfor kan vi ikke hardkode en månedsinntekt mot en 12-måneders antagelse:
    // gjør vi det, faller periodeinntekten under minstebeløpet senere på året og
    // beregningen blir MINSTEBELØP (`**`) i stedet for 25%-regel (`*`).
    // Skaler i stedet månedsinntekten mot gjenstående måneder slik at
    // periodeinntekten lander trygt inne i 25%-regel-båndet:
    //   minstebeløp (99 650) < periodeinntekt < minstebeløp / (1 − 0,25/sats)
    // Helsedel-sats for pensjon (HELSE_UTEN_SYKEPENGER, IKKE_SKATTEPLIKTIG,
    // PENSJON_UFØRETRYGD) er 9,1 % → øvre grense ≈ 156 700. Vi sikter på
    // 1,3 × minstebeløp (≈ 129 500), midt i båndet uansett kjøremåned.
    const minstebeløp = await hentMinstebeløp(request, TESTÅR);
    const restMånederIÅret = 12 - new Date().getMonth(); // forskudd: i dag → 31.12
    const månedsinntekt = String(
      Math.ceil((minstebeløp * 1.3) / restMånederIÅret),
    );

    const unleash = new UnleashHelper(request);
    await unleash.enableFeature('melosys.trygdeavgift.25-prosentregel');

    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);

    await hovedside.gotoOgOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype(SAKSTYPER.FTRL);
    await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
    await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.PENSJONIST);
    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

    // Inngang (Medlemskap) — frivillig helse+pensjon-dekning
    const medlemskap = new MedlemskapPage(page);
    await medlemskap.velgPeriode('01.01.2026', '31.12.2026');
    await medlemskap.velgFlereLandIkkeKjentHvilke();
    await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
    await medlemskap.klikkBekreftOgFortsett();

    // Bestemmelse (Lovvalg) — § 2-8 første ledd bokstav d (pensjonist)
    const lovvalg = new LovvalgPage(page);
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_D');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmålIGruppe('Mottar søker pensjon');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker minst 30 års medlemskap');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker minst 10 års medlemskap');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning');
    await lovvalg.klikkBekreftOgFortsett();

    // Perioder — default-verdier (Innvilget/Avslått/Innvilget) er gyldige for
    // pensjonist + helse/pensjon-dekning. Bare bekreft og gå videre.
    await page.waitForTimeout(3000);
    const resultatPeriode = new ResultatPeriodePage(page);
    await resultatPeriode.klikkBekreftOgFortsett();

    const trygdeavgift = new TrygdeavgiftPage(page);
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('PENSJON');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(månedsinntekt);

    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();
    await trygdeavgift.assertions.verifiserSatsKolonne(0, '*');
    await trygdeavgift.assertions.verifiserForklaringstekst(
      'Beregnet etter 25 %-regelen'
    );

    await trygdeavgift.klikkBekreftOgFortsett();

    // Frivillig pensjonist § 2-8 d med helse+pensjon-dekning: kun helsedel betales
    // (pensjonsdel utgår siden søker allerede mottar pensjon → 1 periode med HELSE).
    await trygdeavgift.assertions.verifiserDbTrygdeavgiftsperioder([
      { beregningsregel: 'TJUEFEM_PROSENT_REGEL', trygdesatsErNull: true, avgiftsdel: 'HELSE' },
    ]);

    const vedtak = new VedtakPage(page);
    await vedtak.klikkFattVedtak();
  });
});
