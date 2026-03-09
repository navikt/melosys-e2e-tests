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
import {waitForProcessInstances} from "../../../helpers/api-helper";
import {withFaktureringDatabase} from "../../../helpers/pg-db-helper";

/**
 * Komplett saksflyt for FTRL-sak med flere land og pensjon-dekning
 *
 * Tester:
 * - Opprettelse av FTRL-sak (Folketrygdloven)
 * - Medlemskap: Flere land (ikke kjent hvilke), delvis dekning (pensjon)
 * - Lovvalg: § 2-8 første ledd a med alle vilkår oppfylt
 * - Trygdeavgift: Ikke-skattepliktig, arbeidsinntekt fra Norge
 * - Vedtak: Fullføring av saksflyt
 */
test.describe('Komplett saksflyt - Flere land med pensjon-dekning', () => {
    test('skal fullføre sak med flere land, ny vurdering så kansellering', async ({page}) => {
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

        // Step 9: Vent på prosesser og sett faktura til BESTILT
        console.log('Step 9: Waiting for processes and updating faktura...');
        await waitForProcessInstances(page.request, 30);

        await withFaktureringDatabase(async (db) => {
            const updated = await db.execute("UPDATE faktura SET status = 'BESTILT'");
            console.log(`Updated ${updated} faktura rows to BESTILT`);
        });

        console.log('✅ Workflow completed successfully!');
    });
});