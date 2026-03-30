import { test } from '../../fixtures';
import { Page } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosPensjonistInngangPage } from '../../pages/behandling/eu-eos-pensjonist-inngang.page';
import { EuEosPensjonistTrygdeavgiftPage } from '../../pages/trygdeavgift/eu-eos-pensjonist-trygdeavgift.page';
import { AARSAK, BEHANDLINGSTEMA, SAKSTEMA, SAKSTYPER, USER_ID_VALID } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';

const inneværendeÅr = new Date().getFullYear();
const helÅrFra = `01.01.${inneværendeÅr}`;
const helÅrTil = `31.12.${inneværendeÅr}`;

async function opprettEøsPensjonistTrygdeavgiftSak(page: Page) {
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
 * - AC5: Ordinær beregning → tabell synlig, ingen infomelding
 */
test.describe('EU/EØS Pensjonist - Trygdeavgift beregningsresultat', () => {
  test('skal vise infomelding når inntekten er under minstebeløpet', async ({ page }) => {
    test.setTimeout(120000);

    await opprettEøsPensjonistTrygdeavgiftSak(page);

    const inngang = new EuEosPensjonistInngangPage(page);
    await inngang.ventPåSideLastet();
    await inngang.fyllInnPeriode(helÅrFra, helÅrTil);
    await inngang.velgBostedsland('SE');
    await inngang.klikkBekreftOgFortsett();

    const trygdeavgift = new EuEosPensjonistTrygdeavgiftPage(page);
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgIkkeSkattepliktig();
    await trygdeavgift.velgInntektskilde('PENSJON_UFØRETRYGD');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('8000');

    await trygdeavgift.verifiserInfomeldingMinstebeløpSynlig();
    await trygdeavgift.verifiserTrygdeavgiftsTabellIkkeSynlig();
  });

  test('skal vise tabell ved ordinær beregning', async ({ page }) => {
    test.setTimeout(120000);

    await opprettEøsPensjonistTrygdeavgiftSak(page);

    const inngang = new EuEosPensjonistInngangPage(page);
    await inngang.ventPåSideLastet();
    await inngang.fyllInnPeriode(helÅrFra, helÅrTil);
    await inngang.velgBostedsland('SE');
    await inngang.klikkBekreftOgFortsett();

    const trygdeavgift = new EuEosPensjonistTrygdeavgiftPage(page);
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgIkkeSkattepliktig();
    await trygdeavgift.velgInntektskilde('PENSJON_UFØRETRYGD');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('200000');

    await trygdeavgift.verifiserTrygdeavgiftsTabellSynlig();
    await trygdeavgift.verifiserInfomeldingMinstebeløpIkkeSynlig();
  });
});
