import { test, expect } from '../../fixtures';
import { Page } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth-helper';
import { UnleashHelper } from '../../helpers/unleash-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { ArbeidFlereLandBehandlingPage } from '../../pages/behandling/arbeid-flere-land-behandling.page';
import { TrygdeavgiftPage } from '../../pages/trygdeavgift/trygdeavgift.page';
import { AnnulleringPage } from '../../pages/behandling/annullering.page';
import { USER_ID_VALID, EU_EOS_LAND, EU_EOS_LOVVALG, AARSAK } from '../../pages/shared/constants';
import { TestPeriods } from '../../helpers/date-helper';
import { runAndWaitForProcessInstances } from '../../helpers/api-helper';
import { verifiserBehandlingSluttilstand } from '../../pages/shared/behandling-sluttilstand.assertions';
import { getFakturaserieReferanse, withDatabase } from '../../helpers/db-helper';
import { FaktureringHelper } from '../../helpers/fakturering-helper';
import { KAFKA_TOPICS, FakturaBestiltMelding, hentSluttOffsets, ventPåMeldinger } from '../../helpers/kafka-helper';
import { hentSaksnummerFraUrl } from '../../helpers/url-helper';

/**
 * EØS Arbeid i flere land, artikkel 13 – forskuddsfakturering av trygdeavgift (MELOSYS-8410)
 *
 * Med toggle melosys.artikkel_13.forskuddsfakturering på (av som standard, slås på i beforeEach) får norsk lovvalg periode- og trygdeavgiftssteg
 * før vedtakssteget, og vedtaket fører til forskuddsfakturering:
 *   Saksopprettelse (EU_EOS / MEDLEMSKAP_LOVVALG / ARBEID_FLERE_LAND, Sverige og Norge)
 *     → Inngang → Bosted (Norge) → Virksomhet → Vurder arbeidsland → Yrkesaktivitet → Arbeidsmønster
 *     → (Forretningssted for 13.1.b, Vurdering av 13.2.b for 13.2.b)
 *     → Lovvalgsbestemmelse og -periode (bestemmelsen vises som tekst)
 *     → Trygdeavgift (ikke skattepliktig, arbeidsinntekt 50 000/md)
 *     → Vedtak (foreløpig fastsatt lovvalgsland)
 *     → Fakturaserie: KVARTAL, 4 fakturaer à 11 400 (3 × 3 800, sats 7,6 %)
 *
 * Hele kjeden (OEBS-meldinger, ny vurdering og annullering med kreditering) testes for 13.1.a.
 * De andre bestemmelsene testes fram til fakturaserien. Ved utpek land er flyten uendret.
 *
 * Perioden er hele NESTE år: da blir det én faktura per kvartal uansett kjøredato.
 */
const BRUTTOINNTEKT = '50000';
const FORVENTET_BELOP_PER_KVARTAL = 11400;
const FORVENTET_ANTALL_KVARTALER = 4;
const FORVENTET_TOTALT = FORVENTET_BELOP_PER_KVARTAL * FORVENTET_ANTALL_KVARTALER;
const ARBEIDSGIVER = 'Ståles Stål AS';
const PERIODESTEG = 'Lovvalgsbestemmelse og -periode';

interface Sider {
  hovedside: HovedsidePage;
  opprettSak: OpprettNySakPage;
  euEosBehandling: EuEosBehandlingPage;
  behandling: ArbeidFlereLandBehandlingPage;
  trygdeavgift: TrygdeavgiftPage;
}

async function opprettSakOgGåTilArbeidsmønster(page: Page, velgYrkesaktivitet: (s: Sider) => Promise<void>) {
  await new AuthHelper(page).login();
  const sider: Sider = {
    hovedside: new HovedsidePage(page),
    opprettSak: new OpprettNySakPage(page),
    euEosBehandling: new EuEosBehandlingPage(page),
    behandling: new ArbeidFlereLandBehandlingPage(page),
    trygdeavgift: new TrygdeavgiftPage(page),
  };
  const { hovedside, opprettSak, euEosBehandling, behandling } = sider;
  const period = TestPeriods.fullNextYearPeriod;

  await hovedside.gotoOgOpprettNySak();
  await opprettSak.fyllInnBrukerID(USER_ID_VALID);
  await opprettSak.velgOpprettNySak();
  await opprettSak.velgSakstype('EU_EOS');
  await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
  await opprettSak.velgBehandlingstema('ARBEID_FLERE_LAND');
  await euEosBehandling.fyllInnFraTilDato(period.start, period.end);
  await euEosBehandling.velgLand(EU_EOS_LAND.SVERIGE);
  await euEosBehandling.velgAndreLand(EU_EOS_LAND.NORGE);
  await opprettSak.velgAarsak(AARSAK.SØKNAD);
  await opprettSak.leggBehandlingIMine();
  await runAndWaitForProcessInstances(
    page.request,
    async () => {
      await opprettSak.klikkOpprettNyBehandling();
      await opprettSak.assertions.verifiserBehandlingOpprettet();
    },
    { timeoutSeconds: 30 }
  );
  await hovedside.goto();
  await hovedside.åpneBehandling(new RegExp(`${USER_ID_VALID}.*flere land`));
  await page.waitForLoadState('networkidle');
  const saksnummer = hentSaksnummerFraUrl(page.url());

  await behandling.klikkBekreftOgFortsett();
  await behandling.velgLandRadio('Norge');
  await behandling.klikkBekreftOgFortsett({ waitForContent: page.getByRole('checkbox', { name: ARBEIDSGIVER }) });
  await behandling.velgArbeidsgiver(ARBEIDSGIVER);
  await behandling.klikkBekreftOgFortsett({
    waitForContent: page.getByRole('checkbox', { name: 'Arbeid utføres i land som er' }),
  });
  await behandling.velgArbeidUtføresILandSomEr();
  await behandling.klikkBekreftOgFortsett();
  await velgYrkesaktivitet(sider);
  await behandling.klikkBekreftOgFortsett();
  await euEosBehandling.waitForStepHeading('Arbeidsmønster');

  return { ...sider, saksnummer };
}

/** Periodesteget viser bestemmelsen fra tidligere steg. Trygdeavgift legges inn og vedtaket fattes. */
async function fullførMedPeriodeOgTrygdeavgift(page: Page, sider: Sider, bestemmelse: string): Promise<string> {
  const { euEosBehandling, behandling, trygdeavgift } = sider;

  await euEosBehandling.waitForStepHeading(PERIODESTEG);
  await expect(page.getByText(bestemmelse, { exact: true }), 'Periodesteget skal vise bestemmelsen').toBeVisible();
  await expect(page.getByRole('radio'), 'Bestemmelsen skal ikke kunne endres i periodesteget').toHaveCount(0);
  await behandling.klikkBekreftOgFortsett();

  await trygdeavgift.ventPåSideLastet();
  await trygdeavgift.velgSkattepliktig(false);
  await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');
  await trygdeavgift.fyllInnBruttoinntektMedApiVent(BRUTTOINNTEKT);
  await trygdeavgift.klikkBekreftOgFortsett();

  await expect(page.getByText('Lovvalget innvilges for en kortere periode'), 'Vedtakssteget skal ikke vise perioden')
    .toHaveCount(0);
  await behandling.fyllInnFritekstTilBegrunnelse('Begrunnelse');
  await behandling.velgInstitusjonSomSkalMottaSed(EU_EOS_LAND.SVERIGE);
  await runAndWaitForProcessInstances(page.request, () => behandling.fattVedtak(), { timeoutSeconds: 60 });

  return withDatabase(async (db) => {
    const rad = await db.queryOne<{ ID: number }>(
      "SELECT ID FROM BEHANDLING WHERE BEH_TYPE = 'FØRSTEGANG' ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY",
      {}
    );
    expect(rad, 'Forventet en FØRSTEGANG-behandling i DB').not.toBeNull();
    return String(rad!.ID);
  });
}

/** Vedtaket er foreløpig, lovvalgsperioden er norsk og trygdeavgiften faktureres per kvartal. */
async function verifiserVedtakOgFakturaserie(
  sider: Sider,
  faktureringHelper: FaktureringHelper,
  behandlingId: string,
  lovvalgsbestemmelse: string
): Promise<string> {
  await verifiserBehandlingSluttilstand({
    behandlingId,
    forventetStatus: 'MIDLERTIDIG_LOVVALGSBESLUTNING',
    forventetResultatType: 'FORELOEPIG_FASTSATT_LOVVALGSLAND',
    forventetTrygdeavgiftType: 'FORELØPIG',
    forventetIverksettProsess: 'IVERKSETT_VEDTAK_EOS',
  });
  await sider.behandling.assertions.verifiserNorskLovvalgsperiode(behandlingId, lovvalgsbestemmelse);

  const fakturaserieReferanse = await getFakturaserieReferanse(behandlingId);
  expect(fakturaserieReferanse, 'FAKTURASERIE_REFERANSE skal være satt på behandlingsresultatet').toBeTruthy();
  const serie = await faktureringHelper.hentFakturaserie(fakturaserieReferanse!);
  faktureringHelper.loggFakturaserie(serie);

  expect(serie.intervall, 'Fakturaserie skal ha intervall KVARTAL').toBe('KVARTAL');
  expect(serie.faktura, `Forventet ${FORVENTET_ANTALL_KVARTALER} fakturaer, én per kvartal`)
    .toHaveLength(FORVENTET_ANTALL_KVARTALER);
  for (const faktura of serie.faktura) {
    const sum = faktureringHelper.avrundBelop(faktura.fakturaLinje.reduce((s, l) => s + l.belop, 0));
    expect(sum, `Faktura ${faktura.periodeFra}→${faktura.periodeTil}`).toBe(FORVENTET_BELOP_PER_KVARTAL);
  }
  expect(faktureringHelper.avrundBelop(faktureringHelper.totalBelop(serie)), 'Total trygdeavgift for året')
    .toBe(FORVENTET_TOTALT);
  return fakturaserieReferanse!;
}

test.describe('EØS Arbeid i flere land art.13 - forskuddsfakturering av trygdeavgift', () => {
  test.beforeEach(async ({ request }) => {
    await new UnleashHelper(request).enableFeature('melosys.artikkel_13.forskuddsfakturering');
  });

  test('13.1.a: skal fakturere trygdeavgift per kvartal og kreditere ved annullering', async ({ page, request }) => {
    test.setTimeout(300000);
    const faktureringHelper = new FaktureringHelper(request);
    const annullering = new AnnulleringPage(page);

    const sider = await opprettSakOgGåTilArbeidsmønster(page, (s) => s.behandling.velgLønnetArbeidIToEllerFlereLand());
    const { hovedside, opprettSak, behandling, saksnummer } = sider;
    await behandling.velgProsentEllerMer();
    await behandling.klikkBekreftOgFortsett();

    const offsetsFørVedtak = hentSluttOffsets(KAFKA_TOPICS.FAKTURA_BESTILT);
    const behandlingId = await fullførMedPeriodeOgTrygdeavgift(page, sider, EU_EOS_LOVVALG.ART_13_1_A);
    const fakturaserieReferanse = await verifiserVedtakOgFakturaserie(
      sider,
      faktureringHelper,
      behandlingId,
      'FO_883_2004_ART13_1A'
    );

    console.log('Venter på fakturabestillinger til OEBS...');
    const bestillinger = await ventPåMeldinger<FakturaBestiltMelding>(KAFKA_TOPICS.FAKTURA_BESTILT, {
      fraOffsets: offsetsFørVedtak,
      antall: FORVENTET_ANTALL_KVARTALER,
    });
    expect(bestillinger, 'Forventet én OEBS-melding per kvartal').toHaveLength(FORVENTET_ANTALL_KVARTALER);
    const år = TestPeriods.fullNextYearPeriod.start.split('.')[2];
    for (const [indeks, melding] of [...bestillinger]
      .sort((a, b) => a.beskrivelse.localeCompare(b.beskrivelse))
      .entries()) {
      expect(melding.beskrivelse).toMatch(new RegExp(`Trygdeavgift ${indeks + 1}\\. kvartal ${år}`));
      expect(melding.fakturaserieReferanse).toBe(fakturaserieReferanse);
      expect(melding.fodselsnummer).toBe(USER_ID_VALID);
      expect(melding.fakturaLinjer, `${melding.beskrivelse} skal ha én linje`).toHaveLength(1);
      expect(melding.fakturaLinjer[0].belop, melding.beskrivelse).toBe(FORVENTET_BELOP_PER_KVARTAL);
    }

    console.log('Oppretter ny vurdering og annullerer...');
    await hovedside.klikkOpprettNySak();
    await runAndWaitForProcessInstances(page.request, () =>
      opprettSak.opprettNyVurdering(USER_ID_VALID, AARSAK.SØKNAD, saksnummer)
    );
    const nyVurderingId = await withDatabase(async (db) => {
      const rad = await db.queryOne<{ ID: number }>(
        "SELECT ID FROM BEHANDLING WHERE BEH_TYPE = 'NY_VURDERING' ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY",
        {}
      );
      expect(rad, 'Forventet en NY_VURDERING-behandling i DB').not.toBeNull();
      return String(rad!.ID);
    });
    await hovedside.goto();
    await hovedside.åpneBehandlingMedId(nyVurderingId);
    await page.waitForLoadState('networkidle');

    const offsetsFørAnnullering = hentSluttOffsets(KAFKA_TOPICS.FAKTURA_BESTILT);
    await runAndWaitForProcessInstances(page.request, () => annullering.annullerSak());

    const kjede = await faktureringHelper.ventPåKjedeSum([fakturaserieReferanse], 0);
    kjede.forEach((s) => faktureringHelper.loggFakturaserie(s));
    const krediteringslinjer = kjede
      .filter((s) => s.fakturaserieReferanse !== fakturaserieReferanse)
      .flatMap((s) => s.faktura.flatMap((f) => f.fakturaLinje));
    expect(krediteringslinjer, 'Forventet én krediteringslinje for hele året').toHaveLength(1);
    expect(krediteringslinjer[0].beskrivelse).toMatch(/(Kreditering|Tilbakebetaling) for periode/);
    expect(faktureringHelper.avrundBelop(krediteringslinjer[0].belop), 'Kreditering av hele året')
      .toBe(-FORVENTET_TOTALT);
    expect(faktureringHelper.avrundBelop(faktureringHelper.totalBelopKjede(kjede)), 'Kjeden skal summere til 0')
      .toBe(0);

    const krediteringer = await ventPåMeldinger<FakturaBestiltMelding>(KAFKA_TOPICS.FAKTURA_BESTILT, {
      fraOffsets: offsetsFørAnnullering,
      antall: 1,
    });
    expect(krediteringer, 'Forventet én krediteringsmelding til OEBS').toHaveLength(1);
    expect(krediteringer[0].fodselsnummer).toBe(USER_ID_VALID);
    expect(krediteringer[0].fakturaLinjer).toHaveLength(1);
    expect(krediteringer[0].fakturaLinjer[0].belop, 'Kreditering av hele året til OEBS').toBe(-FORVENTET_TOTALT);
  });

  const flyter: {
    navn: string;
    bestemmelse: string;
    kode: string;
    yrkesaktivitet: (s: Sider) => Promise<void>;
    vurder: (s: Sider) => Promise<void>;
  }[] = [
    {
      navn: '13.2.a selvstendig, 25 % eller mer i Norge',
      bestemmelse: EU_EOS_LOVVALG.ART_13_2_A,
      kode: 'FO_883_2004_ART13_2A',
      yrkesaktivitet: (s) => s.behandling.velgSelvstendigNæringsvirksomhetIToEllerFlereLand(),
      vurder: async (s) => {
        await s.behandling.velgProsentEllerMer();
        await s.behandling.klikkBekreftOgFortsett();
      },
    },
    {
      navn: '13.3 lønnet arbeid i Norge og selvstendig virksomhet',
      bestemmelse: EU_EOS_LOVVALG.ART_13_3,
      kode: 'FO_883_2004_ART13_3',
      yrkesaktivitet: (s) => s.behandling.velgLønnetArbeidOgSelvstendigIToEllerFlereLand(),
      vurder: async (s) => {
        await s.behandling.velgAktivitet('Lønnet arbeid i Norge og selvstendig virksomhet (13.3)');
        await s.behandling.klikkBekreftOgFortsett();
      },
    },
    {
      navn: '13.4 offentlig tjeneste i Norge',
      bestemmelse: EU_EOS_LOVVALG.ART_13_4,
      kode: 'FO_883_2004_ART13_4',
      yrkesaktivitet: (s) => s.behandling.velgOffentligTjenesteOgAnnenYrkesaktivitet(),
      vurder: async (s) => {
        await s.behandling.velgAktivitet('Offentlig tjeneste i Norge og annen virksomhet (13.4)');
        await s.behandling.klikkBekreftOgFortsett();
      },
    },
    {
      navn: '13.1.b lønnet arbeid, under 25 % i Norge, forretningssted i Norge',
      bestemmelse: EU_EOS_LOVVALG.ART_13_1_B_I,
      kode: 'FO_883_2004_ART13_1B1',
      yrkesaktivitet: (s) => s.behandling.velgLønnetArbeidIToEllerFlereLand(),
      vurder: async (s) => {
        await s.behandling.velgMindreEnn25Prosent();
        await s.behandling.klikkBekreftOgFortsett();
        await s.euEosBehandling.waitForStepHeading('Vurdering av artikkel 13 nr. 1 bokstav b');
        await s.behandling.fyllUtForretningsstedINorge('13.1 b i: en arbeidsgiver');
        await s.behandling.klikkBekreftOgFortsett();
      },
    },
    {
      navn: '13.2.b selvstendig, under 25 % i Norge, interessesenter i Norge',
      bestemmelse: EU_EOS_LOVVALG.ART_13_2_B,
      kode: 'FO_883_2004_ART13_2B',
      yrkesaktivitet: (s) => s.behandling.velgSelvstendigNæringsvirksomhetIToEllerFlereLand(),
      vurder: async (s) => {
        await s.behandling.velgMindreEnn25Prosent();
        await s.behandling.klikkBekreftOgFortsett();
        await s.euEosBehandling.waitForStepHeading('Vurdering av artikkel 13 nr. 2 bokstav b');
        await s.behandling.velgInteressesenterINorge();
        await s.behandling.klikkBekreftOgFortsett();
      },
    },
  ];

  for (const flyt of flyter) {
    test(`${flyt.navn}: skal gi periode- og trygdeavgiftssteg og fakturere per kvartal`, async ({ page, request }) => {
      test.setTimeout(240000);
      const sider = await opprettSakOgGåTilArbeidsmønster(page, flyt.yrkesaktivitet);
      await flyt.vurder(sider);
      const behandlingId = await fullførMedPeriodeOgTrygdeavgift(page, sider, flyt.bestemmelse);
      await verifiserVedtakOgFakturaserie(sider, new FaktureringHelper(request), behandlingId, flyt.kode);
    });
  }

  test('13.4 offentlig tjeneste i annet land: skal gå til utpek land uten periode- og trygdeavgiftssteg', async ({
    page,
  }) => {
    test.setTimeout(180000);
    const { behandling, euEosBehandling } = await opprettSakOgGåTilArbeidsmønster(page, (s) =>
      s.behandling.velgOffentligTjenesteOgAnnenYrkesaktivitet()
    );
    await behandling.velgAktivitet('Offentlig tjeneste i et annet land og annen virksomhet (13.4)');
    await behandling.klikkBekreftOgFortsett();

    await euEosBehandling.waitForStepHeading('Utpek land etter artikkel 13.4');
    await expect(page.locator('.stegIkon'), 'Utpek land skal ikke ha periode- og trygdeavgiftssteg').toHaveText([
      'Inngang',
      'Bosted',
      'Virksomhet',
      'Vurder arbeidsland',
      /Yrkes.?aktivitet/,
      /Arbeids.?mønster/,
      'Utpek land',
    ]);
    await expect(page.getByText('Fakturainformasjon', { exact: true }), 'Ingen fakturainformasjon ved utpek land')
      .toHaveCount(0);
  });
});
