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
 * Scenario — frivillig helse+pensjon (§ 2-8 a), ikke skattepliktig, 100 000 kr/md:
 *
 * «Betales aga = Ja» er ikke en detalj: da er satsene 6,8 % (helse) og 19,4 % (pensjon),
 * begge under 25 %. Med aga = Nei er pensjonssatsen 26,3 %, og pensjonsdelen alene kan da
 * aldri havne under taket — grenen denne testen dekker er utilgjengelig.
 *
 * Perioden krysser årsskiftet og gir to skatteår i samme behandling (minstebeløp 99 650 kr):
 *
 *   | År      | Mnd | Årsinntekt | Tak     | Helsedel | Pensjonsdel | Utfall                               |
 *   |---------|-----|------------|---------|----------|-------------|--------------------------------------|
 *   | i år    |   2 |    200 000 |  25 087 |   13 600 |      38 800 | pensjonsdel begrenset → 25 %-regelen |
 *   | neste   |  12 |  1 200 000 | 275 087 |   81 600 |     232 800 | ingen del begrenset  → ORDINÆR       |
 *
 * Året med særregel er ikke pynt: melosys-web skjuler hele forklaringskortet når ingen
 * inntektsgruppe traff en særregel (forklaringerSomSkalVises). Uten det ville
 * ORDINÆR-forklaringen — og dermed rettingen — aldri vært synlig i nettleseren. Det speiler
 * også innmeldingen, som gjaldt flere skatteforholdsperioder.
 */

const ÅR_MED_SÆRREGEL = new Date().getFullYear();
const ÅR_MED_ORDINÆR = ÅR_MED_SÆRREGEL + 1;
const MÅNEDSINNTEKT = 100000;

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

  // Perioden krysser årsskiftet FRAMOVER: to skatteår i samme behandling. Den kan ikke gå
  // bakover — trygdeavgift for tidligere år fastsettes på årsavregning, og steget klipper
  // da bort fjorårsdelen med et varsel i stedet for å beregne den.
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
    // skiller mellom «web rendrer ikke feltet» og «api/beregning sender det ikke».
    // Forklaringen persisteres ikke i melosys-api, så den finnes bare i PUT-svaret —
    // og skjemaet lagrer debouncet, så vi tar det SISTE svaret, ikke det første.
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
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => beregningssvar.length, { timeout: 15000 })
      .toBeGreaterThan(0);
    const beregning = beregningssvar.at(-1);

    // --- Kontrakten fra melosys-trygdeavgift-beregning, gjennom melosys-api ---
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
    const ordinærForklaring = (beregning.beregningsforklaringer ?? []).find(
      (f: any) => f.aar === ÅR_MED_ORDINÆR,
    );
    expect(
      ordinærForklaring,
      `Fant ingen beregningsforklaring for ${ÅR_MED_ORDINÆR} i svaret`,
    ).toBeDefined();
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
    // Pinner siste commit i #447: totalen utledes fra delene, ikke floores uavhengig av dem.
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

    // --- Det saksbehandleren ser i nettleseren ---
    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();

    const kort = new BeregningsforklaringKortPage(page);
    await kort.assertions.verifiserKortSynlig();
    await kort.aapneKort();
    await kort.assertions.verifiserFeltFinnes(ÅR_MED_SÆRREGEL, 'PENSJONSDEL');

    const steg = await kort.assertions.verifiserDelerMaaltMotTaket(ÅR_MED_ORDINÆR);
    await kort.assertions.verifiserIngenSelvmotsigendeSammenligning(ÅR_MED_ORDINÆR);

    // Kortet skal vise nøyaktig de tallene backend sendte.
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

    await page.screenshot({
      path: 'test-results/beregningsforklaring-per-del.png',
      fullPage: true,
    });
  });

  /**
   * Motprøven: samme sak, men `ordinaerAvgiftPerDel` strippes ut av svaret før nettleseren
   * ser det — altså nøyaktig det melosys-web fikk før MELOSYS-8171.
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
      const response = await route.fetch();
      const json = await response.json();
      for (const forklaring of json.beregningsforklaringer ?? []) {
        delete forklaring.ordinaerAvgiftPerDel;
      }
      await route.fulfill({ response, json });
    });

    const trygdeavgift = await gaaTilTrygdeavgiftMedToSkatteaar(page, request);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent(String(MÅNEDSINNTEKT));
    await page.waitForLoadState('networkidle');
    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();

    const kort = new BeregningsforklaringKortPage(page);
    await kort.assertions.verifiserKortSynlig();
    await kort.aapneKort();

    const steg = await kort.assertions.verifiserMerknadUtenDelbeloep(ÅR_MED_ORDINÆR);
    console.log(`✅ Merknad uten delbeløp: ${steg.merknad}`);
  });
});
