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
import {UnleashHelper} from "../../../helpers/unleash-helper";
import {AdminApiHelper, waitForProcessInstances} from '../../../helpers/api-helper';
import {expect} from "@playwright/test";
import {withDatabase} from '../../../helpers/db-helper';


test.describe('Årsavregning - Ikke-skattepliktige saker', () => {
    test('skal opprette årsavregning for ikke-skattepliktig bruker', async ({page, request}) => {
        // Setup: Authentication
        const auth = new AuthHelper(page);
        const unleash = new UnleashHelper(request);
        await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        // Log what the frontend API returns (for debugging)
        console.log('📊 Logging frontend toggle states after disabling toggle:');
        await unleash.logFrontendToggleStates();

        await auth.login();

        // Setup: Page Objects
        const hovedside = new HovedsidePage(page);
        const opprettSak = new OpprettNySakPage(page);
        const medlemskap = new MedlemskapPage(page);
        const arbeidsforhold = new ArbeidsforholdPage(page);
        const lovvalg = new LovvalgPage(page);
        const resultatPeriode = new ResultatPeriodePage(page);
        const trygdeavgift = new TrygdeavgiftPage(page);
        const vedtak = new VedtakPage(page);
        const adminApi = new AdminApiHelper();

        // Step 1: Create new case
        console.log('📝 Step 1: Creating new case...');
        await hovedside.gotoOgOpprettNySak();
        await opprettSak.opprettStandardSak(USER_ID_VALID);
        await opprettSak.assertions.verifiserBehandlingOpprettet();

        // Step 2: Navigate to behandling
        console.log('📝 Step 2: Opening behandling...');
        console.log('📝 waitForProcessInstances...');
        await waitForProcessInstances(page.request, 30);
        await hovedside.goto()

        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();

        // Step 3: Fill Medlemskap
        console.log('📝 Step 3: Filling medlemskap information...');
        await medlemskap.velgPeriode('01.01.2023', '01.07.2024');
        await medlemskap.velgLand('Afghanistan');
        await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
        await medlemskap.klikkBekreftOgFortsett();

        // Step 4: Select Arbeidsforhold
        console.log('📝 Step 4: Selecting arbeidsforhold...');
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        // Step 5: Answer Lovvalg questions
        console.log('📝 Step 5: Answering lovvalg questions...');
        await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
        await lovvalg.svarJaPaaFørsteSpørsmål();
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
        await lovvalg.klikkBekreftOgFortsett();

        // Step 6: Select Resultat Periode
        console.log('📝 Step 6: Selecting resultat periode...');
        await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

        // Step 7: Fill Trygdeavgift with special options
        console.log('📝 Step 7: Filling trygdeavgift...');
        await trygdeavgift.ventPåSideLastet();
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgSkattepliktig(false);

        await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
        await trygdeavgift.velgBetalesAga(false);
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
        await trygdeavgift.klikkBekreftOgFortsett();

        // Step 8: Fatt vedtak (without filling text fields)
        console.log('📝 Step 8: Making decision...');
        await vedtak.klikkFattVedtak();

        console.log('📝 Step 9: Wait for process instances after first vedtak...');
        await waitForProcessInstances(page.request, 30);

        // FIX: Wait for database state to be committed (deferred pattern fix)
        // The IVERKSETT_VEDTAK_FTRL process completes fast, but we need to ensure
        // the behandling.status = AVSLUTTET is committed before running årsavregning job
        console.log('📝 Step 10: Verify database state before running job...');
        await withDatabase(async (db) => {
            let attempts = 0;
            const maxAttempts = 10;

            while (attempts < maxAttempts) {
                const behandling = await db.queryOne(
                    `SELECT STATUS FROM BEHANDLING WHERE ID = (
                        SELECT MAX(ID) FROM BEHANDLING
                    )`
                );

                console.log(`   Attempt ${attempts + 1}: behandling.STATUS = ${behandling?.STATUS}`);

                if (behandling?.STATUS === 'AVSLUTTET') {
                    console.log('   ✅ Behandling is AVSLUTTET, ready for årsavregning job');
                    break;
                }

                if (attempts === maxAttempts - 1) {
                    throw new Error(`Behandling status is still ${behandling?.STATUS} after ${maxAttempts} attempts`);
                }

                await page.waitForTimeout(500);
                attempts++;
            }
        });

        // Re-enable toggle for årsavregning job (was disabled at start of test)
        await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        // FIX: Add retry logic in case job runs before status is fully committed
        console.log('📝 Step 11: Running årsavregning job with retry logic...');
        let response;
        let jobAttempts = 0;
        const maxJobAttempts = 5;

        while (jobAttempts < maxJobAttempts) {
            await adminApi.finnIkkeSkattepliktigeSaker(
                request,
                '2024-01-01',
                '2024-12-31',
                true // lagProsessinstanser
            );
            response = await adminApi.waitForIkkeSkattepliktigeSakerJob(
                request,
                60, // 60 seconds timeout
                1000 // Poll every 1 second
            );

            console.log(`   Job attempt ${jobAttempts + 1}: antallProsessert = ${response.antallProsessert}`);

            if (response.antallProsessert === 1) {
                console.log('   ✅ Job found 1 case as expected');
                break;
            }

            if (jobAttempts < maxJobAttempts - 1) {
                console.log(`   ⚠️  Expected 1 case, got ${response.antallProsessert}. Retrying in 1s...`);
                await page.waitForTimeout(1000);
            }

            jobAttempts++;
        }

        expect(response.antallProsessert).toBe(1);

        console.log('✅ Workflow completed successfully!');
    });
});
