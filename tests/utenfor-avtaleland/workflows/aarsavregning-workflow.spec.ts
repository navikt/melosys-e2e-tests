/**
 * MELOSYS-7560: Årsavregning Workflow Tests
 *
 * Test cases for automatic creation of annual settlement (årsavregning) based on tax liability status.
 *
 * Rules for automatic creation:
 * ✅ SKAL OPPRETTES:
 * - Førstegangsbehandling: ikke-skattepliktig
 * - Ny vurdering: skattepliktig → ikke-skattepliktig
 * - Ny vurdering: ANY → delvis skattepliktig/ikke-skattepliktig
 * - Feature toggle: AV → PÅ (with script)
 *
 * ❌ SKAL IKKE OPPRETTES:
 * - Førstegangsbehandling: skattepliktig
 * - Ny vurdering: ikke-skattepliktig → skattepliktig
 * - Førstegangsbehandling: delvis skattepliktig/ikke-skattepliktig
 */

import { test, expect } from '../../../fixtures/unleash-cleanup';
import { AuthHelper } from '../../../helpers/auth-helper';
import { AarsavregningWorkflowHelper } from '../../../helpers/aarsavregning-workflow-helper';

// Period variations for testing
const PERIODER = {
    kun2024: { fra: '03.01.2024', til: '01.04.2024', beskrivelse: 'kun periode i 2024' },
    overlap2023_2024: { fra: '03.11.2023', til: '01.04.2024', beskrivelse: 'overlappende 2023-2024' },
    overlap2024_2025: { fra: '03.11.2024', til: '01.04.2025', beskrivelse: 'overlappende 2024-2025' }
};

test.describe('Årsavregning - Førstegangsbehandling', () => {
    test.beforeEach(async ({ page }) => {
        test.setTimeout(90000); // 90 seconds
        const auth = new AuthHelper(page);
        await auth.login();
    });

    /**
     * TEST STEP 1: Førstegangsbehandling ikke-skattepliktig
     * Testing all 3 period variations
     */
    for (const [key, periode] of Object.entries(PERIODER)) {
        test(`skal opprette årsavregning - ikke-skattepliktig (${periode.beskrivelse})`, async ({ page, request }) => {
            const workflow = new AarsavregningWorkflowHelper(page, request);
            await workflow.setupUnleash();

            // Create and complete case with ikke-skattepliktig status
            await workflow.opprettOgBehandleSak({
                skattepliktigStatus: 'ikke-skattepliktig',
                periodeFra: periode.fra,
                periodeTil: periode.til
            });

            // Run årsavregning job - expect 1 case processed
            await workflow.kjørÅrsavregningJob(1);

            console.log(`✅ Test completed: ${periode.beskrivelse}`);
        });
    }

    /**
     * TEST STEP 2: Førstegangsbehandling skattepliktig
     * Testing all 3 period variations - should NOT create årsavregning
     */
    for (const [key, periode] of Object.entries(PERIODER)) {
        test(`skal IKKE opprette årsavregning - skattepliktig (${periode.beskrivelse})`, async ({ page, request }) => {
            const workflow = new AarsavregningWorkflowHelper(page, request);
            await workflow.setupUnleash();

            // Create and complete case with skattepliktig status
            await workflow.opprettOgBehandleSak({
                skattepliktigStatus: 'skattepliktig',
                periodeFra: periode.fra,
                periodeTil: periode.til
            });

            // Run årsavregning job - expect 0 cases processed
            await workflow.kjørÅrsavregningJob(0);

            console.log(`✅ Test completed: ${periode.beskrivelse}`);
        });
    }

    /**
     * TEST STEP 7: Førstegangsbehandling delvis skattepliktig
     * Should NOT automatically create årsavregning
     */
    test('skal IKKE opprette årsavregning - delvis skattepliktig/ikke-skattepliktig', async ({ page, request }) => {
        const workflow = new AarsavregningWorkflowHelper(page, request);
        await workflow.setupUnleash();

        // Create and complete case with delvis status
        await workflow.opprettOgBehandleSak({
            skattepliktigStatus: 'delvis',
            periodeFra: PERIODER.kun2024.fra,
            periodeTil: PERIODER.kun2024.til
        });

        // Run årsavregning job - expect 0 cases processed
        await workflow.kjørÅrsavregningJob(0);

        console.log('✅ Test completed: delvis skattepliktig');
    });
});

test.describe('Årsavregning - Ny vurdering (endre skattstatus)', () => {
    test.beforeEach(async ({ page }) => {
        test.setTimeout(120000); // 120 seconds for multiple workflows
        const auth = new AuthHelper(page);
        await auth.login();
    });

    /**
     * TEST STEP 3: skattepliktig → ikke-skattepliktig
     * Should create årsavregning
     */
    test('skal opprette årsavregning - endre fra skattepliktig til ikke-skattepliktig', async ({ page, request }) => {
        const workflow = new AarsavregningWorkflowHelper(page, request);
        await workflow.setupUnleash();

        // Initial case: skattepliktig
        await workflow.opprettOgBehandleSak({
            skattepliktigStatus: 'skattepliktig',
            periodeFra: PERIODER.kun2024.fra,
            periodeTil: PERIODER.kun2024.til
        });

        // Ny vurdering: change to ikke-skattepliktig
        await workflow.opprettNyVurdering({
            nySkattepliktigStatus: 'ikke-skattepliktig'
        });

        // Run årsavregning job - expect 1 case processed
        await workflow.kjørÅrsavregningJob(1);

        console.log('✅ Test completed: skattepliktig → ikke-skattepliktig');
    });

    /**
     * TEST STEP 4: ikke-skattepliktig → skattepliktig
     * Should NOT create årsavregning
     */
    test('skal IKKE opprette årsavregning - endre fra ikke-skattepliktig til skattepliktig', async ({ page, request }) => {
        const workflow = new AarsavregningWorkflowHelper(page, request);
        await workflow.setupUnleash();

        // Initial case: ikke-skattepliktig
        await workflow.opprettOgBehandleSak({
            skattepliktigStatus: 'ikke-skattepliktig',
            periodeFra: PERIODER.kun2024.fra,
            periodeTil: PERIODER.kun2024.til
        });

        // Ny vurdering: change to skattepliktig
        await workflow.opprettNyVurdering({
            nySkattepliktigStatus: 'skattepliktig'
        });

        // Run årsavregning job - expect 0 cases processed
        await workflow.kjørÅrsavregningJob(0);

        console.log('✅ Test completed: ikke-skattepliktig → skattepliktig');
    });

    /**
     * TEST STEP 5: ikke-skattepliktig → delvis
     * Should create årsavregning
     */
    test('skal opprette årsavregning - endre fra ikke-skattepliktig til delvis', async ({ page, request }) => {
        const workflow = new AarsavregningWorkflowHelper(page, request);
        await workflow.setupUnleash();

        // Initial case: ikke-skattepliktig
        await workflow.opprettOgBehandleSak({
            skattepliktigStatus: 'ikke-skattepliktig',
            periodeFra: PERIODER.kun2024.fra,
            periodeTil: PERIODER.kun2024.til
        });

        // Ny vurdering: change to delvis
        await workflow.opprettNyVurdering({
            nySkattepliktigStatus: 'delvis'
        });

        // Run årsavregning job - expect 1 case processed
        await workflow.kjørÅrsavregningJob(1);

        console.log('✅ Test completed: ikke-skattepliktig → delvis');
    });

    /**
     * TEST STEP 6: skattepliktig → delvis
     * Should create årsavregning
     */
    test('skal opprette årsavregning - endre fra skattepliktig til delvis', async ({ page, request }) => {
        const workflow = new AarsavregningWorkflowHelper(page, request);
        await workflow.setupUnleash();

        // Initial case: skattepliktig
        await workflow.opprettOgBehandleSak({
            skattepliktigStatus: 'skattepliktig',
            periodeFra: PERIODER.kun2024.fra,
            periodeTil: PERIODER.kun2024.til
        });

        // Ny vurdering: change to delvis
        await workflow.opprettNyVurdering({
            nySkattepliktigStatus: 'delvis'
        });

        // Run årsavregning job - expect 1 case processed
        await workflow.kjørÅrsavregningJob(1);

        console.log('✅ Test completed: skattepliktig → delvis');
    });
});

test.describe('Årsavregning - Feature toggle scenario', () => {
    test.beforeEach(async ({ page }) => {
        test.setTimeout(90000); // 90 seconds
        const auth = new AuthHelper(page);
        await auth.login();
    });

    /**
     * TEST STEP 8: Toggle AV → Toggle PÅ
     * Create case with toggle disabled, then enable and run script
     */
    test('skal opprette årsavregning - toggle AV ved opprettelse, PÅ ved script', async ({ page, request }) => {
        const workflow = new AarsavregningWorkflowHelper(page, request);
        await workflow.setupUnleash(); // Toggle starts as DISABLED

        // Create case with ikke-skattepliktig while toggle is OFF
        await workflow.opprettOgBehandleSak({
            skattepliktigStatus: 'ikke-skattepliktig',
            periodeFra: PERIODER.kun2024.fra,
            periodeTil: PERIODER.kun2024.til
        });

        // Now run årsavregning job with toggle ENABLED (done in kjørÅrsavregningJob)
        // This simulates: case created before feature, script run after feature enabled
        await workflow.kjørÅrsavregningJob(1);

        console.log('✅ Test completed: toggle scenario');
    });
});
