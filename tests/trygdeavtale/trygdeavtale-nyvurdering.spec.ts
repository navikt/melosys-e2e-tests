import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { TrygdeavtaleBehandlingPage } from '../../pages/behandling/trygdeavtale-behandling.page';
import { TrygdeavtaleArbeidsstedPage } from '../../pages/behandling/trygdeavtale-arbeidssted.page';
import { USER_ID_VALID } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';

/**
 * Nyvurdering (NV) på trygdeavtale-sak — forkortet periode erstatter MEDL-periode
 *
 * Gap: trygdeavtale-nyvurdering. Trygdeavtale dekkes ellers kun av én
 * førstegangs-test; NV-flyten (5 steg: Inngang, Virksomhet, Bestemmelse,
 * Familie, Vedtak) var udekket. Kjente bugs i NV-området: MELOSYS-7859
 * (datovalidering), MELOSYS-6567 (attest-checkbox ved NV).
 *
 * Scenario:
 * 1. Fullfør en førstegangs trygdeavtale-behandling → fattet vedtak
 *    (Australia, art. 9 nr. 3, 01.01.2024–01.01.2026)
 * 2. Opprett Nyvurdering på samme sak
 * 3. Forkort perioden på Inngang-steget (TOM → 31.12.2025)
 * 4. På Vedtak-steget: synk vedtaksperiodens TOM (viser GAMMEL dato — må
 *    endres via "Endre" → inline TOM-felt → "Lagre"), oppgi obligatorisk
 *    grunn for nytt vedtak (NYE_OPPLYSNINGER) og fatt vedtak
 * 5. Verifiser:
 *    - NV-behandlingen er AVSLUTTET med resultat FASTSATT_LOVVALGSLAND og
 *      NY_VURDERING_BAKGRUNN=NYE_OPPLYSNINGER
 *    - ny lovvalgsperiode-rad med forkortet TOM og SAMME medlperiode_id som
 *      førstegangsbehandlingen
 *    - ingen feilede prosessinstanser; IVERKSETT_VEDTAK_TRYGDEAVTALE FERDIG
 *    - MEDL-perioden er erstattet in-place i mocken (GYLD, tilOgMed forkortet)
 */
const FØRSTE_FRA = '01.01.2024';
const FØRSTE_TIL = '01.01.2026';
const NV_FORKORTET_TIL = '31.12.2025';
const NV_FORKORTET_TIL_ISO = '2025-12-31';

test.describe('Trygdeavtale - Nyvurdering', () => {
  test('skal forkorte periode via nyvurdering og erstatte MEDL-perioden in-place', async ({ page }) => {
    test.setTimeout(180000);

    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new TrygdeavtaleBehandlingPage(page);
    const arbeidssted = new TrygdeavtaleArbeidsstedPage(page);

    // === DEL A: Førstegangs trygdeavtale-behandling → fattet vedtak ===
    console.log('📝 Del A: Oppretter førstegangs trygdeavtale-sak...');
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype('TRYGDEAVTALE');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('YRKESAKTIV');
    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();
    await hovedside.åpneBehandling('TRIVIELL KARAFFEL -');
    await page.waitForLoadState('networkidle');

    console.log('📝 Del A: Fullfører førstegangsbehandling til vedtak...');
    await behandling.fyllUtPeriodeOgLand(FØRSTE_FRA, FØRSTE_TIL, 'AU');
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
    await behandling.innvilgeOgVelgBestemmelse('AUS_ART9_3');
    await arbeidssted.fyllUtArbeidsstedOgFattVedtak('Test');

    console.log('📝 Del A: Venter på iverksetting av førstegangsvedtak...');
    await waitForProcessInstances(page.request, 30);

    // === DEL B: Opprett Nyvurdering på samme sak ===
    console.log('📝 Del B: Oppretter nyvurdering...');
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD');
    await waitForProcessInstances(page.request, 30);

    // Åpne den NYE aktive behandlingen (åpneBehandling tar første lenke = nyeste)
    await hovedside.goto();
    await hovedside.åpneBehandling('TRIVIELL KARAFFEL -');
    await page.waitForLoadState('networkidle');

    // === DEL C: Driv NV-flyten (Inngang → Virksomhet → Bestemmelse → Familie → Vedtak) ===
    console.log(`📝 Del C: Forkorter perioden på Inngang-steget (TOM → ${NV_FORKORTET_TIL})...`);
    // Inngang: felter prefilled fra forrige behandling — endre kun TOM
    await behandling.endreInngangTilOgMedOgFortsett(NV_FORKORTET_TIL);
    // Virksomhet: arbeidsgiver pre-valgt fra forrige behandling
    await behandling.klikkBekreftOgFortsett();
    // Bestemmelse og vurdering: innvilgelse + AUS_ART9_3 pre-valgt
    await behandling.klikkBekreftOgFortsett();
    // Familie: ingen medfølgende familiemedlemmer
    await behandling.klikkBekreftOgFortsett();

    // Vedtak-steget: synk vedtaksperiodens TOM, oppgi grunn og fatt vedtak
    console.log('📝 Del C: Vedtak-steget — synker TOM, velger grunn og fatter vedtak...');
    await behandling.endreVedtaksperiodeTom(NV_FORKORTET_TIL);
    await behandling.velgGrunnForNyttVedtak('NYE_OPPLYSNINGER');
    await behandling.fattVedtak();

    // === DEL D: Verifiser DB + MEDL ===
    console.log('📝 Del D: Venter på iverksetting av NV-vedtak (kaster ved feilede prosessinstanser)...');
    await waitForProcessInstances(page.request, 30);

    const medlPeriodeId = await behandling.assertions.verifiserNyVurderingVedtakIDatabase({
      fom: FØRSTE_FRA,
      tom: NV_FORKORTET_TIL,
      bakgrunn: 'NYE_OPPLYSNINGER',
      bestemmelse: 'AUS_ART9_3'
    });

    await behandling.assertions.verifiserMedlPeriodeErstattet(page.request, medlPeriodeId, {
      tilOgMed: NV_FORKORTET_TIL_ISO,
      grunnlag: 'Australia_9_3'
    });

    console.log('✅ NV på trygdeavtale-sak fullført: periode forkortet og MEDL-periode erstattet in-place');
  });
});
