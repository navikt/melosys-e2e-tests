import { test, expect } from '../../fixtures';
import { Page } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../../pages/behandling/medlemskap.page';
import { ArbeidsforholdPage } from '../../pages/behandling/arbeidsforhold.page';
import { LovvalgPage } from '../../pages/behandling/lovvalg.page';
import { ResultatPeriodePage } from '../../pages/behandling/resultat-periode.page';
import { TrygdeavgiftPage } from '../../pages/trygdeavgift/trygdeavgift.page';
import { AARSAK, SAKSTEMA, SAKSTYPER, USER_ID_VALID } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';

const inneværendeÅr = new Date().getFullYear();
const helÅrFra = `01.01.${inneværendeÅr}`;
const helÅrTil = `31.12.${inneværendeÅr}`;

/**
 * Oppretter en FTRL frivillig medlemskap-sak med helse- og pensjonsdel,
 * og navigerer til Trygdeavgift-steget.
 *
 * Bruker trygdedekning FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON som splitter
 * perioden i helse- og pensjonsdel.
 */
async function opprettFtrlHelsePensjonSakTilTrygdeavgift(page: Page) {
  const auth = new AuthHelper(page);
  await auth.login();

  const hovedside = new HovedsidePage(page);
  const opprettSak = new OpprettNySakPage(page);
  const medlemskap = new MedlemskapPage(page);
  const arbeidsforhold = new ArbeidsforholdPage(page);
  const lovvalg = new LovvalgPage(page);
  const resultatPeriode = new ResultatPeriodePage(page);

  // Opprett FTRL-sak
  await hovedside.goto();
  await hovedside.klikkOpprettNySak();
  await opprettSak.fyllInnBrukerID(USER_ID_VALID);
  await opprettSak.velgSakstype(SAKSTYPER.FTRL);
  await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
  await opprettSak.velgBehandlingstema('YRKESAKTIV');
  await opprettSak.velgAarsak(AARSAK.SØKNAD);
  await opprettSak.leggBehandlingIMine();
  await opprettSak.klikkOpprettNyBehandling();

  await waitForProcessInstances(page.request, 30);
  await hovedside.goto();
  await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

  // Medlemskap med helse- og pensjonsdel
  await medlemskap.velgPeriode(helÅrFra, helÅrTil);
  await medlemskap.velgLand('Afghanistan');
  await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
  await medlemskap.klikkBekreftOgFortsett();

  // Arbeidsforhold
  await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

  // Lovvalg
  await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
  await lovvalg.svarJaPaaFørsteSpørsmål();
  await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
  await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
  await lovvalg.klikkBekreftOgFortsett();

  // Resultat Periode (håndterer overlapp ved helse/pensjon-split)
  await resultatPeriode.fyllUtResultatPeriode('INNVILGET');
}

/**
 * MELOSYS-7988 AC3: Frivillig medlemskap – Helsedel/Pensjonsdel i dekning-kolonnen
 *
 * Gitt at jeg skal beregne trygdeavgift
 * når beregningen gjelder frivillig medlemskap (ikke misjonærinntekt) og er delt i helse- og pensjonsdel
 * så skal det fremkomme i beregningsoversikten hvilken beregning som gjelder helsedel,
 * og hvilken som gjelder pensjonsdel
 */
test.describe('FTRL Trygdeavgift - Helsedel og Pensjonsdel (AC3)', () => {
  test('skal vise Helsedel og Pensjonsdel i dekning-kolonnen ved frivillig medlemskap delt i helse- og pensjonsdel', async ({ page }) => {
    test.setTimeout(180000);

    await opprettFtrlHelsePensjonSakTilTrygdeavgift(page);

    const trygdeavgift = new TrygdeavgiftPage(page);
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('9000');

    // Verifiser at tabellen viser Helsedel og Pensjonsdel i dekning-kolonnen
    await expect(page.getByRole('columnheader', { name: 'Dekning' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Helsedel' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Pensjonsdel' })).toBeVisible();
  });
});
