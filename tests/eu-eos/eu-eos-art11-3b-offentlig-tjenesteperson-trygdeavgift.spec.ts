import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { TrygdeavgiftPage } from '../../pages/trygdeavgift/trygdeavgift.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import {
  USER_ID_VALID,
  SAKSTYPER,
  SAKSTEMA,
  BEHANDLINGSTEMA,
  AARSAK,
  EU_EOS_LAND,
  EU_EOS_LOVVALG,
} from '../../pages/shared/constants';
import { TestPeriods } from '../../helpers/date-helper';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { verifiserBehandlingSluttilstand } from '../../pages/shared/behandling-sluttilstand.assertions';
import { withDatabase } from '../../helpers/db-helper';

/**
 * EØS Medlemskap Lovvalg - Offentlig tjenesteperson art.11(3)(b) MED trygdeavgift
 *
 * Utvider den eksisterende offentlig tjenesteperson-testen med trygdeavgift-steget
 * som nå er tilgjengelig i behandlingsflyten for denne sakstypen.
 *
 * Flyten:
 *   Saksopprettelse (EU_EOS / MEDLEMSKAP_LOVVALG / ARBEID_TJENESTEPERSON_ELLER_FLY)
 *     → Medlemskap (bekreft)
 *     → Arbeidsforhold (velg arbeidsgiver)
 *     → Lovvalg (Rfo. 883/2004 art.11(3)(b))
 *     → Resultat (bekreft)
 *     → Trygdeavgift (ikke skattepliktig, arbeidsinntekt, bruttoinntekt)
 *     → Vedtak (fatt vedtak)
 *     → Verifisering (DB sluttilstand)
 *
 * Perioden MÅ inkludere inneværende år for at trygdeavgift-steget skal vise
 * inputfelt (ellers vises kun "skal fastsettes på årsavregning"-meldingen).
 */
const BRUTTOINNTEKT = '45000';

test.describe('EØS Medlemskap Lovvalg - Offentlig tjenesteperson 11.3b med trygdeavgift', () => {
  test('skal fullføre sak med trygdeavgift og fatte vedtak', async ({ page }) => {
    test.setTimeout(150000);

    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    // Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new EuEosBehandlingPage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);

    // Perioden må inkludere inneværende år for at trygdeavgift-steget
    // skal vise felter i stedet for årsavregning-varselet.
    const period = TestPeriods.fullCurrentYearPeriod;

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

    // Søknadsperiode (inneværende år) og arbeidsland
    await opprettSak.velgSøknadsperiode(period.start, period.end);
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
    // Etter lovvalg navigeres det direkte til Trygdeavgift (ingen separat Resultat-steg
    // for denne sakstypen med periode i inneværende år).
    console.log('Step 5: Selecting lovvalg...');
    await behandling.velgLovvalgsbestemmelse(EU_EOS_LOVVALG.ART_11_3_B);
    await behandling.klikkBekreftOgFortsett();

    // Step 6: Trygdeavgift
    console.log('Step 6: Filling trygdeavgift...');
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(BRUTTOINNTEKT);
    await trygdeavgift.klikkBekreftOgFortsett();

    // Step 7: Vedtak
    console.log('Step 7: Fatting vedtak...');
    await vedtak.klikkFattVedtak();

    // Step 8: Verifiser DB-sluttilstand
    console.log('Step 8: Verifying DB state...');
    await waitForProcessInstances(page.request, 60);

    // Slå opp FØRSTEGANG-behandlingen i DB (cleanup-fixturen gir nøyaktig én per test)
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

    // Verifiser at trygdeavgift ble lagret (FORELØPIG)
    await withDatabase(async (db) => {
      const resultat = await db.queryOne<{ TRYGDEAVGIFT_TYPE: string }>(
        `SELECT TRYGDEAVGIFT_TYPE
         FROM BEHANDLINGSRESULTAT
         WHERE BEHANDLING_ID = :id`,
        { id: lovvalgBehandlingId }
      );
      expect(resultat, 'Forventet behandlingsresultat med trygdeavgift i DB').not.toBeNull();
      expect(resultat!.TRYGDEAVGIFT_TYPE, 'Trygdeavgift skal være FORELØPIG (forskudd)').toBe('FORELØPIG');
      console.log(`✅ Trygdeavgift: ${resultat!.TRYGDEAVGIFT_TYPE}`);
    });
  });
});
