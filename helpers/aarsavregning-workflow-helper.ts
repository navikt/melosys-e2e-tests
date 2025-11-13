import { Page, APIRequestContext } from '@playwright/test';
import { HovedsidePage } from '../pages/hovedside.page';
import { OpprettNySakPage } from '../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../pages/behandling/medlemskap.page';
import { ArbeidsforholdPage } from '../pages/behandling/arbeidsforhold.page';
import { LovvalgPage } from '../pages/behandling/lovvalg.page';
import { ResultatPeriodePage } from '../pages/behandling/resultat-periode.page';
import { TrygdeavgiftPage } from '../pages/trygdeavgift/trygdeavgift.page';
import { VedtakPage } from '../pages/vedtak/vedtak.page';
import { USER_ID_VALID } from '../pages/shared/constants';
import { waitForProcessInstances, AdminApiHelper } from './api-helper';
import { UnleashHelper } from './unleash-helper';
import { expect } from '@playwright/test';

export type SkattepliktigStatus = 'skattepliktig' | 'ikke-skattepliktig' | 'delvis';

export interface BehandlingOptions {
    skattepliktigStatus: SkattepliktigStatus;
    periodeFra: string;
    periodeTil: string;
    userId?: string;
}

export interface NyVurderingOptions {
    nySkattepliktigStatus: SkattepliktigStatus;
    nyPeriodeFra?: string;
    nyPeriodeTil?: string;
}

/**
 * Workflow helper for årsavregning tests
 * Provides reusable functions for common test scenarios
 */
export class AarsavregningWorkflowHelper {
    constructor(
        private page: Page,
        private request: APIRequestContext
    ) {}

    /**
     * Complete workflow: Create case, behandle, and fatt vedtak
     */
    async opprettOgBehandleSak(options: BehandlingOptions): Promise<void> {
        const {
            skattepliktigStatus,
            periodeFra,
            periodeTil,
            userId = USER_ID_VALID
        } = options;

        // Setup page objects
        const hovedside = new HovedsidePage(this.page);
        const opprettSak = new OpprettNySakPage(this.page);
        const medlemskap = new MedlemskapPage(this.page);
        const arbeidsforhold = new ArbeidsforholdPage(this.page);
        const lovvalg = new LovvalgPage(this.page);
        const resultatPeriode = new ResultatPeriodePage(this.page);
        const trygdeavgift = new TrygdeavgiftPage(this.page);
        const vedtak = new VedtakPage(this.page);

        // Step 1: Create new case
        console.log(`📝 Creating new case for ${userId}...`);
        await hovedside.gotoOgOpprettNySak();
        await opprettSak.opprettStandardSak(userId);
        await opprettSak.assertions.verifiserBehandlingOpprettet();

        // Step 2: Navigate to behandling
        console.log('📝 Opening behandling...');
        await waitForProcessInstances(this.request, 30);
        await hovedside.goto();
        await this.page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

        // Step 3: Fill Medlemskap
        console.log(`📝 Filling medlemskap (${periodeFra} → ${periodeTil})...`);
        await medlemskap.velgPeriode(periodeFra, periodeTil);
        await medlemskap.velgLand('Afghanistan');
        await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
        await medlemskap.klikkBekreftOgFortsett();

        // Step 4: Select Arbeidsforhold
        console.log('📝 Selecting arbeidsforhold...');
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        // Step 5: Answer Lovvalg questions
        console.log('📝 Answering lovvalg questions...');
        await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
        await lovvalg.svarJaPaaFørsteSpørsmål();
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
        await lovvalg.klikkBekreftOgFortsett();

        // Step 6: Select Innvilget for Resultat Periode
        // When using FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON, there are 2 periods (Helse + Pensjon)
        console.log('📝 Selecting resultat periode (Innvilget)...');

        // Wait for page to load and check for multiple periods
        await this.page.waitForTimeout(1000); // Let page stabilize

        // Check if there are multiple periods by counting resultat dropdowns
        const resultatDropdowns = await this.page.locator('select[name^="medlemskapsperioder"][name$=".innvilgelsesResultat"]').count();
        console.log(`📝 Found ${resultatDropdowns} resultat periode dropdown(s)`);

        if (resultatDropdowns > 1) {
            // Multiple periods (Helse + Pensjon split)
            // System defaults: Period 1 (Helsedel) = Avslått, Period 2 (Pensjonsdel) = Innvilget
            // Accept these defaults to avoid overlap error
            console.log('📝 Multiple periods detected, accepting defaults (Helsedel: Avslått, Pensjonsdel: Innvilget)...');
            await resultatPeriode.klikkBekreftOgFortsett();
        } else {
            // Single period - default is Avslått, needs to be changed to Innvilget
            await resultatPeriode.fyllUtResultatPeriode('INNVILGET');
        }

        // Step 7: Fill Trygdeavgift
        console.log(`📝 Filling trygdeavgift (${skattepliktigStatus})...`);
        await trygdeavgift.ventPåSideLastet();
        await this.fyllTrygdeavgift(trygdeavgift, skattepliktigStatus);
        await trygdeavgift.klikkBekreftOgFortsett();

        // Step 8: Fatt vedtak
        console.log('📝 Making decision...');
        await vedtak.klikkFattVedtak();

        console.log('📝 Waiting for process instances after vedtak...');
        await waitForProcessInstances(this.request, 30);
    }

    /**
     * Create a "ny vurdering" (new assessment) for existing case
     */
    async opprettNyVurdering(options: NyVurderingOptions): Promise<void> {
        const { nySkattepliktigStatus, nyPeriodeFra, nyPeriodeTil } = options;

        const hovedside = new HovedsidePage(this.page);
        const medlemskap = new MedlemskapPage(this.page);
        const arbeidsforhold = new ArbeidsforholdPage(this.page);
        const lovvalg = new LovvalgPage(this.page);
        const resultatPeriode = new ResultatPeriodePage(this.page);
        const trygdeavgift = new TrygdeavgiftPage(this.page);
        const vedtak = new VedtakPage(this.page);

        console.log('📝 Creating ny vurdering...');
        await hovedside.goto();
        await this.page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

        // Click "Ny vurdering" button
        await this.page.getByRole('button', { name: 'Ny vurdering' }).click();

        // If new period provided, update medlemskap period
        if (nyPeriodeFra && nyPeriodeTil) {
            console.log(`📝 Updating period (${nyPeriodeFra} → ${nyPeriodeTil})...`);
            await medlemskap.velgPeriode(nyPeriodeFra, nyPeriodeTil);
        }
        await medlemskap.klikkBekreftOgFortsett();

        // Arbeidsforhold - just continue with existing
        await arbeidsforhold.klikkBekreftOgFortsett();

        // Lovvalg - use same answers
        await lovvalg.klikkBekreftOgFortsett();

        // Resultat periode - select Innvilget (handle multiple periods)
        console.log('📝 Selecting resultat periode (Innvilget)...');

        // Wait for page to load and check for multiple periods
        await this.page.waitForTimeout(1000);
        const resultatDropdowns = await this.page.locator('select[name^="medlemskapsperioder"][name$=".innvilgelsesResultat"]').count();
        console.log(`📝 Found ${resultatDropdowns} resultat periode dropdown(s)`);

        if (resultatDropdowns > 1) {
            // Multiple periods - accept defaults to avoid overlap
            console.log('📝 Multiple periods detected, accepting defaults (Helsedel: Avslått, Pensjonsdel: Innvilget)...');
            await resultatPeriode.klikkBekreftOgFortsett();
        } else {
            // Single period - change to Innvilget
            await resultatPeriode.fyllUtResultatPeriode('INNVILGET');
        }

        // Trygdeavgift - apply new status
        console.log(`📝 Filling trygdeavgift (${nySkattepliktigStatus})...`);
        await trygdeavgift.ventPåSideLastet();
        await this.fyllTrygdeavgift(trygdeavgift, nySkattepliktigStatus);
        await trygdeavgift.klikkBekreftOgFortsett();

        // Fatt vedtak
        console.log('📝 Making decision for ny vurdering...');
        await vedtak.klikkFattVedtak();

        console.log('📝 Waiting for process instances after ny vurdering...');
        await waitForProcessInstances(this.request, 30);
    }

    /**
     * Run årsavregning job and verify expected number of cases processed
     */
    async kjørÅrsavregningJob(forventetAntall: number): Promise<void> {
        const unleash = new UnleashHelper(this.request);
        const adminApi = new AdminApiHelper();

        console.log('📝 Running årsavregning job...');
        await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        await adminApi.finnIkkeSkattepliktigeSaker(
            this.request,
            '2024-01-01',
            '2024-12-31',
            true // lagProsessinstanser
        );

        const response = await adminApi.waitForIkkeSkattepliktigeSakerJob(
            this.request,
            60, // 60 seconds timeout
            1000 // Poll every 1 second
        );

        console.log(`📊 Job processed: ${response.antallProsessert} cases`);
        expect(response.antallProsessert).toBe(forventetAntall);
    }

    /**
     * Helper to fill trygdeavgift based on skattepliktig status
     */
    private async fyllTrygdeavgift(
        trygdeavgift: TrygdeavgiftPage,
        status: SkattepliktigStatus
    ): Promise<void> {
        switch (status) {
            case 'ikke-skattepliktig':
                // WORKAROUND: Call twice for split periods (Helse + Pensjon)
                await trygdeavgift.velgSkattepliktig(false);
                await trygdeavgift.velgSkattepliktig(false);
                await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
                await trygdeavgift.velgBetalesAga(false);
                await trygdeavgift.fyllInnBruttoinntekt('100000');
                await this.page.waitForTimeout(2000);
                break;

            case 'skattepliktig':
                await trygdeavgift.velgSkattepliktig(true);
                await trygdeavgift.velgSkattepliktig(true);
                await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
                await trygdeavgift.velgBetalesAga(false); // false to show Bruttoinntekt field
                await trygdeavgift.fyllInnBruttoinntekt('100000');
                await this.page.waitForTimeout(2000);
                break;

            case 'delvis':
                // Create multiple periods with different tax status
                // First period: skattepliktig
                await trygdeavgift.velgSkattepliktig(true);
                await trygdeavgift.velgSkattepliktig(true);
                await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
                await trygdeavgift.velgBetalesAga(false); // false to show Bruttoinntekt field
                await trygdeavgift.fyllInnBruttoinntekt('50000');
                await this.page.waitForTimeout(1000);

                // Add second period via "Legg til periode" if exists
                const leggTilButton = this.page.getByRole('button', { name: 'Legg til periode' });
                if (await leggTilButton.isVisible()) {
                    await leggTilButton.click();
                    await this.page.waitForTimeout(1000);

                    // Second period: ikke-skattepliktig
                    await trygdeavgift.velgSkattepliktig(false);
                    await trygdeavgift.velgSkattepliktig(false);
                    await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
                    await trygdeavgift.velgBetalesAga(false);
                    await trygdeavgift.fyllInnBruttoinntekt('50000');
                    await this.page.waitForTimeout(2000);
                }
                break;
        }
    }

    /**
     * Setup unleash for årsavregning tests
     * Disables feature toggle at start of test
     */
    async setupUnleash(): Promise<void> {
        const unleash = new UnleashHelper(this.request);
        await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');
    }
}
