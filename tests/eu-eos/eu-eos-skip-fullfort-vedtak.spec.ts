import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosSkipBehandlingPage } from '../../pages/behandling/eu-eos-skip-behandling.page';
import { USER_ID_VALID } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';

/**
 * Komplett EU/EØS Skip (Ship) arbeidsflyt test
 *
 * Arbeidsflyt:
 * 1. Opprett ny EU/EØS-sak (UTSENDT_ARBEIDSTAKER)
 * 2. Fyll inn periode og land (Danmark)
 * 3. Velg "Yrkesaktiv på sokkel eller"
 * 4. Legg til arbeidssted på skip med detaljer:
 *    - Skipnavn: Hilda
 *    - Fartsområde: UTENRIKS
 *    - Flaggstat: Frankrike (FR)
 *    - Sokkel og flaggland-valg
 * 5. Velg arbeidsgiver
 * 6. Velg land (Norge)
 * 7. Svar på skip-spesifikke spørsmål
 * 8. Fatt vedtak
 *
 * Denne testen dekker hele flyten for skip/sokkel-arbeidsforhold i EU/EØS.
 * Merk: Dette er et spesialtilfelle av EU/EØS med maritime elementer.
 */
test.describe('EU/EØS Skip - Komplett arbeidsflyt', () => {
  test('skal fullføre EU/EØS-skip-arbeidsflyt med vedtak', async ({ page }) => {
    // Øk test timeout til 120 sekunder (vedtak kan ta lang tid på CI)
    test.setTimeout(120000);

    // Oppsett
    const auth = new AuthHelper(page);
    await auth.login();

    // Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const skipBehandling = new EuEosSkipBehandlingPage(page);

    // Opprett sak
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype('EU_EOS');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('UTSENDT_ARBEIDSTAKER');

    // Fyll periode og land
    await skipBehandling.fyllInnFraTilDato('01.01.2024', '31.12.2025');
    await skipBehandling.velgLand('Danmark');
    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    // Vent på prosessinstanser
    console.log('📝 Venter på prosessinstanser...');
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();

    // Naviger til behandling
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    // Vent på at behandlingssiden har lastet
    await page.waitForLoadState('networkidle');

    // Bruk hjelpemetode for resten av flyten
    await skipBehandling.fyllUtSkipBehandling('Hilda', 'Ståles Stål AS');

    // Verifiser
    await skipBehandling.assertions.verifiserVedtakFattet();

      console.log('✅ EU/EØS-skip-arbeidsflyt fullført');
  });
});
