import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import {
  USER_ID_VALID,
  SAKSTYPER,
  SAKSTEMA,
  BEHANDLINGSTEMA,
  AARSAK,
  EU_EOS_LAND,
  EU_EOS_LOVVALG,
  FORRIGE_AAR,
} from '../../pages/shared/constants';
import { runAndWaitForProcessInstances } from '../../helpers/api-helper';
import { verifiserBehandlingSluttilstand } from '../../pages/shared/behandling-sluttilstand.assertions';
import { withDatabase } from '../../helpers/db-helper';

/**
 * Komplett saksflyt for EØS Medlemskap Lovvalg - Offentlig tjenesteperson art.11(3)(b)
 *
 * Tester:
 * - Opprettelse av EU_EOS-sak med sakstema MEDLEMSKAP_LOVVALG og behandlingstema ARBEID_TJENESTEPERSON_ELLER_FLY
 * - Medlemskap: Bulgaria som arbeidsland
 * - Arbeidsforhold: Velg arbeidsgiver
 * - Lovvalg: Rfo. 883/2004 art.11(3)(b)
 * - Vedtak: Fullføring av saksflyt
 * - Verifisering: Årsavregningen opprettes, men er blokkert for denne sakstypen
 *
 * NB (faglig): For EU_EOS/MEDLEMSKAP_LOVVALG/ARBEID_TJENESTEPERSON_ELLER_FLY med
 * lovvalgsbestemmelse FO_883_2004_ART11_3B for foregående år oppretter Melosys nå
 * årsavregningen automatisk (MELOSYS-8163). Selve årsavregningsflyten er derimot ikke rullet
 * ut: så lenge melosys.arsavregning.eos_tjenesteperson er av, møter saksbehandleren en
 * blokkerende melding og kommer ikke videre. Testen verifiserer den tilstanden.
 *
 * Frem til 2026-09-14 sto det et eget varsel her, «Du kan ikke årsavregne disse type saker i
 * Melosys enda». Det ble fjernet fra melosys-web i #3108, og assertionen er flyttet til den
 * blokkerende meldingen. Når togglen settes i produksjon skal den snus igjen, til at
 * årsavregningen kan fullføres — slik ftrl-pensjonist-testen gjør.
 */
test.describe('EØS Medlemskap Lovvalg - Offentlig tjenesteperson 11.3b', () => {
  test('skal fullføre sak og verifisere at årsavregningen er blokkert for sakstypen', async ({ page }) => {
    test.setTimeout(120000);

    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    // Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new EuEosBehandlingPage(page);
    const vedtak = new VedtakPage(page);

    // Lenketeksten i saksoversikten inkluderer fnr, sakstema og behandlingstema
    const behandlingLenke = new RegExp(`${USER_ID_VALID}.*Medlemskap og lovvalg.*Offentlig`);

    // Step 1: Create case
    console.log('Step 1: Creating new EØS Medlemskap Lovvalg Offentlig tjenesteperson case...');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgOpprettNySak();
    await opprettSak.velgSakstype(SAKSTYPER.EU_EOS);
    await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
    await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.ARBEID_TJENESTEPERSON_ELLER_FLY);
    await opprettSak.velgAarsak(AARSAK.SØKNAD);

    // Søknadsperiode (foregående år) og arbeidsland
    await opprettSak.velgSøknadsperiode(`01.01.${FORRIGE_AAR}`, `31.12.${FORRIGE_AAR}`);
    await opprettSak.velgArbeidsland(EU_EOS_LAND.BULGARIA);

    await opprettSak.leggBehandlingIMine();
    await runAndWaitForProcessInstances(
      page.request,
      async () => {
        await opprettSak.klikkOpprettNyBehandling();
        await opprettSak.assertions.verifiserBehandlingOpprettet();
      }, { timeoutSeconds: 30 }
    );
    // Vent på at asynkrone prosessinstanser fra saksopprettelsen er ferdige
    await hovedside.goto();

    // Step 2: Open behandling
    console.log('Step 2: Opening behandling...');
    await hovedside.åpneBehandling(behandlingLenke);
    await page.waitForLoadState('networkidle');

    // Step 3: Medlemskap - Bekreft og fortsett
    console.log('Step 3: Confirming medlemskap...');
    await behandling.klikkBekreftOgFortsett();

    // Step 4: Arbeidsforhold
    console.log('Step 4: Selecting arbeidsforhold...');
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');

    // Step 5: Lovvalg - art.11(3)(b)
    console.log('Step 5: Selecting lovvalg...');
    await behandling.velgLovvalgsbestemmelse(EU_EOS_LOVVALG.ART_11_3_B);
    await behandling.klikkBekreftOgFortsett();

    // Step 6: Bekreft og fortsett (resultat)
    console.log('Step 6: Confirming resultat...');
    await behandling.klikkBekreftOgFortsett();

    // Step 7: Vedtak
    console.log('Step 7: Fatting vedtak...');
    // Step 8: Verifiser interim-oppførsel (se faglig notat øverst)
    console.log('Step 8: Verifying årsavregning cannot be created (interim behaviour)...');
    await runAndWaitForProcessInstances(
      page.request,
      () => vedtak.klikkFattVedtak(),
      { timeoutSeconds: 60 }
    );
    await hovedside.goto();

    await hovedside.åpneBehandling(behandlingLenke);

    // Årsavregningen opprettes nå automatisk, men er blokkert til togglen rulles ut.
    await behandling.assertions.verifiserÅrsavregningIkkeStøttet();
    console.log('✅ Bekreftet: Årsavregning er opprettet, men blokkert for denne sakstypen');

    // Uavhengig av 7828: selve LOVVALGSVEDTAKET (FØRSTEGANG-behandlingen) SKAL ha nådd
    // sin DB-sluttilstand. NB: URL-paramet behandlingID peker på den auto-opprettede
    // ÅRSAVREGNING-behandlingen (UNDER_BEHANDLING) etter re-åpning, så vi slår opp
    // FØRSTEGANG-behandlingen direkte i DB (cleanup-fixturen gir nøyaktig én per test).
    const lovvalgBehandlingId = await withDatabase(async (db) => {
      const rad = await db.queryOne<{ ID: number }>(
        "SELECT ID FROM BEHANDLING WHERE BEH_TYPE = 'FØRSTEGANG' ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY",
        {}
      );
      expect(rad, 'Forventet en FØRSTEGANG-lovvalgsbehandling i DB').not.toBeNull();
      return String(rad!.ID);
    });

    await verifiserBehandlingSluttilstand({
      behandlingId: lovvalgBehandlingId,
      forventetResultatType: 'FASTSATT_LOVVALGSLAND',
      forventetIverksettProsess: 'IVERKSETT_VEDTAK_EOS',
    });
    console.log('✅ Lovvalgsvedtaket er AVSLUTTET og iverksatt i DB');
  });
});
