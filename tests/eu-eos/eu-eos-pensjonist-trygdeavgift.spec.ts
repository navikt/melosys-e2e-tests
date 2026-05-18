import { test } from '../../fixtures';
import { Page, APIRequestContext } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosPensjonistInngangPage } from '../../pages/behandling/eu-eos-pensjonist-inngang.page';
import { EuEosPensjonistTrygdeavgiftPage } from '../../pages/trygdeavgift/eu-eos-pensjonist-trygdeavgift.page';
import { AARSAK, BEHANDLINGSTEMA, SAKSTEMA, SAKSTYPER, USER_ID_VALID } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { UnleashHelper } from '../../helpers/unleash-helper';
import { hentMinstebeløp } from '../../helpers/trygdeavgift-beregning-helper';

// Låst til 2026 for å unngå G-avhengig flakiness ved kalenderårsskifte.
const TESTÅR = 2026;
const helÅrFra = `01.01.${TESTÅR}`;
const helÅrTil = `31.12.${TESTÅR}`;

async function opprettEøsPensjonistTrygdeavgiftSak(page: Page, request: APIRequestContext) {
  // Cleanup-fixturen resetter alle Unleash-toggles før hver test;
  // 25%-regelen må derfor enables eksplisitt her.
  const unleash = new UnleashHelper(request);
  await unleash.enableFeature('melosys.trygdeavgift.25-prosentregel');

  const auth = new AuthHelper(page);
  await auth.login();

  const hovedside = new HovedsidePage(page);
  const opprettSak = new OpprettNySakPage(page);

  await hovedside.goto();
  await hovedside.klikkOpprettNySak();
  await opprettSak.fyllInnBrukerID(USER_ID_VALID);
  await opprettSak.velgSakstype(SAKSTYPER.EU_EOS);
  await opprettSak.velgSakstema(SAKSTEMA.TRYGDEAVGIFT);
  await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.PENSJONIST);
  await opprettSak.velgAarsak(AARSAK.SØKNAD);
  await opprettSak.leggBehandlingIMine();
  await opprettSak.klikkOpprettNyBehandling();

  await waitForProcessInstances(page.request, 30);
  await hovedside.goto();
  await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
  await page.waitForLoadState('networkidle');
}

/**
 * EU/EØS Pensjonist - Trygdeavgift beregningsresultat
 *
 * Tester beregning av trygdeavgift for EU/EØS Pensjonist-saker
 * mot ekte backend (ingen mocking).
 *
 * Dekker:
 * - Infomelding "Trygdeavgift skal ikke betales..." når alle perioder er under minstebeløpet
 * - 25%-regel → tabell med * i sats-kolonnen og fotnote
 * - Sammenslåtte inntektskilder → *** i inntektskilde-kolonnen og fotnote
 * - Regresjon: Ordinær beregning → tabell synlig, ingen infomelding
 */
test.describe('EU/EØS Pensjonist - Trygdeavgift beregningsresultat', () => {
  test('skal vise infomelding når inntekten er under minstebeløpet', async ({ page, request }) => {
    test.setTimeout(120000);

    // Henter faktisk minstebeløp fra melosys-trygdeavgift-beregning og legger oss
    // trygt under, slik at testen tåler G-justering år for år.
    const månedligMinstebeløp = Math.floor((await hentMinstebeløp(request, TESTÅR)) / 12);
    const månedsinntektUnder = String(månedligMinstebeløp - 100);

    await opprettEøsPensjonistTrygdeavgiftSak(page, request);

    const inngang = new EuEosPensjonistInngangPage(page);
    await inngang.ventPåSideLastet();
    await inngang.fyllInnPeriode(helÅrFra, helÅrTil);
    await inngang.velgBostedsland('SE');
    await inngang.klikkBekreftOgFortsett();

    const trygdeavgift = new EuEosPensjonistTrygdeavgiftPage(page);
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgIkkeSkattepliktig();
    await trygdeavgift.velgInntektskilde('PENSJON');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(månedsinntektUnder);

    await trygdeavgift.assertions.verifiserInfomeldingMinstebeløpSynlig();
    await trygdeavgift.assertions.verifiserTrygdeavgiftsTabellIkkeSynlig();
  });

  // 25%-regel → tabell med * i sats-kolonnen og fotnote
  test('skal vise tabell med asterisk (*) for 25%-regel', async ({ page, request }) => {
    test.setTimeout(120000);

    // Trygt over minstebeløpet, men lav nok til at 25%-regelen begrenser avgiften.
    const månedligMinstebeløp = Math.floor((await hentMinstebeløp(request, TESTÅR)) / 12);
    const månedsinntektFor25ProsentRegel = String(Math.floor(månedligMinstebeløp * 1.5));

    await opprettEøsPensjonistTrygdeavgiftSak(page, request);

    const inngang = new EuEosPensjonistInngangPage(page);
    await inngang.ventPåSideLastet();
    await inngang.fyllInnPeriode(helÅrFra, helÅrTil);
    await inngang.velgBostedsland('SE');
    await inngang.klikkBekreftOgFortsett();

    const trygdeavgift = new EuEosPensjonistTrygdeavgiftPage(page);
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgIkkeSkattepliktig();
    await trygdeavgift.velgInntektskilde('PENSJON');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(månedsinntektFor25ProsentRegel);

    await trygdeavgift.assertions.verifiserTrygdeavgiftsTabellSynlig();
    await trygdeavgift.assertions.verifiser25ProsentRegelMarkering();
    await trygdeavgift.assertions.verifiserInfomeldingMinstebeløpIkkeSynlig();
  });

  // Sammenslåtte inntektskilder → *** i inntektskilde-kolonnen og fotnote
  test('skal vise *** for sammenslåtte inntektskilder', async ({ page, request }) => {
    test.setTimeout(120000);

    // Hver enkelt kilde er like under minstebeløpet, totalt godt over — det er
    // sammenslåingen som gjør at avgift skal beregnes.
    const månedligMinstebeløp = Math.floor((await hentMinstebeløp(request, TESTÅR)) / 12);
    const månedsinntektPerKilde = String(månedligMinstebeløp - 100);

    await opprettEøsPensjonistTrygdeavgiftSak(page, request);

    const inngang = new EuEosPensjonistInngangPage(page);
    await inngang.ventPåSideLastet();
    await inngang.fyllInnPeriode(helÅrFra, helÅrTil);
    await inngang.velgBostedsland('SE');
    await inngang.klikkBekreftOgFortsett();

    const trygdeavgift = new EuEosPensjonistTrygdeavgiftPage(page);
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgIkkeSkattepliktig();

    await trygdeavgift.velgInntektskilde('PENSJON');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(månedsinntektPerKilde);

    await trygdeavgift.klikkLeggTilInntekt();
    await trygdeavgift.velgInntektskildeForIndeks(1, 'Uføretrygd');
    await trygdeavgift.fyllInnBruttoinntektForIndeksMedApiVent(1, månedsinntektPerKilde);

    await trygdeavgift.assertions.verifiserTrygdeavgiftsTabellSynlig();
    await trygdeavgift.assertions.verifiserSammenslåtteInntektskilderMarkering();
  });

  // Ordinær beregning (baseline) → tabell synlig, ingen infomeldinger
  test('skal vise tabell ved ordinær beregning', async ({ page, request }) => {
    test.setTimeout(120000);

    await opprettEøsPensjonistTrygdeavgiftSak(page, request);

    const inngang = new EuEosPensjonistInngangPage(page);
    await inngang.ventPåSideLastet();
    await inngang.fyllInnPeriode(helÅrFra, helÅrTil);
    await inngang.velgBostedsland('SE');
    await inngang.klikkBekreftOgFortsett();

    const trygdeavgift = new EuEosPensjonistTrygdeavgiftPage(page);
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgIkkeSkattepliktig();
    await trygdeavgift.velgInntektskilde('PENSJON');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('200000');

    await trygdeavgift.assertions.verifiserTrygdeavgiftsTabellSynlig();
    await trygdeavgift.assertions.verifiserInfomeldingMinstebeløpIkkeSynlig();
  });
});
