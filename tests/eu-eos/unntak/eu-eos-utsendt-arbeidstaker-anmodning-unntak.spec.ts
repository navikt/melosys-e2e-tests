import { test, expect } from '../../../fixtures';
import { AuthHelper } from '../../../helpers/auth-helper';
import { HovedsidePage } from '../../../pages/hovedside.page';
import { OpprettNySakPage } from '../../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../../pages/behandling/eu-eos-behandling.page';
import { AnmodningUnntakPage } from '../../../pages/eu-eos/unntak/anmodning-unntak.page';
import { waitForProcessInstances } from '../../../helpers/api-helper';
import {
  USER_ID_VALID,
  SAKSTYPER,
  SAKSTEMA,
  BEHANDLINGSTEMA,
  AARSAK,
  EU_EOS_LAND,
} from '../../../pages/shared/constants';

/**
 * EU/EØS Utsendt arbeidstaker - Anmodning om unntak via behandlingsflyt
 *
 * Tester full arbeidsflyt:
 * 1. Opprett EU/EØS sak med "Utsendt arbeidstaker"
 * 2. Naviger til sak og gå gjennom behandlingssteg
 * 3. Velg "Yrkesaktiv, direkte til" for å gå rett til unntak
 * 4. Velg arbeidsgiver
 * 5. Fyll ut unntak-skjema og send brevene
 */
test.describe('EU/EØS Utsendt arbeidstaker - Anmodning om unntak', () => {

  test('skal opprette sak og sende anmodning om unntak via behandlingsflyt', async ({ page }) => {
    test.setTimeout(120000);

    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new EuEosBehandlingPage(page);
    const unntak = new AnmodningUnntakPage(page);

    // === STEG 1: Opprett EU/EØS sak med "Utsendt arbeidstaker" ===
    console.log('Steg 1: Oppretter EU/EØS sak');
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();

    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype(SAKSTYPER.EU_EOS);
    await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
    await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.UTSENDT_ARBEIDSTAKER);

    await behandling.fyllInnFraTilDato('01.01.2026', '01.01.2027');
    await behandling.velgLand(EU_EOS_LAND.DANMARK);

    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    // Vent på prosessinstanser og last siden på nytt
    console.log('Steg 2: Venter på prosessinstanser');
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();

    // === STEG 3: Naviger til behandling ===
    console.log('Steg 3: Navigerer til behandling');
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    await page.waitForLoadState('networkidle');

    // === STEG 4: Bekreft inngangsvilkår ===
    console.log('Steg 4: Bekrefter inngangsvilkår');
    await behandling.klikkBekreftOgFortsett();

    // === STEG 5: Velg yrkesaktiv, direkte til ===
    console.log('Steg 5: Velger yrkesaktiv, direkte til');
    await behandling.velgYrkesaktiv();
    await behandling.velgYrkesaktivDirekteTil();
    await behandling.klikkBekreftOgFortsett();

    // === STEG 6: Velg arbeidsgiver ===
    console.log('Steg 6: Velger arbeidsgiver');
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');

    // === STEG 7: Fyll ut og send brevene ===
    console.log('Steg 7: Fyller ut unntak og sender brevene');
    await unntak.fyllUtOgSendBrevene({
      artikkel: 'FO_883_2004_ART11_3A',
      begrunnelse: 'KORTVARIG_PERIODE_RETUR_NORSK_AG',
      ytterligereInfo: 'E2E test - anmodning om unntak',
    });
  });
});
