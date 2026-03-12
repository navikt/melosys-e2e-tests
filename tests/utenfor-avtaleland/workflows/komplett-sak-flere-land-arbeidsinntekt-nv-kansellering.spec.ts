import {test} from '../../../fixtures';
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
import {waitForProcessInstances} from '../../../helpers/api-helper';
import {withFaktureringDatabase} from '../../../helpers/pg-db-helper';
import {AnnulleringPage} from "../../../pages/behandling/annullering.page";
import {withDatabase} from "../../../helpers/db-helper";
import {FaktureringHelper} from "../../../helpers/fakturering-helper";
import {expect} from "@playwright/test";
import {AarsavregningPage} from "../../../pages/behandling/aarsavregning.page";

/**
 * Komplett saksflyt for FTRL-sak med flere land og pensjon-dekning,
 * etterfulgt av ny vurdering som annulleres.
 *
 * Tester:
 * - Opprettelse av FTRL-sak (Folketrygdloven)
 * - Medlemskap: Flere land (ikke kjent hvilke), delvis dekning (pensjon)
 * - Lovvalg: § 2-8 første ledd a med alle vilkår oppfylt
 * - Trygdeavgift: Ikke-skattepliktig, arbeidsinntekt fra Norge
 * - Vedtak: Fullføring av saksflyt
 * - Faktura: Sett alle rader til BESTILT
 * - Ny vurdering: Opprett og annuller (kansellering)
 */
test.describe('Komplett saksflyt - Flere land med pensjon-dekning og NV-kansellering', () => {
    test('skal fullføre sak med flere land, pensjon-dekning, deretter NV som annulleres', async ({page, request}) => {
        test.setTimeout(120000);

        // Setup
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
        const annullering = new AnnulleringPage(page);
        const arsavregning = new AarsavregningPage(page);

        // Step 1: Opprett sak
        console.log('Step 1: Creating new case...');
        await hovedside.gotoOgOpprettNySak();
        await opprettSak.opprettStandardSak(USER_ID_VALID);
        await opprettSak.assertions.verifiserBehandlingOpprettet();

        // Step 2: Åpne behandling
        console.log('Step 2: Opening behandling...');
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();

        // Step 3: Medlemskap - Flere land med pensjon-dekning
        console.log('Step 3: Filling medlemskap (01.01.2025 - 31.07.2026)...');
        await medlemskap.velgPeriode('01.01.2025', '31.07.2026');
        await medlemskap.velgFlereLandIkkeKjentHvilke();
        await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_B_PENSJON');
        await medlemskap.klikkBekreftOgFortsett();

        // Step 4: Arbeidsforhold
        console.log('Step 4: Selecting arbeidsforhold...');
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        // Step 5: Lovvalg - § 2-8 a med alle vilkår oppfylt
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

        // Hent behandlingId fra URL
        const opprinneligBehandlingId = new URL(page.url()).searchParams.get('behandlingID');
        console.log(`OpprinneligBehandlingId: ${opprinneligBehandlingId}`);

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

        // Step 9: Vent på prosesser
        console.log('Step 9: Waiting for processes...');
        await waitForProcessInstances(page.request, 30);

        // Step 11: Søk opp bruker og åpne årsavregningsbehandling
        console.log('Step 11: Opening årsavregning behandling...');
        await hovedside.goto();
        await hovedside.søkEtterBruker(USER_ID_VALID);
        await page.getByRole('link', {name: 'Yrkesaktiv - Årsavregning'}).getByRole('button').click();

        // Step 12: Fyll ut årsavregning
        console.log('Step 12: Filling årsavregning...');
        await arsavregning.svarNei();
        await arsavregning.velgSkattepliktig(false);
        await arsavregning.velgInntektskilde('ARBEIDSINNTEKT_FRA_NORGE');
        await arsavregning.fyllInnBruttoinntektMedApiVent('20000');
        await arsavregning.klikkBekreftOgFortsett();

        // Hent behandlingId fra URL
        const arsavregningBehandlingId = new URL(page.url()).searchParams.get('behandlingID');
        console.log(`ArsavregningBehandlingId: ${arsavregningBehandlingId}`);

        // Step 13: Fatt vedtak for årsavregning
        console.log('Step 13: Making årsavregning decision...');
        await vedtak.klikkFattVedtak();

        await waitForProcessInstances(page.request, 30);
        console.log('✅ Årsavregning vedtak completed');

        await withFaktureringDatabase(async (db) => {
            const updated = await db.execute("UPDATE faktura SET status = 'BESTILT'");
            console.log(`Updated ${updated} faktura rows to BESTILT`);
        });



        // Step 14: Opprett ny vurdering
        console.log('Step 10: Creating nyvurdering...');
        await hovedside.klikkOpprettNySak();
        await opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD');
        await waitForProcessInstances(page.request, 30);

        // Step 15: Åpne ny behandling
        console.log('Step 11: Opening new behandling...');
        await hovedside.goto();
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).first().click();

        // Hent behandlingId fra URL
        const behandlingId = new URL(page.url()).searchParams.get('behandlingID');
        console.log(`BehandlingId: ${behandlingId}`);

        // Step 16: Annuller saken
        console.log('Step 12: Annullering...');
        await annullering.annullerSak();
        await waitForProcessInstances(page.request, 30);

        console.log('✅ Workflow completed successfully!');

        //Verifiserer at annulering har avregnet innværende fakturalinjer

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

        const arsavregningFakturaserieRef = await withDatabase(async (db) => {
            const result = await db.queryOne<{ FAKTURASERIE_REFERANSE: string }>(
                `SELECT FAKTURASERIE_REFERANSE
                 FROM BEHANDLINGSRESULTAT
                 WHERE BEHANDLING_ID = :id`,
                {id: arsavregningBehandlingId}
            );
            return result?.FAKTURASERIE_REFERANSE;
        });

        if (opprinneligFakturaserieReferanse === undefined || fakturaserieReferanse === undefined || arsavregningFakturaserieRef === undefined) {
            throw new Error(`Fakturaserie referanse er ikke satt. Opprinnelig: ${opprinneligFakturaserieReferanse} (behandlingId: ${opprinneligBehandlingId}), Ny: ${fakturaserieReferanse} (behandlingId: ${behandlingId})`);
        }

        const faktureringHelper = new FaktureringHelper(request);
        const opprinneligFakturaserie = await faktureringHelper.hentFakturaserie(opprinneligFakturaserieReferanse);
        const fakturaserie = await faktureringHelper.hentFakturaserie(fakturaserieReferanse);
        const arsavregningFakturaserie = await faktureringHelper.hentFakturaserie(arsavregningFakturaserieRef);

        faktureringHelper.loggFakturaserie(opprinneligFakturaserie);
        faktureringHelper.loggFakturaserie(fakturaserie);
        faktureringHelper.loggFakturaserie(arsavregningFakturaserie);

        const opprinneligTotal = faktureringHelper.totalBelop(opprinneligFakturaserie);
        const arsavregningTotal = faktureringHelper.totalBelop(arsavregningFakturaserie);
        const nyTotal = faktureringHelper.totalBelop(fakturaserie);
        const sum = opprinneligTotal + arsavregningTotal + nyTotal;

        expect(sum, 'Sum av fakturaserier skal være 0').toBe(0);
    });
});