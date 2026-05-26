import { test, expect } from '../../fixtures';
import { Page, APIRequestContext } from '@playwright/test';
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
 * - Mock: melosys-mock returnerer kanonisk data (`kilde="MOCK"`, FL_PGI_LOENN + SUM_PI rader
 *   for de siste 5 år) for alle fnrs unntatt `00000000000` som gir 404. Ingen seed-rute
 *   eksisterer for å differensiere kilder pr fnr — Scenarios 2/3/4 stubber derfor responsen
 *   via `page.route(...)` for å kunne teste UI-rendering deterministisk.
 * - UI: ingen `data-testid`-er; selektorer er tekst-/role-baserte.
 * - Sidemenyen er panel-basert (ingen URL-endring).
 */

const POPP_TOGGLE_NAMES = [
  'melosys.vis_pensjonsopptjening_popp', // api (underscores)
  'melosys.vis-pensjonsopptjening-popp', // web (hyphens)
];
const ÅRSAVREGNING_LINK_REGEX = new RegExp(`${USER_ID_VALID}.*Pensjonist.*Årsavregning`);
const BRUKERNAVN = 'TRIVIELL KARAFFEL';

type PoppPeriode = { aar: number; pgi: number; kilde: string };

/**
 * Stub responsen fra `/api/behandlinger/{id}/pensjonsopptjening` med oppgitt
 * periode-liste. Brukes for å teste UI-rendering av kombinasjoner av kilder
 * (Skatt+Avgiftssystemet+Melosys) som melosys-mock ikke kan produsere uten
 * seed-mekanisme.
 */
async function stubPoppResponse(page: Page, perioder: PoppPeriode[]): Promise<void> {
  await page.route('**/api/behandlinger/*/pensjonsopptjening', async (route) => {
    const url = new URL(route.request().url());
    // Hent inntektsÅr fra path/body hvis vi vil — for stub holder vi det enkelt.
    void url;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        inntektsAr: FORRIGE_AAR,
        behandletAr: FORRIGE_AAR,
        perioder,
      }),
    });
  });
}

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
  });

  test('Scenario 1 — seksjonen vises med rader fra POPP (kilde fra mock)', async ({ page }) => {
    test.setTimeout(180000);

    // Bruker reell melosys-mock-data (kilde="MOCK", siste 5 år, kanoniske beløp).
    const auth = new AuthHelper(page);
    await auth.login();

    await opprettOgÅpneAutoÅrsavregning(page);

    const popp = new PensjonsopptjeningPage(page);
    await popp.ventPåSeksjon();

    await popp.assertions.verifiserSeksjonVises();
    const rader = await popp.lesRader();

    // «Vises seksjonen + hver oppføring viser år, PGI, kilde»
    expect(rader.length).toBeGreaterThan(0);
    for (const rad of rader) {
      expect(rad.aar).toBeGreaterThan(0);
      expect(rad.pgi).toBeGreaterThan(0);
      expect(rad.kilde.length).toBeGreaterThan(0);
    }

    // «Nyeste år øverst»
    await popp.assertions.verifiserNyesteÅrØverst(rader);

    // Inntil 5 år tilbake (mock dekker det)
    const fra = FORRIGE_AAR - 4;
    const til = FORRIGE_AAR;
    await popp.assertions.verifiserAarIntervall(rader, fra, til);
  });

  test('Scenario 2 — delt grunnlag: Skatt og Avgiftssystemet samme år (stubbed)', async ({ page }) => {
    test.setTimeout(180000);

    // Stubber API-responsen — mocken kan ikke differensiere kilder pr fnr i dag.
    await stubPoppResponse(page, [
      { aar: FORRIGE_AAR, pgi: 540_000, kilde: POPP_KILDE.SKATT },
      { aar: FORRIGE_AAR, pgi: 120_000, kilde: POPP_KILDE.AVGIFTSSYSTEMET },
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

  test('Scenario 3 — alle tre kilder: Skatt + Avgiftssystemet + Melosys (stubbed)', async ({ page }) => {
    test.setTimeout(180000);

    await stubPoppResponse(page, [
      { aar: FORRIGE_AAR, pgi: 540_000, kilde: POPP_KILDE.SKATT },
      { aar: FORRIGE_AAR, pgi: 120_000, kilde: POPP_KILDE.AVGIFTSSYSTEMET },
      { aar: FORRIGE_AAR, pgi: 80_000, kilde: POPP_KILDE.MELOSYS },
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

  test('Scenario 4 — ingen pensjonsopptjening: tom-melding vises (stubbed)', async ({ page }) => {
    test.setTimeout(180000);

    // Stubber tom respons — mocken returnerer alltid data for ekte fnr.
    await stubPoppResponse(page, []);

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
    async ({ page }) => {
      // BLOKKERT: auto-opprettelses-flyten (FTRL Pensjonist → vedtak) gir alltid
      // en årsavregning for FORRIGE_AAR. Vi har ingen produksjonsklar måte å
      // sette opp en årsavregning med inntektsÅr ≥ 6 år tilbake på i E2E-stacken
      // i dag. Når bygg leverer en seed-rute (eller en lovlig vei via UI) for
      // en eldre årsavregning, fjern test.fixme og fyll inn under.
      test.setTimeout(180000);

      const GAMMELT_AAR = new Date().getFullYear() - 8;

      await stubPoppResponse(page, [
        { aar: GAMMELT_AAR, pgi: 400_000, kilde: POPP_KILDE.SKATT },
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
