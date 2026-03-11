import {test, expect} from '../../fixtures';
import {AuthHelper} from '../../helpers/auth-helper';
import {HovedsidePage} from '../../pages/hovedside.page';
import {OpprettNySakPage} from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {EuEosBehandlingPage} from '../../pages/behandling/eu-eos-behandling.page';
import {ArbeidFlereLandBehandlingPage} from '../../pages/behandling/arbeid-flere-land-behandling.page';
import {USER_ID_VALID} from '../../pages/shared/constants';
import {waitForProcessInstances} from '../../helpers/api-helper';

/**
 * EU/EØS artikkel 13.1 - Arbeid i flere land
 *
 * Arbeidsflyt:
 * 1. Opprett ny EU/EØS-sak (ARBEID_FLERE_LAND)
 * 2. Fyll inn periode (Fra/Til)
 * 3. Velg to land (arbeidsland og hjemland)
 * 4. Velg årsak (SØKNAD)
 * 5. Opprett behandling
 * 6. Velg hjemland (Norge)
 * 7. Velg arbeidsgiver
 * 8. Bekreft arbeid i flere land
 * 9. Velg lønnet arbeid i to eller flere land
 * 10. Velg prosentandel (25% eller mer)
 * 11. Fyll inn vedtakstekst og fatt vedtak
 *
 * Denne testen dekker hele flyten for "Arbeid i flere land" med POM.
 */
test.describe('EU/EØS - Arbeid i flere land (artikkel 13.1)', () => {
    test('skal fullføre arbeid i flere land-arbeidsflyt', async ({page}) => {
        // Øk test timeout til 180 sekunder (reload-fallback ved rendering-stall kan ta opptil 90s per steg)
        test.setTimeout(180000);

        // Oppsett
        const auth = new AuthHelper(page);
        await auth.login();

        // Page Objects
        const hovedside = new HovedsidePage(page);
        const opprettSak = new OpprettNySakPage(page);
        const euEosBehandling = new EuEosBehandlingPage(page);
        const behandling = new ArbeidFlereLandBehandlingPage(page);

        // Opprett sak med to land
        await hovedside.goto();
        await hovedside.klikkOpprettNySak();
        await opprettSak.fyllInnBrukerID(USER_ID_VALID);
        await opprettSak.velgSakstype('EU_EOS');
        await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
        await opprettSak.velgBehandlingstema('ARBEID_FLERE_LAND');

        // Fyll inn periode og land (under saksopprettelse)
        await euEosBehandling.fyllInnFraTilDato('01.01.2024', '31.12.2025');
        await euEosBehandling.velgLand('Estland');
        // Velg andre land (hjemland) - dette vises bare for "Arbeid i flere land"
        await euEosBehandling.velgAndreLand('Norge');

        // Velg årsak før andre land
        await opprettSak.velgAarsak('SØKNAD');
        // Vent på at andre dropdown vises (trigges av behandlingstema "ARBEID_FLERE_LAND")
        await page.waitForTimeout(1000);


        // Fullfør saksopprettelse
        await opprettSak.leggBehandlingIMine();
        await opprettSak.klikkOpprettNyBehandling();

        // Vent på prosessinstanser og last siden på nytt
        console.log('📝 Venter på prosessinstanser...');
        await waitForProcessInstances(page.request, 30);
        await hovedside.goto();

        // Naviger til behandling
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();
        // Vent på at behandlingssiden har lastet
        await page.waitForLoadState('networkidle');

        // Fullfør behandling med POM
        await behandling.fyllUtArbeidFlereLandBehandling(
            'Norge',              // land (hjemland)
            'Ståles Stål AS',     // arbeidsgiver
            'Test begrunnelse',   // begrunnelse
            'Test informasjon'    // informasjon (ytterligere informasjon)
        );

        console.log('✅ EU/EØS "Arbeid i flere land" arbeidsflyt fullført');
    });
});
