import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { ArbeidFlereLandBehandlingPage } from '../../pages/behandling/arbeid-flere-land-behandling.page';
import { USER_ID_VALID, EU_EOS_LAND } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { createJournalpostForSak } from '../../helpers/mock-helper';

/**
 * EU/EØS SED A008 - Videresend søknad
 *
 * Denne testen dekker flyten der Norge mottar en søknad om medlemskap/lovvalg
 * for arbeid i flere land, men videresender søknaden til et annet land (Sverige)
 * fordi det landet er kompetent til å avgjøre saken.
 *
 * SED A008 er dokumenttypen som brukes for videresending av søknad.
 *
 * Arbeidsflyt:
 * 1. Opprett ny EU/EØS-sak (ARBEID_FLERE_LAND) med Norge og Sverige
 * 2. Bekreft første steg
 * 3. Velg "Annet" (kompetent land er et annet)
 * 4. Fyll inn kompetent land: "Sverige (SE)"
 * 5. Kryss av for "Oppgitt utenlandsk" og "Ikke registrert bosatt i Norge"
 * 6. Bekreft og fortsett
 * 7. Velg utenlandsk institusjon (SE:ACC12600)
 * 8. Klikk "Videresend søknad"
 *
 * @known-error - Videresend søknad-funksjonaliteten fungerer ikke. Testen brukes
 * for å verifisere og feilsøke funksjonaliteten.
 */
test.describe('EU/EØS SED A008 - Videresend søknad', () => {
  test('skal videresende søknad til Sverige', async ({ page }) => {
    // Øk test timeout til 120 sekunder
    test.setTimeout(120000);

    // Oppsett
    const auth = new AuthHelper(page);
    await auth.login();

    // Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const euEosBehandling = new EuEosBehandlingPage(page);
    const behandling = new ArbeidFlereLandBehandlingPage(page);

    // === STEG 1: Opprett sak ===
    console.log('🚀 Starter SED A008 Videresend søknad test');
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype('EU_EOS');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('ARBEID_FLERE_LAND');

    await euEosBehandling.fyllInnFraTilDato('01.01.2024', '31.12.2025');

    // Velg land: Norge og Sverige
    await euEosBehandling.velgLand(EU_EOS_LAND.NORGE);
    await euEosBehandling.velgAndreLand(EU_EOS_LAND.SVERIGE);

    // Velg årsak og opprett behandling
    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    // Vent på prosessinstanser
    console.log('📝 Venter på prosessinstanser...');
    await waitForProcessInstances(page.request, 30);

    // === HENT SAKSNUMMER FRA FAGSAK-SIDEN ===
    // Etter opprettelse navigeres vi til hovedsiden, så vi må klikke på fagsaken
    await page.waitForLoadState('networkidle');
    await hovedside.goto();
    await page.waitForLoadState('networkidle');

    // Klikk på personlenken for å gå til fagsak
    console.log('🔗 Klikker på fagsak-lenken...');
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    await page.waitForLoadState('networkidle');

    const fagsakUrl = page.url();
    console.log(`🔗 Fagsak URL: ${fagsakUrl}`);

    // Extract saksnummer from URL
    // URL format: /melosys/EU_EOS/saksbehandling/MEL-103/?behandlingID=120
    // Or: /melosys/fagsaker/MEL-103/...
    let saksnummer: string | null = null;
    const urlMatch = fagsakUrl.match(/(MEL-\d+)/);
    if (urlMatch) {
      saksnummer = urlMatch[1];
    }

    if (!saksnummer) {
      console.log('⚠️ Kunne ikke hente saksnummer fra URL');
      await page.screenshot({ path: 'test-results/debug-saksnummer-not-found.png' });
      throw new Error('Saksnummer ikke funnet i fagsak URL');
    }
    console.log(`📋 Saksnummer hentet: ${saksnummer}`);

    // === OPPRETT JOURNALPOST MED DOKUMENT ===
    // Videresend søknad krever minst ett vedlegg
    console.log('📎 Oppretter journalpost med dokument for saken...');
    const journalpostResult = await createJournalpostForSak(page.request, {
      fagsakId: saksnummer,
      brukerIdent: USER_ID_VALID,
      tittel: 'Søknad om A1 for utsendte arbeidstakere'
    });
    console.log(`✅ Journalpost opprettet: ${journalpostResult.journalpostId}`);

    // Vi er allerede på behandlingssiden fra tidligere klikk
    // Reload siden for å få med de nye dokumentene
    console.log('🔄 Laster siden på nytt for å hente dokumenter...');
    await page.reload();
    await page.waitForLoadState('networkidle');
    console.log(`🔗 Nå på behandling: ${page.url()}`);

    // === STEG 2-8: Fullfør videresend-flyten med POM ===
    console.log('📋 Starter videresend-flyt med POM');
    await behandling.fyllUtVideresendSøknad('Sverige (SE)', 'SE:ACC12600');

    console.log('✅ SED A008 Videresend søknad arbeidsflyt fullført');
  });
});
