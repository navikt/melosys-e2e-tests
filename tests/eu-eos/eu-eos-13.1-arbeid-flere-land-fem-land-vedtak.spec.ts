import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { ArbeidFlereLandBehandlingPage } from '../../pages/behandling/arbeid-flere-land-behandling.page';
import { USER_ID_VALID, EU_EOS_LAND } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';

/**
 * EU/EØS 13.1 - Arbeid i flere land (5 land)
 *
 * Arbeidsflyt:
 * 1. Opprett ny EU/EØS-sak (ARBEID_FLERE_LAND) med 5 land:
 *    Norge, Danmark, Belgia, Grønland, Tyskland
 * 2. Fyll inn periode
 * 3. Opprett behandling
 * 4. Bekreft inngangsvilkår
 * 5. Velg bostedsland (Norge)
 * 6. Velg arbeidsgiver (Ståles Stål AS)
 * 7. Bekreft arbeidslokasjon
 * 8. Velg arbeidstype (Lønnet arbeid i to eller flere land)
 * 9. Velg prosentandel (% eller mer)
 * 10. Fatt vedtak
 *
 * Tester at arbeid i flere land fungerer med mange land valgt.
 */
test.describe('EU/EØS 13.1 - Arbeid i flere land (5 land)', () => {
  test('skal fullføre arbeid i flere land med Norge, Danmark, Belgia, Grønland og Tyskland', async ({ page }) => {
    test.setTimeout(180000);

    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const euEosBehandling = new EuEosBehandlingPage(page);
    const behandling = new ArbeidFlereLandBehandlingPage(page);

    // === Saksopprettelse ===
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgOpprettNySak();
    await opprettSak.velgSakstype('EU_EOS');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('ARBEID_FLERE_LAND');

    // Fyll inn periode
    await euEosBehandling.fyllInnFraTilDato('01.01.2024', '31.12.2025');

    // Velg 5 land
    await euEosBehandling.velgLand(EU_EOS_LAND.NORGE);
    await euEosBehandling.velgAndreLand(EU_EOS_LAND.DANMARK);
    await euEosBehandling.velgAndreLand(EU_EOS_LAND.BELGIA);
    await euEosBehandling.velgAndreLand(EU_EOS_LAND.GRONLAND);
    await euEosBehandling.velgAndreLand(EU_EOS_LAND.TYSKLAND);

    // Opprett behandling
    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    // Vent på prosessinstanser
    console.log('📝 Venter på prosessinstanser...');
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();

    // === Behandling ===
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    await page.waitForLoadState('networkidle');

    // Steg 1: Inngang - Bekreft inngangsvilkår
    console.log('📋 Steg 1: Inngang');
    await behandling.klikkBekreftOgFortsett();

    // Steg 2: Bosted - Velg hovedland
    console.log('📋 Steg 2: Bosted');
    await behandling.velgLandRadio('Norge');
    await behandling.klikkBekreftOgFortsett();

    // Steg 3: Virksomhet - Velg arbeidsgiver
    console.log('📋 Steg 3: Virksomhet');
    await behandling.velgArbeidsgiver('Ståles Stål AS');
    await behandling.klikkBekreftOgFortsett({
      waitForContent: page.getByRole('checkbox', { name: 'Arbeid utføres i land som er' }),
    });

    // Steg 4: Arbeidslokasjon
    console.log('📋 Steg 4: Arbeidslokasjon');
    await behandling.velgArbeidUtføresILandSomEr();
    await behandling.klikkBekreftOgFortsett({
      waitForContent: page.getByRole('radio', { name: 'Lønnet arbeid i to eller' }),
    });

    // Steg 5: Arbeidstype
    console.log('📋 Steg 5: Arbeidstype');
    await behandling.velgLønnetArbeidIToEllerFlereLand();
    await behandling.klikkBekreftOgFortsett({
      waitForContent: page.getByRole('radio', { name: '% eller mer' }),
    });

    // Steg 6: Prosentandel
    console.log('📋 Steg 6: Prosentandel');
    await behandling.velgProsentEllerMer();
    await behandling.klikkBekreftOgFortsett();

    // Fatt vedtak (fixture håndterer waitForProcessInstances etter siste vedtak)
    console.log('📋 Fatter vedtak');
    await behandling.fattVedtak();

    console.log('✅ Arbeid i flere land med 5 land fullført');
  });
});
