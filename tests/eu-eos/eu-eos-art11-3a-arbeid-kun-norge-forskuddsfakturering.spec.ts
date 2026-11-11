import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { TrygdeavgiftPage } from '../../pages/trygdeavgift/trygdeavgift.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import { AnnulleringPage } from '../../pages/behandling/annullering.page';
import {
  USER_ID_VALID,
  SAKSTYPER,
  SAKSTEMA,
  BEHANDLINGSTEMA,
  AARSAK,
  EU_EOS_LAND,
  EU_EOS_LOVVALG,
} from '../../pages/shared/constants';
import { TestPeriods } from '../../helpers/date-helper';
import { runAndWaitForProcessInstances } from '../../helpers/api-helper';
import { verifiserBehandlingSluttilstand } from '../../pages/shared/behandling-sluttilstand.assertions';
import { getFakturaserieReferanse, withDatabase } from '../../helpers/db-helper';
import { FaktureringHelper } from '../../helpers/fakturering-helper';
import {
  KAFKA_TOPICS,
  FakturaBestiltMelding,
  hentSluttOffsets,
  ventPåMeldinger,
} from '../../helpers/kafka-helper';
import { hentSaksnummerFraUrl } from '../../helpers/url-helper';

/**
 * EØS Arbeid kun i Norge art.11(3)(a) – forskuddsfakturering av trygdeavgift (MELOSYS-8397)
 *
 * Flyten (toggle melosys.arbeid-kun-norge.forskuddsfakturering på):
 *   Saksopprettelse (EU_EOS / MEDLEMSKAP_LOVVALG / ARBEID_KUN_NORGE, arbeidsland Norge)
 *     → Inngang → Yrkessituasjon (yrkesaktiv) → Virksomhet
 *     → Lovvalgsbestemmelse og -periode (art.11(3)(a))
 *     → Trygdeavgift (ikke skattepliktig, arbeidsinntekt 50 000/md)
 *     → Vedtak (fatt)
 *     → Fakturaserie: KVARTAL, 4 fakturaer à 11 400 (3 × 3 800, sats 7,6 %)
 *     → 4 fakturabestillinger til OEBS (Kafka faktura-bestilt.v1)
 *     → Ny vurdering → Annullering
 *     → Kreditering av hele året (−45 600), kjeden summerer til 0, kreditnota til OEBS
 *
 * Perioden er hele NESTE år: da blir det én faktura per kvartal uansett kjøredato.
 * I inneværende år slås kvartaler som allerede har startet sammen i én faktura.
 */
const BRUTTOINNTEKT = '50000';
const FORVENTET_BELOP_PER_KVARTAL = 11400; // 3 800/md × 3 md (7,6 % av 50 000)
const FORVENTET_ANTALL_KVARTALER = 4;
const FORVENTET_TOTALT = FORVENTET_BELOP_PER_KVARTAL * FORVENTET_ANTALL_KVARTALER;

test.describe('EØS Arbeid kun i Norge 11.3a - forskuddsfakturering av trygdeavgift', () => {
  test('skal fakturere trygdeavgift per kvartal og kreditere ved annullering', async ({ page, request }) => {
    test.setTimeout(240000);

    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new EuEosBehandlingPage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);
    const annullering = new AnnulleringPage(page);
    const faktureringHelper = new FaktureringHelper(request);

    const period = TestPeriods.fullNextYearPeriod;
    const behandlingLenke = new RegExp(`${USER_ID_VALID}.*Medlemskap og lovvalg.*kun i Norge`);

    // Step 1: Opprett sak
    console.log('Step 1: Oppretter EØS-sak Arbeid kun i Norge...');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgOpprettNySak();
    await opprettSak.velgSakstype(SAKSTYPER.EU_EOS);
    await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
    await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.ARBEID_KUN_NORGE);
    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    await opprettSak.velgSøknadsperiode(period.start, period.end);
    // Arbeidsland Norge gir periode- og trygdeavgiftssteg
    await opprettSak.velgArbeidsland(EU_EOS_LAND.NORGE);
    await opprettSak.leggBehandlingIMine();
    await runAndWaitForProcessInstances(
      page.request,
      async () => {
        await opprettSak.klikkOpprettNyBehandling();
        await opprettSak.assertions.verifiserBehandlingOpprettet();
      }, { timeoutSeconds: 30 }
    );
    await hovedside.goto();

    // Step 2: Åpne behandling og gå gjennom flyten
    console.log('Step 2: Går gjennom stegene...');
    await hovedside.åpneBehandling(behandlingLenke);
    await page.waitForLoadState('networkidle');
    const saksnummer = hentSaksnummerFraUrl(page.url());

    await behandling.klikkBekreftOgFortsett();
    await behandling.velgYrkesaktivEllerSelvstendigOgFortsett(true);
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');

    await behandling.waitForStepHeading('Lovvalgsbestemmelse og -periode');
    await behandling.velgLovvalgsbestemmelse(EU_EOS_LOVVALG.ART_11_3_A);
    await behandling.klikkBekreftOgFortsett();

    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(BRUTTOINNTEKT);
    await trygdeavgift.klikkBekreftOgFortsett();

    // Step 3: Fatt vedtak
    console.log('Step 3: Fatter vedtak...');
    const offsetsFørVedtak = hentSluttOffsets(KAFKA_TOPICS.FAKTURA_BESTILT);
    await runAndWaitForProcessInstances(
      page.request,
      () => vedtak.klikkFattVedtak(),
      { timeoutSeconds: 60 }
    );

    const førstegangBehandlingId = await withDatabase(async (db) => {
      const rad = await db.queryOne<{ ID: number }>(
        "SELECT ID FROM BEHANDLING WHERE BEH_TYPE = 'FØRSTEGANG' ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY",
        {}
      );
      expect(rad, 'Forventet en FØRSTEGANG-behandling i DB').not.toBeNull();
      return String(rad!.ID);
    });

    await verifiserBehandlingSluttilstand({
      behandlingId: førstegangBehandlingId,
      forventetResultatType: 'FASTSATT_LOVVALGSLAND',
      forventetTrygdeavgiftType: 'FORELØPIG',
      forventetIverksettProsess: 'IVERKSETT_VEDTAK_EOS',
    });

    // Step 4: Verifiser fakturaserien – én faktura per kvartal
    console.log('Step 4: Verifiserer fakturaserie...');
    const fakturaserieReferanse = await getFakturaserieReferanse(førstegangBehandlingId);
    expect(fakturaserieReferanse, 'FAKTURASERIE_REFERANSE skal være satt på behandlingsresultatet').toBeTruthy();

    const serie = await faktureringHelper.hentFakturaserie(fakturaserieReferanse!);
    faktureringHelper.loggFakturaserie(serie);

    expect(serie.intervall, 'Fakturaserie skal ha intervall KVARTAL').toBe('KVARTAL');
    expect(serie.faktura, `Forventet ${FORVENTET_ANTALL_KVARTALER} fakturaer, én per kvartal`)
      .toHaveLength(FORVENTET_ANTALL_KVARTALER);
    for (const faktura of serie.faktura) {
      const sum = faktureringHelper.avrundBelop(faktura.fakturaLinje.reduce((s, l) => s + l.belop, 0));
      expect(sum, `Faktura ${faktura.periodeFra}→${faktura.periodeTil} skal være ${FORVENTET_BELOP_PER_KVARTAL}`)
        .toBe(FORVENTET_BELOP_PER_KVARTAL);
    }
    expect(faktureringHelper.avrundBelop(faktureringHelper.totalBelop(serie)), 'Total trygdeavgift for året')
      .toBe(FORVENTET_TOTALT);

    // Step 5: Verifiser at fakturaene sendes til OEBS
    // send_faktura_instant gir datoBestilt i dag, så cronjobben bestiller dem innen ett minutt.
    // Bestilte fakturaer er også en forutsetning for kreditering ved annullering.
    console.log('Step 5: Venter på fakturabestillinger til OEBS...');
    const bestillinger = await ventPåMeldinger<FakturaBestiltMelding>(KAFKA_TOPICS.FAKTURA_BESTILT, {
      fraOffsets: offsetsFørVedtak,
      antall: FORVENTET_ANTALL_KVARTALER,
    });
    expect(bestillinger, 'Forventet én OEBS-melding per kvartal').toHaveLength(FORVENTET_ANTALL_KVARTALER);
    const år = period.start.split('.')[2];
    expect(bestillinger.map(m => m.beskrivelse).sort())
      .toEqual([1, 2, 3, 4].map(kvartal => `Trygdeavgift ${kvartal}. kvartal ${år}`));
    for (const melding of bestillinger) {
      expect(melding.fakturaserieReferanse).toBe(fakturaserieReferanse);
      expect(melding.fodselsnummer).toBe(USER_ID_VALID);
      expect(melding.fakturaLinjer, `${melding.beskrivelse} skal ha én linje`).toHaveLength(1);
      expect(melding.fakturaLinjer[0].belop, `${melding.beskrivelse}`).toBe(FORVENTET_BELOP_PER_KVARTAL);
    }

    // Step 6: Ny vurdering og annullering
    console.log('Step 6: Oppretter ny vurdering og annullerer...');
    await hovedside.klikkOpprettNySak();
    await runAndWaitForProcessInstances(
      page.request,
      () => opprettSak.opprettNyVurdering(USER_ID_VALID, AARSAK.SØKNAD, saksnummer)
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

    // Step 7: Verifiser kreditering av hele året
    console.log('Step 7: Verifiserer kreditering...');
    const kjede = await faktureringHelper.ventPåKjedeSum([fakturaserieReferanse!], 0);
    kjede.forEach(s => faktureringHelper.loggFakturaserie(s));

    const krediteringslinjer = kjede
      .filter(s => s.fakturaserieReferanse !== fakturaserieReferanse)
      .flatMap(s => s.faktura.flatMap(f => f.fakturaLinje));
    expect(krediteringslinjer, 'Forventet én krediteringslinje for hele året').toHaveLength(1);
    expect(krediteringslinjer[0].beskrivelse).toMatch(/Kreditering for periode/);
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
    expect(krediteringer[0].beskrivelse).toMatch(/Opphør av medlemskap/);
    expect(krediteringer[0].fakturaLinjer).toHaveLength(1);
    expect(krediteringer[0].fakturaLinjer[0].beskrivelse).toMatch(/Kreditering for periode/);
    expect(krediteringer[0].fakturaLinjer[0].belop, 'Kreditering av hele året til OEBS').toBe(-FORVENTET_TOTALT);
    console.log('✅ Fakturert per kvartal og kreditert ved annullering, også mot OEBS');
  });
});
