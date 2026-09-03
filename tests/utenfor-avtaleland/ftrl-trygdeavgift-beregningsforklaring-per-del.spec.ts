import { Page, expect } from '@playwright/test';
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
 * - melosys-trygdeavgift-beregning #447: nytt felt `ordinaerAvgiftPerDel`, og totalen
 *   utledes fra delene (ellers kunne floor(sum) bli 1 kr høyere enn summen av floor(del))
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
 */

/**
 * Perioden må starte i framtiden. Er 01.11 passert, innvilger Perioder-steget pensjonsdelen
 * først fra dagens dato, året med særregel krymper, og taket det måles mot krymper med det.
 * Vi skyver derfor scenarioet ett år fram fra 1. november.
 *
 * Grensen er satt på marginen, ikke på det siste målepunktet som passerte: taket faller
 * raskt gjennom november (25 087 kr ved 01.11, 13 337 kr ved 15.11, 87 kr ved 01.12), og et
 * scenario som balanserer noen kroner over minstebeløpsgrensen er ikke verdt å stå i.
 */
const IDAG = new Date();
const ÅR_MED_SÆRREGEL = IDAG.getFullYear() + (IDAG.getMonth() >= 10 ? 1 : 0);
const ÅR_MED_ORDINÆR = ÅR_MED_SÆRREGEL + 1;
const MÅNEDSINNTEKT = 100000;

/**
 * Samme mønster som resten av repoet (se TrygdeavgiftPage.ventPåSideLastet): networkidle skal
 * la testen gå videre, ikke velte den. Uten guard arver kallet 30s-standarden og kaster på en
 * enkelt etterslepende autolagring, med en feilmelding som ikke peker på det testen sjekker.
 */
async function ventPaaRoligNettverk(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
    console.log('⚠️  Nettverket ble ikke rolig innen 5s (fortsetter)');
  });
}

/**
 * Fører saken fram til trygdeavgiftssteget med scenarioet over, og lar bruttoinntekten stå
 * ufylt — den fylles av testen selv, som da kan lytte på beregningssvaret først.
 */
async function gaaTilTrygdeavgiftMedToSkatteaar(page: Page, request: any): Promise<TrygdeavgiftPage> {
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

  // Bakover er ikke et alternativ: trygdeavgift for tidligere år fastsettes på årsavregning,
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
  // Ja gir satsene 6,8 % / 19,4 %; med Nei er pensjonssatsen 26,3 % og pensjonsdelen
  // kan aldri komme under taket — da finnes ikke grenen testen skal dekke.
  await trygdeavgift.velgBetalesAga(true);
  return trygdeavgift;
}

test.describe('Beregningsforklaring — ordinær avgift pr. avgiftsdel', () => {

  test('viser hvert delbeløp målt mot 25 %-taket når ingen del ble begrenset', async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);

    // Taket og delbeløpene regnes ut på forhånd, slik at testen sier hva den forventer
    // før den ser svaret — og feiler hvis G-justering flytter minstebeløpet under oss.
    const minstebeløp = await hentMinstebeløp(request, ÅR_MED_ORDINÆR);
    const årsinntekt = MÅNEDSINNTEKT * 12;
    const forventetTak = Math.floor(0.25 * (årsinntekt - minstebeløp));

    const trygdeavgift = await gaaTilTrygdeavgiftMedToSkatteaar(page, request);

    // Fanger opp beregningssvaret slik melosys-api faktisk serialiserer det, så testen
    // skiller «web rendrer ikke feltet» fra «api/beregning sender det ikke». Forklaringen
    // persisteres ikke, så den finnes kun i PUT-svaret.
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
    await ventPaaRoligNettverk(page);

    // Poll på INNHOLDET, ikke på antall svar: skjemaet lagrer debouncet, og
    // fyllInnBruttoinntektMedApiVent løser seg på hvilket som helst 200-svar. Det første
    // svaret som lander kan være fra tilstanden før inntekten ble fylt inn, og har da ingen
    // forklaring for ÅR_MED_ORDINÆR. Rekkefølgen i lista er dessuten json()-rekkefølge.
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
    // .at(-1): flere autolagringer kan ha rukket å svare, og det ferskeste svaret er det som
    // svarer til skjemaet slik det står nå — altså det kortet nedenfor rendres fra.
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

    // Selve feilklassen: summen overstiger taket, men ingen del gjør det. Uten dette
    // holder scenarioet ikke lenger, og resten av testen ville passert uten å bevise noe.
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

    // Kortet rendres kun når en særregel slo ut et sted i settet, så året med 25 %-regel er
    // en forutsetning for at ORDINÆR-forklaringen i det hele tatt er synlig i nettleseren.
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
   * Motprøven: samme sak, men `ordinaerAvgiftPerDel` strippes ut av svaret før nettleseren
   * ser det — altså nøyaktig det melosys-web fikk før feltet ble innført.
   *
   * Uten denne testen kunne testen over ikke skille «melosys-web utleder merknaden av
   * tallene» fra «melosys-web gjentar en hardkodet ulikhet som tilfeldigvis stemte». Det er
   * denne responsen som ga kortet fag meldte inn: totalen overstiger taket, og kortet
   * påsto likevel «Ordinær avgift … ≤ 25 %-tak … → ordinær beregning brukes».
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
        // Et unntak som slipper ut herfra ville latt forespørselen stå ufullført til testens
        // timeout, uten spor tilbake til interceptet.
        console.error(`⚠️  Kunne ikke stripe ordinaerAvgiftPerDel: ${error}`);
        await route.continue().catch(() => {
          // Kun oppryddingen svelges; feilen over er allerede logget.
        });
      }
    });

    const trygdeavgift = await gaaTilTrygdeavgiftMedToSkatteaar(page, request);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(String(MÅNEDSINNTEKT));
    await ventPaaRoligNettverk(page);
    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();

    const kort = new BeregningsforklaringKortPage(page);
    await kort.assertions.verifiserKortSynlig();
    await kort.aapneKort();

    const steg = await kort.assertions.verifiserMerknadUtenDelbeloep(ÅR_MED_ORDINÆR);
    console.log(`✅ Merknad uten delbeløp: ${steg.merknad}`);
  });
});
