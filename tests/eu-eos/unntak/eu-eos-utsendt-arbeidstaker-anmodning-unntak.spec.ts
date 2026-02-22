import { test, expect } from '../../../fixtures';
import { AuthHelper } from '../../../helpers/auth-helper';
import { HovedsidePage } from '../../../pages/hovedside.page';
import { OpprettNySakPage } from '../../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../../pages/behandling/eu-eos-behandling.page';
import { AnmodningUnntakPage } from '../../../pages/eu-eos/unntak/anmodning-unntak.page';
import { waitForProcessInstances } from '../../../helpers/api-helper';
import { UnleashHelper } from '../../../helpers/unleash-helper';
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
 * Fire varianter:
 * 1. "Direkte til art.11(3)(a)" - Velg "Yrkesaktiv, direkte til", artikkel 11(3)(a)
 * 2. "Direkte til art.13(1)(a)" - Velg "Yrkesaktiv, direkte til", artikkel 13(1)(a)
 * 3. "Direkte til art.13(1)(a) med TWFA" - Som #2, men med Rammeavtale om fjernarbeid
 * 4. "Via full behandling" - Gå gjennom alle behandlingssteg, velg "Nei, jeg vil
 *    vurdere" med begrunnelse, deretter send unntak-brevene
 */
test.describe('EU/EØS Utsendt arbeidstaker - Anmodning om unntak', () => {

  /**
   * Helper: Opprett EU/EØS sak og naviger til behandling
   */
  async function opprettSakOgNavigerTilBehandling(page: any) {
    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new EuEosBehandlingPage(page);

    // Opprett EU/EØS sak med "Utsendt arbeidstaker"
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

    // Naviger til behandling
    console.log('Steg 3: Navigerer til behandling');
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    await page.waitForLoadState('networkidle');

    // Bekreft inngangsvilkår
    console.log('Steg 4: Bekrefter inngangsvilkår');
    await behandling.klikkBekreftOgFortsett();

    return { hovedside, opprettSak, behandling };
  }

  test('direkte til - skal sende anmodning om unntak', async ({ page }) => {
    test.setTimeout(120000);

    const { behandling } = await opprettSakOgNavigerTilBehandling(page);
    const unntak = new AnmodningUnntakPage(page);

    // === Velg yrkesaktiv, direkte til ===
    console.log('Steg 5: Velger yrkesaktiv, direkte til');
    await behandling.velgYrkesaktiv();
    await behandling.velgYrkesaktivDirekteTil();
    await behandling.klikkBekreftOgFortsett();

    // === Velg arbeidsgiver ===
    console.log('Steg 6: Velger arbeidsgiver');
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');

    // === Fyll ut og send brevene ===
    console.log('Steg 7: Fyller ut unntak og sender brevene');
    await unntak.fyllUtOgSendBrevene({
      artikkel: 'FO_883_2004_ART11_3A',
      begrunnelse: 'KORTVARIG_PERIODE_RETUR_NORSK_AG',
      ytterligereInfo: 'E2E test - direkte til unntak',
    });
  });

  test('direkte til art.13(1)(a) - skal sende anmodning om unntak', async ({ page }) => {
    test.setTimeout(120000);

    const { behandling } = await opprettSakOgNavigerTilBehandling(page);
    const unntak = new AnmodningUnntakPage(page);

    // === Velg yrkesaktiv, direkte til ===
    console.log('Steg 5: Velger yrkesaktiv, direkte til');
    await behandling.velgYrkesaktiv();
    await behandling.velgYrkesaktivDirekteTil();
    await behandling.klikkBekreftOgFortsett();

    // === Velg arbeidsgiver ===
    console.log('Steg 6: Velger arbeidsgiver');
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');

    // === Fyll ut og send brevene ===
    console.log('Steg 7: Fyller ut unntak og sender brevene');
    await unntak.fyllUtOgSendBrevene({
      artikkel: 'FO_883_2004_ART13_1A',
      begrunnelse: 'DELTIDSARBEID_I_UTLANDET_MOTTAR_AAP',
      ytterligereInfo: 'E2E test - direkte til art.13(1)(a)',
    });
  });

  test('direkte til art.13(1)(a) med TWFA - skal sende anmodning om unntak', async ({ page, request }) => {
    test.setTimeout(120000);

    // TWFA checkbox requires CDM 4.4 toggle
    const unleash = new UnleashHelper(request);
    await unleash.enableFeature('melosys.cdm-4-4');

    const { behandling } = await opprettSakOgNavigerTilBehandling(page);
    const unntak = new AnmodningUnntakPage(page);

    // === Velg yrkesaktiv, direkte til ===
    console.log('Steg 5: Velger yrkesaktiv, direkte til');
    await behandling.velgYrkesaktiv();
    await behandling.velgYrkesaktivDirekteTil();
    await behandling.klikkBekreftOgFortsett();

    // === Velg arbeidsgiver ===
    console.log('Steg 6: Velger arbeidsgiver');
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');

    // === Fyll ut med TWFA og send brevene ===
    console.log('Steg 7: Fyller ut unntak med TWFA og sender brevene');
    await unntak.fyllUtOgSendBrevene({
      artikkel: 'FO_883_2004_ART13_1A',
      twfa: true,
      begrunnelse: 'HJEMMEKONTOR_MEDFOELGENDE',
      ytterligereInfo: 'E2E test - direkte til art.13(1)(a) med TWFA',
    });
  });

  test('via full behandling - skal sende anmodning om unntak', async ({ page }) => {
    test.setTimeout(120000);

    const { behandling } = await opprettSakOgNavigerTilBehandling(page);
    const unntak = new AnmodningUnntakPage(page);

    // === Velg yrkesaktiv (uten "direkte til") ===
    console.log('Steg 5: Velger yrkesaktiv');
    await behandling.velgYrkesaktiv();
    await behandling.klikkBekreftOgFortsett();

    // === Velg arbeidsgiver ===
    console.log('Steg 6: Velger arbeidsgiver');
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');

    // === Velg lønnet arbeid ===
    console.log('Steg 7: Velger lønnet arbeid');
    await behandling.velgArbeidstype(true);

    // === Svar Ja på to spørsmål ===
    console.log('Steg 8: Svarer Ja på spørsmål');
    await behandling.svarJaOgFortsett();
    await behandling.svarJaOgFortsett();

    // === Velg "Nei, jeg vil vurdere" med begrunnelse ===
    console.log('Steg 9: Velger nei, vil vurdere med begrunnelse');
    await behandling.velgNeiVilVurdere();
    await behandling.leggTilBegrunnelseForVurdering(
      'Erstatter en annen utsendt person, samlet periode over 24 md.'
    );
    await behandling.klikkBekreftOgFortsett();

    // Rammeavtale om fjernarbeid (TWFA) - en med og uten

    // === Fyll ut og send brevene ===
    console.log('Steg 10: Fyller ut unntak og sender brevene');
    await unntak.fyllUtOgSendBrevene({
      artikkel: 'FO_883_2004_ART11_3A',
      begrunnelse: 'ERSTATTER_EN_ANNEN_UNDER_5_AAR',
      ytterligereInfo: 'E2E test - via full behandling',
    });
  });
});
