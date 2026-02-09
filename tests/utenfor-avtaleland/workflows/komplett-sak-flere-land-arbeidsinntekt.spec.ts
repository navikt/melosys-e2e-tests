import {test} from '../../../fixtures';
import {AuthHelper} from '../../../helpers/auth-helper';
import {HovedsidePage} from '../../../pages/hovedside.page';
import {OpprettNySakPage} from '../../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {MedlemskapPage} from '../../../pages/behandling/medlemskap.page';
import {ArbeidsforholdPage} from '../../../pages/behandling/arbeidsforhold.page';
import {LovvalgPage} from '../../../pages/behandling/lovvalg.page';
import {ResultatPeriodePage} from '../../../pages/behandling/resultat-periode.page';
import {BehandlingPage} from '../../../pages/behandling/behandling.page';
import {TrygdeavgiftPage} from '../../../pages/trygdeavgift/trygdeavgift.page';
import {VedtakPage} from '../../../pages/vedtak/vedtak.page';
import {USER_ID_VALID} from '../../../pages/shared/constants';
import {UnleashHelper} from '../../../helpers/unleash-helper';
import {TestPeriods} from '../../../helpers/date-helper';
import {waitForProcessInstances} from '../../../helpers/api-helper';
import {withFaktureringDatabase} from '../../../helpers/pg-db-helper';

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
 */
test.describe('Komplett saksflyt - Flere land med arbeidsinntekt', () => {
    test('skal fullføre sak med flere land, ikke-skattepliktig og arbeidsinntekt fra Norge', async ({
        page,
        request
    }) => {
        // Setup
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
        const behandling = new BehandlingPage(page);
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
        const period = TestPeriods.standardPeriod;
        console.log(`Step 3: Filling medlemskap (${period.start} - ${period.end})...`);
        await medlemskap.velgPeriode(period.start, period.end);
        await medlemskap.velgFlereLandIkkeKjentHvilke();
        await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
        await medlemskap.klikkBekreftOgFortsett();

        // Step 4: Arbeidsforhold
        console.log('Step 4: Selecting arbeidsforhold...');
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

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
        await trygdeavgift.fyllInnSkatteforholdFraDato(period.start);
        await trygdeavgift.fyllInnInntektsperiodeFraDato(period.start);
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

        // Step 10: Create nyvurdering - endre skattestatus til skattepliktig
        console.log('Step 10: Creating nyvurdering...');
        await hovedside.klikkOpprettNySak();
        await opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD');

        console.log('Step 11: Waiting for behandling creation...');
        await waitForProcessInstances(page.request, 30);

        // Step 12: Open the new active behandling
        console.log('Step 12: Opening new behandling...');
        await hovedside.goto();
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).first().click();

        // Step 13: Navigate to Trygdeavgift and change skattepliktig to Ja
        console.log('Step 13: Changing skattepliktig to Ja...');
        await behandling.gåTilTrygdeavgift();
        await trygdeavgift.velgSkattepliktig(true);
        await trygdeavgift.klikkBekreftOgFortsett();

        // Step 14: Fatt vedtak for nyvurdering
        console.log('Step 14: Submitting vedtak for nyvurdering...');
        await page.waitForLoadState('networkidle');
        await vedtak.fattVedtakForNyVurdering('FEIL_I_BEHANDLING');

        console.log('Workflow completed successfully!');
    });
});
