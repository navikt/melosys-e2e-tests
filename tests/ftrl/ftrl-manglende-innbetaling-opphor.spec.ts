import {expect, test} from '../../fixtures';
import {AuthHelper} from '../../helpers/auth-helper';
import {HovedsidePage} from '../../pages/hovedside.page';
import {OpprettNySakPage} from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {MedlemskapPage} from '../../pages/behandling/medlemskap.page';
import {ArbeidsforholdPage} from '../../pages/behandling/arbeidsforhold.page';
import {LovvalgPage} from '../../pages/behandling/lovvalg.page';
import {ResultatPeriodePage} from '../../pages/behandling/resultat-periode.page';
import {TrygdeavgiftPage} from '../../pages/trygdeavgift/trygdeavgift.page';
import {VedtakPage} from '../../pages/vedtak/vedtak.page';
import {ManglendeInnbetalingPage} from '../../pages/behandling/manglende-innbetaling.page';
import {USER_ID_VALID, TIMEOUT_LONG} from '../../pages/shared/constants';
import {TestPeriods} from '../../helpers/date-helper';
import {waitForProcessInstances} from '../../helpers/api-helper';
import {getFakturaserieReferanse, withDatabase} from '../../helpers/db-helper';
import {FaktureringHelper} from '../../helpers/fakturering-helper';

/**
 * FTRL manglende innbetaling av trygdeavgift → opphør av frivillig medlemskap (§ 2-15 andre ledd)
 *
 * Gap: ftrl-manglende-innbetaling-opphor. Verifiserer hele kjeden fra ubetalt faktura til
 * opphørsvedtak:
 *
 *   frivillig medlemskap § 2-8 første ledd a (vedtak + fakturaserie)
 *     → faktura BESTILT + simulert manglende innbetaling (faktureringskomponenten admin-API)
 *     → Kafka ManglendeFakturabetalingMelding → melosys-api oppretter automatisk behandling
 *       MANGLENDE_INNBETALING_TRYGDEAVGIFT (årsak MELDING_OM_MANGLENDE_INNBETALING,
 *       prosess OPPRETT_NY_BEHANDLING_MANGLENDE_INNBETALING: oppgave + varselbrev)
 *     → UI: steg «Manglende innbetaling» → innbetaling mangler for HELE perioden
 *       → «Opphør av frivillig medlemskap etter § 2-15» → Fatt vedtak
 *     → behandling AVSLUTTET, resultat OPPHØRT, fagsak OPPHØRT, fakturaserie KANSELLERT
 *
 * Flyt og DB-fasit verifisert live 2026-06-11 (sak MEL-40, behandling 54→55), se
 * .claude/worker-briefs/gap-ftrl-manglende-innbetaling-opphor.progress.md.
 *
 * Forutsetninger i stacken (begge compose-filene):
 *   - faktureringskomponenten: NAIS_CLUSTER_NAME=dev-gcp (åpner admin-endepunktene)
 *   - faktureringskomponenten: KAFKA_TOPIC_NAME_MANGLENDE_FAKTURABETALING=
 *     teammelosys.manglende-fakturabetaling-local (samme topic som melosys-api lytter på)
 *
 * @expect-docker-errors fordi: opphørsvedtak-steget i melosys-web (VurderingVedtakOpphoer)
 * autolagrer fritekst via POST /api/behandlinger/{id}/resultat/fritekst med KUN
 * begrunnelseFritekst i payloaden. LagreFritekstDto.innledningFritekst blir null, og
 * BehandlingsresultatService.oppdaterFritekster (Kotlin, non-null String-parameter) kaster
 * NullPointerException → 500 ERROR i melosys-api-loggen. UI og flyt er upåvirket (kjent
 * frontend/backend-kontraktsbug). Å fylle friteksten i editoren hjelper IKKE — feltet
 * innledningFritekst mangler alltid i requesten, uavhengig av innhold.
 */
test.describe('FTRL manglende innbetaling - opphør av frivillig medlemskap § 2-15', () => {
    test('skal opprette manglende-innbetaling-behandling automatisk og fatte opphørsvedtak @expect-docker-errors', async ({page, request}) => {
        test.setTimeout(240000);

        // Setup
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
        const manglendeInnbetaling = new ManglendeInnbetalingPage(page);
        const faktureringHelper = new FaktureringHelper(request);

        // === DEL 1: Bygg frivillig § 2-8a-sak med fakturaserie (speiler komplett-sak-2-8a) ===

        console.log('📝 Steg 1: Oppretter ny FTRL-sak...');
        await hovedside.gotoOgOpprettNySak();
        await opprettSak.opprettStandardSak(USER_ID_VALID);
        await opprettSak.assertions.verifiserBehandlingOpprettet();

        console.log('📝 Steg 2: Åpner behandling...');
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();

        const period = TestPeriods.standardPeriod;
        console.log(`📝 Steg 3: Fyller medlemskap (${period.start} - ${period.end})...`);
        await medlemskap.velgPeriode(period.start, period.end);
        await medlemskap.velgLand('Afghanistan');
        await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
        await medlemskap.klikkBekreftOgFortsett();

        console.log('📝 Steg 4: Velger arbeidsforhold...');
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        // Behandlings-ID fra URL for DB-oppslag
        const opprinneligBehandlingId = new URL(page.url()).searchParams.get('behandlingID');
        expect(opprinneligBehandlingId, 'behandlingID skal finnes i URL').not.toBeNull();
        console.log(`📋 Opprinnelig behandlingId: ${opprinneligBehandlingId}`);

        console.log('📝 Steg 5: Svarer på § 2-8 første ledd a lovvalg-spørsmål...');
        await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
        await lovvalg.svarJaPaaFørsteSpørsmål();
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
        await lovvalg.klikkBekreftOgFortsett();

        console.log('📝 Steg 6: Setter resultat-periode til INNVILGET...');
        await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

        console.log('📝 Steg 7: Fyller trygdeavgift...');
        await trygdeavgift.ventPåSideLastet();
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
        await trygdeavgift.velgBetalesAga(false);
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
        await trygdeavgift.klikkBekreftOgFortsett();

        console.log('📝 Steg 8: Fatter vedtak (frivillig medlemskap innvilget)...');
        await vedtak.klikkFattVedtak();
        await waitForProcessInstances(page.request, 60);

        // === DEL 2: Faktura BESTILT + simuler manglende innbetaling ===

        const fakturaserieReferanse = await getFakturaserieReferanse(opprinneligBehandlingId);
        expect(fakturaserieReferanse, 'FAKTURASERIE_REFERANSE skal være satt på behandlingsresultatet').toBeTruthy();
        console.log(`📋 FakturaserieReferanse: ${fakturaserieReferanse}`);

        const serie = await faktureringHelper.hentFakturaserie(fakturaserieReferanse!);
        faktureringHelper.loggFakturaserie(serie);
        const opprettetFaktura = faktureringHelper.fakturaerMedStatus(serie, 'OPPRETTET')[0];
        expect(opprettetFaktura, 'Forventet minst én faktura med status OPPRETTET i serien').toBeTruthy();

        console.log('📝 Steg 9: Setter faktura BESTILT og simulerer manglende innbetaling...');
        await faktureringHelper.settFakturaStatus(opprettetFaktura.fakturaReferanse, 'BESTILT');
        await faktureringHelper.simulerManglendeInnbetaling(opprettetFaktura.fakturaReferanse, 0);

        // === DEL 3: Vent på automatisk opprettet MANGLENDE_INNBETALING_TRYGDEAVGIFT-behandling ===

        console.log('📝 Steg 10: Venter på automatisk opprettet behandling...');
        const nyBehandling = await ventPaaManglendeInnbetalingBehandling(opprinneligBehandlingId!);
        console.log(`📋 Ny behandling: ${nyBehandling.ID} (sak ${nyBehandling.SAKSNUMMER})`);

        // La opprettelses-prosessen (oppgave + varselbrev) kjøre ferdig
        await waitForProcessInstances(page.request, 30);

        await withDatabase(async (db) => {
            const aarsak = await db.queryOne<{ AARSAK_TYPE: string }>(
                'SELECT AARSAK_TYPE FROM BEHANDLINGSAARSAK WHERE BEHANDLING_ID = :id',
                {id: nyBehandling.ID}
            );
            expect(aarsak?.AARSAK_TYPE, 'Behandlingsårsak skal være MELDING_OM_MANGLENDE_INNBETALING')
                .toBe('MELDING_OM_MANGLENDE_INNBETALING');

            const oppgaveId = await db.queryOne<{ OPPGAVE_ID: number }>(
                'SELECT OPPGAVE_ID FROM BEHANDLING WHERE ID = :id',
                {id: nyBehandling.ID}
            );
            expect(oppgaveId?.OPPGAVE_ID, 'Behandlingen skal ha fått en oppgave (OPPGAVE_ID)').toBeTruthy();

            const prosesser = await db.query<{ PROSESS_TYPE: string; STATUS: string; SIST_FULLFORT_STEG: string }>(
                `SELECT PROSESS_TYPE, STATUS, SIST_FULLFORT_STEG
                 FROM PROSESSINSTANS
                 WHERE BEHANDLING_ID = :id`,
                {id: nyBehandling.ID}
            );
            const opprettProsess = prosesser.find(p => p.PROSESS_TYPE === 'OPPRETT_NY_BEHANDLING_MANGLENDE_INNBETALING');
            expect(opprettProsess, 'Forventet prosessinstans OPPRETT_NY_BEHANDLING_MANGLENDE_INNBETALING').toBeTruthy();
            expect(opprettProsess!.STATUS, 'Opprettelses-prosessen skal være FERDIG').toBe('FERDIG');
            expect(opprettProsess!.SIST_FULLFORT_STEG, 'Siste steg skal være varselbrev-utsending')
                .toBe('SEND_MANGLENDE_INNBETALING_VARSELBREV');

            // Varselbrevet (varsel_manglende_innbetaling) journalføres+distribueres i egen prosess
            const brevProsess = prosesser.find(p => p.PROSESS_TYPE === 'OPPRETT_OG_DISTRIBUER_BREV');
            expect(brevProsess, 'Forventet OPPRETT_OG_DISTRIBUER_BREV (varselbrev) på behandlingen').toBeTruthy();
            expect(brevProsess!.STATUS, 'Varselbrev-prosessen skal være FERDIG').toBe('FERDIG');

            console.log(`✅ Auto-opprettelse verifisert: årsak, oppgave, ${prosesser.length} prosessinstanser`);
        });

        // === DEL 4: UI - driv behandlingen til opphørsvedtak ===

        console.log('📝 Steg 11: Åpner den nye behandlingen via søk...');
        await hovedside.goto();
        await hovedside.søkEtterBruker(nyBehandling.SAKSNUMMER);
        const behandlingsLenke = page.locator(`a[href*="behandlingID=${nyBehandling.ID}"]`).first();
        await behandlingsLenke.waitFor({state: 'visible', timeout: TIMEOUT_LONG});
        await behandlingsLenke.click();

        console.log('📝 Steg 12: Velger «hele medlemskapsperioden» og går til opphørsvedtak...');
        await manglendeInnbetaling.ventPaaSteg();
        await manglendeInnbetaling.velgInnbetalingManglerHelePerioden();
        await manglendeInnbetaling.bekreftOgGaaTilOpphoersvedtak();

        console.log('📝 Steg 13: Fatter opphørsvedtak...');
        await vedtak.klikkFattVedtak();
        await waitForProcessInstances(page.request, 60);

        // === DEL 5: Slutt-tilstand - behandling, fagsak og fakturaserie ===

        await withDatabase(async (db) => {
            const behandling = await db.queryOne<{ STATUS: string }>(
                'SELECT STATUS FROM BEHANDLING WHERE ID = :id',
                {id: nyBehandling.ID}
            );
            expect(behandling?.STATUS, 'Behandlingen skal være AVSLUTTET').toBe('AVSLUTTET');

            const resultat = await db.queryOne<{ RESULTAT_TYPE: string }>(
                'SELECT RESULTAT_TYPE FROM BEHANDLINGSRESULTAT WHERE BEHANDLING_ID = :id',
                {id: nyBehandling.ID}
            );
            expect(resultat?.RESULTAT_TYPE, 'Behandlingsresultat skal være OPPHØRT').toBe('OPPHØRT');

            const fagsak = await db.queryOne<{ STATUS: string }>(
                'SELECT STATUS FROM FAGSAK WHERE SAKSNUMMER = :saksnummer',
                {saksnummer: nyBehandling.SAKSNUMMER}
            );
            expect(fagsak?.STATUS, 'Fagsaken skal være OPPHØRT').toBe('OPPHØRT');

            const prosesser = await db.query<{ PROSESS_TYPE: string; STATUS: string }>(
                `SELECT PROSESS_TYPE, STATUS
                 FROM PROSESSINSTANS
                 WHERE BEHANDLING_ID = :id`,
                {id: nyBehandling.ID}
            );
            for (const p of prosesser) {
                expect(p.STATUS, `Prosess ${p.PROSESS_TYPE} skal være FERDIG`).toBe('FERDIG');
            }
            const iverksett = prosesser.find(p => p.PROSESS_TYPE === 'IVERKSETT_VEDTAK_FTRL');
            expect(iverksett, 'Forventet IVERKSETT_VEDTAK_FTRL-prosessinstans for opphørsvedtaket').toBeTruthy();

            console.log(`✅ Opphør verifisert: behandling AVSLUTTET / OPPHØRT, fagsak OPPHØRT, ${prosesser.length} prosesser FERDIG`);
        });

        // Iverksettingen skal kansellere fakturaserien i faktureringskomponenten
        const serieEtterOpphoer = await faktureringHelper.hentFakturaserie(fakturaserieReferanse!);
        expect(serieEtterOpphoer.status, 'Fakturaserien skal være KANSELLERT etter opphørsvedtaket').toBe('KANSELLERT');
        console.log(`✅ Fakturaserie ${fakturaserieReferanse} KANSELLERT`);

        console.log('✅ Komplett manglende innbetaling → opphør-flyt fullført');
    });

    /**
     * Poll på at melosys-api har opprettet MANGLENDE_INNBETALING_TRYGDEAVGIFT-behandlingen
     * (Kafka-konsumering + prosess tar normalt ~5 sekunder)
     */
    async function ventPaaManglendeInnbetalingBehandling(
        opprinneligBehandlingId: string,
        timeoutMs = 60000
    ): Promise<{ ID: number; SAKSNUMMER: string }> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const behandling = await withDatabase(async (db) =>
                db.queryOne<{ ID: number; SAKSNUMMER: string }>(
                    `SELECT ID, SAKSNUMMER
                     FROM BEHANDLING
                     WHERE BEH_TYPE = 'MANGLENDE_INNBETALING_TRYGDEAVGIFT'
                       AND OPPRINNELIG_BEHANDLING_ID = :id`,
                    {id: opprinneligBehandlingId}
                )
            );
            if (behandling) {
                return behandling;
            }
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        throw new Error(
            `Ingen MANGLENDE_INNBETALING_TRYGDEAVGIFT-behandling ble opprettet for behandling ` +
            `${opprinneligBehandlingId} innen ${timeoutMs}ms - kom Kafka-meldingen frem til melosys-api?`
        );
    }
});
