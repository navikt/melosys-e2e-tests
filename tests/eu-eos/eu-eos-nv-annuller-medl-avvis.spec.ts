import {test} from '../../fixtures';
import {AuthHelper} from '../../helpers/auth-helper';
import {HovedsidePage} from '../../pages/hovedside.page';
import {OpprettNySakPage} from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {EuEosBehandlingPage} from '../../pages/behandling/eu-eos-behandling.page';
import {AnnulleringPage} from '../../pages/behandling/annullering.page';
import {USER_ID_VALID} from '../../pages/shared/constants';
import {waitForProcessInstances} from '../../helpers/api-helper';
import {withDatabase} from '../../helpers/db-helper';

/**
 * EU/EØS - Annullering av sak med sendt vedtak (MEDL-avvisning)
 *
 * Gap: nv-eos-annuller-medl-avvis (e2e-dekningshull, Tier 2). Ingen e2e dekket
 * annullering av en EU/EØS-sak som allerede har et sendt vedtak. Bug-tett område:
 * MELOSYS-7668 (en cron-jobb overskrev den avviste MEDL-perioden).
 *
 * Scenario:
 * 1. Fullfør en førstegangs utsendt-sak → vedtak (A009, MEDL-periode opprettes GYLD)
 * 2. Opprett en Nyvurdering
 * 3. Annuller saken (Behandlingsmeny → Avslutt behandling → Saken er annullert)
 * 4. Verifiser at annulleringen iverksettes korrekt:
 *    - fagsak satt til ANNULLERT
 *    - NV-behandlingen avsluttet med behandlingsresultat ANNULLERT
 *    - NV-lovvalgsperioden slettet; opprinnelig periode står igjen INNVILGET
 *    - MEDL-perioden avvist (status GYLD → AVST) ← kjernen i MELOSYS-7668
 *    - ANNULLER_SAK fullført uten feilede prosessinstanser
 *
 * Assertionene speiler backend-integrasjonstesten
 * `AnnuleringNyVurderingEøsOgTrygdeavtaleIT`, men verifiseres ende-til-ende
 * gjennom hele stacken (UI → api → prosessflyt → MEDL-mock).
 *
 * NB om X008: backloggen antok at en annullering sender en X008 (tilbaketrekking)
 * til utenlandsk institusjon. Det stemmer IKKE for denne flyten — ANNULLER_SAK-
 * prosessen sender ingen SED (verifisert i kode + driftet flyt: 0 nye SED-er ved
 * annullering). Utgående X008 sendes kun ved A012/A004-svar i en nyvurdering
 * (`sendGodkjenningArbeidFlereLand`/`sendAvslagUtpekingSvar` → invaliderer en
 * tidligere A004/A012), og innkommende X008→annullering er en egen mottaks-flyt.
 * Derfor asserterer denne testen ikke X008 — det ville vært en falsk-grønn vakt.
 */
const FRA = '01.01.2024';
const TIL = '31.12.2025';

test.describe('EU/EØS - Annullering (MEDL-avvisning)', () => {
    test('skal annullere sak med sendt vedtak og avvise MEDL-perioden', async ({page, request}) => {
        test.setTimeout(240000);

        const auth = new AuthHelper(page);
        await auth.login();

        const hovedside = new HovedsidePage(page);
        const opprettSak = new OpprettNySakPage(page);
        const behandling = new EuEosBehandlingPage(page);
        const annullering = new AnnulleringPage(page);

        // === DEL A: Førstegangs utsendt-sak → vedtak (A009, MEDL-periode opprettes) ===
        console.log('📝 Del A: Oppretter førstegangs utsendt-sak...');
        await hovedside.goto();
        await hovedside.klikkOpprettNySak();
        await opprettSak.fyllInnBrukerID(USER_ID_VALID);
        await opprettSak.velgSakstype('EU_EOS');
        await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
        await opprettSak.velgBehandlingstema('UTSENDT_ARBEIDSTAKER');
        await behandling.fyllInnFraTilDato(FRA, TIL);
        await behandling.velgLand('Danmark');
        await opprettSak.velgAarsak('SØKNAD');
        await opprettSak.leggBehandlingIMine();
        await opprettSak.klikkOpprettNyBehandling();

        await waitForProcessInstances(page.request, 30);
        await hovedside.goto();
        await hovedside.åpneBehandling('TRIVIELL KARAFFEL -');
        await page.waitForLoadState('networkidle');

        console.log('📝 Del A: Fullfører førstegangs behandling til vedtak...');
        await behandling.klikkBekreftOgFortsett();
        await behandling.velgYrkesaktivEllerSelvstendigOgFortsett(true);
        await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
        await behandling.velgArbeidstype(true);
        await behandling.svarJaOgFortsett();
        await behandling.svarJaOgFortsett();
        await behandling.innvilgeOgFattVedtak();

        console.log('📝 Del A: Venter på iverksetting av førstegangsvedtak...');
        await waitForProcessInstances(page.request, 60);

        // Hent MEDL-periode-id-en som førstegangsvedtaket opprettet (eneste rad etter rensing).
        const medlPeriodeId = await withDatabase(async (db) => {
            const lp = await db.queryOne<{ MEDLPERIODE_ID: number }>(
                `SELECT medlperiode_id FROM lovvalg_periode ORDER BY id DESC FETCH FIRST 1 ROWS ONLY`, {});
            if (!lp?.MEDLPERIODE_ID) {
                throw new Error('Fant ingen lovvalgsperiode med medlperiode_id etter førstegangsvedtak');
            }
            return lp.MEDLPERIODE_ID;
        });
        console.log(`📌 MEDL-periode opprettet: ${medlPeriodeId}`);
        // Forutsetning: perioden er GYLD (aktiv) før annullering — gjør AVST-sjekken til en reell delta.
        await annullering.assertions.verifiserMedlPeriodeGyldig(request, medlPeriodeId);

        // === DEL B: Opprett Nyvurdering ===
        console.log('📝 Del B: Oppretter nyvurdering...');
        await hovedside.goto();
        await hovedside.klikkOpprettNySak();
        await opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD');
        await waitForProcessInstances(page.request, 30);

        // Åpne den NYE aktive behandlingen (åpneBehandling tar nyeste lenke, med reload-retry)
        await hovedside.goto();
        await hovedside.åpneBehandling('TRIVIELL KARAFFEL -');
        await page.waitForLoadState('networkidle');

        // === DEL C: Annuller saken ===
        console.log('📝 Del C: Annullerer saken...');
        await annullering.annullerSak();

        console.log('📝 Del C: Venter på iverksetting av annullering (kaster ved feilede prosessinstanser)...');
        await waitForProcessInstances(page.request, 60);

        // === DEL D: Verifiser annulleringen ===
        await annullering.assertions.verifiserAnnulleringIverksatt(request, medlPeriodeId);

        console.log('✅ Annullering av EU/EØS-sak verifisert: fagsak ANNULLERT, MEDL-periode avvist');
    });
});
