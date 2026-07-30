import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { SedHelper, SED_SCENARIOS } from '../../helpers/sed-helper';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../../pages/behandling/medlemskap.page';
import { ArbeidsforholdPage } from '../../pages/behandling/arbeidsforhold.page';
import { LovvalgPage } from '../../pages/behandling/lovvalg.page';
import { ResultatPeriodePage } from '../../pages/behandling/resultat-periode.page';
import { TrygdeavgiftPage } from '../../pages/trygdeavgift/trygdeavgift.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import {
  verifiserSedRutetTilTema,
  verifiserInngaaendeSedJournalfoert,
} from '../../pages/shared/sed-mottak.assertions';
import { verifiserVedtaksbrev } from '../../pages/shared/vedtaksbrev.assertions';
import { verifiserArkivsakKoblet } from '../../pages/shared/arkivsak.assertions';
import { USER_ID_VALID, BRUKERNAVN_VALID } from '../../pages/shared/constants';
import { TestPeriods } from '../../helpers/date-helper';

/**
 * MELOSYS-7821 — Avvikle Basic-autentisering mot Sak → token-basert arkivsak-tilgang.
 * Spec: specs/arkivsak-token-basert-tilgang.md
 *
 * Dette er en BEHAVIOR-EQUIVALENCE-kontrakt for en ren autentiserings-endring som er usynlig
 * på E2E-laget: Sak/SAF/Joark er mocket og mocken validerer ikke auth-headeren, så testen kan
 * verken se «Basic ble brukt» eller «token ble brukt». Den asserterer i stedet det
 * FUNKSJONELLE fotavtrykket av et velfungerende arkivsak-oppslag — det som MÅ forbli uendret
 * etter at melosys-api/eessi bytter fra Basic auth til SAF `saker`-query / Entra-token:
 *
 *   1. Saken kobles til en arkivsak (FAGSAK.GSAK_SAKSNUMMER satt) — beviset på at oppslaget
 *      mot Sak ga et brukbart resultat. (Ingen eksisterende test asserterer dette.)
 *   2. Dokumenter journalføres mot saken (INNGAAENDE SED + UTGAAENDE vedtaksbrev).
 *   3. EESSI-saksflyt ruter korrekt og uten feilede prosesser.
 *
 * Knekker det nye auth-/oppslags-sporet (f.eks. Sak-/mock-svaret gir ingen arkivsak), faller
 * GSAK-koblingen bort og journalføringen mister sin sak-tilknytning → testen blir RØD.
 *
 * Auth-MEKANISMEN (Basic vs. token, og at Basic-config avvises) dekkes av enhets-/
 * integrasjonstest i tjenestene + verifisering i Q1/Q2 — se «Kjente avgrensninger» i speken.
 */
test.describe('Token-basert arkivsak-tilgang (MELOSYS-7821)', () => {
  // ===================================================================================
  // Scenario 1 — Inngående EESSI-saksflyt: A003 rutes, journalføres og kobles til arkivsak
  // (melosys-eessi + melosys-api). Ren API/DB-flyt, ingen UI.
  // ===================================================================================
  test('skal rute + journalføre inngående A003 og koble saken til arkivsak (EESSI)', async ({
    request,
  }) => {
    console.log('📨 Scenario 1: inngående A003 → ruting + journalføring + arkivsak-kobling');
    const sedHelper = new SedHelper(request);

    const result = await sedHelper.sendSed(SED_SCENARIOS.A003_MINIMAL);
    expect(result.success, `Send SED feilet: ${result.message}`).toBe(true);

    // Globalt poll FØR sluttilstands-assertene (jf. CI-race-lærdom).
    await waitForProcessInstances(request, 60);

    // S1 «behandling rutet til riktig tema uten feilede prosesser» + EESSI-saksflyt uendret.
    const ruting = await verifiserSedRutetTilTema({
      forventetTema: 'BESLUTNING_LOVVALG_ANNET_LAND',
      rutingProsess: 'ARBEID_FLERE_LAND_NY_SAK',
    });

    // S1 «journalføres som INNGAAENDE EESSI-journalpost knyttet til saken».
    await verifiserInngaaendeSedJournalfoert(request, {
      saksnummer: ruting.saksnummer,
      sedType: 'A003',
    });

    // S1 «saken er koblet til en arkivsak (GSAK)» — beviset på at arkivsak-oppslaget mot Sak
    // (det auth-bytten gjelder) ga et brukbart resultat.
    await verifiserArkivsakKoblet({ saksnummer: ruting.saksnummer });

    console.log('✅ Scenario 1: EESSI-saksflyt rutet + journalført + arkivsak koblet');
  });

  // ===================================================================================
  // Scenario 2 — Utgående journalføring: FTRL § 2-8-vedtak → vedtaksbrev journalført mot
  // arkivsak (melosys-api). Gjenbruker FTRL-flyten fra vedtaksbrev-mottakertype.spec.ts.
  // ===================================================================================
  test('skal journalføre vedtaksbrev mot arkivsak ved FTRL-vedtak (melosys-api)', async ({
    page,
    request,
  }) => {
    test.setTimeout(300000);

    console.log('📨 Scenario 2: FTRL § 2-8-vedtak → vedtaksbrev journalført + arkivsak-kobling');
    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const resultatPeriode = new ResultatPeriodePage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);

    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();
    await hovedside.åpneBehandling(`${BRUKERNAVN_VALID} -`);

    const period = TestPeriods.standardPeriod;
    await medlemskap.velgPeriode(period.start, period.end);
    await medlemskap.velgLand('Afghanistan');
    await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
    await medlemskap.klikkBekreftOgFortsett();

    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
    await lovvalg.klikkBekreftOgFortsett();

    await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
    await trygdeavgift.velgBetalesAga(false);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
    await trygdeavgift.klikkBekreftOgFortsett();

    const behandlingId = new URL(page.url()).searchParams.get('behandlingID');
    expect(behandlingId, 'behandlingID skal finnes i URL').not.toBeNull();

    await vedtak.klikkFattVedtak();
    console.log('📝 Venter på iverksetting (FTRL)...');
    await waitForProcessInstances(page.request, 60);

    // S2 «behandling avsluttet med korrekt resultat via IVERKSETT_VEDTAK_FTRL».
    await vedtak.assertions.verifiserBehandlingAvsluttet({
      behandlingId,
      forventetResultatType: 'MEDLEM_I_FOLKETRYGDEN',
      forventetIverksettProsess: 'IVERKSETT_VEDTAK_FTRL',
    });

    // S2 «vedtaksbrevet journalføres som ferdigstilt UTGAAENDE journalpost til riktig mottaker».
    await verifiserVedtaksbrev(request, {
      mottakerFnr: USER_ID_VALID,
      forventetBrevkode: 'innvilgelse_ftrl',
      forventetTittel: 'Vedtak om frivillig medlemskap',
    });

    // S2 «saken er koblet til en arkivsak (GSAK)» — beviset på at arkivsak-oppslaget mot Sak
    // (det melosys-api journalfører vedtaksbrevet mot) ga et brukbart resultat.
    await verifiserArkivsakKoblet({ behandlingId: behandlingId! });

    console.log('✅ Scenario 2: vedtaksbrev journalført + arkivsak koblet');
  });
});
