import { expect, Locator, Page } from '@playwright/test';
import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { AarsavregningPage } from '../../pages/behandling/aarsavregning.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import {
  USER_ID_VALID,
  SAKSTYPER,
  SAKSTEMA,
  BEHANDLINGSTEMA,
  AARSAK,
  BEHANDLINGSTYPE,
  FORRIGE_AAR,
} from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { UnleashHelper } from '../../helpers/unleash-helper';
import { hentMinstebeløp } from '../../helpers/trygdeavgift-beregning-helper';

/**
 * Årsavregning FTRL — 25%-regelen og minstebeløp
 *
 * Tester at visning av sats, dekning og inntektskilde tilpasses korrekt
 * når 25%-regelen og/eller minstebeløpet benyttes i endelig beregning
 * av trygdeavgift i årsavregning-konteksten.
 *
 * Krav (fra JIRA-story):
 * 1. Sats `*` med fotnote "Beregnet etter 25 %-regelen" når 25%-regel treffer
 * 2. Sats `**` med fotnote "Inntekten er under minstebeløpet" når under minstebeløp
 * 3. Dekning "Helsedel"/"Pensjonsdel" ved 25%-regel for frivillig (unntatt misjonær)
 *    (dekkes i trygdeavgift-steg-testene — krever førstegangsbehandling med dekning)
 * 4. Inntektskilde `***` med fotnote "Mer enn en inntekt" ved sammenslåtte kilder
 *    (krever flere inntektskilder — dekkes i trygdeavgift-steg-testene)
 *
 * Oppsett:
 * - Sakstype: FTRL, Behandlingstype: ÅRSAVREGNING
 * - Toggle: melosys.trygdeavgift.25-prosentregel (aktivert i felles oppsett)
 * - År: Forrige kalenderår (dynamisk via FORRIGE_AAR)
 * - Periode: Full-år (01.01 - 31.12) for stabile beregninger
 * - Inntekt: Beregnet relativt til faktisk minstebeløp via hentMinstebeløp()
 *
 * Teststrategi:
 * - Første test (ordinær) verifiserer at årsavregning-flyten fungerer med
 *   25%-regel-toggle aktivert når ordinær sats gjelder.
 * - Påfølgende tester verifiserer 25%-regel-spesifikk visning i UI. Disse vil
 *   FEILE inntil frontend-støtte for 25%-regel i årsavregning er implementert.
 *
 * Viktig: Årsavregning bruker en EGEN beregningstabell (BeregnetTrygdeavgiftDetaljer)
 * som er forskjellig fra trygdeavgift-stegets (TrygdeavgiftsperioderTabell).
 * Tabellen vises i en sammenleggbar panel ("Vis detaljert beregning") og har en
 * annen kolonnerekkefølge:
 *   Trygdeperiode | Sats | Avgift md. | Inntektskilde | Bruttoinntekt md. | Betalt aga.? | Skattepliktig | Dekning
 * Begge komponenter bruker de SAMME formateringsfunksjonene (formaterSats,
 * formaterDekning, formaterInntektskilde) og den SAMME Beregningsforklaringer-
 * komponenten (div.forklaringstekster).
 */

const TESTÅR = FORRIGE_AAR;

/**
 * Felles oppsett: enable 25%-regel toggle, login, opprett FTRL årsavregning,
 * naviger til årsavregning-formen.
 */
async function opprettFtrlAarsavregning(
  page: Page,
  request: any,
): Promise<{ aarsavregning: AarsavregningPage; vedtak: VedtakPage }> {
  const unleash = new UnleashHelper(request);
  await unleash.enableFeature('melosys.trygdeavgift.25-prosentregel');

  const auth = new AuthHelper(page);
  await auth.login();

  const hovedside = new HovedsidePage(page);
  const opprettSak = new OpprettNySakPage(page);
  const aarsavregning = new AarsavregningPage(page);
  const vedtak = new VedtakPage(page);

  await hovedside.goto();
  await hovedside.klikkOpprettNySak();
  await opprettSak.fyllInnBrukerID(USER_ID_VALID);
  await opprettSak.velgOpprettNySak();
  await opprettSak.velgSakstype(SAKSTYPER.FTRL);
  await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
  await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.YRKESAKTIV);
  await opprettSak.velgBehandlingstype(BEHANDLINGSTYPE.ÅRSAVREGNING);
  await opprettSak.velgAarsak(AARSAK.SØKNAD);
  await opprettSak.leggBehandlingIMine();
  await opprettSak.klikkOpprettNyBehandling();
  await opprettSak.assertions.verifiserBehandlingOpprettet();

  console.log('📝 Venter på prosessinstanser...');
  await waitForProcessInstances(page.request, 30);
  await hovedside.goto();

  await page
    .getByRole('link', { name: new RegExp(`${USER_ID_VALID}`) })
    .first()
    .click();

  await aarsavregning.ventPåSideLastet();
  return { aarsavregning, vedtak };
}

// ---------------------------------------------------------------------------
// Hjelpere for årsavregningens beregningstabell
//
// Tabellen (BeregnetTrygdeavgiftDetaljer) vises i en sammenleggbar panel
// (<ExpansionCard>) med tittel "Vis detaljert beregning". Panelet er lukket
// by default — må åpnes/klikkes før innholdet er tilgjengelig.
//
// Kolonnerekkefølge (indeks):
//   0: Trygdeperiode
//   1: Sats          (tall_felt — formaterSats: '*' / '**' / tall)
//   2: Avgift md.    (tall_felt)
//   3: Inntektskilde (formaterInntektskilde: '***' / kodeverk-term)
//   4: Bruttoinntekt md. (tall_felt)
//   5: Betalt aga.?  (betinget)
//   6: Skattepliktig
//   7: Dekning       (betinget — formaterDekning: 'Helsedel'/'Pensjonsdel'/kodeverk)
//
// Forklaringstekster (Beregningsforklaringer) rendres i div.forklaringstekster
// under tabellen, inne i ExpansionCard.Content.
// ---------------------------------------------------------------------------

const SATS_COL = 1;
const INNTEKTSKILDE_COL = 3;
const DEKNING_COL_FROM_END = 1; // Dekning er siste eller nest-siste kolonne

/** Åpne "Vis detaljert beregning"-panelet hvis det er lukket. */
async function åpneDetaljertBeregning(page: Page): Promise<void> {
  // ExpansionCard har aria-label="trygdeavgiftdetaljer" og knappen er inni headeren.
  const card = page.locator('[aria-label="trygdeavgiftdetaljer"]');
  await card.waitFor({ state: 'visible', timeout: 10000 });
  const button = card.locator('button').first();
  const expanded = await button.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await button.click();
    await page.getByRole('columnheader', { name: 'Trygdeperiode' }).waitFor({ state: 'visible' });
  }
  console.log('✅ Åpnet "Vis detaljert beregning"-panelet');
}

/** Hent beregnings-tabellen (inne i ExpansionCard etter at den er åpnet). */
function beregningstabell(page: Page): Locator {
  return page.locator('table.periode_tabell');
}

/** Verifiser sats-kolonnen (indeks 1) for en gitt rad. */
async function verifiserSatsKolonne(page: Page, radIndex: number, forventet: string | RegExp): Promise<void> {
  const row = beregningstabell(page).locator('tbody tr').nth(radIndex);
  const satsCell = row.locator('td').nth(SATS_COL);
  await expect(satsCell).toHaveText(forventet);
  console.log(`✅ Sats kolonne rad ${radIndex}: ${forventet}`);
}

/** Verifiser dekning-kolonnen (siste kolonne) for en gitt rad. */
async function verifiserDekningKolonne(page: Page, radIndex: number, forventet: string | RegExp): Promise<void> {
  const row = beregningstabell(page).locator('tbody tr').nth(radIndex);
  // Dekning er siste td i raden (betinget kolonne — vises ikke alltid)
  const cells = row.locator('td');
  const count = await cells.count();
  const dekningCell = cells.nth(count - DEKNING_COL_FROM_END);
  await expect(dekningCell).toContainText(forventet);
  console.log(`✅ Dekning kolonne rad ${radIndex}: ${forventet}`);
}

/** Verifiser inntektskilde-kolonnen (indeks 3) for en gitt rad. */
async function verifiserInntektskildeKolonne(page: Page, radIndex: number, forventet: string | RegExp): Promise<void> {
  const row = beregningstabell(page).locator('tbody tr').nth(radIndex);
  const inntektskildeCell = row.locator('td').nth(INNTEKTSKILDE_COL);
  await expect(inntektskildeCell).toContainText(forventet);
  console.log(`✅ Inntektskilde kolonne rad ${radIndex}: ${forventet}`);
}

/** Verifiser at en forklaringstekst (fotnote) er synlig under tabellen. */
async function verifiserForklaringstekst(page: Page, tekst: string | RegExp): Promise<void> {
  const forklaring = page.locator('.forklaringstekster');
  await expect(forklaring).toBeVisible({ timeout: 5000 });
  await expect(forklaring).toContainText(tekst);
  console.log(`✅ Forklaringstekst verifisert: ${tekst}`);
}

/** Verifiser at ingen forklaringstekster er synlige (ordinær beregning). */
async function verifiserIngenForklaringstekster(page: Page): Promise<void> {
  const forklaring = page.locator('.forklaringstekster');
  await expect(forklaring).not.toBeVisible({ timeout: 2000 });
  console.log('✅ Ingen forklaringstekster synlige');
}

test.describe('Årsavregning FTRL — 25%-regelen', () => {

  /**
   * Ordinær beregning: ordinær sats gjelder (25%-regelen begrenser ikke avgiften).
   * Verifiserer at beregnings-tabellen viser numerisk sats og ingen
   * forklaringstekster når inntekten er godt over 25%-regel-grensen.
   */
  test('ordinær beregning uten begrensning', async ({ page, request }) => {
    test.setTimeout(120000);

    const { aarsavregning, vedtak } = await opprettFtrlAarsavregning(page, request);

    await aarsavregning.velgÅr(String(TESTÅR));
    await aarsavregning.svarNei();
    await aarsavregning.velgBestemmelse('FTRL_KAP2_2_1');
    await aarsavregning.velgFraOgMedPeriode(`01.01.${TESTÅR}`);
    await aarsavregning.velgTilOgMedPeriode(`31.12.${TESTÅR}`);
    await aarsavregning.velgSkattepliktig(false);
    await aarsavregning.velgInntektskilde('ARBEIDSINNTEKT');
    await aarsavregning.fyllInnBruttoinntektMedApiVent('80000');

    // Åpne detaljert beregning og verifiser ordinær visning
    await åpneDetaljertBeregning(page);
    await verifiserSatsKolonne(page, 0, /^\d/);
    await verifiserIngenForklaringstekster(page);

    // Fullfør flyten: Bekreft + vedtak
    await aarsavregning.klikkBekreftOgFortsett();
    await vedtak.klikkFattVedtak();

    await waitForProcessInstances(page.request, 60);
    await vedtak.assertions.verifiserBehandlingAvsluttet();

    console.log('✅ Årsavregning: ordinær beregning + vedtak fullført');
  });

  /**
   * Inntekt under minstebeløpet fremkommer i beregningsoversikten.
   *
   * Forventet visning:
   * - Infotekst: "Trygdeavgift skal ikke betales da inntekten er under minstebeløpet."
   */
  test('inntekt under minstebeløpet fremkommer i beregningsoversikten', async ({ page, request }) => {
    test.setTimeout(120000);

    // Henter faktisk minstebeløp og legger oss trygt under
    const minstebeløp = await hentMinstebeløp(request, TESTÅR);
    const månedligMinstebeløp = Math.floor(minstebeløp / 12);
    const månedsinntekt = String(månedligMinstebeløp - 100);

    const { aarsavregning } = await opprettFtrlAarsavregning(page, request);

    await aarsavregning.velgÅr(String(TESTÅR));
    await aarsavregning.svarNei();
    await aarsavregning.velgBestemmelse('FTRL_KAP2_2_1');
    await aarsavregning.velgFraOgMedPeriode(`01.01.${TESTÅR}`);
    await aarsavregning.velgTilOgMedPeriode(`31.12.${TESTÅR}`);
    await aarsavregning.velgSkattepliktig(false);
    await aarsavregning.velgInntektskilde('ARBEIDSINNTEKT');
    await aarsavregning.fyllInnBruttoinntektMedApiVent(månedsinntekt);

    // Under minstebeløpet: alert vises inne i detaljert beregning-panelet.
    // Panelet inneholder KUN alertmelding (ingen tabell), så vi åpner det
    // uten å vente på tabellheader.
    const card = page.locator('[aria-label="trygdeavgiftdetaljer"]');
    await card.waitFor({ state: 'visible', timeout: 10000 });
    const button = card.locator('button').first();
    const expanded = await button.getAttribute('aria-expanded');
    if (expanded !== 'true') {
      await button.click();
    }
    await expect(
      page.getByText('Trygdeavgift skal ikke betales da inntekten er under minstebeløpet.')
    ).toBeVisible({ timeout: 10000 });
  });

  /**
   * Beregnet etter 25%-regelen fremkommer i beregningsoversikten.
   *
   * Forventet visning:
   * - Sats-kolonne: `*`
   * - Fotnote: "Beregnet etter 25 %-regelen"
   */
  test('beregnet etter 25%-regelen fremkommer i beregningsoversikten', async ({ page, request }) => {
    test.setTimeout(120000);

    // Inntekt litt over minstebeløpet → 25%-regelen treffer.
    // Ratio 1.21 gir en totalinntekt ~21 % over minstebeløpet: trygt innenfor
    // 25%-regel-båndet (godt under grensen der ordinær sats gjelder).
    const minstebeløp = await hentMinstebeløp(request, TESTÅR);
    const månedligMinstebeløp = Math.floor(minstebeløp / 12);
    const månedsinntekt = String(Math.floor(månedligMinstebeløp * 1.21));

    const { aarsavregning } = await opprettFtrlAarsavregning(page, request);

    await aarsavregning.velgÅr(String(TESTÅR));
    await aarsavregning.svarNei();
    await aarsavregning.velgBestemmelse('FTRL_KAP2_2_1');
    await aarsavregning.velgFraOgMedPeriode(`01.01.${TESTÅR}`);
    await aarsavregning.velgTilOgMedPeriode(`31.12.${TESTÅR}`);
    await aarsavregning.velgSkattepliktig(false);
    await aarsavregning.velgInntektskilde('ARBEIDSINNTEKT');
    await aarsavregning.fyllInnBruttoinntektMedApiVent(månedsinntekt);

    // Åpne detaljert beregning og verifiser 25%-regel visning
    await åpneDetaljertBeregning(page);
    await verifiserSatsKolonne(page, 0, '*');
    await verifiserForklaringstekst(page, 'Beregnet etter 25 %-regelen');
  });

  /**
   * Frivillig helse- og pensjonsdel fremkommer i beregningsoversikten.
   *
   * Forventet visning:
   * - Sats-kolonne: `*` på begge rader
   * - Fotnote: "Beregnet etter 25 %-regelen"
   * - Dekning-kolonne: "Helsedel" på rad 0, "Pensjonsdel" på rad 1
   */
  test('frivillig helse- og pensjonsdel fremkommer i beregningsoversikten', async ({ page, request }) => {
    test.setTimeout(120000);

    const minstebeløp = await hentMinstebeløp(request, TESTÅR);
    const månedligMinstebeløp = Math.floor(minstebeløp / 12);
    const månedsinntekt = String(Math.floor(månedligMinstebeløp * 1.21));

    const { aarsavregning } = await opprettFtrlAarsavregning(page, request);

    await aarsavregning.velgÅr(String(TESTÅR));
    await aarsavregning.svarNei();
    await aarsavregning.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
    await aarsavregning.velgDekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
    await aarsavregning.velgFraOgMedPeriode(`01.01.${TESTÅR}`);
    await aarsavregning.velgTilOgMedPeriode(`31.12.${TESTÅR}`);
    await aarsavregning.velgSkattepliktig(false);
    await aarsavregning.velgInntektskilde('INNTEKT_FRA_UTLANDET');
    await aarsavregning.velgBetalesAga(false);
    await aarsavregning.fyllInnBruttoinntektMedApiVent(månedsinntekt);

    // Åpne detaljert beregning og verifiser helsedel/pensjonsdel-split
    await åpneDetaljertBeregning(page);
    await verifiserSatsKolonne(page, 0, '*');
    await verifiserSatsKolonne(page, 1, '*');
    await verifiserForklaringstekst(page, 'Beregnet etter 25 %-regelen');
    await verifiserDekningKolonne(page, 0, /Helsedel/);
    await verifiserDekningKolonne(page, 1, /Pensjonsdel/);
  });

  /**
   * Sammenslåtte inntektskilder fremkommer i beregningsoversikten.
   *
   * Når flere inntektskilder er slått sammen i beregningen skal det vises
   * *** i inntektskilde-kolonnen med fotnote "Mer enn en inntekt".
   *
   * Oppsett: Hver kilde er under minstebeløp individuelt, men totalt over —
   * det er sammenslåingen som gjør at avgift beregnes.
   */
  test('sammenslåtte inntektskilder fremkommer i beregningsoversikten', async ({ page, request }) => {
    test.setTimeout(120000);

    // Hver kilde under minstebeløpet alene, totalt over → sammenslåing + 25%-regel
    const minstebeløp = await hentMinstebeløp(request, TESTÅR);
    const månedligMinstebeløp = Math.floor(minstebeløp / 12);
    const månedsinntektPerKilde = String(Math.floor(månedligMinstebeløp * 0.6));

    const { aarsavregning } = await opprettFtrlAarsavregning(page, request);

    await aarsavregning.velgÅr(String(TESTÅR));
    await aarsavregning.svarNei();
    await aarsavregning.velgBestemmelse('FTRL_KAP2_2_1');
    await aarsavregning.velgFraOgMedPeriode(`01.01.${TESTÅR}`);
    await aarsavregning.velgTilOgMedPeriode(`31.12.${TESTÅR}`);
    await aarsavregning.velgSkattepliktig(false);

    // Første inntektskilde
    await aarsavregning.velgInntektskilde('ARBEIDSINNTEKT');
    await aarsavregning.fyllInnBruttoinntektForIndeks(0, månedsinntektPerKilde);

    // Andre inntektskilde
    await aarsavregning.klikkLeggTilInntekt();
    await aarsavregning.velgInntektskildeForIndeks(1, 'NÆRINGSINNTEKT');
    await aarsavregning.fyllInnBruttoinntektForIndeksMedApiVent(1, månedsinntektPerKilde);

    // Åpne detaljert beregning og verifiser sammenslåtte inntektskilder
    await åpneDetaljertBeregning(page);
    await verifiserInntektskildeKolonne(page, 0, '***');
    await verifiserForklaringstekst(page, 'Mer enn en inntekt');
  });
});
