import {expect, test} from '../../../fixtures';
import {AuthHelper} from '../../../helpers/auth-helper';
import {UnleashHelper} from '../../../helpers/unleash-helper';
import {HovedsidePage} from '../../../pages/hovedside.page';
import {OpprettNySakPage} from '../../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {MedlemskapPage} from '../../../pages/behandling/medlemskap.page';
import {ArbeidsforholdPage} from '../../../pages/behandling/arbeidsforhold.page';
import {LovvalgPage} from '../../../pages/behandling/lovvalg.page';
import {ResultatPeriodePage} from '../../../pages/behandling/resultat-periode.page';
import {TrygdeavgiftPage} from '../../../pages/trygdeavgift/trygdeavgift.page';
import {VedtakPage} from '../../../pages/vedtak/vedtak.page';
import {USER_ID_VALID} from '../../../pages/shared/constants';

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

        // Step 3: Fill Medlemskap
        console.log('📝 Step 3: Filling medlemskap information...');
        await medlemskap.velgPeriode('01.01.2024', '01.07.2024');
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
        // Step 6: Accept default Resultat Periode values (two periods: Helsedel and Pensjonsdel)
        // When FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON creates split periods, the defaults are:
        // - Helsedel (period 1): Avslått
        // - Pensjonsdel (period 2): Innvilget
        // We accept these defaults to avoid "Innvilgede perioder overlapper" validation error
        console.log('📝 Step 6: Accepting default resultat periode values for split periods...');
        await resultatPeriode.klikkBekreftOgFortsett();

        // Step 7: Handle Trygdeavgift page with årsavregning warning
        // When using 2024-only dates, the system shows a warning about not entering
        // tax periods for previous years (MELOSYS-7689), and we just accept it
        console.log('📝 Step 7: Handling trygdeavgift with årsavregning warning...');

        // Verify that the required Unleash toggle is enabled
        const unleash = new UnleashHelper(request);
        const toggleName = 'melosys.faktureringskomponenten.ikke-tidligere-perioder';
        const isToggleEnabled = await unleash.isFeatureEnabled(toggleName);

        console.log(`🔧 Unleash toggle '${toggleName}': ${isToggleEnabled ? 'ENABLED ✅' : 'DISABLED ❌'}`);

        // Assert that the toggle is enabled (test depends on this)
        expect(isToggleEnabled,
            `Unleash toggle '${toggleName}' must be ENABLED for this test to work. ` +
            `The toggle controls the årsavregning warning display. ` +
            `See docs/guides/UNLEASH-DEBUGGING.md for troubleshooting.`
        ).toBe(true);

        // Log what the frontend API returns (for debugging)
        console.log('📊 Logging all frontend toggle states:');
        await unleash.logFrontendToggleStates();

        // Check if the årsavregning warning is displayed
        const hasAarsavregningWarning = await page.getByText(/tidligere år skal fastsettes på årsavregning/i).isVisible({ timeout: 5000 }).catch(() => false);

        // Verify that the årsavregning warning is displayed (test should fail if not present)
        expect(hasAarsavregningWarning,
            'Expected årsavregning warning to be displayed. ' +
            'The warning "tidligere år skal fastsettes på årsavregning" should appear when using 2024-only dates.'
        ).toBe(true);

        console.log('✅ Årsavregning warning detected as expected - proceeding');
        await trygdeavgift.klikkBekreftOgFortsett();

        // Step 8: Fatt vedtak (without filling text fields)
        console.log('📝 Step 8: Making decision...');
        await vedtak.klikkFattVedtak();

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

        // Step 3: Fill Medlemskap
        console.log('📝 Step 3: Filling medlemskap information...');
        await medlemskap.velgPeriode('01.01.2024', '01.04.2024');
        await medlemskap.velgLand('Afghanistan');
        await medlemskap.velgTrygdedekning('FULL_DEKNING_FTRL');
        await medlemskap.klikkBekreftOgFortsett();

        // Step 4: Select Arbeidsforhold
        console.log('📝 Step 4: Selecting arbeidsforhold...');
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        // Step 5: Answer Lovvalg questions
        console.log('📝 Step 5: Answering lovvalg questions...');
        await lovvalg.fyllUtLovvalg();

        // Step 6: Handle Trygdeavgift with årsavregning warning
        // When using 2024-only dates, the system shows a warning (MELOSYS-7689)
        console.log('📝 Step 6: Handling trygdeavgift with årsavregning warning...');

        // Verify that the required Unleash toggle is enabled
        const unleash = new UnleashHelper(request);
        const toggleName = 'melosys.faktureringskomponenten.ikke-tidligere-perioder';
        const isToggleEnabled = await unleash.isFeatureEnabled(toggleName);

        console.log(`🔧 Unleash toggle '${toggleName}': ${isToggleEnabled ? 'ENABLED ✅' : 'DISABLED ❌'}`);

        // Assert that the toggle is enabled (test depends on this)
        expect(isToggleEnabled,
            `Unleash toggle '${toggleName}' must be ENABLED for this test to work. ` +
            `The toggle controls the årsavregning warning display. ` +
            `See docs/guides/UNLEASH-DEBUGGING.md for troubleshooting.`
        ).toBe(true);

        // Log what the frontend API returns (for debugging)
        console.log('📊 Logging all frontend toggle states:');
        await unleash.logFrontendToggleStates();

        const hasAarsavregningWarning = await page.getByText(/tidligere år skal fastsettes på årsavregning/i).isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasAarsavregningWarning,
            'Expected årsavregning warning to be displayed. ' +
            'The warning "tidligere år skal fastsettes på årsavregning" should appear when using 2024-only dates.'
        ).toBe(true);

        console.log('✅ Årsavregning warning detected as expected - proceeding');
        await trygdeavgift.klikkBekreftOgFortsett();

        // Step 7: Make Decision (Fatt vedtak)
        console.log('📝 Step 7: Making decision...');
        await vedtak.fattVedtak('fritekst', 'begrunnelse', 'trygdeavgift');

        console.log('✅ Complete workflow finished successfully!');
    });
});
