import { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import { AuthHelper } from '../../../helpers/auth-helper';
import { HovedsidePage } from '../../../pages/hovedside.page';
import { OpprettNySakPage } from '../../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../../pages/behandling/eu-eos-behandling.page';
import { AnmodningUnntakPage } from '../../../pages/eu-eos/unntak/anmodning-unntak.page';
import { waitForProcessInstances } from '../../../helpers/api-helper';
import { UnleashHelper } from '../../../helpers/unleash-helper';
import { fetchStoredSedDocuments, findNewNavFormatSed } from '../../../helpers/mock-helper';
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
 * Seks varianter:
 * 1. "Direkte til art.11(3)(a)" - CDM 4.4, artikkel 11(3)(a)
 * 2. "Direkte til art.13(1)(a)" - CDM 4.4, artikkel 13(1)(a)
 * 3. "Direkte til art.13(1)(a) med TWFA" - CDM 4.4, med Rammeavtale om fjernarbeid
 * 4. "Via full behandling" - CDM 4.4, gjennom alle behandlingssteg
 * 5. "Direkte til CDM 4.3 art.11(3)(a)" - CDM 4.3 (toggle av)
 * 6. "Direkte til CDM 4.3 art.13(1)(a)" - CDM 4.3 (toggle av), verifiserer rammeavtale=null
 *
 * Alle varianter verifiserer SED A001-innhold fra RINA-mock.
 */
test.describe('EU/EØS Utsendt arbeidstaker - Anmodning om unntak', () => {

  /**
   * Helper: Opprett EU/EØS sak og naviger til behandling
   */
  async function opprettSakOgNavigerTilBehandling(page: Page) {
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
    await hovedside.åpneSak('TRIVIELL KARAFFEL -');
    await page.waitForLoadState('networkidle');

    // Bekreft inngangsvilkår
    console.log('Steg 4: Bekrefter inngangsvilkår');
    await behandling.klikkBekreftOgFortsett();

    return { hovedside, opprettSak, behandling };
  }

  /**
   * Helper: Velg "Yrkesaktiv, direkte til" og arbeidsgiver
   * Brukes av alle "direkte til"-varianter (5 av 6 tester)
   */
  async function velgDirekteTilOgArbeidsgiver(behandling: EuEosBehandlingPage): Promise<void> {
    console.log('Steg 5: Velger yrkesaktiv, direkte til');
    await behandling.velgYrkesaktiv();
    await behandling.velgYrkesaktivDirekteTil();
    await behandling.klikkBekreftOgFortsett();

    console.log('Steg 6: Velger arbeidsgiver');
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
  }

  test('direkte til - skal sende anmodning om unntak', async ({ page, request }) => {
    test.setTimeout(120000);

    // Eksplisitt CDM 4.4
    const unleash = new UnleashHelper(request);
    await unleash.enableFeature('melosys.cdm-4-4');

    const { behandling } = await opprettSakOgNavigerTilBehandling(page);
    const unntak = new AnmodningUnntakPage(page);

    await velgDirekteTilOgArbeidsgiver(behandling);

    // === Fyll ut brevskjema, snapshot, send ===
    console.log('Steg 7: Fyller ut unntak og sender brevene');
    await unntak.fyllUtBrevSkjema({
      artikkel: 'FO_883_2004_ART11_3A',
      begrunnelse: 'KORTVARIG_PERIODE_RETUR_NORSK_AG',
      ytterligereInfo: 'E2E test - direkte til unntak',
    });

    const docsBefore = await fetchStoredSedDocuments(request, 'A001');
    await unntak.klikkSendBrevene();

    // === Verifiser SED A001 (CDM 4.4, art.11(3)(a)) ===
    const sedContent = await findNewNavFormatSed(request, 'A001', docsBefore);
    const nav = sedContent.nav as Record<string, any>;
    const medlemskap = sedContent.medlemskap as Record<string, any>;

    expect(sedContent.sed).toBe('A001');
    expect(sedContent.sedVer).toBe('4');
    expect(sedContent.sedGVer).toBe('4');

    // CDM 4.4: artikkel under forordning8832004
    expect(medlemskap.forordning8832004?.unntak?.grunnlag?.artikkel).toBe('11_3_a');

    // Begrunnelse, periode, ytterligereInfo
    expect(medlemskap.unntak?.begrunnelse).toBeTruthy();
    expect(medlemskap.soeknadsperiode?.startdato).toBe('2026-01-01');
    expect(medlemskap.soeknadsperiode?.sluttdato).toBe('2027-01-01');
    expect(nav.ytterligereinformasjon).toBe('E2E test - direkte til unntak');

    // Ingen TWFA
    expect(medlemskap.rammeavtale).toBeNull();

    // Arbeidsgiver
    expect(nav.arbeidsgiver?.[0]?.navn).toBe('Ståles Stål AS');
  });

  test('direkte til art.13(1)(a) - skal sende anmodning om unntak', async ({ page, request }) => {
    test.setTimeout(120000);

    // Eksplisitt CDM 4.4
    const unleash = new UnleashHelper(request);
    await unleash.enableFeature('melosys.cdm-4-4');

    const { behandling } = await opprettSakOgNavigerTilBehandling(page);
    const unntak = new AnmodningUnntakPage(page);

    await velgDirekteTilOgArbeidsgiver(behandling);

    // === Fyll ut brevskjema, snapshot, send ===
    console.log('Steg 7: Fyller ut unntak og sender brevene');
    await unntak.fyllUtBrevSkjema({
      artikkel: 'FO_883_2004_ART13_1A',
      begrunnelse: 'DELTIDSARBEID_I_UTLANDET_MOTTAR_AAP',
      ytterligereInfo: 'E2E test - direkte til art.13(1)(a)',
    });

    const docsBefore = await fetchStoredSedDocuments(request, 'A001');
    await unntak.klikkSendBrevene();

    // === Verifiser SED A001 (CDM 4.4, art.13(1)(a)) ===
    const sedContent = await findNewNavFormatSed(request, 'A001', docsBefore);
    const nav = sedContent.nav as Record<string, any>;
    const medlemskap = sedContent.medlemskap as Record<string, any>;

    expect(sedContent.sed).toBe('A001');
    expect(sedContent.sedVer).toBe('4');
    expect(sedContent.sedGVer).toBe('4');

    // CDM 4.4: artikkel under forordning8832004
    expect(medlemskap.forordning8832004?.unntak?.grunnlag?.artikkel).toBe('13_1_a');

    // Begrunnelse, periode, ytterligereInfo
    expect(medlemskap.unntak?.begrunnelse).toBeTruthy();
    expect(medlemskap.soeknadsperiode?.startdato).toBe('2026-01-01');
    expect(medlemskap.soeknadsperiode?.sluttdato).toBe('2027-01-01');
    expect(nav.ytterligereinformasjon).toBe('E2E test - direkte til art.13(1)(a)');

    // TWFA ikke avhuket -> fjernarbeid=nei
    expect(medlemskap.rammeavtale?.fjernarbeid?.EESSIYesNoType).toBe('nei');

    // Arbeidsgiver
    expect(nav.arbeidsgiver?.[0]?.navn).toBe('Ståles Stål AS');
  });

  test('direkte til art.13(1)(a) med TWFA - skal sende anmodning om unntak', async ({ page, request }) => {
    test.setTimeout(120000);

    // TWFA checkbox requires CDM 4.4 toggle
    const unleash = new UnleashHelper(request);
    await unleash.enableFeature('melosys.cdm-4-4');

    const { behandling } = await opprettSakOgNavigerTilBehandling(page);
    const unntak = new AnmodningUnntakPage(page);

    await velgDirekteTilOgArbeidsgiver(behandling);

    // === Fyll ut med TWFA, snapshot, send ===
    console.log('Steg 7: Fyller ut unntak med TWFA og sender brevene');
    await unntak.fyllUtBrevSkjema({
      artikkel: 'FO_883_2004_ART13_1A',
      twfa: true,
      begrunnelse: 'HJEMMEKONTOR_MEDFOELGENDE',
      ytterligereInfo: 'E2E test - direkte til art.13(1)(a) med TWFA',
    });

    const docsBefore = await fetchStoredSedDocuments(request, 'A001');
    await unntak.klikkSendBrevene();

    // === Verifiser SED A001 (CDM 4.4, art.13(1)(a) med TWFA) ===
    const sedContent = await findNewNavFormatSed(request, 'A001', docsBefore);
    const nav = sedContent.nav as Record<string, any>;
    const medlemskap = sedContent.medlemskap as Record<string, any>;

    expect(sedContent.sed).toBe('A001');
    expect(sedContent.sedVer).toBe('4');
    expect(sedContent.sedGVer).toBe('4');

    // CDM 4.4: artikkel under forordning8832004
    expect(medlemskap.forordning8832004?.unntak?.grunnlag?.artikkel).toBe('13_1_a');

    // TWFA aktivert
    expect(medlemskap.rammeavtale?.fjernarbeid?.EESSIYesNoType).toBe('ja');

    // Begrunnelse, periode, ytterligereInfo
    expect(medlemskap.unntak?.begrunnelse).toBeTruthy();
    expect(medlemskap.soeknadsperiode?.startdato).toBe('2026-01-01');
    expect(medlemskap.soeknadsperiode?.sluttdato).toBe('2027-01-01');
    expect(nav.ytterligereinformasjon).toBe('E2E test - direkte til art.13(1)(a) med TWFA');

    // Arbeidsgiver
    expect(nav.arbeidsgiver?.[0]?.navn).toBe('Ståles Stål AS');
  });

  test('via full behandling - skal sende anmodning om unntak', async ({ page, request }) => {
    test.setTimeout(120000);

    // Eksplisitt CDM 4.4
    const unleash = new UnleashHelper(request);
    await unleash.enableFeature('melosys.cdm-4-4');

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

    // === Fyll ut brevskjema, snapshot, send ===
    console.log('Steg 10: Fyller ut unntak og sender brevene');
    await unntak.fyllUtBrevSkjema({
      artikkel: 'FO_883_2004_ART11_3A',
      begrunnelse: 'ERSTATTER_EN_ANNEN_UNDER_5_AAR',
      ytterligereInfo: 'E2E test - via full behandling',
    });

    const docsBefore = await fetchStoredSedDocuments(request, 'A001');
    await unntak.klikkSendBrevene();

    // === Verifiser SED A001 (CDM 4.4, art.11(3)(a) via full behandling) ===
    const sedContent = await findNewNavFormatSed(request, 'A001', docsBefore);
    const nav = sedContent.nav as Record<string, any>;
    const medlemskap = sedContent.medlemskap as Record<string, any>;

    expect(sedContent.sed).toBe('A001');
    expect(sedContent.sedVer).toBe('4');
    expect(sedContent.sedGVer).toBe('4');

    // CDM 4.4: artikkel under forordning8832004
    expect(medlemskap.forordning8832004?.unntak?.grunnlag?.artikkel).toBe('11_3_a');

    // Begrunnelse, periode, ytterligereInfo
    expect(medlemskap.unntak?.begrunnelse).toBeTruthy();
    expect(medlemskap.soeknadsperiode?.startdato).toBe('2026-01-01');
    expect(medlemskap.soeknadsperiode?.sluttdato).toBe('2027-01-01');
    expect(nav.ytterligereinformasjon).toBe('E2E test - via full behandling');

    // Ingen TWFA
    expect(medlemskap.rammeavtale).toBeNull();

    // Arbeidsgiver
    expect(nav.arbeidsgiver?.[0]?.navn).toBe('Ståles Stål AS');
  });

  test('direkte til CDM 4.3 - skal sende anmodning om unntak', async ({ page, request }) => {
    test.setTimeout(120000);

    // Deaktiver CDM 4.4 -> bruker CDM 4.3
    const unleash = new UnleashHelper(request);
    await unleash.disableFeature('melosys.cdm-4-4');

    const { behandling } = await opprettSakOgNavigerTilBehandling(page);
    const unntak = new AnmodningUnntakPage(page);

    await velgDirekteTilOgArbeidsgiver(behandling);

    // === Fyll ut brevskjema, snapshot, send ===
    console.log('Steg 7: Fyller ut unntak og sender brevene (CDM 4.3)');
    await unntak.fyllUtBrevSkjema({
      artikkel: 'FO_883_2004_ART11_3A',
      begrunnelse: 'KORTVARIG_PERIODE_RETUR_NORSK_AG',
      ytterligereInfo: 'E2E test - direkte til CDM 4.3',
    });

    const docsBefore = await fetchStoredSedDocuments(request, 'A001');
    await unntak.klikkSendBrevene();

    // === Verifiser SED A001 (CDM 4.3, art.11(3)(a)) ===
    const sedContent = await findNewNavFormatSed(request, 'A001', docsBefore);
    const nav = sedContent.nav as Record<string, any>;
    const medlemskap = sedContent.medlemskap as Record<string, any>;

    expect(sedContent.sed).toBe('A001');
    expect(sedContent.sedVer).toBe('3');
    expect(sedContent.sedGVer).toBe('4');

    // CDM 4.3: artikkel under unntak (IKKE under forordning8832004)
    expect(medlemskap.unntak?.grunnlag?.artikkel).toBe('11_3_a');
    expect(medlemskap.forordning8832004).toBeNull();

    // Begrunnelse, periode, ytterligereInfo
    expect(medlemskap.unntak?.begrunnelse).toBeTruthy();
    expect(medlemskap.soeknadsperiode?.startdato).toBe('2026-01-01');
    expect(medlemskap.soeknadsperiode?.sluttdato).toBe('2027-01-01');
    expect(nav.ytterligereinformasjon).toBe('E2E test - direkte til CDM 4.3');

    // Ingen TWFA og ingen forordning8832004
    expect(medlemskap.rammeavtale).toBeNull();

    // Arbeidsgiver
    expect(nav.arbeidsgiver?.[0]?.navn).toBe('Ståles Stål AS');
  });

  test('direkte til art.13(1)(a) CDM 4.3 - skal sende anmodning om unntak', async ({ page, request }) => {
    test.setTimeout(120000);

    // Deaktiver CDM 4.4 -> bruker CDM 4.3
    const unleash = new UnleashHelper(request);
    await unleash.disableFeature('melosys.cdm-4-4');

    const { behandling } = await opprettSakOgNavigerTilBehandling(page);
    const unntak = new AnmodningUnntakPage(page);

    await velgDirekteTilOgArbeidsgiver(behandling);

    // === Fyll ut brevskjema, snapshot, send ===
    console.log('Steg 7: Fyller ut unntak og sender brevene (CDM 4.3, art.13(1)(a))');
    await unntak.fyllUtBrevSkjema({
      artikkel: 'FO_883_2004_ART13_1A',
      begrunnelse: 'DELTIDSARBEID_I_UTLANDET_MOTTAR_AAP',
      ytterligereInfo: 'E2E test - direkte til art.13(1)(a) CDM 4.3',
    });

    const docsBefore = await fetchStoredSedDocuments(request, 'A001');
    await unntak.klikkSendBrevene();

    // === Verifiser SED A001 (CDM 4.3, art.13(1)(a)) ===
    const sedContent = await findNewNavFormatSed(request, 'A001', docsBefore);
    const nav = sedContent.nav as Record<string, any>;
    const medlemskap = sedContent.medlemskap as Record<string, any>;

    expect(sedContent.sed).toBe('A001');
    expect(sedContent.sedVer).toBe('3');
    expect(sedContent.sedGVer).toBe('4');

    // CDM 4.3: artikkel under unntak (IKKE under forordning8832004)
    expect(medlemskap.unntak?.grunnlag?.artikkel).toBe('13_1_a');
    expect(medlemskap.forordning8832004).toBeNull();

    // CDM 4.3: rammeavtale er null (i motsetning til CDM 4.4 som har fjernarbeid=nei)
    expect(medlemskap.rammeavtale).toBeNull();

    // Begrunnelse, periode, ytterligereInfo
    expect(medlemskap.unntak?.begrunnelse).toBeTruthy();
    expect(medlemskap.soeknadsperiode?.startdato).toBe('2026-01-01');
    expect(medlemskap.soeknadsperiode?.sluttdato).toBe('2027-01-01');
    expect(nav.ytterligereinformasjon).toBe('E2E test - direkte til art.13(1)(a) CDM 4.3');

    // Arbeidsgiver
    expect(nav.arbeidsgiver?.[0]?.navn).toBe('Ståles Stål AS');
  });
});
