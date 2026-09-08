import { APIRequestContext, Page, expect } from '@playwright/test';
import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../../pages/behandling/medlemskap.page';
import { ArbeidsforholdPage } from '../../pages/behandling/arbeidsforhold.page';
import { LovvalgPage } from '../../pages/behandling/lovvalg.page';
import { ResultatPeriodePage } from '../../pages/behandling/resultat-periode.page';
import { TrygdeavgiftPage } from '../../pages/trygdeavgift/trygdeavgift.page';
import { BeregningsforklaringKortPage } from '../../pages/trygdeavgift/beregningsforklaring-kort.page';
import { USER_ID_VALID } from '../../pages/shared/constants';
import { UnleashHelper } from '../../helpers/unleash-helper';
import { hentMinstebeløp } from '../../helpers/trygdeavgift-beregning-helper';
import { isTrygdeavgiftBeregningResponse } from '../../pages/shared/trygdeavgift-api';

/**
 * Beregningsforklaring — ordinær avgift pr. avgiftsdel (MELOSYS-8171)
 *
 * Fag meldte inn et forklaringskort som motsa seg selv:
 *
 *   Ordinær avgift 339 600 kr ≤ 25 %-tak 275 087 kr → ordinær beregning brukes
 *
 * For frivillig medlemskap måles helsedelen og pensjonsdelen hver for seg mot ett felles
 * tak. Ingen del oversteg taket, så ordinær beregning ble brukt — men kortet viste summen
 * av delene, som aldri ble sammenlignet med taket. Avgiftsbeløpene var hele tiden riktige.
 *
 * Rettingen går gjennom tre repoer, og denne testen dekker alle tre i én kjøring:
 * - melosys-trygdeavgift-beregning: nytt felt `ordinaerAvgiftPerDel`, og totalen utledes
 *   fra delene
 * - melosys-api: feltet føres videre til frontend i `beregningsforklaringer`
 * - melosys-web: steg 3 rendrer delbeløpene, og merknaden utledes av tallene som vises
 *
 * Scenario — frivillig helse+pensjon (§ 2-8 a), ikke skattepliktig, 100 000 kr/md, over en
 * periode som krysser årsskiftet og gir to skatteår i samme behandling:
 *
 *   | År      | Mnd | Årsinntekt | Tak     | Helsedel | Pensjonsdel | Utfall                               |
 *   |---------|-----|------------|---------|----------|-------------|--------------------------------------|
 *   | i år    |   2 |    200 000 |  25 087 |   13 600 |      38 800 | pensjonsdel begrenset → 25 %-regelen |
 *   | neste   |  12 |  1 200 000 | 275 087 |   81 600 |     232 800 | ingen del begrenset  → ORDINÆR       |
 *
 * Tallene forutsetter minstebeløp 99 650 kr. Både minstebeløp og satser for et år uten egne
 * rader faller tilbake på nyeste år som finnes, så taket flytter seg når neste års satser
 * lander — testen regner det ut dynamisk framfor å hardkode det.
 *
 * Satsen har ingen tilsvarende vakt: pensjonsdelen (19,4 % × 1 200 000 = 232 800) må holde seg
 * under taket. Fra rundt 22,9 % vipper året over i 25 %-regelen, og testen blir rød uten at noe
 * er regressert.
 */

/**
 * Perioden må starte i framtiden. Er 01.11 passert, innvilger Perioder-steget pensjonsdelen
 * først fra dagens dato, året med særregel krymper, og taket det måles mot krymper med det.
 * Taket faller mot null gjennom november (25 087 kr ved 01.11, 87 kr ved 01.12), så
 * scenarioet skyves ett år fram allerede fra 1. november og ikke senere.
 */
const IDAG = new Date();
const ÅR_MED_SÆRREGEL = IDAG.getFullYear() + (IDAG.getMonth() >= 10 ? 1 : 0);
const ÅR_MED_ORDINÆR = ÅR_MED_SÆRREGEL + 1;
const MÅNEDSINNTEKT = 100000;

/**
 * networkidle skal la testen gå videre, ikke feile den — samme mønster som
 * TrygdeavgiftPage.ventPåSideLastet. Uten timeout og catch arver kallet 30s-standarden og
 * kaster på én etterslepende autolagring, med en feilmelding som peker et annet sted enn feilen.
 */
async function settleNetwork(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
    console.log('⚠️  Nettverket ble ikke rolig innen 5s (fortsetter)');
  });
}

/**
 * Fører saken fram til trygdeavgiftssteget med scenarioet over, og lar bruttoinntekten stå
 * ufylt — den fylles av testen selv, som da kan lytte på beregningssvaret først.
 */
async function gåTilTrygdeavgiftMedToSkatteår(page: Page, request: APIRequestContext): Promise<TrygdeavgiftPage> {
  const unleash = new UnleashHelper(request);
  await unleash.enableFeature('melosys.trygdeavgift.25-prosentregel');
  await unleash.enableFeature('melosys.trygdeavgift.vis_beregningsforklaring');

  const auth = new AuthHelper(page);
  await auth.login();

  const hovedside = new HovedsidePage(page);
  const opprettSak = new OpprettNySakPage(page);
  await hovedside.gotoOgOpprettNySak();
  await opprettSak.opprettStandardSak(USER_ID_VALID);
  await opprettSak.assertions.verifiserBehandlingOpprettet();
  await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

  // Perioden kan ikke gå bakover: trygdeavgift for tidligere år fastsettes på årsavregning,
  // og steget klipper bort fjorårsdelen med et varsel i stedet for å beregne den.
  const medlemskap = new MedlemskapPage(page);
  await medlemskap.velgPeriode(`01.11.${ÅR_MED_SÆRREGEL}`, `31.12.${ÅR_MED_ORDINÆR}`);
  await medlemskap.velgFlereLandIkkeKjentHvilke();
  await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
  await medlemskap.klikkBekreftOgFortsett();

  const arbeidsforhold = new ArbeidsforholdPage(page);
  await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

  const lovvalg = new LovvalgPage(page);
  await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
  await lovvalg.svarJaPaaFørsteSpørsmål();
  await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
  await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
  await lovvalg.klikkBekreftOgFortsett();

  const resultatPeriode = new ResultatPeriodePage(page);
  await resultatPeriode.ventPåSideLastet();
  await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

  const trygdeavgift = new TrygdeavgiftPage(page);
  await trygdeavgift.ventPåSideLastet();
  await trygdeavgift.velgSkattepliktig(false);
  await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
  // Ja gir satsene 6,8 % / 19,4 %. Med Nei er pensjonssatsen 26,3 %, pensjonsdelen blir alltid
  // begrenset, og grenen testen skal dekke finnes ikke.
  await trygdeavgift.velgBetalesAga(true);
  return trygdeavgift;
}

test.describe('Beregningsforklaring — ordinær avgift pr. avgiftsdel', () => {

  test('viser hvert delbeløp målt mot 25 %-taket når ingen del ble begrenset', async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);

    // Taket regnes ut før svaret leses, så en G-justering av minstebeløpet gir en feil på
    // denne linja og ikke et uforklarlig avvik lenger nede.
    const minstebeløp = await hentMinstebeløp(request, ÅR_MED_ORDINÆR);
    const årsinntekt = MÅNEDSINNTEKT * 12;
    const forventetTak = Math.floor(0.25 * (årsinntekt - minstebeløp));

    const trygdeavgift = await gåTilTrygdeavgiftMedToSkatteår(page, request);

    // Fanger opp beregningssvaret slik melosys-api serialiserer det, så en feil viser om
    // feltet mangler i api-svaret eller bare i visningen. Forklaringen lagres ikke, så den
    // finnes kun i PUT-svaret.
    const beregningssvar: any[] = [];
    page.on('response', (response) => {
      if (isTrygdeavgiftBeregningResponse(response) && response.request().method() === 'PUT') {
        response
          .json()
          .then((body) => beregningssvar.push(body))
          .catch(() => undefined);
      }
    });
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(String(MÅNEDSINNTEKT));
    await settleNetwork(page);

    // Poll på innholdet, ikke på antall svar: skjemaet lagrer debouncet, og
    // fyllInnBruttoinntektMedApiVent løser seg på hvilket som helst 200-svar — det første kan
    // være fra før inntekten ble fylt inn. Lista er i json()-rekkefølge, ikke svar-rekkefølge.
    const forklaringFor = (svar: any) =>
      (svar?.beregningsforklaringer ?? []).find((f: any) => f.aar === ÅR_MED_ORDINÆR);
    await expect
      .poll(() => beregningssvar.filter(forklaringFor).length, {
        timeout: 15000,
        message:
          `Ingen av beregningssvarene inneholdt en forklaring for ${ÅR_MED_ORDINÆR}. ` +
          'Sender melosys-api fortsatt beregningsforklaringer, og traff scenarioet riktig år?',
      })
      .toBeGreaterThan(0);
    // I dag svarer bare én autolagring. Kommer det flere, er rekkefølgen her json()-oppløsning
    // og ikke nødvendigvis den nettleseren rendret fra.
    const treff = beregningssvar.filter(forklaringFor);
    const beregning = treff.at(-1);
    const ordinærForklaring = forklaringFor(beregning);

    console.log(
      'Forklaringer i svaret: ' +
        JSON.stringify(
          (beregning.beregningsforklaringer ?? []).map((f: any) => ({
            aar: f.aar,
            gruppe: f.inntektsgruppe,
            regel: f.valgtRegel,
            tak: f.maksimalAvgift25Prosent,
            ordinaer: f.ordinaerAvgift,
            perDel: f.ordinaerAvgiftPerDel,
          })),
        ),
    );
    expect(ordinærForklaring.valgtRegel).toBe('ORDINÆR');
    expect(ordinærForklaring.maksimalAvgift25Prosent).toBe(forventetTak);

    const deler = ordinærForklaring.ordinaerAvgiftPerDel ?? [];
    expect(
      deler.map((del: any) => del.inntektsgruppe),
      'melosys-api skal føre ordinaerAvgiftPerDel videre fra beregningstjenesten',
    ).toEqual(['HELSEDEL', 'PENSJONSDEL']);

    // Uten sum over taket og alle deler under det finnes ikke feilen fag meldte inn.
    expect(
      ordinærForklaring.ordinaerAvgift,
      'Scenarioet forutsetter at summen av delene overstiger taket',
    ).toBeGreaterThan(ordinærForklaring.maksimalAvgift25Prosent);
    for (const del of deler) {
      expect(del.ordinaerAvgift).toBeLessThanOrEqual(ordinærForklaring.maksimalAvgift25Prosent);
    }
    // floor(helse) + floor(pensjon) kan bli 1 kr lavere enn floor(helse + pensjon), så
    // totalen må utledes fra delene og ikke rundes ned uavhengig av dem.
    expect(
      deler.reduce((sum: number, del: any) => sum + del.ordinaerAvgift, 0),
      'ordinaerAvgift skal være summen av delene, ikke en uavhengig avrunding',
    ).toBe(ordinærForklaring.ordinaerAvgift);

    expect(
      (beregning.beregningsforklaringer ?? []).some(
        (f: any) => f.aar === ÅR_MED_SÆRREGEL && f.valgtRegel === 'TJUEFEM_PROSENT_REGEL',
      ),
      `${ÅR_MED_SÆRREGEL} skal treffe 25 %-regelen, ellers skjuler melosys-web kortet`,
    ).toBe(true);

    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();

    const kort = new BeregningsforklaringKortPage(page);
    await kort.assertions.verifiserKortSynlig();
    await kort.aapneKort();
    await kort.assertions.verifiserFeltFinnes(ÅR_MED_SÆRREGEL, 'PENSJONSDEL');

    const steg = await kort.assertions.verifiserDelerMaaltMotTaket(ÅR_MED_ORDINÆR);

    expect(steg.avgiftstak).toBe(ordinærForklaring.maksimalAvgift25Prosent);
    expect(steg.ordinaerAvgift).toBe(ordinærForklaring.ordinaerAvgift);
    expect(steg.deler.map((del) => del.beloep)).toEqual(
      deler.map((del: any) => del.ordinaerAvgift),
    );

    console.log(
      `✅ ${ÅR_MED_ORDINÆR}: tak ${steg.avgiftstak} kr, ordinær avgift ${steg.ordinaerAvgift} kr, ` +
        `deler ${steg.deler.map((d) => `${d.navn} ${d.beloep}`).join(' + ')}`,
    );
    console.log(`✅ Merknad: ${steg.merknad}`);
  });

  /**
   * Motprøve: samme sak, men `ordinaerAvgiftPerDel` fjernes fra svaret før nettleseren ser
   * det, slik svaret var før feltet fantes. Da skal kortet si at delbeløpene mangler. Før
   * rettingen viste det i stedet «Ordinær avgift … ≤ 25 %-tak … → ordinær beregning brukes»,
   * en fast tekst som ikke var regnet ut fra tallene.
   */
  test('påstår ikke at totalen er under taket når delbeløpene mangler i svaret', async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);

    await page.route('**/trygdeavgift/beregning', async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      try {
        const response = await route.fetch();
        const json = await response.json();
        for (const forklaring of json.beregningsforklaringer ?? []) {
          delete forklaring.ordinaerAvgiftPerDel;
        }
        await route.fulfill({ response, json });
      } catch (error) {
        // Et unntak herfra lar forespørselen henge til testens timeout, uten spor tilbake
        // til denne route-en.
        console.error(`⚠️  Kunne ikke stripe ordinaerAvgiftPerDel: ${error}`);
        await route.continue().catch(() => {
          // Feilen over er allerede logget.
        });
      }
    });

    const trygdeavgift = await gåTilTrygdeavgiftMedToSkatteår(page, request);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(String(MÅNEDSINNTEKT));
    await settleNetwork(page);
    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();

    const kort = new BeregningsforklaringKortPage(page);
    await kort.assertions.verifiserKortSynlig();
    await kort.aapneKort();

    const steg = await kort.assertions.verifiserMerknadUtenDelbeloep(ÅR_MED_ORDINÆR);
    console.log(`✅ Merknad uten delbeløp: ${steg.merknad}`);
  });
});
