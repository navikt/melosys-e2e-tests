import {expect, test} from '../../../fixtures';
import {AuthHelper} from '../../../helpers/auth-helper';
import {HovedsidePage} from '../../../pages/hovedside.page';
import {OpprettNySakPage} from '../../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {MedlemskapPage} from '../../../pages/behandling/medlemskap.page';
import {ArbeidsforholdPage} from '../../../pages/behandling/arbeidsforhold.page';
import {LovvalgPage} from '../../../pages/behandling/lovvalg.page';
import {ResultatPeriodePage} from '../../../pages/behandling/resultat-periode.page';
import {TrygdeavgiftPage} from '../../../pages/trygdeavgift/trygdeavgift.page';
import {VedtakPage} from '../../../pages/vedtak/vedtak.page';
import {USER_ID_VALID} from '../../../pages/shared/constants';
import {getYearFromDate, TestPeriods} from '../../../helpers/date-helper';
import {waitForProcessInstances} from '../../../helpers/api-helper';
import {withFaktureringDatabase} from '../../../helpers/pg-db-helper';
import {withDatabase} from '../../../helpers/db-helper';
import {FaktureringHelper} from '../../../helpers/fakturering-helper';
import {AnnulleringPage} from "../../../pages/behandling/annullering.page";

/**
 * Komplett saksflyt for FTRL-sak med flere land og arbeidsinntekt fra Norge
 *
 * Tester:
 * - Opprettelse av FTRL-sak (Folketrygdloven)
 * - Medlemskap: Flere land (ikke kjent hvilke), delvis dekning (helse/pensjon)
 * - Lovvalg: 2-8 forste ledd a med alle vilkar oppfylt
 * - Trygdeavgift: Ikke-skattepliktig, arbeidsinntekt fra Norge
 *   inkludert skatteforhold og inntektsperiode datoer
 * - Vedtak: Fullføring av saksflyt
 * - Faktura: Sett alle rader til BESTILT
 * - Nyvurdering: Endre skattestatus til skattepliktig
 * - Ingen trygdeavgiftsperioder for 2026 - avregning skal returnere q1 og q2 fakturalinjer
 */
test.describe('Komplett saksflyt - Flere land med arbeidsinntekt', () => {
    test('komplett førstegangsbehandling, automatisk opprettet årsavregning, nv annulerer også åpen årsavregning', async ({
                                                                                                                                                            page,
                                                                                                                                                            request
                                                                                                                                                        }) => {
        // Setup
        test.setTimeout(120000);
        const auth = new AuthHelper(page);
        await auth.login();

        // Page Objects
        const hovedside = new HovedsidePage(page);
        const opprettSak = new OpprettNySakPage(page);
        const medlemskap = new MedlemskapPage(page);
        const arbeidsforhold = new ArbeidsforholdPage(page);
        const lovvalg = new LovvalgPage(page);
        const resultatPeriode = new ResultatPeriodePage(page);
        const trygdeavgift = new TrygdeavgiftPage(page);
        const vedtak = new VedtakPage(page);
        const annullering = new AnnulleringPage(page)

        // Step 1: Create case
        console.log('Step 1: Creating new case...');
        await hovedside.gotoOgOpprettNySak();
        await opprettSak.opprettStandardSak(USER_ID_VALID);
        await opprettSak.assertions.verifiserBehandlingOpprettet();

        // Step 2: Open behandling
        console.log('Step 2: Opening behandling...');
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();

        // Step 3: Medlemskap - Flere land med delvis dekning
        const period = TestPeriods.yearBoundaryPeriod
        console.log(`Step 3: Filling medlemskap (${period.start} - ${period.end})...`);
        await medlemskap.velgPeriode(period.start, period.end);
        await medlemskap.velgFlereLandIkkeKjentHvilke();
        await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
        await medlemskap.klikkBekreftOgFortsett();

        // Step 4: Arbeidsforhold
        console.log('Step 4: Selecting arbeidsforhold...');
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        // Hent behandlingId fra URL
        const opprinneligBehandlingId = new URL(page.url()).searchParams.get('behandlingID');
        console.log(`OpprinneligBehandlingId: ${opprinneligBehandlingId}`);

        // Step 5: Lovvalg - 2-8 a med alle vilkar
        console.log('Step 5: Answering lovvalg questions...');
        await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
        await lovvalg.svarJaPaaFørsteSpørsmål();
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
        await lovvalg.klikkBekreftOgFortsett();

        // Step 6: Resultat Periode
        console.log('Step 6: Setting resultat periode...');
        await page.waitForTimeout(3000);
        await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

        // Step 7: Trygdeavgift - Ikke-skattepliktig med arbeidsinntekt fra Norge
        console.log('Step 7: Filling trygdeavgift...');
        await trygdeavgift.ventPåSideLastet();
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('10000');
        await trygdeavgift.klikkBekreftOgFortsett();

        // Step 8: Vedtak
        console.log('Step 8: Making decision...');
        await vedtak.klikkFattVedtak();

        // Step 9: Wait for processes and set faktura to BESTILT
        console.log('Step 9: Waiting for processes and updating faktura...');
        await waitForProcessInstances(page.request, 30);

        await withFaktureringDatabase(async (db) => {
            const updated = await db.execute("UPDATE faktura SET status = 'BESTILT'");
            console.log(`Updated ${updated} faktura rows to BESTILT`);
        });

        // Step 13: Opprett ny vurdering
        console.log('Step 13: Creating nyvurdering...');
        await hovedside.klikkOpprettNySak();
        await opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD');
        await waitForProcessInstances(page.request, 30);

        // Step 14: Åpne ny behandling
        console.log('Step 14: Opening new behandling...');
        await hovedside.goto();
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).first().click();

        // Hent behandlingId fra URL
        const behandlingId = new URL(page.url()).searchParams.get('behandlingID');
        console.log(`BehandlingId: ${behandlingId}`);

        // Step 15: Annuller saken
        console.log('Step 15: Annullering...');
        await annullering.annullerSak();
        await waitForProcessInstances(page.request, 30);

        console.log('✅ Workflow completed successfully!');

        // Hent årsavregningsbehandlingens ID fra databasen (automatisk opprettet, aldri åpnet i UI)
        const aarsavregningBehandlingId = await withDatabase(async (db) => {
            const result = await db.queryOne<{ ID: string }>(
                `SELECT b.id
                 FROM BEHANDLING b
                 JOIN FAGSAK s ON b.saksnummer = s.saksnummer
                 WHERE s.saksnummer = (SELECT saksnummer FROM BEHANDLING WHERE id = :id)
                   AND b.beh_type = 'ÅRSAVREGNING'`,
                {id: opprinneligBehandlingId}
            );
            return result?.ID;
        });
        console.log(`AarsavregningBehandlingId: ${aarsavregningBehandlingId}`);

        // Verifiserer at årsavregningsbehandlingen ble lukket med FERDIGBEHANDLET
        await withDatabase(async (db) => {
            const result = await db.queryOne<{ RESULTAT_TYPE: string }>(
                `SELECT RESULTAT_TYPE FROM BEHANDLINGSRESULTAT WHERE BEHANDLING_ID = :id`,
                {id: aarsavregningBehandlingId}
            );
            expect(
                result?.RESULTAT_TYPE,
                'Årsavregningsbehandlingen skal være lukket med FERDIGBEHANDLET'
            ).toBe('FERDIGBEHANDLET');
        });

        // Verifiserer at ny vurdering har avregnet innværende fakturalinjer

        const opprinneligFakturaserieReferanse = await withDatabase(async (db) => {
            const result = await db.queryOne<{ FAKTURASERIE_REFERANSE: string }>(
                `SELECT FAKTURASERIE_REFERANSE
                 FROM BEHANDLINGSRESULTAT
                 WHERE BEHANDLING_ID = :id`,
                {id: opprinneligBehandlingId}
            );
            return result?.FAKTURASERIE_REFERANSE;
        });

        const fakturaserieReferanse = await withDatabase(async (db) => {
            const result = await db.queryOne<{ FAKTURASERIE_REFERANSE: string }>(
                `SELECT FAKTURASERIE_REFERANSE
                 FROM BEHANDLINGSRESULTAT
                 WHERE BEHANDLING_ID = :id`,
                {id: behandlingId}
            );
            return result?.FAKTURASERIE_REFERANSE;
        });

        if (opprinneligFakturaserieReferanse === undefined || fakturaserieReferanse === undefined) {
            throw new Error(`Fakturaserie referanse er ikke satt. Opprinnelig: ${opprinneligFakturaserieReferanse} (behandlingId: ${opprinneligBehandlingId}), Ny: ${fakturaserieReferanse} (behandlingId: ${behandlingId})`);
        }

        const faktureringHelper = new FaktureringHelper(request);
        const opprinneligFakturaserie = await faktureringHelper.hentFakturaserie(opprinneligFakturaserieReferanse);
        const fakturaserie = await faktureringHelper.hentFakturaserie(fakturaserieReferanse);

        faktureringHelper.loggFakturaserie(opprinneligFakturaserie);
        faktureringHelper.loggFakturaserie(fakturaserie);

        const avregningsÅr = getYearFromDate(period.end)
        const opprinneligTotal = faktureringHelper.totalBelop(opprinneligFakturaserie, avregningsÅr);
        const nyTotal = faktureringHelper.totalBelop(fakturaserie, avregningsÅr);
        const sum = opprinneligTotal + nyTotal;

        console.log(`Opprinnelig serie: ${opprinneligTotal} kr`);
        console.log(`Ny serie: ${nyTotal} kr`);

        expect(sum, `Sum av fakturaserier for ${avregningsÅr} skal være 0`).toBe(0);
    });
});
