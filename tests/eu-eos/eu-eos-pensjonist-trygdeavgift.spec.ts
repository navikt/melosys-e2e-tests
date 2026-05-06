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

// Låst til 2026 for å unngå G-avhengig flakiness ved kalenderårsskifte.
// Oppdater ved behov hvis mock-data eller G-grenser endres for dette året.
const TESTÅR = 2026;
const helÅrFra = `01.01.${TESTÅR}`;
const helÅrTil = `31.12.${TESTÅR}`;

// Bruttoinntekt-testdata (månedlig beløp × 12 = årsbeløp):
// Minstebeløpet for EU/EØS pensjonist er G-avhengig (ca. 0,5G ≈ 66 000 kr/år i 2026).
// INNTEKT_UNDER_MINSTEBELØP: 8 000/mnd × 12 = 96 000/år — under minstebeløpet (AC1)
// INNTEKT_FOR_25_PROSENTREGEL: 9 000/mnd × 12 = 108 000/år — over minstebeløpet, men avgift > 25% av overskudd → 25%-regel (AC2)
// INNTEKT_AC4_PER_KILDE: 5 000/mnd × 12 = 60 000/år per kilde (2 kilder = 120 000/år) → sammenslåing (AC4)
// Revurder ved neste G-justering (normalt 1. mai hvert år).
const INNTEKT_UNDER_MINSTEBELØP = '8000';
const INNTEKT_FOR_25_PROSENTREGEL = '9000';
const INNTEKT_AC4_PER_KILDE = '5000';

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
 * Akseptansekriterier:
 * - AC1: Vis infomelding "Trygdeavgift skal ikke betales..." når alle perioder er under minstebeløpet
 * - AC2: 25%-regel → tabell med * i sats-kolonnen og fotnote
 * - AC4: Sammenslåtte inntektskilder → *** i inntektskilde-kolonnen og fotnote
 * - Regresjonstest: Ordinær beregning → tabell synlig, ingen infomelding
 */
test.describe('EU/EØS Pensjonist - Trygdeavgift beregningsresultat', () => {
  test('skal vise infomelding når inntekten er under minstebeløpet', async ({ page, request }) => {
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
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(INNTEKT_UNDER_MINSTEBELØP);

    await trygdeavgift.assertions.verifiserInfomeldingMinstebeløpSynlig();
    await trygdeavgift.assertions.verifiserTrygdeavgiftsTabellIkkeSynlig();
  });

  // AC2: 25%-regel → tabell med * i sats-kolonnen og fotnote
  test('skal vise tabell med asterisk (*) for 25%-regel', async ({ page, request }) => {
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
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(INNTEKT_FOR_25_PROSENTREGEL);

    await trygdeavgift.assertions.verifiserTrygdeavgiftsTabellSynlig();
    await trygdeavgift.assertions.verifiser25ProsentRegelMarkering();
    await trygdeavgift.assertions.verifiserInfomeldingMinstebeløpIkkeSynlig();
  });

  // AC4: Sammenslåtte inntektskilder → *** i inntektskilde-kolonnen og fotnote
  test('skal vise *** for sammenslåtte inntektskilder', async ({ page, request }) => {
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

    // Første inntektskilde: Pensjon
    await trygdeavgift.velgInntektskilde('PENSJON');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(INNTEKT_AC4_PER_KILDE);

    // Legg til andre inntektskilde: Uføretrygd
    // Samlet 2×5000×12=120000 > minstebeløpet, men avgift > 25% av overskudd → sammenslåing
    await trygdeavgift.klikkLeggTilInntekt();
    await trygdeavgift.velgInntektskildeForIndeks(1, 'Uføretrygd');
    await trygdeavgift.fyllInnBruttoinntektForIndeksMedApiVent(1, INNTEKT_AC4_PER_KILDE);

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
