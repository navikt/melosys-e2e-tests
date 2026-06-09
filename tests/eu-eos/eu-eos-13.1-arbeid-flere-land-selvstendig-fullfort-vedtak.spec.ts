import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { ArbeidFlereLandBehandlingPage } from '../../pages/behandling/arbeid-flere-land-behandling.page';
import { USER_ID_VALID, EU_EOS_LAND } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { fetchStoredSedDocuments, findNewNavFormatSed } from '../../helpers/mock-helper';

/**
 * EU/EØS 13.1 - Arbeid i flere land (Selvstendig næringsvirksomhet variant)
 *
 * Arbeidsflyt:
 * 1. Opprett ny EU/EØS-sak (ARBEID_FLERE_LAND)
 * 2. Fyll inn periode (Fra og Til dato)
 * 3. Velg to land (Sverige og Norge)
 * 4. Velg årsak (SØKNAD)
 * 5. Opprett behandling
 * 6. Bekreft første steg
 * 7. Velg hovedland (Norge)
 * 8. Velg arbeidsgiver (Ståles Stål AS)
 * 9. Svar på spørsmål om arbeidslokasjon
 * 10. Velg arbeidstype (Selvstendig næringsvirksomhet i to eller flere land)
 * 11. Velg prosentandel (% eller mer)
 * 12. Fyll inn fritekst-felter
 * 13. Velg SED-dokument (SED A003) via popup
 * 14. Fatt vedtak
 *
 * Denne testen dekker varianten med selvstendig næringsvirksomhet og SED-dokument popup.
 */
test.describe('EU/EØS 13.1 - Arbeid i flere land (Selvstendig variant)', () => {
  test('skal fullføre "Arbeid i flere land" med selvstendig næringsvirksomhet og SED-dokument', async ({ page, request }) => {
    // Øk test timeout til 120 sekunder (vedtak kan ta lang tid på CI)
    test.setTimeout(120000);

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
    await euEosBehandling.fyllInnFraTilDato('19.11.2025', '18.11.2026');

    // Velg to land (Sverige og Norge)
    await euEosBehandling.velgLand(EU_EOS_LAND.SVERIGE);
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

    // Fullfør behandling - steg-for-steg for å demonstrere alle metodene

    // Steg 1: Bekreft første steg (periode og land er allerede fylt)
    await behandling.klikkBekreftOgFortsett();

    // Steg 2: Velg hovedland (Norge)
    await behandling.velgLandRadio('Norge');
    await behandling.klikkBekreftOgFortsett();

    // Steg 3: Velg arbeidsgiver
    await behandling.velgArbeidsgiver('Ståles Stål AS');
    await behandling.klikkBekreftOgFortsett();

    // Steg 4: Svar på arbeidslokasjon-spørsmål
    await behandling.velgArbeidUtføresILandSomEr();
    await behandling.klikkBekreftOgFortsett();

    // Steg 5: Velg arbeidstype (Selvstendig næringsvirksomhet)
    await behandling.velgSelvstendigNæringsvirksomhetIToEllerFlereLand();
    await behandling.klikkBekreftOgFortsett();

    // Steg 6: Velg prosentandel
    await behandling.velgProsentEllerMer();
    await behandling.klikkBekreftOgFortsett();

    // Steg 7: Fyll inn fritekst-felter
    await behandling.fyllInnFritekstTilBegrunnelse('lol');
    await behandling.fyllInnYtterligereInformasjon('foo-bar');

    // Steg 8: Velg institusjon som skal motta SED
    await behandling.velgInstitusjonSomSkalMottaSed('Sverige');

    // Snapshot A003-dokumenter før vedtak (SED sendes ved iverksetting av vedtak)
    const docsBefore = await fetchStoredSedDocuments(request, 'A003');

    // Steg 9: Fatt vedtak
    await behandling.fattVedtak();

    console.log('✅ "Arbeid i flere land" (Selvstendig variant) arbeidsflyt fullført med POM');

    // === Verifiser SED A003-innhold (lovvalgsvedtak til utland) ===
    // Gap: a003-ut-innholds-assertion. A003 sendes implisitt av flere vedtak-tester,
    // men ingen asserterer innholdet slik A001/A008 gjøres.
    const sedContent = await findNewNavFormatSed(request, 'A003', docsBefore);
    expect(sedContent.sed).toBe('A003');
    expect(sedContent.sedVer).toBe('4');
    expect(sedContent.sedGVer).toBe('4');

    const medlemskap = sedContent.medlemskap as Record<string, any>;

    // Artikkel: selvstendig næringsvirksomhet i flere land = art. 13(2)(a)
    expect(medlemskap.relevantartikkelfor8832004eller9872009).toBe('13_2_a');

    // Lovvalgsland og vedtaksperiode skal speile saken (NO, 19.11.2025–18.11.2026)
    const vedtak = medlemskap.vedtak as Record<string, any>;
    expect(vedtak.land).toBe('NO');
    expect(vedtak.gjelderperiode?.startdato).toBe('2025-11-19');
    expect(vedtak.gjelderperiode?.sluttdato).toBe('2026-11-18');
    expect(vedtak.eropprinneligvedtak).toBe('ja');

    console.log('✅ SED A003-innhold verifisert (art. 13(2)(a), lovvalgsland NO, periode 19.11.2025–18.11.2026)');
  });
});
