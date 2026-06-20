import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { SedHelper } from '../../helpers/sed-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { EuEosUtpekingPage } from '../../pages/behandling/eu-eos-utpeking.page';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { fetchStoredSedDocuments } from '../../helpers/mock-helper';
import { BRUKERNAVN_VALID } from '../../pages/shared/constants';

/**
 * EU/EØS - Inngående A003 (annet land utpekt) → REGISTRERT_UNNTAK
 *
 * Gap: eos-inngaaende-a003-annet-land-utpekt-registrert-unntak (Tier 1). Dette er
 * den volum-mest-brukte udekkede flyten i prod: REGISTRERING_UNNTAK_GODKJENN står
 * for ~19 % av alt prosessarbeid, og utfallet REGISTRERT_UNNTAK for ~85 % av alle
 * vedtaksutfall. Den er den OMVENDTE grenen av
 * eu-eos-inngaaende-a003-norge-utpekt-a012.spec.ts: der peker A003 ut Norge
 * (→ A012 / FASTSATT_LOVVALGSLAND); her peker A003 ut et ANNET EU/EØS-land, og
 * saksbehandler godkjenner/registrerer at Norge dermed ikke er kompetent
 * (→ REGISTRERT_UNNTAK, personen unntas norsk trygd).
 *
 * Scenario (primær happy-path, varsleUtland=false → ingen utgående SED):
 * 1. Injiser en inngående A003 med lovvalgsland = SE (et annet land enn NO). Dette
 *    oppretter en behandling med tema BESLUTNING_LOVVALG_ANNET_LAND for testpersonen.
 * 2. Åpne behandlingen og fullfør annet-land-grenen (bare 2 steg, ikke 4 som
 *    Norge-grenen): Vurdering[Godkjenn] → Godkjenn utpeking[Bekreft].
 * 3. Verifiser ende-til-ende:
 *    - behandlingsresultat REGISTRERT_UNNTAK / utfall_registrering_unntak GODKJENT
 *    - en lovvalgsperiode til det andre landet (SE), art.13(1)(a), INNVILGET,
 *      medlemskapstype UNNTATT, knyttet til en MEDL-periode
 *    - REGISTRERING_UNNTAK_GODKJENN fullført uten feilede prosessinstanser
 *    - MEDL-perioden er opprettet med det andre landet som lovvalgsland (SWE),
 *      foreløpig lovvalg (FORL) / uavklart status (UAVK) — behandlingen ender som
 *      MIDLERTIDIG_LOVVALGSBESLUTNING (ikke AVSLUTTET)
 *    - INGEN utgående A012 sendes (varsleUtland=false sender ingen SED)
 *
 * Live-verifisert 2026-06-14 (Playwright MCP, behandling 101, lovvalgsland SE → MEDL SWE).
 */
test.describe('EU/EØS - Inngående A003 (annet land utpekt)', () => {
  test('skal godkjenne at et annet land er utpekt og registrere unntak (uten SED)', async ({ page, request }) => {
    test.setTimeout(240000);

    // === DEL A: Inngående A003 (lovvalgsland=SE) oppretter annet-land-behandling ===
    console.log('📝 Del A: Injiserer inngående A003 (annet land utpekt, lovvalgsland=SE)...');
    const sed = new SedHelper(request);
    const result = await sed.sendSed({
      sedType: 'A003',
      bucType: 'LA_BUC_02',
      lovvalgsland: 'SE',
      artikkel: '13_1_a',
      // opprettBucIRina ikke nødvendig: varsleUtland=false sender ingen SED, så
      // melosys-api trenger ingen åpen BUC i RINA-store for denne flyten.
    });
    expect(result.success, `Send A003 feilet: ${result.message}`).toBe(true);
    await waitForProcessInstances(request, 60);

    const auth = new AuthHelper(page);
    await auth.login();
    const hovedside = new HovedsidePage(page);
    const utpeking = new EuEosUtpekingPage(page);

    // Åpne den nyopprettede annet-land-behandlingen for testpersonen.
    await hovedside.goto();
    await hovedside.åpneBehandling(`${BRUKERNAVN_VALID} -`);
    await page.waitForLoadState('networkidle').catch(() => {});

    // Snapshot A012-tilstand FØR godkjenning (primær path skal IKKE sende noen SED).
    const a012Før = await fetchStoredSedDocuments(request, 'A012');

    // === DEL B: Godkjenn at annet land er utpekt og registrer unntaket ===
    console.log('📝 Del B: Godkjenner lovvalgsbeslutningen og registrerer unntak...');
    await utpeking.godkjennUtpekingAnnetLand({ varsleUtland: false });

    console.log('📝 Del B: Venter på at REGISTRERING_UNNTAK_GODKJENN fullfører (kaster ved feilede instanser)...');
    await waitForProcessInstances(request, 90);

    // === DEL C: Verifiser REGISTRERT_UNNTAK + MEDL-overføring + ingen SED ===
    await utpeking.assertions.verifiserRegistrertUnntakIverksatt(request, {
      lovvalgsland: 'SE',
      medlLovvalgsland: 'SWE',
    });

    const a012Etter = await fetchStoredSedDocuments(request, 'A012');
    expect(
      a012Etter.length,
      'Ingen utgående A012 skal sendes når varsleUtland=false'
    ).toBe(a012Før.length);

    console.log('✅ Inngående A003 (annet land utpekt) → REGISTRERT_UNNTAK verifisert ende-til-ende');
  });
});
