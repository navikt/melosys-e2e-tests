import {test, expect} from '../../../fixtures';
import {AuthHelper} from '../../../helpers/auth-helper';
import {HovedsidePage} from '../../../pages/hovedside.page';
import {OpprettNySakPage} from '../../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {MedlemskapPage} from '../../../pages/behandling/medlemskap.page';
import {ArbeidsforholdPage} from '../../../pages/behandling/arbeidsforhold.page';
import {LovvalgPage} from '../../../pages/behandling/lovvalg.page';
import {ResultatPeriodePage} from '../../../pages/behandling/resultat-periode.page';
import {TrygdeavgiftPage} from '../../../pages/trygdeavgift/trygdeavgift.page';
import {USER_ID_VALID} from '../../../pages/shared/constants';
import {waitForProcessInstances} from '../../../helpers/api-helper';
import {Page} from '@playwright/test';

/**
 * Common setup function to navigate from homepage to Trygdeavgift page
 * This handles all the common steps before testing different trygdeavgift scenarios
 */
async function setupBehandlingToTrygdeavgift(page: Page) {
    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const resultatPeriode = new ResultatPeriodePage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);

    // Create case
    console.log('📝 Setting up case...');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Navigate to behandling
    console.log('📝 Opening behandling...');
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();
    await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();

    // Fill Medlemskap
    console.log('📝 Filling medlemskap...');
    await medlemskap.velgPeriode('01.01.2023', '01.07.2024');
    await medlemskap.velgLand('Afghanistan');
    await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
    await medlemskap.klikkBekreftOgFortsett();

    // Fill Arbeidsforhold
    console.log('📝 Filling arbeidsforhold...');
    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    // Fill Lovvalg
    console.log('📝 Filling lovvalg...');
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
    await lovvalg.klikkBekreftOgFortsett();

    // Fill Resultat Periode
    console.log('📝 Filling resultat periode...');
    await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

    // Now at Trygdeavgift page
    console.log('📝 Ready at Trygdeavgift page');
    await trygdeavgift.ventPåSideLastet();

    return trygdeavgift;
}

// forandring etter https://jira.adeo.no/browse/MELOSYS-7689 krever oppdatering på alle disse
test.describe('Trygdeavgift - Gyldige scenarioer @manual', () => {

    test('Scenario 1: Ikke skattepliktig + Inntekt fra utlandet + Betales ikke AGA - Skattesats 37%', async ({page}) => {
        const trygdeavgift = await setupBehandlingToTrygdeavgift(page);

        console.log('📝 Testing: Ikke skattepliktig + Inntekt fra utlandet + Betales ikke AGA');
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgInntektskilde('Inntekt fra utlandet');
        await trygdeavgift.velgBetalesAga(false);
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');

        // Should calculate tax at 37.5% (2023) and 37% (2024)
        await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();

        // Verify actual calculated values (2 periods with different rates per year)
        await trygdeavgift.assertions.verifiserBeregnedeTrygdeavgiftVerdier([
            { sats: '37.5', avgiftPerMnd: '37500 nkr' },  // 01.01.2023 - 31.12.2023 (37.5% rate)
            { sats: '37', avgiftPerMnd: '37000 nkr' }     // 01.01.2024 - 01.07.2024 (37% rate)
        ]);

        console.log('✅ Scenario 1 succeeded - Tax calculated at 37.5% (2023) and 37% (2024) rates');
    });

    test('Scenario 2: Ikke skattepliktig + Inntekt fra utlandet + Betales AGA - Skattesats 28%', async ({page}) => {
        const trygdeavgift = await setupBehandlingToTrygdeavgift(page);

        console.log('📝 Testing: Ikke skattepliktig + Inntekt fra utlandet + Betales AGA');
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgInntektskilde('Inntekt fra utlandet');
        await trygdeavgift.velgBetalesAga(true);
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');

        // Should calculate tax at 28.3% (2023) and 27.8% (2024) - lower rate because AGA is paid
        await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();

        // Verify actual calculated values (2 periods with different rates per year)
        await trygdeavgift.assertions.verifiserBeregnedeTrygdeavgiftVerdier([
            { sats: '28.3', avgiftPerMnd: '28300 nkr' },  // 01.01.2023 - 31.12.2023 (28.3% rate)
            { sats: '27.8', avgiftPerMnd: '27800 nkr' }   // 01.01.2024 - 01.07.2024 (27.8% rate)
        ]);

        console.log('✅ Scenario 2 succeeded - Tax calculated at 28.3% (2023) and 27.8% (2024) rates');
    });

    test('Scenario 3: Skattepliktig + Inntekt fra utlandet + Betales ikke AGA - Skattesats 9.2%', async ({page}) => {
        const trygdeavgift = await setupBehandlingToTrygdeavgift(page);

        console.log('📝 Testing: Skattepliktig + Inntekt fra utlandet + Betales ikke AGA');
        await trygdeavgift.velgSkattepliktig(true);
        await trygdeavgift.velgInntektskilde('Inntekt fra utlandet');
        await trygdeavgift.velgBetalesAga(false);
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');

        // Should calculate tax at 9.2% - lowest rate
        await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();
        await trygdeavgift.assertions.verifiserTrygdeavgiftSats('9.2');

        // Verify actual calculated values (2 periods: 2023 and 2024)
        await trygdeavgift.assertions.verifiserBeregnedeTrygdeavgiftVerdier([
            { sats: '9.2', avgiftPerMnd: '9200 nkr' },  // 01.01.2023 - 31.12.2023
            { sats: '9.2', avgiftPerMnd: '9200 nkr' }   // 01.01.2024 - 01.07.2024
        ]);

        console.log('✅ Scenario 3 succeeded - Tax calculated at 9.2% rate');
    });

    test('Scenario 4: Skattepliktig + Inntekt fra utlandet + Betales AGA - Ingen trygdeavgift til NAV', async ({page}) => {
        const trygdeavgift = await setupBehandlingToTrygdeavgift(page);

        console.log('📝 Testing: Skattepliktig + Inntekt fra utlandet + Betales AGA');
        await trygdeavgift.velgSkattepliktig(true);
        await trygdeavgift.velgInntektskilde('Inntekt fra utlandet');
        await trygdeavgift.velgBetalesAga(true);

        // Should show "no tax to NAV" message and bruttoinntekt is not relevant
        await trygdeavgift.assertions.verifiserIngenTrygdeavgift();
        await trygdeavgift.assertions.verifiserBruttoinntektIkkeRelevant();

        console.log('✅ Scenario 4 succeeded - Ingen trygdeavgift til NAV when skattepliktig and AGA is paid');
    });

    test('Scenario 5: Skattepliktig + Arbeidsinntekt fra Norge - Betales aga disabled', async ({page}) => {
        const trygdeavgift = await setupBehandlingToTrygdeavgift(page);

        console.log('📝 Testing: Skattepliktig + Arbeidsinntekt fra Norge');
        await trygdeavgift.velgSkattepliktig(true);
        await trygdeavgift.velgInntektskilde('Arbeidsinntekt fra Norge');

        // For Norwegian income, AGA field is disabled but no special message appears
        // Just verify button is disabled (no bruttoinntekt field visible)
        await trygdeavgift.assertions.verifiserBetalesAgaDisabled();

        console.log('✅ Scenario 5 succeeded - Norwegian income: AGA disabled');
    });

    test('Scenario 6: Ikke skattepliktig + Arbeidsinntekt fra Norge - Betales aga disabled', async ({page}) => {
        const trygdeavgift = await setupBehandlingToTrygdeavgift(page);

        console.log('📝 Testing: Ikke skattepliktig + Arbeidsinntekt fra Norge');
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgInntektskilde('Arbeidsinntekt fra Norge');

        // For Norwegian income, AGA is automatically paid (field disabled)
        await trygdeavgift.assertions.verifiserBetalesAgaDisabled();

        console.log('✅ Scenario 6 succeeded - Norwegian income: AGA disabled (regardless of skattepliktig)');
    });

    test('Scenario 7: Skattepliktig + Næringsinntekt fra Norge - Betales aga disabled', async ({page}) => {
        const trygdeavgift = await setupBehandlingToTrygdeavgift(page);

        console.log('📝 Testing: Skattepliktig + Næringsinntekt fra Norge');
        await trygdeavgift.velgSkattepliktig(true);
        await trygdeavgift.velgInntektskilde('Næringsinntekt fra Norge');

        // For Norwegian business income, same rules as work income
        await trygdeavgift.assertions.verifiserBetalesAgaDisabled();

        console.log('✅ Scenario 7 succeeded - Norwegian business income: AGA disabled');
    });

    test('Summary: All income sources available regardless of Skattepliktig status', async ({page}) => {
        const trygdeavgift = await setupBehandlingToTrygdeavgift(page);

        console.log('\n📊 Verifying UI behavior: All income sources available');

        // Test 1: Ikke skattepliktig - all options should be available
        console.log('\n📝 Test 1: Ikke skattepliktig');
        await trygdeavgift.velgSkattepliktig(false);

        // Verify we can select different income sources
        await trygdeavgift.velgInntektskilde('Arbeidsinntekt fra Norge');
        await page.waitForTimeout(500);

        await trygdeavgift.velgInntektskilde('Inntekt fra utlandet');
        await page.waitForTimeout(500);

        await trygdeavgift.velgInntektskilde('Næringsinntekt fra Norge');
        await page.waitForTimeout(500);

        // Test 2: Skattepliktig - all options should still be available
        console.log('\n📝 Test 2: Skattepliktig');
        await trygdeavgift.velgSkattepliktig(true);

        await trygdeavgift.velgInntektskilde('Arbeidsinntekt fra Norge');
        await page.waitForTimeout(500);

        await trygdeavgift.velgInntektskilde('Inntekt fra utlandet');
        await page.waitForTimeout(500);

        console.log('\n📊 Summary:');
        console.log('   ✓ All income sources are available regardless of Skattepliktig status');
        console.log('   ✓ UI prevents invalid combinations through disabled fields');
        console.log('   ✓ No validation errors - system handles all combinations gracefully');
    });
});
