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
import { hentBrevForSak } from '../../helpers/brev-helper';
import { hentSaksnummerFraUrl } from '../../helpers/url-helper';
import { verifiserAarsavregningBehandling } from '../../pages/behandling/aarsavregning.assertions';

/**
 * Komplett saksflyt for EØS Medlemskap Lovvalg - Offentlig tjenesteperson art.11(3)(b)
 *
 * Tester:
 * - Opprettelse av EU_EOS-sak med sakstema MEDLEMSKAP_LOVVALG og behandlingstema ARBEID_TJENESTEPERSON_ELLER_FLY
 * - Medlemskap: Bulgaria som arbeidsland
 * - Arbeidsforhold: Velg arbeidsgiver
 * - Lovvalg: Rfo. 883/2004 art.11(3)(b)
 * - Vedtak: Fullføring av saksflyt
 * - Årsavregningen for foregående år opprettes, med innhentingsbrev, men er blokkert
 *
 * NB (faglig, MELOSYS-8163): Vedtaket oppretter årsavregningen og sender innhentingsbrevet med
 * lovvalgsperioden for året. Det skjer uavhengig av melosys.arsavregning.eos_tjenesteperson.
 * Togglen styrer bare selve årsavregningsflyten. Den er av i produksjon, så saksbehandleren
 * møter en blokkerende melding og kommer ikke videre. Testen verifiserer den tilstanden.
 * Tilstanden med togglen på står som test.fixme nederst.
 */
test.describe('EØS Medlemskap Lovvalg - Offentlig tjenesteperson 11.3b', () => {
  test('vedtak for foregående år oppretter årsavregning og sender innhentingsbrev med lovvalgsperioden, men årsavregningen er blokkert', async ({ page }) => {
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
    const saksnummer = hentSaksnummerFraUrl(page.url());

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
    // Step 8: Verifiser at årsavregningen opprettes, men er blokkert (se faglig notat øverst)
    console.log('Step 8: Verifying årsavregning is created but blocked...');
    await runAndWaitForProcessInstances(
      page.request,
      () => vedtak.klikkFattVedtak(),
      { timeoutSeconds: 60 }
    );
    await hovedside.goto();

    await hovedside.åpneBehandling(behandlingLenke);

    // Årsavregningen opprettes nå automatisk, men er blokkert til togglen rulles ut.
    // Meldingen rendres i dag bare fra årsavregningsstegene, så den impliserer isolert sett at
    // behandlingen finnes. DB-sjekken er en regresjonspinne: flyttes meldingen senere til et
    // steg som vises uten en årsavregning, fanger den at behandlingen faktisk ble opprettet.
    await behandling.assertions.verifiserÅrsavregningIkkeStøttet();
    console.log('✅ Bekreftet: Årsavregning er opprettet, men blokkert for denne sakstypen');

    // Selve LOVVALGSVEDTAKET (FØRSTEGANG-behandlingen) SKAL ha nådd
    // sin DB-sluttilstand. NB: URL-paramet behandlingID peker på den auto-opprettede
    // ÅRSAVREGNING-behandlingen (UNDER_BEHANDLING) etter re-åpning, så vi slår opp
    // FØRSTEGANG-behandlingen direkte i DB (cleanup-fixturen gir nøyaktig én per test).
    const { lovvalgBehandlingId, aarsavregningId } = await withDatabase(async (db) => {
      const rad = await db.queryOne<{ ID: number }>(
        "SELECT ID FROM BEHANDLING WHERE BEH_TYPE = 'FØRSTEGANG' ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY",
        {}
      );
      expect(rad, 'Forventet en FØRSTEGANG-lovvalgsbehandling i DB').not.toBeNull();

      // Årsavregningen opprettes av vedtaket, altså etter lovvalgsbehandlingen. Scopet på
      // ID > lovvalgsbehandlingen: cleanup-fixturen svelger en feilet DB-opprydding og lar
      // kjøringen gå videre, så et usikret oppslag kan treffe forrige tests rad.
      const aarsavregning = await db.queryOne<{ ID: number }>(
        `SELECT ID FROM BEHANDLING
         WHERE BEH_TYPE = 'ÅRSAVREGNING' AND ID > :lovvalgId
         ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY`,
        { lovvalgId: rad!.ID }
      );
      expect(
        aarsavregning,
        'Årsavregningen skal være opprettet automatisk av vedtaket'
      ).not.toBeNull();

      return { lovvalgBehandlingId: String(rad!.ID), aarsavregningId: String(aarsavregning!.ID) };
    });

    await verifiserBehandlingSluttilstand({
      behandlingId: lovvalgBehandlingId,
      forventetResultatType: 'FASTSATT_LOVVALGSLAND',
      forventetIverksettProsess: 'IVERKSETT_VEDTAK_EOS',
    });
    console.log('✅ Lovvalgsvedtaket er AVSLUTTET og iverksatt i DB');

    await verifiserAarsavregningBehandling(aarsavregningId, {
      forventetStatus: 'UNDER_BEHANDLING',
      forventetResultatType: 'IKKE_FASTSATT',
      forventetAar: FORRIGE_AAR,
    });

    // Perioden flettes inn når brevet produseres og står ikke i prosessinstansen, så den må leses
    // fra PDF-en. Malen utelater hele periodesetningen når mapperen ikke finner perioder. Det var
    // tilfellet før MELOSYS-8163, da mapperen leste medlemskapsperiodene, som tjenesteperson ikke har.
    const brevkode = 'innhenting_av_inntektsopplysninger';
    await expect
      .poll(async () => (await hentBrevForSak(page.request, saksnummer, brevkode)).length, {
        message: `Venter på ett arkivert innhentingsbrev på ${saksnummer}`,
        timeout: 30_000,
      })
      .toBe(1);
    const [brev] = await hentBrevForSak(page.request, saksnummer, brevkode);
    expect(brev.mottakerId, 'Innhentingsbrevet skal gå til bruker').toBe(USER_ID_VALID);
    expect(brev.tekst).toContain(`Du må sende oss inntektsopplysninger for ${FORRIGE_AAR}`);
    expect(brev.tekst).toContain(
      `Perioden du skal sende opplysninger for er 1. januar ${FORRIGE_AAR} - 31. desember ${FORRIGE_AAR}.`
    );
    console.log('✅ Innhentingsbrevet er sendt til bruker med lovvalgsperioden for året');
  });

  // Med melosys.arsavregning.eos_tjenesteperson på skal årsavregningen kunne fullføres. Det går
  // ikke ennå, fordi skjemaet «Endelig beregnet trygdeavgift» ikke støtter lovvalgsperioder
  // (melosys-web logger «Lovvalgsperioder er ikke støttet enda» ved innlasting). Sett lokalt
  // 15.09.2026 med togglen på:
  // - «Innbetalt trygdeavgift» er tomt, og «Tidligere grunnlag» finner ingen informasjon.
  // - «Beregn trygdeavgiften»: «Bestemmelse» har bare «Velg…», og steget kommer ikke videre.
  // - «Oppgi beløp for beregnet trygdeavgift»: vedtaket fattes, og årsavregningen blir AVSLUTTET
  //   uten feil.
  // Støtten kommer i MELOSYS-6837 og MELOSYS-6815 (epic MELOSYS-6834). Skriv testen da.
  test.fixme('skal kunne fullføre årsavregningen når togglen for tjenesteperson er på', async () => {});
});
