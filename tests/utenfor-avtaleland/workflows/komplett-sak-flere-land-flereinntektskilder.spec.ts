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
  test('skal fullføre komplett saksflyt med flere land og flere inntektskilder', async ({ page, request }) => {
    // Setup: Autentisering
    const auth = new AuthHelper(page);
    await auth.login();

    // Setup: Unleash feature toggles
    const unleash = new UnleashHelper(request);
    await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

    // Setup: Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new BehandlingPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);

    console.log('🎯 Starter komplett saksflyt for FTRL flere land...');

    // Steg 1: Opprett ny sak
    console.log('\n📝 Steg 1: Oppretter ny sak...');
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();

    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype('FTRL');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('YRKESAKTIV');
    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    await opprettSak.assertions.verifiserBehandlingOpprettet();
    console.log('✅ Sak opprettet');

    // Steg 2: Åpne behandling og rediger dato
    console.log('\n📅 Steg 2: Redigerer dato...');
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    await behandling.endreDatoMedDatovelger('2024', 'fredag 1');
    console.log('✅ Dato redigert');

    // Steg 3: Fyll ut medlemskap
    console.log('\n🌍 Steg 3: Fyller ut medlemskap...');
    await medlemskap.velgPeriode('01.11.2024', '14.11.2024');
    await medlemskap.velgFlereLandIkkeKjentHvilke();
    await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
    await medlemskap.klikkBekreftOgFortsett();
    console.log('✅ Medlemskap utfylt (flere land)');

    // Steg 4: Velg arbeidsforhold
    console.log('\n💼 Steg 4: Velger arbeidsforhold...');
    await arbeidsforhold.velgArbeidsgiver('Ståles Stål AS');
    await arbeidsforhold.klikkBekreftOgFortsett();
    console.log('✅ Arbeidsforhold valgt');

    // Steg 5: Fyll ut lovvalg (§ 2-8 første ledd a)
    console.log('\n⚖️  Steg 5: Fyller ut lovvalg...');
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
    await lovvalg.klikkBekreftOgFortsettMedVent();
    await lovvalg.klikkBekreftOgFortsettMedVent();
    console.log('✅ Lovvalg utfylt (§ 2-8 første ledd a)');

    // Steg 6: Fyll ut trygdeavgift med flere inntektskilder
    console.log('\n💰 Steg 6: Fyller ut trygdeavgift...');
    await behandling.gåTilTrygdeavgift();
    await trygdeavgift.ventPåSideLastet();

    // Velg skattepliktig
    await trygdeavgift.velgSkattepliktig(true);

    // Første inntektskilde: Arbeidsinntekt
    console.log('   Legger til arbeidsinntekt...');
    await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');

    // Andre inntektskilde: Næringsinntekt
    console.log('   Legger til næringsinntekt...');
    await trygdeavgift.klikkLeggTilInntekt();
    await trygdeavgift.velgInntektskildeForIndeks(1, 'NÆRINGSINNTEKT_FRA_NORGE');
    await trygdeavgift.fyllInnBruttoinntektForIndeks(1, '100000');

    await trygdeavgift.klikkBekreftOgFortsett();
    console.log('✅ Trygdeavgift utfylt (flere inntektskilder)');

    // Steg 7: Fatt vedtak
    console.log('\n🎯 Steg 7: Fatter vedtak...');
    await vedtak.fyllInnAlleTekstfelt('fritekst', 'begrunnelse', 'trygdeavgift');
    await vedtak.klikkFattVedtak();
    console.log('✅ Vedtak fattet');

    console.log('\n🎉 Komplett saksflyt fullført!');
  });

  test('skal fullføre forenklet arbeidsflyt med flere land', async ({ page, request }) => {
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

    console.log('🎯 Starter forenklet arbeidsflyt...');

    // Steg 1: Opprett sak
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);

    // Steg 2: Rediger dato
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    await behandling.endreDatoMedDatovelger('2024', 'fredag 1');

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
