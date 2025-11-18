import {test} from '../../../fixtures';
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
 *
 * Reused from trygdeavgift-validations.spec.ts
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
test.describe('Trygdeavgift - Valideringsfeil @manual', () => {

    test('FEIL: Skattepliktig=Ja + Pensjon/uføretrygd det betales kildeskatt av', async ({page}) => {
        const trygdeavgift = await setupBehandlingToTrygdeavgift(page);

        console.log('📝 Testing: Skattepliktig + Pensjon/uføretrygd det betales kildeskatt av (SHOULD FAIL)');
        await trygdeavgift.velgSkattepliktig(true);
        await trygdeavgift.velgInntektskilde('Pensjon/uføretrygd det betales kildeskatt av');

        // Should show validation error
        await trygdeavgift.assertions.verifiserValideringsfeil(
            'kan ikke velges for perioder bruker er skattepliktig til Norge'
        );

        // Button should be disabled
        await trygdeavgift.assertions.verifiserBekreftKnappDeaktivert();

        console.log('✅ Validation error correctly shown and button disabled');
    });
});
