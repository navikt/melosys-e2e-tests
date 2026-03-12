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
import {UnleashHelper} from '../../../helpers/unleash-helper';
import {getYearFromDate, TestPeriods} from '../../../helpers/date-helper';
import {waitForProcessInstances} from '../../../helpers/api-helper';
import {withFaktureringDatabase} from '../../../helpers/pg-db-helper';
import {withDatabase} from '../../../helpers/db-helper';
import {FaktureringHelper} from '../../../helpers/fakturering-helper';

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
    test('skal fullføre sak med flere land, ikke-skattepliktig og arbeidsinntekt fra Norge. Så NV med skattepliktig, avregning skal bli riktig', async ({
                                                                                                                                                            page,
                                                                                                                                                            request
                                                                                                                                                        }) => {
        // Setup
        test.setTimeout(120000);
        const auth = new AuthHelper(page);
        const unleash = new UnleashHelper(request);
        await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');
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

        // Step 1: Create case
        console.log('Step 1: Creating new case...');
        await hovedside.gotoOgOpprettNySak();
        await opprettSak.opprettStandardSak(USER_ID_VALID);
        await opprettSak.assertions.verifiserBehandlingOpprettet();

        // Step 2: Open behandling
        console.log('Step 2: Opening behandling...');
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();

        // Step 3: Medlemskap - Flere land med delvis dekning
        const period = TestPeriods.currentYearPeriod
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

        await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        // Step 10: Create nyvurdering - endre skattestatus til skattepliktig
        console.log('Step 10: Creating nyvurdering...');
        await hovedside.klikkOpprettNySak();
        await opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD');

        console.log('Step 11: Waiting for behandling creation...');
        await waitForProcessInstances(page.request, 30);

        // Åpne ny behandling
        await hovedside.goto();
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).first().click();

        // Medlemskap for ny vurdering
        const periodNV = TestPeriods.previousYearPeriod
        console.log(`📝 Medlemskap ny vurdering (${periodNV.start} - ${periodNV.end})...`);
        await medlemskap.velgPeriode(periodNV.start, periodNV.end);
        await medlemskap.klikkBekreftOgFortsett();

        // Arbeidsforhold
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        // Hent behandlingId fra URL
        const behandlingId = new URL(page.url()).searchParams.get('behandlingID');
        console.log(`behandlingId: ${behandlingId}`);

        // Lovvalg med FTRL 2.1 fjerde ledd (endret fra 2.8a)
        console.log('📝 Lovvalg: FTRL 2.1 fjerde ledd...');
        await lovvalg.velgBestemmelse('FTRL_KAP2_2_1');
        await lovvalg.velgBrukersSituasjon('MIDLERTIDIG_ARBEID_2_1_FJERDE_LEDD');
        await lovvalg.svarJaPaaFørsteSpørsmål();
        await lovvalg.svarJaPaaSpørsmålIGruppe('Er søkers arbeidsoppdrag i');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Plikter arbeidsgiver å betale');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker lovlig opphold i');
        await lovvalg.klikkBekreftOgFortsett();

        // Resultat og trygdeavgift – klikk gjennom (data beholdes fra forrige behandling)
        await resultatPeriode.klikkBekreftOgFortsett();
        await trygdeavgift.klikkBekreftOgFortsett();

        // Vedtak for ny vurdering med grunn
        console.log('📝 Fatter vedtak for ny vurdering...');
        await vedtak.fattVedtakForNyVurdering('FEIL_I_BEHANDLING');
        await waitForProcessInstances(page.request, 30);

        console.log('✅ Ny vurdering med FTRL 2.1 fullført!');


        //Verifiserer at ny vurdering har avregnet innværende fakturalinjer

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
