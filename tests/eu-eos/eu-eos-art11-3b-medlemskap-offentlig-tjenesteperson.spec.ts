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
import { waitForProcessInstances } from '../../helpers/api-helper';
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
 * - Verifisering: Årsavregning kan ikke opprettes ennå for denne sakstypen
 *
 * NB (faglig, jf. MELOSYS-7828): For EU_EOS/MEDLEMSKAP_LOVVALG/ARBEID_TJENESTEPERSON_ELLER_FLY
 * med lovvalgsbestemmelse FO_883_2004_ART11_3B for foregående år SKAL Melosys etter hvert
 * opprette årsavregning automatisk. Den funksjonaliteten er enda ikke på plass for denne
 * sakstypen (jf. Jira-kommentar 2026-04-27 "blir ikke automatisk opprettet enda"), så testen
 * verifiserer den nåværende interim-oppførselen: varselet "Du kan ikke årsavregne disse type
 * saker i Melosys enda". Når MELOSYS-7828 implementeres for denne sakstypen må assertionen
 * snus til å verifisere at årsavregning faktisk opprettes (slik ftrl-pensjonist-testen gjør).
 */
test.describe('EØS Medlemskap Lovvalg - Offentlig tjenesteperson 11.3b', () => {
  test('skal fullføre sak og verifisere at årsavregning ikke kan opprettes', async ({ page }) => {
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
    await opprettSak.klikkOpprettNyBehandling();
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Vent på at asynkrone prosessinstanser fra saksopprettelsen er ferdige
    console.log('Venter på prosessinstanser etter saksopprettelse...');
    await waitForProcessInstances(page.request, 30);
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
    await vedtak.klikkFattVedtak();

    // Step 8: Verifiser interim-oppførsel (se faglig notat øverst)
    console.log('Step 8: Verifying årsavregning cannot be created (interim behaviour)...');
    await waitForProcessInstances(page.request, 60);
    await hovedside.goto();

    await hovedside.åpneBehandling(behandlingLenke);

    // Interim-oppførsel (gated på MELOSYS-7828): årsavregning kan ikke opprettes enda.
    await behandling.assertions.verifiserKanIkkeÅrsavregneEnda();
    console.log('✅ Bekreftet: Årsavregning kan ikke opprettes for denne sakstypen (enda)');

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
