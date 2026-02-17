import { test, expect } from '../../../fixtures';
import { AuthHelper } from '../../../helpers/auth-helper';
import { waitForProcessInstances } from '../../../helpers/api-helper';
import { HovedsidePage } from '../../../pages/hovedside.page';
import { OpprettNySakPage } from '../../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { BehandlingPage } from '../../../pages/behandling/behandling.page';
import { MedlemskapPage } from '../../../pages/behandling/medlemskap.page';
import { ArbeidsforholdPage } from '../../../pages/behandling/arbeidsforhold.page';
import { LovvalgPage } from '../../../pages/behandling/lovvalg.page';
import { TrygdeavgiftPage } from '../../../pages/trygdeavgift/trygdeavgift.page';
import { VedtakPage } from '../../../pages/vedtak/vedtak.page';
import { BehandlingsmenyPage } from '../../../pages/behandling/behandlingsmeny.page';
import { OppsummeringPage } from '../../../pages/behandling/oppsummering.page';
import { USER_ID_VALID } from '../../../pages/shared/constants';

/**
 * Trygdeavgift-kontroller E2E-tester
 *
 * Tester to bugfikser (MELOSYS-7831):
 *
 * Feil 1: harBehandlingMedTrygdeavgift returnerte true for tidlig
 *   - Fikset i TrygdeavgiftFagsakController.kt: sjekkFakturaserie=true
 *   - Resultat: Behandlingstema skal være redigerbar FØR ferdigbehandling
 *
 * Feil 2: Kontroll ga advarsler om overlappende periode for bortfalte saker
 *   - Fikset i Kontroll.kt: filtrer bort saker med UGYLDIGE_SAKSSTATUSER_FOR_TRYGDEAVGIFT
 *   - Resultat: Bortfalt sak skal IKKE trigge advarsel på ny sak
 *
 * Flow: FTRL YRKESAKTIV (bevist i eksisterende E2E-tester)
 */

test.describe('Trygdeavgift-kontroller', () => {

  test('Behandlingstema skal være redigerbar før ferdigbehandling', async ({ page }) => {
    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new BehandlingPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const oppsummering = new OppsummeringPage(page);

    // Steg 1: Opprett FTRL YRKESAKTIV sak
    console.log('📋 Steg 1: Opprett sak');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);

    // Steg 2: Klikk på saken for å åpne den
    console.log('📋 Steg 2: Åpne saken');
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

    // Steg 3: Rediger dato
    await behandling.endreDatoMedDatovelger('2024', 'november', 'fredag 1');

    // Steg 4: Medlemskap
    console.log('📋 Steg 3: Medlemskap');
    await medlemskap.velgPeriode('01.11.2024', '14.11.2024');
    await medlemskap.velgFlereLandIkkeKjentHvilke();
    await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
    await medlemskap.klikkBekreftOgFortsett();

    // Steg 5: Arbeidsforhold
    console.log('📋 Steg 4: Arbeidsforhold');
    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    // Steg 6: Lovvalg
    console.log('📋 Steg 5: Lovvalg');
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmål(['Har søker vært medlem i minst', 'Har søker nær tilknytning til']);
    await lovvalg.klikkBekreftOgFortsettMedVent();
    await lovvalg.klikkBekreftOgFortsettMedVent();

    // Steg 7: Trygdeavgift - beregn trygdeavgift (men IKKE fatt vedtak)
    console.log('📋 Steg 6: Trygdeavgift');
    await behandling.gåTilTrygdeavgift();
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(true);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
    await trygdeavgift.klikkBekreftOgFortsett();

    // Steg 8: Verifiser at behandlingstema er redigerbar i EndreBehandling-modalen
    console.log('📋 Steg 7: Verifiser EndreBehandling-modal');
    await oppsummering.klikkEndre();
    await oppsummering.verifiserBehandlingstemaRedigerbar();
    await oppsummering.verifiserIngenFakturaserieMelding();
    await oppsummering.lukkModal();

    console.log('✅ Test fullført: Behandlingstema er redigerbar før ferdigbehandling');
  });

  test('Bortfalt sak skal ikke gi kontroll-advarsel på ny sak', async ({ page, request }) => {
    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new BehandlingPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);
    const behandlingsmeny = new BehandlingsmenyPage(page);

    // ========== SAK 1: Opprett, ferdigbehandl, og bortfall ==========

    // Steg 1: Opprett FTRL YRKESAKTIV sak
    console.log('📋 SAK 1 - Steg 1: Opprett sak');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);

    // Steg 2: Åpne saken
    console.log('📋 SAK 1 - Steg 2: Åpne saken');
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    await behandling.endreDatoMedDatovelger('2024', 'november', 'fredag 1');

    // Steg 3: Medlemskap
    console.log('📋 SAK 1 - Steg 3: Medlemskap');
    await medlemskap.velgPeriode('01.11.2024', '14.11.2024');
    await medlemskap.velgFlereLandIkkeKjentHvilke();
    await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
    await medlemskap.klikkBekreftOgFortsett();

    // Steg 4: Arbeidsforhold
    console.log('📋 SAK 1 - Steg 4: Arbeidsforhold');
    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    // Steg 5: Lovvalg
    console.log('📋 SAK 1 - Steg 5: Lovvalg');
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmål(['Har søker vært medlem i minst', 'Har søker nær tilknytning til']);
    await lovvalg.klikkBekreftOgFortsettMedVent();
    await lovvalg.klikkBekreftOgFortsettMedVent();

    // Steg 6: Trygdeavgift
    console.log('📋 SAK 1 - Steg 6: Trygdeavgift');
    await behandling.gåTilTrygdeavgift();
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(true);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
    await trygdeavgift.klikkBekreftOgFortsett();

    // Steg 7: Fatt vedtak
    console.log('📋 SAK 1 - Steg 7: Fatt vedtak');
    await vedtak.fattVedtak('fritekst', 'begrunnelse', 'trygdeavgift');

    // Vent på asynkrone prosesser
    await waitForProcessInstances(request, 30);

    // Steg 8: Bortfall saken via behandlingsmeny
    console.log('📋 SAK 1 - Steg 8: Bortfall saken');

    // Naviger tilbake til saken (etter vedtak navigerer vi til forsiden)
    await hovedside.goto();
    await hovedside.åpneSak('TRIVIELL KARAFFEL');
    await behandlingsmeny.bortfallBehandling();

    // Vent på asynkrone prosesser etter bortfall
    await waitForProcessInstances(request, 30);

    // ========== SAK 2: Opprett ny sak med overlappende periode ==========

    // Steg 9: Opprett ny sak for SAMME bruker
    console.log('📋 SAK 2 - Steg 1: Opprett ny sak med overlappende periode');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);

    // Steg 10: Åpne saken
    console.log('📋 SAK 2 - Steg 2: Åpne saken');
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    await behandling.endreDatoMedDatovelger('2024', 'november', 'fredag 1');

    // Steg 11: Medlemskap med overlappende periode
    console.log('📋 SAK 2 - Steg 3: Medlemskap (overlappende periode)');
    await medlemskap.velgPeriode('01.11.2024', '14.11.2024');
    await medlemskap.velgFlereLandIkkeKjentHvilke();
    await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
    await medlemskap.klikkBekreftOgFortsett();

    // Steg 12: Arbeidsforhold
    console.log('📋 SAK 2 - Steg 4: Arbeidsforhold');
    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    // Steg 13: Lovvalg
    console.log('📋 SAK 2 - Steg 5: Lovvalg');
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmål(['Har søker vært medlem i minst', 'Har søker nær tilknytning til']);
    await lovvalg.klikkBekreftOgFortsettMedVent();
    await lovvalg.klikkBekreftOgFortsettMedVent();

    // Steg 14: Trygdeavgift
    console.log('📋 SAK 2 - Steg 6: Trygdeavgift');
    await behandling.gåTilTrygdeavgift();
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(true);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
    await trygdeavgift.klikkBekreftOgFortsett();

    // Steg 15: Gå til vedtakssiden og verifiser INGEN advarsel
    console.log('📋 SAK 2 - Steg 7: Verifiser ingen kontroll-advarsel på vedtakssiden');
    await behandling.gåTilVedtak();

    // Vent på at vedtakssiden er lastet
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // VERIFISERING: Ingen .navds-alert--warning skal vises
    // Kontroll-advarsler vises via feilmeldinger.tsx med klassen .advarsler-container
    const warningAlerts = page.locator('.navds-alert--warning');
    const warningCount = await warningAlerts.count();

    if (warningCount > 0) {
      const warningTexts: string[] = [];
      for (let i = 0; i < warningCount; i++) {
        const text = await warningAlerts.nth(i).textContent();
        warningTexts.push(text || '');
      }
      console.error(`❌ Uventede advarsler funnet: ${warningTexts.join(', ')}`);
    }

    expect(warningCount).toBe(0);
    console.log('✅ Test fullført: Ingen kontroll-advarsel for bortfalt sak');
  });
});
