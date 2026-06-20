import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { SedHelper } from '../../helpers/sed-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosUtpekingPage } from '../../pages/behandling/eu-eos-utpeking.page';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { BRUKERNAVN_VALID, USER_ID_VALID } from '../../pages/shared/constants';

/**
 * EU/EØS - Nyvurdering av inngående A003 (annet land utpekt) → REGISTRERT_UNNTAK
 *
 * Gap (P5a): heatmap-cellen `BESLUTNING_LOVVALG_ANNET_LAND × NY_VURDERING` (~10,2k/12mo).
 * P1 (#278) dekker FØRSTEGANG-grenen (inngående A003 annet land → REGISTRERT_UNNTAK);
 * NY_VURDERING-grenen var udekket. Cellen var dessuten en FALSK ✅ funnet ved
 * verifiseringen 2026-06-14: den eksisterende `eu-eos-12.1-nyvurdering-medl-overforing`
 * er UTSENDT_ARBEIDSTAKER (art. 12(1)), IKKE inngående annet land. Denne testen lukker
 * NV-grenen og retter den feiletiketten.
 *
 * Fase A (verify-don't-trust, live-repro 2026-06-15):
 *  - NV-grenen for annet land er MANUELL: NV-behandlingen lander på SAMME 2-stegs
 *    utpeking-wizard som førstegang (Vurder lovvalgsbeslutningen → Godkjenn utpeking),
 *    så `godkjennUtpekingAnnetLand` gjenbrukes uendret.
 *  - NV-behandlingen får `BEH_TYPE=NY_VURDERING` + `BEH_TEMA=BESLUTNING_LOVVALG_ANNET_LAND`
 *    (discriminator mot førstegangens `FØRSTEGANG`), og sin EGEN
 *    `REGISTRERING_UNNTAK_GODKJENN` → REGISTRERT_UNNTAK.
 *  - MEDL oppdateres in-place: NV-lovvalgsperioden deler samme `medlperiode_id` som
 *    førstegang. `verifiserRegistrertUnntakIverksatt` (nyeste rad) treffer NV-radene.
 *
 * Scenario (varsleUtland=false → ingen utgående SED, som P1):
 *  - Del A: etabler førstegangs-saken (P1-stegene) → REGISTRERT_UNNTAK.
 *  - Del B: opprett en nyvurdering og bekreft at NV-grenen (riktig tema) ble truffet.
 *  - Del C: fullfør NV-grenen og verifiser at unntaket re-registreres ende-til-ende.
 */
test.describe('EU/EØS - Nyvurdering av inngående A003 (annet land utpekt)', () => {
  test('skal nyvurdere en registrert annet-land-sak og re-registrere unntaket', async ({ page, request }) => {
    test.setTimeout(300000);

    const auth = new AuthHelper(page);
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const utpeking = new EuEosUtpekingPage(page);

    // === DEL A: Etabler førstegangs-saken (inngående A003 annet land → REGISTRERT_UNNTAK) ===
    console.log('📝 Del A: Injiserer inngående A003 (annet land utpekt, lovvalgsland=SE)...');
    const sed = new SedHelper(request);
    const result = await sed.sendSed({
      sedType: 'A003',
      bucType: 'LA_BUC_02',
      lovvalgsland: 'SE',
      artikkel: '13_1_a',
      // varsleUtland=false sender ingen SED → ingen åpen BUC i RINA-store nødvendig.
    });
    expect(result.success, `Send A003 feilet: ${result.message}`).toBe(true);
    await waitForProcessInstances(request, 60);

    await auth.login();
    await hovedside.goto();
    await hovedside.åpneBehandling(`${BRUKERNAVN_VALID} -`);
    await page.waitForLoadState('networkidle').catch(() => {});

    console.log('📝 Del A: Godkjenner utpekingen og registrerer førstegangs-unntaket...');
    await utpeking.godkjennUtpekingAnnetLand({ varsleUtland: false });
    await waitForProcessInstances(request, 90);

    // === DEL B: Opprett nyvurdering og bekreft at NV-grenen (riktig tema) ble truffet ===
    console.log('📝 Del B: Oppretter nyvurdering...');
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD');
    await waitForProcessInstances(request, 30);

    // Hele poenget med cellen: NV-behandlingen skal ha annet-land-temaet — ikke UTSENDT.
    await utpeking.assertions.verifiserNyVurderingAnnetLandOpprettet();

    // Åpne den nye NV-behandlingen (åpneBehandling tar nyeste lenke, med reload-retry).
    await hovedside.goto();
    await hovedside.åpneBehandling(`${BRUKERNAVN_VALID} -`);
    await page.waitForLoadState('networkidle').catch(() => {});

    // === DEL C: Fullfør NV-grenen og verifiser re-registrert unntak ende-til-ende ===
    console.log('📝 Del C: Godkjenner lovvalgsbeslutningen på nytt i nyvurderingen...');
    await utpeking.godkjennUtpekingAnnetLand({ varsleUtland: false });

    console.log('📝 Del C: Venter på at NV-ens REGISTRERING_UNNTAK_GODKJENN fullfører...');
    await waitForProcessInstances(request, 90);

    // Gjenbruk P1-assertionen — tar nyeste rad = NV-behandlingens sluttilstand.
    await utpeking.assertions.verifiserRegistrertUnntakIverksatt(request, {
      lovvalgsland: 'SE',
      medlLovvalgsland: 'SWE',
    });

    console.log('✅ Nyvurdering av inngående A003 (annet land) → REGISTRERT_UNNTAK verifisert ende-til-ende');
  });
});
