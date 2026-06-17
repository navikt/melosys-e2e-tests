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
import {TestPeriods} from '../../../helpers/date-helper';
import {waitForProcessInstances} from '../../../helpers/api-helper';
import {expect} from '@playwright/test';

/**
 * Komplett saksflyt - FTRL § 2-8 første ledd bokstav b (student, frivillig medlemskap)
 *
 * Gap: ftrl-2-8b-student-full-flyt. § 2-8b fantes kun i deaktiverte discovery-notater
 * (se docs/lovvalg/LOVVALG-2-8-B-DISCOVERY.md). Denne dekker full førstegangs vedtaksflyt
 * med trygdeavgift.
 *
 * Mønster kopiert fra komplett-sak-2-8a.spec.ts. Forskjell mot § 2-8a:
 * - bestemmelse FTRL_KAP2_2_8_FØRSTE_LEDD_B
 * - 4 betingede lovvalgsspørsmål (§ 2-8a har 3): det ekstra er "Er søker student ...".
 */
test.describe('Komplett saksflyt - Utenfor avtaleland', () => {
    test('skal fullføre komplett saksflyt med § 2-8 første ledd bokstav b (student)', async ({page, request}) => {
        // Setup: Authentication
        const auth = new AuthHelper(page);
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

        // Step 1: Create new case
        console.log('📝 Step 1: Creating new case...');
        await hovedside.gotoOgOpprettNySak();
        await opprettSak.opprettStandardSak(USER_ID_VALID);
        await opprettSak.assertions.verifiserBehandlingOpprettet();

        // Step 2: Navigate to behandling (robust mot async saksoversikt-lasting via reload-retry)
        console.log('📝 Step 2: Opening behandling...');
        await hovedside.åpneBehandling('TRIVIELL KARAFFEL -');

        // Step 3: Fill Medlemskap (using dynamic dates to avoid year-boundary issues)
        const period = TestPeriods.standardPeriod;
        console.log(`📝 Step 3: Filling medlemskap information (${period.start} - ${period.end})...`);
        await medlemskap.velgPeriode(period.start, period.end);
        await medlemskap.velgLand('Afghanistan');
        await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
        await medlemskap.klikkBekreftOgFortsett();

        // Step 4: Select Arbeidsforhold
        console.log('📝 Step 4: Selecting arbeidsforhold...');
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        // Step 5: Answer Lovvalg questions (§ 2-8b: 4 betingede spørsmål)
        console.log('📝 Step 5: Answering lovvalg questions (§ 2-8b student)...');
        await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_B');
        await lovvalg.svarJaPaaFørsteSpørsmål();                                // Q1: ikke omfattet av annet lands lovgivning
        await lovvalg.svarJaPaaSpørsmålIGruppe('Er søker student');            // Q2: student ved universitet/høgskole (kun § 2-8b)
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst'); // Q3: medlem i minst tre av fem siste år
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til'); // Q4: nær tilknytning til norsk samfunn
        await lovvalg.klikkBekreftOgFortsett();

        // Step 6: Select Resultat Periode - explicitly set INNVILGET to avoid default "Avslått"
        console.log('📝 Step 6: Setting resultat periode to INNVILGET...');
        await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

        // Step 7: Handle Trygdeavgift page
        console.log('📝 Step 7: Handling trygdeavgift...');
        await trygdeavgift.ventPåSideLastet();

        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
        await trygdeavgift.velgBetalesAga(false);
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
        await trygdeavgift.klikkBekreftOgFortsett();

        // Capture behandlingId from URL for DB end-state assertions (before vedtak navigates away)
        const behandlingId = new URL(page.url()).searchParams.get('behandlingID');
        expect(behandlingId, 'behandlingID skal finnes i URL').not.toBeNull();

        // Step 8: Fatt vedtak
        console.log('📝 Step 8: Making decision...');
        await vedtak.klikkFattVedtak();

        // Step 9: Hard sluttilstand - vent på iverksetting + verifiser DB end-state
        console.log('📝 Step 9: Waiting for iverksetting + verifying DB end-state...');
        await waitForProcessInstances(page.request, 60);
        await vedtak.assertions.verifiserBehandlingAvsluttet({
            behandlingId,
            forventetResultatType: 'MEDLEM_I_FOLKETRYGDEN',
            forventetIverksettProsess: 'IVERKSETT_VEDTAK_FTRL',
        });

        console.log('✅ § 2-8b (student) workflow completed');
    });
});
