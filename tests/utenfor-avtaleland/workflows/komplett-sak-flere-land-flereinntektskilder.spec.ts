import { test } from '../../../fixtures';
import { AuthHelper } from '../../../helpers/auth-helper';
import { UnleashHelper } from '../../../helpers/unleash-helper';
import { HovedsidePage } from '../../../pages/hovedside.page';
import { OpprettNySakPage } from '../../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { BehandlingPage } from '../../../pages/behandling/behandling.page';
import { MedlemskapPage } from '../../../pages/behandling/medlemskap.page';
import { ArbeidsforholdPage } from '../../../pages/behandling/arbeidsforhold.page';
import { LovvalgPage } from '../../../pages/behandling/lovvalg.page';
import { TrygdeavgiftPage } from '../../../pages/trygdeavgift/trygdeavgift.page';
import { VedtakPage } from '../../../pages/vedtak/vedtak.page';
import { USER_ID_VALID } from '../../../pages/shared/constants';

/**
 * Komplett saksflyt for FTRL-sak med flere land og flere inntektskilder
 *
 * Tester:
 * - Opprettelse av FTRL-sak (Folketrygdloven)
 * - Redigering av dato med datovelger
 * - Medlemskap: Flere land (ikke kjent hvilke)
 * - Lovvalg: § 2-8 første ledd a
 * - Trygdeavgift: Flere inntektskilder (arbeidsinntekt + næringsinntekt)
 * - Vedtak: Fullføring av saksflyt
 *
 * Relatert: MELOSYS-7539 - Testing av årsavregningsbehandling
 */

test.describe('Komplett saksflyt - FTRL flere land', () => {
  test('skal fullføre komplett saksflyt - delevis skattepliktig - med flere inntektskilder', async ({ page, request }) => {
    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    const unleash = new UnleashHelper(request);
    await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new BehandlingPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);

    // Steg 1: Opprett sak
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);

    // Steg 2: Rediger dato (November 1, 2024 is a Friday)
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    await behandling.endreDatoMedDatovelger('2024', 'november', 'fredag 1');

    // Steg 3: Medlemskap
    await medlemskap.velgPeriode('01.11.2024', '14.11.2024');
    await medlemskap.velgFlereLandIkkeKjentHvilke();
    await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
    await medlemskap.klikkBekreftOgFortsett();

    // Steg 4: Arbeidsforhold
    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    // Steg 5: Lovvalg
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmål(['Har søker vært medlem i minst', 'Har søker nær tilknytning til']);
    await lovvalg.klikkBekreftOgFortsettMedVent();
    await lovvalg.klikkBekreftOgFortsettMedVent();

    // Steg 6: Trygdeavgift
    await behandling.gåTilTrygdeavgift();
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(true);
    await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');
    await trygdeavgift.klikkLeggTilInntekt();
    await trygdeavgift.velgInntektskildeForIndeks(1, 'NÆRINGSINNTEKT_FRA_NORGE');
    await trygdeavgift.fyllInnBruttoinntektForIndeks(1, '100000');
    await trygdeavgift.klikkBekreftOgFortsett();

    // Steg 7: Vedtak
    await vedtak.fattVedtak('fritekst', 'begrunnelse', 'trygdeavgift');

    console.log('✅ Forenklet arbeidsflyt fullført');
  });
});
