import { expect, test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { TrygdeavgiftPage } from '../../pages/trygdeavgift/trygdeavgift.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import {
  USER_ID_VALID,
  SAKSTYPER,
  SAKSTEMA,
  BEHANDLINGSTEMA,
  AARSAK,
  EU_EOS_LAND,
  EU_EOS_LOVVALG,
  FORRIGE_AAR,
} from '../../pages/shared/constants';
import { TestPeriods } from '../../helpers/date-helper';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { UnleashHelper } from '../../helpers/unleash-helper';
import { withDatabase } from '../../helpers/db-helper';
import { verifiserAarsavregningBehandling } from '../../pages/behandling/aarsavregning.assertions';
import { setupPensjonistUtenGrunnlagMedAutoAarsavregning } from '../aarsavregning/pensjonist-aarsavregning-setup';

/**
 * MELOSYS-8163: Automatisk årsavregning ved vedtak for EU/EØS — offentlig tjenesteperson og
 * EØS pensjonist
 *
 * Spec: specs/aarsavregning-automatisk-eos-tjenesteperson-pensjonist.md
 *
 * Utvider den samme automatikken som allerede gjelder for FTRL (MELOSYS-8148) til to EU/EØS
 * sakstyper: EU_EOS/MEDLEMSKAP_LOVVALG/ARBEID_TJENESTEPERSON_ELLER_FLY (art. 11.3b, med
 * innhentingsbrev, periode hentet fra lovvalgsperioden) og EU_EOS/TRYGDEAVGIFT/PENSJONIST (uten
 * brev). Frem til hver sakstypes egen årsavregningsflyt er ferdigstilt vises en blokkerende
 * melding i årsavregningsflyten.
 *
 * STATUS (2026-07-01): Skrevet parallelt med at melosys-api-claude og melosys-web implementerer
 * MELOSYS-8163. Mot main: begge scenariene røde kun på den blokkerende meldingen (auto-opprett +
 * brev er allerede grønt). Verifisert mot feature-branchene (melosys-api:
 * 8163-arsavregning-eos-tjenesteperson, melosys-web: feature/8163-arsavregning-eos-melding):
 * Scenario B (pensjonist) er GRØNT. Scenario A (tjenesteperson) feiler fortsatt — men av en
 * konkret, diagnostisert årsak i melosys-web (IKKE poll-lag): `src/url/url.ts` sin
 * `skalViseIngenFlyt()` ruter tjenesteperson-årsavregning ubetinget til den gamle
 * `IngenFlytBehandling`-fallback-siden uansett toggle-state, så den nye meldingskomponenten nås
 * aldri. Rapportert til melosys-web via hivemind. Se endringsloggen i speken.
 */

const BREVMAL_INNHENTING = 'INNHENTING_AV_INNTEKTSOPPLYSNINGER';
const AKTOER_ID_VALID = '1111111111111';
const BLOKKERENDE_MELDING_TESTID = 'aarsavregning-ikke-stottet-sakstype';
const BLOKKERENDE_MELDING_TEKST =
  /Melosys støtter ikke årsavregning for denne kombinasjonen av sakstype.{0,2}tema/i;

type BrevRad = { DATA: string; STATUS: string; PROSESS_TYPE: string };

/** Henter en fersk innhentingsbrev-prosessinstans, eller undefined hvis ingen finnes. */
async function hentInnhentingsbrev(): Promise<BrevRad | undefined> {
  return await withDatabase(async (db) => {
    const rader = await db.query<BrevRad>(
      `SELECT PI.DATA, PI.STATUS, PI.PROSESS_TYPE
       FROM PROSESSINSTANS PI
       WHERE PI.PROSESS_TYPE IN ('SEND_BREV', 'OPPRETT_OG_DISTRIBUER_BREV')
         AND PI.REGISTRERT_DATO > SYSDATE - INTERVAL '10' MINUTE
       ORDER BY PI.REGISTRERT_DATO DESC`,
      {}
    );
    return rader.find((r) => (r.DATA || '').includes(BREVMAL_INNHENTING));
  });
}

/**
 * Binder brev-«Så»-linjene i scenario A: poller PROSESSINSTANS til en fersk brev-prosessinstans
 * for innhentingsbrevet finnes, og verifiserer at den er FERDIG og adressert til forventet
 * mottaker. Periode-innholdet (lovvalgsperiode vs. medlemskapsperiode) asserteres IKKE eksakt her
 * — InnhentingAvInntektsopplysningerMapper-gapet (se speken) gjør at DATA kan inneholde feil
 * periodetype til mapper-fiksen lander. Brevmal-treffet + FERDIG-status er det bærende.
 */
async function verifiserInnhentingsbrevSendt(mottakerIdentifikatorer: string[]): Promise<void> {
  await expect
    .poll(async () => (await hentInnhentingsbrev()) !== undefined, {
      message: `Venter på brev-prosessinstans for ${BREVMAL_INNHENTING}`,
      timeout: 30_000,
    })
    .toBe(true);

  const brev = (await hentInnhentingsbrev())!;
  console.log(`🔍 Innhentingsbrev: prosess=${brev.PROSESS_TYPE}, status=${brev.STATUS}`);

  expect(brev.STATUS, 'Innhentingsbrevet skal være produsert og distribuert (FERDIG)').toBe(
    'FERDIG'
  );

  const dataHarMottaker = mottakerIdentifikatorer.some((id) => (brev.DATA || '').includes(id));
  expect(
    dataHarMottaker,
    `Brevet skal være adressert til bruker (en av ${mottakerIdentifikatorer.join(' / ')})`
  ).toBe(true);
}

/**
 * Binder de to siste «Så»-linjene i begge scenarier: den blokkerende meldingen vises, og
 * saksbehandler kan ikke bekrefte årsavregningssteget. Årsvelgeren (#aarVelger) rendres FØR
 * meldingen og er alltid synlig — det som faktisk skjules bak
 * `!erÅrsavregningIkkeStøttetSakstype` er bekreft-underskjemaet
 * (AarsavregningMedGrunnlag/AarsavregningUtenEllerDeltGrunnlag), altså «Bekreft og
 * fortsett»-knappen. Vi asserterer derfor fravær av DEN, ikke av årsvelgeren.
 *
 * melosys-web henter featuretoggles KUN én gang per SPA-økt (rammeverk-mount ved
 * innlogging/reload) fra melosys-api sin egen /featuretoggle-endepunkt — som igjen reflekterer
 * melosys-api sin Unleash-klients EGEN poll-interval (ikke instant selv om Unleash-serveren
 * allerede har bekreftet endringen). Et `unleash.disableFeature(...)`-kall like før sjekken kan
 * derfor treffe et vindu der melosys-api ennå ikke har polled den nye verdien. Vi reloader og
 * poller derfor i en løkke i stedet for å stole på ett enkelt reload (samme
 * poll-lag-fenomen som er dokumentert for trygdeavgift-beregning i CLAUDE.md).
 */
async function verifiserBlokkerendeMelding(page: import('@playwright/test').Page): Promise<void> {
  const melding = page.getByTestId(BLOKKERENDE_MELDING_TESTID);

  await expect
    .poll(
      async () => {
        if (await melding.isVisible().catch(() => false)) {
          return true;
        }
        await page.reload();
        await page.waitForLoadState('networkidle').catch(() => {});
        return melding.isVisible().catch(() => false);
      },
      {
        message: `Venter på blokkerende melding (${BLOKKERENDE_MELDING_TESTID}) — kan henge på melosys-api sin Unleash-poll-lag`,
        timeout: 45_000,
        intervals: [3_000],
      }
    )
    .toBe(true);

  await expect(melding).toHaveText(BLOKKERENDE_MELDING_TEKST);

  // Årsvelgeren (#aarVelger) rendres FØR meldingen i vurderingAarsavregningInngang.tsx og er
  // alltid synlig. Det som faktisk skjules bak `!erÅrsavregningIkkeStøttetSakstype` er
  // AarsavregningMedGrunnlag/AarsavregningUtenEllerDeltGrunnlag — underskjemaet som inneholder
  // «Bekreft og fortsett»-knappen. Det er DEN som skal være fraværende.
  await expect(page.getByRole('button', { name: 'Bekreft og fortsett' })).toBeHidden();
  console.log('✅ Blokkerende melding vises, bekreft-underskjemaet er skjult');
}

test.describe('Automatisk årsavregning for EU/EØS tjenesteperson og pensjonist (MELOSYS-8163)', () => {
  test('EØS tjenesteperson art.11.3b: auto-opprettet årsavregning + innhentingsbrev + blokkerende melding', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const auth = new AuthHelper(page);
    const unleash = new UnleashHelper(request);

    // Disable tidlig (før login) — påvirker ikke auto-opprett/brev-delen (den styres av
    // OppretteÅrsavregningVedEndring, ikke denne UI-only-togglen), og gir melosys-api sin
    // Unleash-klient mest mulig tid til å polle den nye verdien før vi når blokkerings-sjekken.
    await unleash.disableFeature('melosys.arsavregning.eos_tjenesteperson');
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new EuEosBehandlingPage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);

    // Periode utelukkende i forrige kalenderår — i motsetning til
    // eu-eos-art11-3b-offentlig-tjenesteperson-trygdeavgift.spec.ts som bruker
    // fullCurrentYearPeriod nettopp for å UNNGÅ tidligere-år-varselet. Her er det poenget:
    // trygdeavgift skal IKKE fastsettes på førstegangen, men på en auto-opprettet årsavregning.
    const periode = TestPeriods.previousYearPeriod;
    const behandlingLenke = new RegExp(`${USER_ID_VALID}.*Medlemskap og lovvalg.*Offentlig`);

    console.log('Step 1: Oppretter EØS Medlemskap Lovvalg Offentlig tjenesteperson-sak...');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgOpprettNySak();
    await opprettSak.velgSakstype(SAKSTYPER.EU_EOS);
    await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
    await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.ARBEID_TJENESTEPERSON_ELLER_FLY);
    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    await opprettSak.velgSøknadsperiode(periode.start, periode.end);
    await opprettSak.velgArbeidsland(EU_EOS_LAND.BULGARIA);
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    console.log('Step 2: Venter på prosessinstanser etter saksopprettelse...');
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();

    console.log('Step 3: Åpner behandlingen...');
    await hovedside.åpneBehandling(behandlingLenke);
    await page.waitForLoadState('networkidle');

    // Saksnummeret trengs for å navigere presist til årsavregningens Vurdering-steg senere
    // (hovedside.åpneBehandling(/Årsavregning/) landet i praksis på et sidepanel som «Fullmektig»
    // i stedet for selve vurderingssteget — åpneAarsavregningForSaksnummer treffer riktig lenke).
    const saksnummer = new URL(page.url()).pathname.match(/\b(MEL-\d+)\b/)?.[1];
    if (!saksnummer) {
      throw new Error(`Fant ikke saksnummer i URL-en: ${page.url()}`);
    }

    console.log('Step 4: Medlemskap - Bekreft og fortsett...');
    await behandling.klikkBekreftOgFortsett();

    console.log('Step 5: Arbeidsforhold...');
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');

    console.log('Step 6: Lovvalg - art.11(3)(b)...');
    await behandling.velgLovvalgsbestemmelse(EU_EOS_LOVVALG.ART_11_3_B);
    // Periode utelukkende i tidligere år: trygdeavgift-steget viser kun
    // «tidligere år skal fastsettes på årsavregning»-varselet, ingen inputfelt. Samme
    // «tomt steg»-mønster som EuEosPensjonistBehandlingPage.klikkBekreftOgFortsettTilTomtTrygdeavgiftSteg.
    await behandling.klikkBekreftOgFortsett({
      waitForContent: page.getByText(/tidligere år skal fastsettes på årsavregning/i).first(),
    });

    console.log('Step 7: Trygdeavgift (tomt steg - kun varsel)...');
    await trygdeavgift.klikkBekreftOgFortsett();

    console.log('Step 8: Fatter førstegangsvedtak...');
    await vedtak.klikkFattVedtak();

    console.log('Step 9: Venter på auto-opprettelse av årsavregning + innhentingsbrev...');
    await waitForProcessInstances(page.request, 60);

    console.log('Step 10: Åpner den auto-opprettede årsavregningsbehandlingen...');
    await hovedside.goto();
    await hovedside.åpneAarsavregningForSaksnummer(saksnummer);
    await page.waitForURL(/behandlingID=\d+/, { timeout: 15000 });
    const behandlingId = new URL(page.url()).searchParams.get('behandlingID');
    if (!behandlingId) {
      throw new Error(`Fant ikke behandlingID i årsavregnings-URL-en: ${page.url()}`);
    }
    console.log(`📌 Auto-opprettet årsavregning: behandlingID=${behandlingId}`);

    await verifiserAarsavregningBehandling(behandlingId, {
      forventetStatus: 'UNDER_BEHANDLING',
      forventetResultatType: 'IKKE_FASTSATT',
      forventetAar: FORRIGE_AAR,
    });

    console.log('Step 11: Verifiserer innhentingsbrev...');
    await verifiserInnhentingsbrevSendt([USER_ID_VALID, AKTOER_ID_VALID]);

    console.log('Step 12: Verifiserer blokkerende melding i årsavregningsflyten...');
    await verifiserBlokkerendeMelding(page);

    await waitForProcessInstances(page.request, 30);
  });

  test('EØS pensjonist: auto-opprettet årsavregning viser blokkerende melding før togglen er satt i produksjon', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const auth = new AuthHelper(page);
    const unleash = new UnleashHelper(request);

    // Simulerer pre-prod-tilstand: i dette testmiljøet er melosys.arsavregning.eos_pensjonist
    // normalt PÅ (default-state, se helpers/unleash-helper.ts) fordi pensjonist-årsavregningsflyten
    // allerede er langt på vei bygget. Blokkerende melding + brev-fravær er allerede dekket av
    // aarsavregning-innhentingsbrev-saksbehandlingsflyt.spec.ts scenario 4 — denne testen legger
    // KUN til blokkerings-assertionen som MELOSYS-8163 introduserer.
    await unleash.disableFeature('melosys.arsavregning.eos_pensjonist');
    await auth.login();

    console.log('📝 EØS-pensjonist saksbehandlingsflyt → auto-opprettet årsavregning...');
    await setupPensjonistUtenGrunnlagMedAutoAarsavregning(page);

    console.log('🔍 Verifiserer blokkerende melding i årsavregningsflyten...');
    await verifiserBlokkerendeMelding(page);

    await waitForProcessInstances(page.request, 30);
  });
});
