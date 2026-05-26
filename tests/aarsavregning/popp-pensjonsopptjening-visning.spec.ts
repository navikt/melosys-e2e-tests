import { test, expect } from '../../fixtures';
import { Page } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../../pages/behandling/medlemskap.page';
import { LovvalgPage } from '../../pages/behandling/lovvalg.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import { PensjonsopptjeningPage } from '../../pages/behandling/pensjonsopptjening.page';
import {
  USER_ID_VALID,
  SAKSTYPER,
  SAKSTEMA,
  BEHANDLINGSTEMA,
  AARSAK,
  FORRIGE_AAR,
  POPP_KILDE,
  POPP_KILDE_VISNING,
} from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { UnleashHelper } from '../../helpers/unleash-helper';
import { clearPoppSeed, seedPoppInntekt, PoppInntektSeed } from '../../helpers/mock-helper';

/**
 * Visning av eksisterende pensjonsopptjening (PGI) fra POPP under årsavregning.
 *
 * Spec (kontrakt): specs/popp-pensjonsopptjening-visning.md (MELOSYS-8073).
 *
 * **Reconcile-status (2026-05-26):**
 * - API: `GET /api/behandlinger/{behandlingId}/pensjonsopptjening` (verifisert, 401 uten token).
 * - Toggle: BÅDE `melosys.vis_pensjonsopptjening_popp` (api, underscores) OG
 *   `melosys.vis-pensjonsopptjening-popp` (web, hyphens) må enables — begge er registrert i
 *   Unleash. Begge må av default være «på» (default-fixturen tar dem, men eksplisitt = trygt).
 * - Mock: melosys-mock har nå seed-rute (`POST /popp/admin/inntekt/seed`) som overstyrer
 *   default kanonisk respons (kilde="SKD", FL_PGI_LOENN + SUM_PI for siste 5 år) per fnr.
 *   Alle scenario seeder eksplisitt for å være deterministisk uavhengig av default-mockens
 *   kilde-verdier — API-en (PensjonsopptjeningOppslag) passerer `kilde` uendret videre,
 *   og UI rendrer kun SKATT/AVGIFTSSYSTEMET/MELOSYS som «Skatt»/«Avgiftssystemet»/«Melosys»
 *   (andre verdier vises rått). Default-seeden ryddes per test i beforeEach — `clearMockData`
 *   rører ikke POPP.
 * - UI: ingen `data-testid`-er; selektorer er tekst-/role-baserte.
 * - Sidemenyen er panel-basert (ingen URL-endring).
 */

const POPP_TOGGLE_NAMES = [
  'melosys.vis_pensjonsopptjening_popp', // api (underscores)
  'melosys.vis-pensjonsopptjening-popp', // web (hyphens)
];
const ÅRSAVREGNING_LINK_REGEX = new RegExp(`${USER_ID_VALID}.*Pensjonist.*Årsavregning`);
const BRUKERNAVN = 'TRIVIELL KARAFFEL';

/**
 * Gå gjennom hele pensjonist-flyten og fatt vedtak slik at en årsavregning-
 * behandling blir auto-opprettet. Klikker deretter inn i årsavregningen.
 */
async function opprettOgÅpneAutoÅrsavregning(page: Page): Promise<void> {
  const hovedside = new HovedsidePage(page);
  const opprettSak = new OpprettNySakPage(page);
  const medlemskap = new MedlemskapPage(page);
  const lovvalg = new LovvalgPage(page);
  const vedtak = new VedtakPage(page);

  await hovedside.gotoOgOpprettNySak();
  await opprettSak.fyllInnBrukerID(USER_ID_VALID);
  await opprettSak.velgOpprettNySak();
  await opprettSak.velgSakstype(SAKSTYPER.FTRL);
  await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
  await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.PENSJONIST);
  await opprettSak.velgAarsak(AARSAK.SØKNAD);
  await opprettSak.leggBehandlingIMine();
  await opprettSak.klikkOpprettNyBehandling();
  await opprettSak.assertions.verifiserBehandlingOpprettet();

  await waitForProcessInstances(page.request, 30);
  await hovedside.goto();

  await hovedside.åpneBehandling(`${BRUKERNAVN} -`);
  await page.waitForLoadState('networkidle');

  await medlemskap.velgPeriode(`01.01.${FORRIGE_AAR}`, `31.12.${FORRIGE_AAR}`);
  await medlemskap.velgLand('Afghanistan');
  await medlemskap.velgTrygdedekning('FULL_DEKNING_FTRL');
  await medlemskap.klikkBekreftOgFortsett();

  await lovvalg.velgBestemmelse('FTRL_KAP2_2_1');
  await lovvalg.velgBrukersSituasjon('MIDLERTIDIG_2_1_FJERDE_LEDD');
  await lovvalg.svarJaPaaFørsteSpørsmål();
  await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker oppholdt seg eller');
  await lovvalg.svarJaPaaSpørsmålIGruppe('Er søkers utenlandsopphold ment');
  await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker lovlig opphold i');
  await lovvalg.klikkBekreftOgFortsett();
  await lovvalg.klikkBekreftOgFortsett();
  await lovvalg.klikkBekreftOgFortsett();

  await vedtak.klikkFattVedtak();

  await waitForProcessInstances(page.request, 60);
  await hovedside.goto();
  const aarsavregningLink = await hovedside.ventPåBehandlingslenke(ÅRSAVREGNING_LINK_REGEX);
  await expect(aarsavregningLink).toBeVisible({ timeout: 15000 });
  await aarsavregningLink.click();
  await page.waitForLoadState('networkidle');
}

test.describe('POPP — visning av pensjonsopptjening under årsavregning', () => {
  test.beforeEach(async ({ request }) => {
    const unleash = new UnleashHelper(request);
    for (const name of POPP_TOGGLE_NAMES) {
      await unleash.enableFeature(name);
    }
    // clearMockData (cleanup-fixturen) rører ikke POPP-seeden — rydd eksplisitt
    // så hver test starter med ren baseline.
    await clearPoppSeed(request, USER_ID_VALID);
  });

  test('Scenario 1 — seksjonen vises med 5 år SKATT-rader (seeded)', async ({ page, request }) => {
    test.setTimeout(180000);

    // Seed eksplisitt med SKATT for hele 5-års-vinduet. Default mock returnerer
    // kilde="SKD" som API-en passerer uendret, og UI rendrer rått (ikke «Skatt»).
    // For å verifisere visningsnavn-mappingen seeder vi SKATT direkte.
    const skattRader: PoppInntektSeed[] = [];
    for (let aar = FORRIGE_AAR - 4; aar <= FORRIGE_AAR; aar++) {
      skattRader.push({ inntektAr: aar, belop: 540_000, kilde: POPP_KILDE.SKATT });
    }
    await seedPoppInntekt(request, USER_ID_VALID, skattRader);

    const auth = new AuthHelper(page);
    await auth.login();

    await opprettOgÅpneAutoÅrsavregning(page);

    const popp = new PensjonsopptjeningPage(page);
    await popp.ventPåSeksjon();

    await popp.assertions.verifiserSeksjonVises();
    const rader = await popp.lesRader();

    await popp.assertions.verifiserAlleRaderHarKilde(rader, POPP_KILDE_VISNING.SKATT);
    await popp.assertions.verifiserNyesteÅrØverst(rader);
    await popp.assertions.verifiserAarIntervall(rader, FORRIGE_AAR - 4, FORRIGE_AAR);
  });

  test('Scenario 2 — delt grunnlag: Skatt og Avgiftssystemet samme år (seeded)', async ({ page, request }) => {
    test.setTimeout(180000);

    await seedPoppInntekt(request, USER_ID_VALID, [
      { inntektAr: FORRIGE_AAR, belop: 540_000, kilde: POPP_KILDE.SKATT },
      { inntektAr: FORRIGE_AAR, belop: 120_000, kilde: POPP_KILDE.AVGIFTSSYSTEMET },
    ]);

    const auth = new AuthHelper(page);
    await auth.login();

    await opprettOgÅpneAutoÅrsavregning(page);

    const popp = new PensjonsopptjeningPage(page);
    await popp.ventPåSeksjon();

    await popp.assertions.verifiserSeksjonVises();
    const rader = await popp.lesRader();

    await popp.assertions.verifiserAntallRaderForAar(rader, FORRIGE_AAR, 2);
    await popp.assertions.verifiserRaderInneholderKilder(rader, FORRIGE_AAR, [
      POPP_KILDE_VISNING.SKATT,
      POPP_KILDE_VISNING.AVGIFTSSYSTEMET,
    ]);
  });

  test('Scenario 3 — alle tre kilder: Skatt + Avgiftssystemet + Melosys (seeded)', async ({ page, request }) => {
    test.setTimeout(180000);

    await seedPoppInntekt(request, USER_ID_VALID, [
      { inntektAr: FORRIGE_AAR, belop: 540_000, kilde: POPP_KILDE.SKATT },
      { inntektAr: FORRIGE_AAR, belop: 120_000, kilde: POPP_KILDE.AVGIFTSSYSTEMET },
      { inntektAr: FORRIGE_AAR, belop: 80_000, kilde: POPP_KILDE.MELOSYS },
    ]);

    const auth = new AuthHelper(page);
    await auth.login();

    await opprettOgÅpneAutoÅrsavregning(page);

    const popp = new PensjonsopptjeningPage(page);
    await popp.ventPåSeksjon();

    await popp.assertions.verifiserSeksjonVises();
    const rader = await popp.lesRader();

    await popp.assertions.verifiserAntallRaderForAar(rader, FORRIGE_AAR, 3);
    await popp.assertions.verifiserRaderInneholderKilder(rader, FORRIGE_AAR, [
      POPP_KILDE_VISNING.SKATT,
      POPP_KILDE_VISNING.AVGIFTSSYSTEMET,
      POPP_KILDE_VISNING.MELOSYS,
    ]);
  });

  test('Scenario 4 — ingen pensjonsopptjening: tom-melding vises (seeded tom)', async ({ page, request }) => {
    test.setTimeout(180000);

    // Tom seed overstyrer default-data og gir 0 perioder fra API.
    await seedPoppInntekt(request, USER_ID_VALID, []);

    const auth = new AuthHelper(page);
    await auth.login();

    await opprettOgÅpneAutoÅrsavregning(page);

    const popp = new PensjonsopptjeningPage(page);
    await popp.ventPåSeksjon();

    await popp.assertions.verifiserSeksjonVises();
    await popp.assertions.verifiserTomMelding();

    const rader = await popp.lesRader();
    expect(rader).toEqual([]);
  });

  test.fixme(
    'Scenario 5 — årsavregning eldre enn 5 år: visning utvides til avregningsåret',
    async ({ page, request }) => {
      // BLOKKERT: auto-opprettelses-flyten (FTRL Pensjonist → vedtak) gir alltid
      // en årsavregning for FORRIGE_AAR. Vi har ingen produksjonsklar måte å
      // sette opp en årsavregning med inntektsÅr ≥ 6 år tilbake på i E2E-stacken
      // i dag. Når bygg leverer en seed-rute (eller en lovlig vei via UI) for
      // en eldre årsavregning, fjern test.fixme og fyll inn under.
      test.setTimeout(180000);

      const GAMMELT_AAR = new Date().getFullYear() - 8;

      await seedPoppInntekt(request, USER_ID_VALID, [
        { inntektAr: GAMMELT_AAR, belop: 400_000, kilde: POPP_KILDE.SKATT },
      ]);

      const auth = new AuthHelper(page);
      await auth.login();

      // TODO(reconcile): åpne en årsavregning med inntektsÅr = GAMMELT_AAR.
      await opprettOgÅpneAutoÅrsavregning(page);

      const popp = new PensjonsopptjeningPage(page);
      await popp.ventPåSeksjon();

      await popp.assertions.verifiserSeksjonVises();
      const rader = await popp.lesRader();
      await popp.assertions.verifiserAarIntervall(rader, GAMMELT_AAR, GAMMELT_AAR);
    },
  );
});
