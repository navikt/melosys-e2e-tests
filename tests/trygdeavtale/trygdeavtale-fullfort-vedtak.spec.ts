import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { TrygdeavtaleBehandlingPage } from '../../pages/behandling/trygdeavtale-behandling.page';
import { TrygdeavtaleArbeidsstedPage } from '../../pages/behandling/trygdeavtale-arbeidssted.page';
import { USER_ID_VALID } from '../../pages/shared/constants';

/**
 * Komplett Trygdeavtale arbeidsflyt test
 *
 * Arbeidsflyt:
 * 1. Opprett ny Trygdeavtale-sak
 * 2. Fyll inn periode og velg arbeidsland (Australia)
 * 3. Velg arbeidsgiver
 * 4. Innvilg søknad og velg bestemmelse
 * 5. Legg til arbeidssted
 * 6. Fatt vedtak direkte fra behandlingssiden (ingen egen vedtaksside for Trygdeavtale)
 *
 * Denne testen dekker hele flyten fra saksopprettelse til vedtak for Trygdeavtale.
 * Merk: I motsetning til FTRL, har Trygdeavtale IKKE en egen vedtaksside med tekstfelter.
 */
test.describe('Trygdeavtale - Komplett arbeidsflyt', () => {
  test('skal fullføre trygdeavtale-arbeidsflyt med vedtak', async ({ page }) => {
    // Oppsett
    const auth = new AuthHelper(page);
    await auth.login();

    // Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new TrygdeavtaleBehandlingPage(page);
    const arbeidssted = new TrygdeavtaleArbeidsstedPage(page);

    // Opprett sak
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype('TRYGDEAVTALE');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('YRKESAKTIV');
    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Naviger til behandling
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

    // Fullfør behandling med hjelpemetoder
    await behandling.fyllUtPeriodeOgLand('01.01.2024', '01.01.2026', 'AU');
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
    await behandling.innvilgeOgVelgBestemmelse('AUS_ART9_3');

    // Fullfør arbeidssted og fatt vedtak
    await arbeidssted.fyllUtArbeidsstedOgFattVedtak('Test');

    console.log('✅ Trygdeavtale-arbeidsflyt fullført med hjelpemetoder');
  });
});
