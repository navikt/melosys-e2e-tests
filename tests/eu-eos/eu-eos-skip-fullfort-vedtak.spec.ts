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

    // For EU/EØS må vi fylle periode og land UNDER saksopprettelsen
    await skipBehandling.fyllInnFraTilDato('01.01.2024', '01.01.2026');
    await skipBehandling.velgLand('Danmark');
    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    // Vent på prosessinstanser og last siden på nytt
    console.log('📝 Venter på prosessinstanser...');
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();

    // Naviger til behandling
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

    // Steg 1: Bekreft periode/land (allerede fylt ved opprettelse)
    await skipBehandling.klikkBekreftOgFortsett();

    // Steg 2: Velg yrkesaktiv på sokkel
    await skipBehandling.velgYrkesaktivPaSokkel();
    await skipBehandling.klikkBekreftOgFortsett();

    // Steg 3: Legg til skip med detaljer
    await skipBehandling.klikkArbeidssted();
    await skipBehandling.leggTilNyttSkip();
    await skipBehandling.fyllInnSkipNavn('Hilda');
    await skipBehandling.velgFartsomrade('UTENRIKS');
    await skipBehandling.velgFlaggstat('Frankrike (FR)');
    await skipBehandling.velgNorskSokkel();
    await skipBehandling.velgSkipRegistrertIEttLand();
    await skipBehandling.velgFlagglandSomArbeidsland('Frankrike');
    await skipBehandling.velgSkip();
    await skipBehandling.klikkBekreftOgFortsett();

    // Steg 4: Velg arbeidsgiver
    await skipBehandling.velgArbeidsgiver('Ståles Stål AS');
    await skipBehandling.klikkBekreftOgFortsett();

    // Steg 5: Velg land (Norge)
    const norgeRadio = page.getByRole('radio', { name: 'Norge' });
    await norgeRadio.check();
    await skipBehandling.klikkBekreftOgFortsett();

    // Steg 6: Spørsmål om skip
    await skipBehandling.velgArbeiderPaNorskSkip();
    await skipBehandling.velgArbeiderPaUtenlandskSkip();
    await skipBehandling.klikkBekreftOgFortsett();

    // Steg 7: Fatt vedtak
    await skipBehandling.fattVedtak();

    // Verifiser
    await skipBehandling.assertions.verifiserVedtakFattet();

    console.log('✅ EU/EØS-skip-arbeidsflyt fullført');
  });

  test('skal fullføre skip-arbeidsflyt med hjelpemetode', async ({ page }) => {
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
    await skipBehandling.fyllInnFraTilDato('01.01.2024', '01.01.2026');
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

    // Bruk hjelpemetode for resten av flyten
    await skipBehandling.fyllUtSkipBehandling('Hilda', 'Ståles Stål AS');

    // Verifiser
    await skipBehandling.assertions.verifiserVedtakFattet();

    console.log('✅ EU/EØS-skip-arbeidsflyt fullført med hjelpemetode');
  });
});
