import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { SedHelper } from '../../helpers/sed-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { EuEosUtpekingPage } from '../../pages/behandling/eu-eos-utpeking.page';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { fetchStoredJournalposter, fetchStoredSedDocuments } from '../../helpers/mock-helper';
import { BRUKERNAVN_VALID } from '../../pages/shared/constants';

/**
 * EU/EØS - Inngående A003 (Norge utpekt) → utgående A012
 *
 * Gap: eos-inngaaende-a003-norge-utpekt-a012 (Tier 1, e2e-dekningshull). Et
 * sed-mottak-smoke dekker at en inngående A003 oppretter en fagsak, men INGEN
 * e2e fullførte utpeking-behandlingen (GODKJENN_UTPEKING_NORGE) til vedtak og
 * verifiserte Norges utgående A012-svar. Identifisering er bug-følsom
 * (MELOSYS-7743: feil person matchet).
 *
 * Scenario:
 * 1. Injiser en inngående A003 som peker ut Norge (lovvalgsland=NO). Dette
 *    oppretter en behandling med tema BESLUTNING_LOVVALG_NORGE for testpersonen.
 * 2. Åpne behandlingen og fullfør "vurder utpeking"-flyten (Inngang →
 *    Virksomhet → Vurdering[Godkjenn] → Vedtak).
 * 3. Fatt vedtak (Norge godkjenner utpekingen).
 * 4. Verifiser ende-til-ende:
 *    - en utgående A012 (godkjenning av lovvalgsbeslutning) sendes på den
 *      eksisterende bucen, med tilhørende UTGAAENDE EESSI-journalpost
 *    - behandlingsresultatet er FASTSATT_LOVVALGSLAND / utpeking GODKJENT (NO)
 *    - en lovvalgsperiode til Norge (art.13(1)(a), INNVILGET) opprettes, knyttet
 *      til en MEDL-periode
 *    - MEDL-perioden er et foreløpig norsk medlemskap (lovvalg FORL / status UAVK)
 *      — speiler at vedtaket er en MIDLERTIDIG_LOVVALGSBESLUTNING
 *    - IVERKSETT_VEDTAK_EOS fullført uten feilede prosessinstanser
 *
 * Mock-forutsetning (opprettBucIRina=true): den direkte mottak-stien går utenom
 * melosys-eessi og oppretter derfor ingen BUC i RINA-store. Uten en BUC faller
 * melosys-api tilbake på den fil-baserte default-BUCen (LA_BUC_03), som ikke
 * matcher "åpen LA_BUC_02"-sjekken i SendVedtakUtland, og A012 ville aldri blitt
 * sendt. Flagget registrerer den utenlandsk-initierte, åpne LA_BUC_02-en som
 * Norge svarer på — slik en ekte innkommende A003 ville ha kommet inn på.
 */
test.describe('EU/EØS - Inngående A003 (Norge utpekt)', () => {
  test('skal godkjenne utpeking av Norge og svare utland med A012', async ({ page, request }) => {
    test.setTimeout(240000);

    // === DEL A: Inngående A003 som peker ut Norge oppretter utpeking-behandling ===
    console.log('📝 Del A: Injiserer inngående A003 (Norge utpekt)...');
    const sed = new SedHelper(request);
    const result = await sed.sendSed({
      sedType: 'A003',
      bucType: 'LA_BUC_02',
      lovvalgsland: 'NO',
      artikkel: '13_1_a',
      opprettBucIRina: true,
    });
    expect(result.success, `Send A003 feilet: ${result.message}`).toBe(true);
    await waitForProcessInstances(request, 60);

    const auth = new AuthHelper(page);
    await auth.login();
    const hovedside = new HovedsidePage(page);
    const utpeking = new EuEosUtpekingPage(page);

    // Åpne den nyopprettede utpeking-behandlingen for testpersonen.
    await hovedside.goto();
    await hovedside.åpneBehandling(`${BRUKERNAVN_VALID} -`);
    await page.waitForLoadState('networkidle').catch(() => {});

    // Snapshot SED- og journalpost-tilstand FØR vedtak (for å verifisere A012-delta).
    const sedFør = await fetchStoredSedDocuments(request, 'A012');
    const jpFør = await fetchStoredJournalposter(request);

    // === DEL B: Godkjenn utpeking og fatt vedtak ===
    console.log('📝 Del B: Godkjenner utpeking og fatter vedtak...');
    await utpeking.godkjennUtpekingOgFattVedtak();

    console.log('📝 Del B: Venter på iverksetting (sender A012, kaster ved feilede prosessinstanser)...');
    await waitForProcessInstances(request, 90);

    // === DEL C: Verifiser A012 sendt + norsk lovvalg/MEDL iverksatt ===
    await utpeking.assertions.verifiserA012Sendt(request, sedFør, jpFør);
    await utpeking.assertions.verifiserGodkjentUtpekingIverksatt(request);

    console.log('✅ Inngående A003 (Norge utpekt) → A012 verifisert ende-til-ende');
  });
});
