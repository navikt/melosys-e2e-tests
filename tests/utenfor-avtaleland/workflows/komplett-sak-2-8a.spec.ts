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

test.describe('Komplett saksflyt - Utenfor avtaleland', () => {
    test('skal fullføre komplett saksflyt med § 2-8 første ledd bokstav a (arbeidstaker)', async ({page, request}) => {
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

        // Step 2: Navigate to behandling
        console.log('📝 Step 2: Opening behandling...');
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();

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

        // Step 5: Answer Lovvalg questions
        console.log('📝 Step 5: Answering lovvalg questions...');
        await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
        await lovvalg.svarJaPaaFørsteSpørsmål();
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
        await lovvalg.klikkBekreftOgFortsett();

        // Step 6: Select Resultat Periode - explicitly set INNVILGET to avoid default "Avslått"
        console.log('📝 Step 6: Setting resultat periode to INNVILGET...');
        await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

        // Step 7: Handle Trygdeavgift page
        // With FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON, we need to fill in skatteforhold and income
        console.log('📝 Step 7: Handling trygdeavgift...');
        await trygdeavgift.ventPåSideLastet();

        // Check if the årsavregning warning is displayed (informational only)
        const hasAarsavregningWarning = await page.getByText(/tidligere år skal fastsettes på årsavregning/i).isVisible({ timeout: 2000 }).catch(() => false);

        if (hasAarsavregningWarning) {
            console.log('ℹ️ Årsavregning warning detected - period includes previous year dates');
        } else {
            console.log('ℹ️ No årsavregning warning - period is within current year');
        }

        // Fill all required trygdeavgift fields
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
        await trygdeavgift.velgBetalesAga(false);
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
        await trygdeavgift.klikkBekreftOgFortsett();

        // Capture behandlingId from URL for DB end-state assertions (before vedtak navigates away)
        const behandlingId = new URL(page.url()).searchParams.get('behandlingID');
        expect(behandlingId, 'behandlingID skal finnes i URL').not.toBeNull();

        // Step 8: Fatt vedtak (without filling text fields)
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

        console.log('✅ Workflow completed');
    });

    test('FULL_DEKNING_FTRL', async ({page, request}) => {
        // Setup: Authentication
        const auth = new AuthHelper(page);
        await auth.login();

        // Setup: Page Objects
        const hovedside = new HovedsidePage(page);
        const opprettSak = new OpprettNySakPage(page);
        const medlemskap = new MedlemskapPage(page);
        const arbeidsforhold = new ArbeidsforholdPage(page);
        const lovvalg = new LovvalgPage(page);
        const trygdeavgift = new TrygdeavgiftPage(page);
        const vedtak = new VedtakPage(page);

        // Step 1: Create new case
        console.log('📝 Step 1: Creating new case...');
        await hovedside.gotoOgOpprettNySak();
        await opprettSak.opprettStandardSak(USER_ID_VALID);
        await opprettSak.assertions.verifiserBehandlingOpprettet();

        // Step 2: Navigate to behandling
        console.log('📝 Step 2: Opening behandling...');
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();

        // Step 3: Fill Medlemskap (using dynamic dates to avoid year-boundary issues)
        const period = TestPeriods.standardPeriod;
        console.log(`📝 Step 3: Filling medlemskap information (${period.start} - ${period.end})...`);
        await medlemskap.velgPeriode(period.start, period.end);
        await medlemskap.velgLand('Afghanistan');
        await medlemskap.velgTrygdedekning('FULL_DEKNING_FTRL');
        await medlemskap.klikkBekreftOgFortsett();

        // Step 4: Select Arbeidsforhold
        console.log('📝 Step 4: Selecting arbeidsforhold...');
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        // Step 5: Answer Lovvalg questions
        console.log('📝 Step 5: Answering lovvalg questions...');
        await lovvalg.fyllUtLovvalg();

        // Step 6: Handle Trygdeavgift page
        // With FULL_DEKNING_FTRL, we need to fill in skatteforhold and income
        console.log('📝 Step 6: Handling trygdeavgift...');
        await trygdeavgift.ventPåSideLastet();

        // Check if the årsavregning warning is displayed (informational only)
        const hasAarsavregningWarning = await page.getByText(/tidligere år skal fastsettes på årsavregning/i).isVisible({ timeout: 2000 }).catch(() => false);

        if (hasAarsavregningWarning) {
            console.log('ℹ️ Årsavregning warning detected - period includes previous year dates');
        } else {
            console.log('ℹ️ No årsavregning warning - period is within current year');
        }

        // Fill all required trygdeavgift fields
        // Note: FULL_DEKNING_FTRL has different income options (no "Inntekt fra utlandet")
        // Note: For ARBEIDSINNTEKT, "Betales aga?" is shown as "Ikke relevant" (not a radio group)
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');
        // No velgBetalesAga() - field shows "Ikke relevant" for this income type
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
        await trygdeavgift.klikkBekreftOgFortsett();

        // Capture behandlingId from URL for DB end-state assertions (before vedtak navigates away)
        const behandlingId = new URL(page.url()).searchParams.get('behandlingID');
        expect(behandlingId, 'behandlingID skal finnes i URL').not.toBeNull();

        // Step 7: Make Decision (Fatt vedtak)
        console.log('📝 Step 7: Making decision...');
        await vedtak.fattVedtak('fritekst', 'begrunnelse', 'trygdeavgift');

        // Step 8: Hard sluttilstand - vent på iverksetting + verifiser DB end-state
        console.log('📝 Step 8: Waiting for iverksetting + verifying DB end-state...');
        await waitForProcessInstances(page.request, 60);
        await vedtak.assertions.verifiserBehandlingAvsluttet({
            behandlingId,
            forventetResultatType: 'MEDLEM_I_FOLKETRYGDEN',
            forventetIverksettProsess: 'IVERKSETT_VEDTAK_FTRL',
        });

        console.log('✅ Complete workflow finished successfully!');
    });
});
