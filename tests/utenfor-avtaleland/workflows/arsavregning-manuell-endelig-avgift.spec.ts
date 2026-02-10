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
import {UnleashHelper} from '../../../helpers/unleash-helper';
import {waitForProcessInstances} from '../../../helpers/api-helper';
import {expect} from '@playwright/test';


test.describe('Årsavregning - Manuell endelig avgift (MELOSYS-7714)', () => {
    test('skal fatte vedtak med manuell avgift uten feil i VARSLE_PENSJONSOPPTJENING', async ({page, request}) => {
        // Extended timeout for this complex multi-step test (2 vedtak cycles)
        test.setTimeout(120_000);

        // Setup: Authentication and feature toggles
        const auth = new AuthHelper(page);
        const unleash = new UnleashHelper(request);

        // Ensure POPP toggle is enabled so VARSLE_PENSJONSOPPTJENING actually runs
        await unleash.enableFeature('melosys.send_popp_hendelse');
        // Disable fakturering toggle (same as arsavregning-ikke-skattepliktig test)
        await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        await auth.login();

        // Page objects
        const hovedside = new HovedsidePage(page);
        const opprettSak = new OpprettNySakPage(page);
        const medlemskap = new MedlemskapPage(page);
        const arbeidsforhold = new ArbeidsforholdPage(page);
        const lovvalg = new LovvalgPage(page);
        const resultatPeriode = new ResultatPeriodePage(page);
        const trygdeavgift = new TrygdeavgiftPage(page);
        const vedtak = new VedtakPage(page);

        // ============================================================
        // Part 1: Create initial case with vedtak
        // (Same setup as arsavregning-ikke-skattepliktig.spec.ts)
        // ============================================================

        console.log('📝 Part 1: Creating initial case with vedtak...');

        // Step 1: Create new FTRL case
        console.log('📝 Step 1: Creating new case...');
        await hovedside.gotoOgOpprettNySak();
        await opprettSak.opprettStandardSak(USER_ID_VALID);
        await opprettSak.assertions.verifiserBehandlingOpprettet();

        // Step 2: Navigate to behandling
        console.log('📝 Step 2: Opening behandling...');
        await waitForProcessInstances(page.request, 30);
        await hovedside.goto();
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();

        // Step 3: Fill Medlemskap
        console.log('📝 Step 3: Filling medlemskap...');
        await medlemskap.velgPeriode('01.01.2023', '01.07.2024');
        await medlemskap.velgLand('Afghanistan');
        await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
        await medlemskap.klikkBekreftOgFortsett();

        // Step 4: Fill Arbeidsforhold
        console.log('📝 Step 4: Selecting arbeidsforhold...');
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        // Step 5: Fill Lovvalg
        console.log('📝 Step 5: Answering lovvalg questions...');
        await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
        await lovvalg.svarJaPaaFørsteSpørsmål();
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
        await lovvalg.klikkBekreftOgFortsett();

        // Step 6: Fill Resultat Periode
        console.log('📝 Step 6: Selecting resultat periode...');
        await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

        // Step 7: Fill Trygdeavgift (ikke-skattepliktig)
        console.log('📝 Step 7: Filling trygdeavgift...');
        await trygdeavgift.ventPåSideLastet();
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
        await trygdeavgift.velgBetalesAga(false);
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
        await trygdeavgift.klikkBekreftOgFortsett();

        // Step 8: Fatt initial vedtak
        console.log('📝 Step 8: Making initial decision...');
        await vedtak.klikkFattVedtak();

        console.log('📝 Step 9: Waiting for process instances after initial vedtak...');
        await waitForProcessInstances(page.request, 30);

        // ============================================================
        // Part 2: Create årsavregning with MANUELL_ENDELIG_AVGIFT
        // ============================================================

        console.log('📝 Part 2: Creating årsavregning with manuell endelig avgift...');

        // Step 10: Navigate back to fagsak
        console.log('📝 Step 10: Navigating back to fagsak...');
        await hovedside.goto();
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();

        // Step 11: Navigate to Årsavregning tab
        console.log('📝 Step 11: Opening årsavregning tab...');
        const aarsavregningTab = page.locator('button[role="tab"]:has-text("Årsavregning")');
        await aarsavregningTab.waitFor({state: 'visible', timeout: 10_000});
        await aarsavregningTab.click();

        // Verify årsavregning page loaded
        await expect(
            page.getByRole('heading', {name: 'Årsavregning'}),
            'Årsavregning-overskrift skal være synlig'
        ).toBeVisible({timeout: 10_000});

        // Step 12: Select year from dropdown
        console.log('📝 Step 12: Selecting year...');
        const årDropdown = page.getByRole('combobox', {name: 'År'});
        await årDropdown.waitFor({state: 'visible', timeout: 10_000});

        // Get first available year
        const førsteÅr = await årDropdown.locator('option:not([disabled])').first().textContent();
        expect(førsteÅr, 'Skal finne tilgjengelig år i dropdown').toBeTruthy();

        // Set up API listener before selecting year (creates årsavregning via POST)
        const aarsavregningResponsePromise = page.waitForResponse(
            response =>
                response.url().includes('/aarsavregninger') &&
                !response.url().includes('/grunnlagstype') &&
                response.request().method() === 'POST',
            {timeout: 15_000}
        ).catch(() => null);

        await årDropdown.selectOption({label: førsteÅr!.trim()});
        await aarsavregningResponsePromise;
        console.log(`✅ Selected year: ${førsteÅr!.trim()}`);

        // Step 13: Handle "Skal du legge til trygdeavgift fra Avgiftssystemet?" question
        console.log('📝 Step 13: Answering trygdeavgift fra Avgiftssystemet question...');
        const trygdeavgiftSpørsmål = page.getByText(
            'Skal du legge til trygdeavgift fra Avgiftssystemet til denne årsavregningen?'
        );
        await trygdeavgiftSpørsmål.waitFor({state: 'visible', timeout: 10_000});

        // Answer "Nei" - we want to manually set the avgift, not use external data
        const neiRadio = page.getByRole('radio', {name: 'Nei'}).first();
        await neiRadio.waitFor({state: 'visible', timeout: 5_000});

        // Set up API listener for grunnlagstype update
        const grunnlagstypeResponsePromise = page.waitForResponse(
            response =>
                response.url().includes('/grunnlagstype') &&
                response.request().method() === 'POST',
            {timeout: 15_000}
        ).catch(() => null);

        await neiRadio.check();
        await grunnlagstypeResponsePromise;
        console.log('✅ Answered "Nei" to Avgiftssystemet question');

        // Step 14: Select "Oppgi endelig beregnet trygdeavgift" (MANUELL_ENDELIG_AVGIFT)
        console.log('📝 Step 14: Selecting manuell endelig avgift...');
        const manuellRadio = page.getByRole('radio', {name: 'Oppgi endelig beregnet trygdeavgift'});
        await manuellRadio.waitFor({state: 'visible', timeout: 15_000});

        // Set up API listener for endeligAvgiftValg change
        const endeligAvgiftResponsePromise = page.waitForResponse(
            response =>
                response.url().includes('/endeligAvgift') &&
                response.request().method() === 'PUT',
            {timeout: 15_000}
        );

        await manuellRadio.check();
        await endeligAvgiftResponsePromise;
        console.log('✅ Selected "Oppgi endelig beregnet trygdeavgift" (MANUELL_ENDELIG_AVGIFT)');

        // Step 15: Enter manuelt avgift beløp
        console.log('📝 Step 15: Entering manuelt beløp...');
        const belopInput = page.getByRole('textbox', {name: 'Endelig beregnet trygdeavgift'});
        await belopInput.waitFor({state: 'visible', timeout: 10_000});

        // Set up API listener for manuelt beløp update (debounced PUT)
        const manueltBelopResponsePromise = page.waitForResponse(
            response =>
                response.url().includes('/aarsavregninger') &&
                response.request().method() === 'PUT' &&
                response.status() === 200,
            {timeout: 15_000}
        );

        await belopInput.fill('75000');
        await belopInput.press('Tab'); // Trigger blur/debounce
        await manueltBelopResponsePromise;
        console.log('✅ Entered manuelt beløp: 75000');

        // Step 16: Click "Bekreft og fortsett"
        console.log('📝 Step 16: Confirming årsavregning...');
        const bekreftButton = page.getByRole('button', {name: 'Bekreft og fortsett'});
        await expect(bekreftButton).toBeEnabled({timeout: 10_000});
        await bekreftButton.click();

        // Step 17: Fatt vedtak for årsavregning
        console.log('📝 Step 17: Fatting vedtak for årsavregning...');
        await vedtak.klikkFattVedtak();

        // Step 18: Wait for process instances (IVERKSETT_VEDTAK_AARSAVREGNING)
        // This is the critical assertion: VARSLE_PENSJONSOPPTJENING should
        // skip POPP-hendelse for MANUELL_ENDELIG_AVGIFT instead of failing
        console.log('📝 Step 18: Waiting for IVERKSETT_VEDTAK_AARSAVREGNING process...');
        await waitForProcessInstances(page.request, 30);

        // Re-enable toggle (cleanup)
        await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        console.log('✅ MELOSYS-7714: Årsavregning med MANUELL_ENDELIG_AVGIFT fullført uten feil!');
        console.log('✅ VARSLE_PENSJONSOPPTJENING hoppet over POPP-hendelse for manuell avgift');
    });
});
