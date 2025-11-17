import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { USER_ID_VALID } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';

/**
 * Komplett EU/EØS arbeidsflyt test
 *
 * Arbeidsflyt:
 * 1. Opprett ny EU/EØS-sak (UTSENDT_ARBEIDSTAKER)
 * 2. Fyll inn periode med dateplukker
 * 3. Velg land (Danmark)
 * 4. Velg Yrkesaktiv
 * 5. Velg arbeidsgiver
 * 6. Velg Lønnet arbeid
 * 7. Svar Ja på to spørsmål
 * 8. Innvilg søknad og fatt vedtak
 *
 * Denne testen dekker hele flyten fra saksopprettelse til vedtak for EU/EØS.
 * Merk: EU/EØS fatter vedtak direkte uten egen vedtaksside (som Trygdeavtale).
 */
test.describe('EU/EØS - Komplett arbeidsflyt', () => {
  test('skal fullføre EU/EØS-arbeidsflyt med vedtak', async ({ page }) => {
    // Oppsett
    const auth = new AuthHelper(page);
    await auth.login();

    // Page Objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new EuEosBehandlingPage(page);

    // Opprett sak
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype('EU_EOS');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('UTSENDT_ARBEIDSTAKER');

    // For EU/EØS må vi fylle periode og land UNDER saksopprettelsen
    await behandling.velgPeriodeMedDatepicker('2024', 'fredag 1');
    await behandling.fyllInnSluttdato('01.01.2026');
    await behandling.velgLand('Danmark');

    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    // Vent på prosessinstanser og last siden på nytt
    console.log('📝 Venter på prosessinstanser...');
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();

    // Naviger til behandling
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

    // Fullfør resten av behandlingen (uten periode og land som allerede er fylt)
    await behandling.klikkBekreftOgFortsett(); // Første steg - bekreft periode/land
    await behandling.velgYrkesaktivEllerSelvstendigOgFortsett(true);
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
    await behandling.velgArbeidstype(true); // Lønnet arbeid
    await behandling.svarJaOgFortsett(); // Første spørsmål
    await behandling.svarJaOgFortsett(); // Andre spørsmål
    await behandling.innvilgeOgFattVedtak();

    console.log('✅ EU/EØS-arbeidsflyt fullført med hjelpemetoder');
  });
});
