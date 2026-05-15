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
 * Akseptansekriterier:
 * - AC1: Vis infomelding "Trygdeavgift skal ikke betales..." når alle perioder er under minstebeløpet
 * - AC2: 25%-regel → tabell med * i sats-kolonnen og fotnote
 * - AC4: Sammenslåtte inntektskilder → *** i inntektskilde-kolonnen og fotnote
 * - Regresjonstest: Ordinær beregning → tabell synlig, ingen infomelding
 */
test.describe('EU/EØS Pensjonist - Trygdeavgift beregningsresultat', () => {
  test('skal vise infomelding når inntekten er under minstebeløpet (1000 kr/md)', async ({ page, request }) => {
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
    // 1000 kr/md = 12 000 kr/år — klart under minstebeløpet (G-justert i melosys-trygdeavgift-beregning).
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('1000');

    await trygdeavgift.assertions.verifiserInfomeldingMinstebeløpSynlig();
    await trygdeavgift.assertions.verifiserTrygdeavgiftsTabellIkkeSynlig();
  });

  // AC2: 25%-regel → tabell med * i sats-kolonnen og fotnote
  test('skal vise tabell med asterisk (*) for 25%-regel (9000 kr/md)', async ({ page, request }) => {
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
    // 9000 kr/md = 108 000 kr/år — over minstebeløpet, men lav nok til at 25%-regelen begrenser avgiften.
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('9000');

    await trygdeavgift.assertions.verifiserTrygdeavgiftsTabellSynlig();
    await trygdeavgift.assertions.verifiser25ProsentRegelMarkering();
    await trygdeavgift.assertions.verifiserInfomeldingMinstebeløpIkkeSynlig();
  });

  // AC4: Sammenslåtte inntektskilder → *** i inntektskilde-kolonnen og fotnote
  test('skal vise *** for sammenslåtte inntektskilder (2 × 5000 kr/md)', async ({ page, request }) => {
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

    // Første inntektskilde: Pensjon. 5000 kr/md = 60 000 kr/år per kilde.
    await trygdeavgift.velgInntektskilde('PENSJON');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('5000');

    // Andre inntektskilde: Uføretrygd. Sammen ≈ 120 000 kr/år, og avgift > 25% av overskudd
    // gir sammenslåing av kildene (*** i tabellen).
    await trygdeavgift.klikkLeggTilInntekt();
    await trygdeavgift.velgInntektskildeForIndeks(1, 'Uføretrygd');
    await trygdeavgift.fyllInnBruttoinntektForIndeksMedApiVent(1, '5000');

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
