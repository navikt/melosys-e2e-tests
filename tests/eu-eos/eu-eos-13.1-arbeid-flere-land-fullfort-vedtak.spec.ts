import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { ArbeidFlereLandBehandlingPage } from '../../pages/behandling/arbeid-flere-land-behandling.page';
import { USER_ID_VALID, EU_EOS_LAND } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';

/**
 * EU/EØS 13.1 - Arbeid i flere land
 *
 * Arbeidsflyt:
 * 1. Opprett ny EU/EØS-sak (ARBEID_FLERE_LAND)
 * 2. Fyll inn periode (Fra og Til dato)
 * 3. Velg to land (Estland og Norge)
 * 4. Velg årsak (SØKNAD)
 * 5. Opprett behandling
 * 6. Bekreft første steg
 * 7. Velg hovedland (Norge)
 * 8. Velg arbeidsgiver (Ståles Stål AS)
 * 9. Svar på spørsmål om arbeidslokasjon
 * 10. Velg arbeidstype (Lønnet arbeid i to eller flere land)
 * 11. Velg prosentandel (% eller mer)
 * 12. Fyll inn fritekst-felter
 * 13. Fatt vedtak
 *
 * Denne testen dekker hele flyten for "Arbeid i flere land" fra saksopprettelse til vedtak.
 */
test.describe('EU/EØS 13.1 - Arbeid i flere land', () => {
  test('skal fullføre "Arbeid i flere land" arbeidsflyt med vedtak', async ({ page }) => {
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

    // Opprett sak
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype('EU_EOS');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('ARBEID_FLERE_LAND');

    // Fyll inn periode
    await euEosBehandling.fyllInnFraTilDato('01.01.2024', '31.12.2025');

    // Velg to land (Estland og Norge)
    await euEosBehandling.velgLand(EU_EOS_LAND.ESTLAND);
    await euEosBehandling.velgAndreLand(EU_EOS_LAND.NORGE);

    // Velg årsak og opprett behandling
    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    // Vent på prosessinstanser og last siden på nytt
    console.log('📝 Venter på prosessinstanser...');
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();

    // Naviger til behandling
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    // Vent på at behandlingssiden har lastet
    await page.waitForLoadState('networkidle');

    // Fullfør behandling med POM
    // Merk: Vi kan bruke hjelpemetoden for komplett flyt, eller steg-for-steg som vist under

    // Alternativ 1: Bruk hjelpemetode (anbefalt for enkle tester)
    await behandling.fyllUtArbeidFlereLandBehandling(
      'Norge',
      'Ståles Stål AS',
      'Lorem ipsum dolor sit amet',
      'Ytterligere informasjon om behandlingen'
    );

    console.log('✅ "Arbeid i flere land" arbeidsflyt fullført med POM');

    // Database-verifisering: behandlingstema ARBEID_FLERE_LAND, lovvalgsland NO og persistert vedtak
    await behandling.assertions.verifiserKomplettBehandling(USER_ID_VALID, 'NO');
  });
});
