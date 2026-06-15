import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { SedHelper, SED_SCENARIOS, EESSI_SED_SCENARIOS, SedHendelseConfig } from '../../helpers/sed-helper';
import { withDatabase } from '../../helpers/db-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { SokPage } from '../../pages/sok/sok.page';
import {
  verifiserSedRutetTilTema,
  verifiserInngaaendeSedJournalfoert,
} from '../../pages/shared/sed-mottak.assertions';
import { EuEosUtpekingAssertions } from '../../pages/behandling/eu-eos-utpeking.assertions';
import { fetchStoredJournalposter } from '../../helpers/mock-helper';

/**
 * Test suite for SED (Structured Electronic Document) intake flow
 *
 * These tests verify that incoming SED documents from EU/EØS partner
 * countries are correctly processed by melosys-api and result in
 * appropriate case creation or updates.
 *
 * Flow being tested:
 * 1. Mock endpoint creates journalpost in SAF + publishes MelosysEessiMelding to Kafka
 * 2. melosys-api consumes message and creates MOTTAK_SED process
 * 3. Process creates fagsak/behandling and potentially ARBEID_FLERE_LAND_NY_SAK
 *
 * Uses E2E Support API for process verification:
 * - GET /internal/e2e/process-instances/await - waits for processes to complete
 * - POST /internal/e2e/caches/clear - clears caches after DB changes
 */
test.describe('SED Mottak', () => {
  const E2E_API_BASE = 'http://localhost:8080/internal/e2e';

  let auth: AuthHelper;
  let sedHelper: SedHelper;
  let hovedside: HovedsidePage;
  let sokPage: SokPage;

  test.beforeEach(async ({ page, request }) => {
    auth = new AuthHelper(page);
    sedHelper = new SedHelper(request);
    hovedside = new HovedsidePage(page);
    sokPage = new SokPage(page);
  });

  /**
   * Wait for process instances to complete using E2E Support API
   */
  async function awaitProcessInstances(
    request: any,
    options: { timeoutSeconds?: number; expectedInstances?: number } = {}
  ): Promise<{ success: boolean; status: string; message: string; failedInstances?: any[] }> {
    const timeout = options.timeoutSeconds || 30;
    const params = new URLSearchParams({ timeoutSeconds: timeout.toString() });
    if (options.expectedInstances) {
      params.set('expectedInstances', options.expectedInstances.toString());
    }

    const response = await request.get(
      `${E2E_API_BASE}/process-instances/await?${params}`,
      { failOnStatusCode: false }
    );

    const data = await response.json();

    return {
      success: response.ok(),
      status: data.status,
      message: data.message,
      failedInstances: data.failedInstances,
    };
  }

  test('skal trigge MOTTAK_SED prosess ved mottak av A003', async ({ request }) => {
    // This test verifies the complete flow from SED to process creation

    console.log('📝 Step 1: Sending A003 SED via mock service...');
    const result = await sedHelper.sendSed(SED_SCENARIOS.A003_MINIMAL);

    expect(result.success, `Send SED failed: ${result.message}`).toBe(true);
    console.log(`   ✅ SED sent: sedId=${result.sedId}, rinaSaksnummer=${result.rinaSaksnummer}`);

    console.log('📝 Step 2: Waiting for MOTTAK_SED process to complete...');
    const processResult = await awaitProcessInstances(request, {
      timeoutSeconds: 60,
      expectedInstances: 1,
    });

    console.log(`   Status: ${processResult.status}`);
    console.log(`   Message: ${processResult.message}`);

    if (processResult.failedInstances && processResult.failedInstances.length > 0) {
      console.log('   ❌ Failed instances:');
      for (const instance of processResult.failedInstances) {
        console.log(`      - ${instance.type}: ${instance.error?.melding || 'Unknown error'}`);
      }
    }

    expect(processResult.success, `Process failed: ${processResult.message}`).toBe(true);

    // P2: verifiser at A003 (annet land enn NO) faktisk RUTES til riktig utfall —
    // en behandling med tema BESLUTNING_LOVVALG_ANNET_LAND + ARBEID_FLERE_LAND_NY_SAK FERDIG
    console.log('📝 Step 3: Verifying SED routed to correct outcome...');
    const ruting = await verifiserSedRutetTilTema({
      forventetTema: 'BESLUTNING_LOVVALG_ANNET_LAND',
      rutingProsess: 'ARBEID_FLERE_LAND_NY_SAK',
    });

    // P3: verifiser at mottaket faktisk journalførte SED-en (INNGAAENDE EESSI-journalpost)
    await verifiserInngaaendeSedJournalfoert(request, {
      saksnummer: ruting.saksnummer,
      sedType: 'A003',
    });
    console.log('✅ MOTTAK_SED routed + journalført correctly');
  });

  test('skal opprette fagsak ved mottak av A003 fra Sverige', async ({ request }) => {
    console.log('📝 Step 1: Sending A003 from Sweden...');
    const result = await sedHelper.sendSed(SED_SCENARIOS.A003_FRA_SVERIGE);

    expect(result.success, `Send SED failed: ${result.message}`).toBe(true);
    console.log(`   ✅ SED sent: sedId=${result.sedId}`);

    console.log('📝 Step 2: Waiting for process to complete...');
    const processResult = await awaitProcessInstances(request, {
      timeoutSeconds: 60,
      expectedInstances: 1,
    });

    expect(processResult.success, `Process failed: ${processResult.message}`).toBe(true);

    // P2: A003 fra Sverige (lovvalgsland SE ≠ NO) skal rutes til BESLUTNING_LOVVALG_ANNET_LAND
    // og ARBEID_FLERE_LAND_NY_SAK skal være FERDIG — ikke bare at «en fagsak finnes».
    console.log('📝 Step 3: Verifying SED routed to BESLUTNING_LOVVALG_ANNET_LAND...');
    const ruting = await verifiserSedRutetTilTema({
      forventetTema: 'BESLUTNING_LOVVALG_ANNET_LAND',
      rutingProsess: 'ARBEID_FLERE_LAND_NY_SAK',
    });

    // P3: SED-en skal journalføres (INNGAAENDE EESSI-journalpost knyttet til saken)
    await verifiserInngaaendeSedJournalfoert(request, {
      saksnummer: ruting.saksnummer,
      sedType: 'A003',
    });

    console.log('✅ A003 from Sweden routed + journalført');
  });

  test('skal håndtere A009 og automatisk registrere unntak fra norsk trygd (REGISTRERT_UNNTAK)', async ({ page, request }) => {
    // P4 (REGISTRERING_UNNTAK_NY_SAK, ~3 % av prosessarbeidet): en innkommende A009
    // (utstasjonering — annet land bekrefter at deres trygd gjelder) registrerer
    // unntaket fra norsk trygd HELT AUTOMATISK i mottaket. Fase A-repro 2026-06-15
    // (behandling 136) bekreftet at det IKKE finnes et manuelt saksbehandler-
    // godkjenningssteg her — REGISTRERING_UNNTAK_NY_SAK *og* REGISTRERING_UNNTAK_GODKJENN
    // fullføres (FERDIG) uten UI-interaksjon, i motsetning til A003 annet-land-grenen
    // (P1) der saksbehandler godkjenner manuelt. Denne testen beviser derfor at den
    // automatiske kjeden faktisk produserer riktig UTFALL (REGISTRERT_UNNTAK), ikke
    // bare at rutingsprosessen kjørte.
    console.log('📝 Step 1: Sending A009 information request from Germany...');
    const result = await sedHelper.sendSed(SED_SCENARIOS.A009_FRA_TYSKLAND);

    expect(result.success, `Send SED failed: ${result.message}`).toBe(true);
    console.log(`   ✅ SED sent: sedId=${result.sedId}`);

    console.log('📝 Step 2: Waiting for process to complete...');
    const processResult = await awaitProcessInstances(request, {
      timeoutSeconds: 60,
      expectedInstances: 1,
    });

    console.log(`   Status: ${processResult.status}, Message: ${processResult.message}`);
    expect(processResult.success, `Process failed: ${processResult.message}`).toBe(true);

    // P2: A009 (informasjonsforespørsel) rutes til registrering av unntak fra norsk trygd
    console.log('📝 Step 3: Verifying A009 routed to REGISTRERING_UNNTAK...');
    const ruting = await verifiserSedRutetTilTema({
      forventetTema: 'REGISTRERING_UNNTAK_NORSK_TRYGD_UTSTASJONERING',
      rutingProsess: 'REGISTRERING_UNNTAK_NY_SAK',
    });

    // P3: A009 skal journalføres som INNGAAENDE EESSI-journalpost
    await verifiserInngaaendeSedJournalfoert(request, {
      saksnummer: ruting.saksnummer,
      sedType: 'A009',
    });

    // P4: det automatiske utfallet skal være et REGISTRERT_UNNTAK. Gjenbruker P1-POM-ens
    // verifiserRegistrertUnntakIverksatt (BESLUTNING_LOVVALG_ANNET_LAND → REGISTRERT_UNNTAK)
    // — samme sluttilstand, men her produsert automatisk i mottaket. A009 kommer fra
    // Tyskland, så lovvalget overføres til DE (MEDL-register: DEU).
    console.log('📝 Step 4: Verifying automatic REGISTRERT_UNNTAK end-state...');
    const unntakAssertions = new EuEosUtpekingAssertions(page);
    await unntakAssertions.verifiserRegistrertUnntakIverksatt(request, {
      lovvalgsland: 'DE',
      medlLovvalgsland: 'DEU',
    });

    console.log('✅ A009 routed + journalført + automatisk REGISTRERT_UNNTAK iverksatt');
  });

  test('skal håndtere A010 og automatisk registrere unntak fra norsk trygd – øvrige (REGISTRERT_UNNTAK)', async ({ page, request }) => {
    // P5b (REGISTRERING_UNNTAK_NORSK_TRYGD_ØVRIGE, ~9,8k/12mo): søsken-temaet til
    // A009/P4. A010 (øvrige tilfeller) registrerer unntaket fra norsk trygd HELT
    // AUTOMATISK i mottaket — nøyaktig samme maskineri som A009 (UnntaksperiodeSedRuter,
    // gjelderSedTyper() = {A009, A010}), men ruter til behandlingstema
    // REGISTRERING_UNNTAK_NORSK_TRYGD_ØVRIGE i stedet for _UTSTASJONERING. Fase A-repro
    // 2026-06-15 (behandling 147, A010 fra DE) bekreftet identisk sluttilstand som A009:
    // MOTTAK_SED + REGISTRERING_UNNTAK_NY_SAK + REGISTRERING_UNNTAK_GODKJENN alle FERDIG
    // uten UI, behandlingsresultat REGISTRERT_UNNTAK / GODKJENT, lovvalg DE / UNNTATT.
    // Denne testen vokter den distinkte A010-grenen (egen tema-mapping i
    // hentBehandlingstema + eget regelsett i UnntaksperiodeKontrollsett) — en regresjon
    // der fanges ikke av A009-testen. Ingen mock-endring: A010 går gjennom det generiske
    // /lag-melosys-eessi-melding-endepunktet på lik linje med A009.
    console.log('📝 Step 1: Sending A010 provisional determination from Germany...');
    const result = await sedHelper.sendSed(SED_SCENARIOS.A010_FRA_TYSKLAND);

    expect(result.success, `Send SED failed: ${result.message}`).toBe(true);
    console.log(`   ✅ SED sent: sedId=${result.sedId}`);

    console.log('📝 Step 2: Waiting for process to complete...');
    const processResult = await awaitProcessInstances(request, {
      timeoutSeconds: 60,
      expectedInstances: 1,
    });

    console.log(`   Status: ${processResult.status}, Message: ${processResult.message}`);
    expect(processResult.success, `Process failed: ${processResult.message}`).toBe(true);

    // P2: A010 rutes til registrering av unntak fra norsk trygd – øvrige (≠ A009 _UTSTASJONERING)
    console.log('📝 Step 3: Verifying A010 routed to REGISTRERING_UNNTAK_NORSK_TRYGD_ØVRIGE...');
    const ruting = await verifiserSedRutetTilTema({
      forventetTema: 'REGISTRERING_UNNTAK_NORSK_TRYGD_ØVRIGE',
      rutingProsess: 'REGISTRERING_UNNTAK_NY_SAK',
    });

    // P3: A010 skal journalføres som INNGAAENDE EESSI-journalpost
    await verifiserInngaaendeSedJournalfoert(request, {
      saksnummer: ruting.saksnummer,
      sedType: 'A010',
    });

    // P5b: det automatiske utfallet skal være et REGISTRERT_UNNTAK. Gjenbruker samme
    // page-uavhengige POM som A009/P4 — A010 kommer fra Tyskland, så lovvalget overføres
    // til DE (MEDL-register: DEU).
    console.log('📝 Step 4: Verifying automatic REGISTRERT_UNNTAK end-state...');
    const unntakAssertions = new EuEosUtpekingAssertions(page);
    await unntakAssertions.verifiserRegistrertUnntakIverksatt(request, {
      lovvalgsland: 'DE',
      medlLovvalgsland: 'DEU',
    });

    console.log('✅ A010 routed (ØVRIGE) + journalført + automatisk REGISTRERT_UNNTAK iverksatt');
  });

  test('skal håndtere A001 søknad fra Danmark', async ({ request }) => {
    console.log('📝 Step 1: Sending A001 application from Denmark...');
    const result = await sedHelper.sendSed(SED_SCENARIOS.A001_FRA_DANMARK);

    expect(result.success, `Send SED failed: ${result.message}`).toBe(true);
    console.log(`   ✅ SED sent: sedId=${result.sedId}`);

    console.log('📝 Step 2: Waiting for process to complete...');
    const processResult = await awaitProcessInstances(request, {
      timeoutSeconds: 60,
      expectedInstances: 1,
    });

    console.log(`   Status: ${processResult.status}, Message: ${processResult.message}`);
    expect(processResult.success, `Process failed: ${processResult.message}`).toBe(true);

    // P2: A001 (søknad om unntak / anmodning) rutes til ANMODNING_OM_UNNTAK_HOVEDREGEL
    console.log('📝 Step 3: Verifying A001 routed to ANMODNING_OM_UNNTAK...');
    const ruting = await verifiserSedRutetTilTema({
      forventetTema: 'ANMODNING_OM_UNNTAK_HOVEDREGEL',
      rutingProsess: 'ANMODNING_OM_UNNTAK_MOTTAK_NY_SAK',
    });

    // P3: A001 skal journalføres som INNGAAENDE EESSI-journalpost
    await verifiserInngaaendeSedJournalfoert(request, {
      saksnummer: ruting.saksnummer,
      sedType: 'A001',
    });

    console.log('✅ A001 application routed + journalført');
  });

  test('skal håndtere tilpasset SED konfigurasjon', async ({ request }) => {
    // Test with custom SED configuration to verify all fields work
    console.log('📝 Step 1: Sending custom SED configuration...');

    const customConfig = {
      sedType: SedHelper.getSedTypes().A003,
      bucType: SedHelper.getBucTypes().LA_BUC_02,
      landkode: 'FI',
      avsenderId: 'FI:KELA',
      lovvalgsland: 'FI',
      arbeidsland: ['NO', 'FI'],
      periodeFom: '2025-01-01',
      periodeTom: '2025-12-31',
    };

    const result = await sedHelper.sendSed(customConfig);

    console.log(`   BUC Type: ${customConfig.bucType}`);
    console.log(`   SED Type: ${customConfig.sedType}`);
    console.log(`   From: ${customConfig.avsenderId} (${customConfig.landkode})`);
    console.log(`   Result: ${result.success ? 'Success' : 'Failed'}`);

    expect(result.success, `Send SED failed: ${result.message}`).toBe(true);
    console.log(`   ✅ SED sent: sedId=${result.sedId}`);

    console.log('📝 Step 2: Waiting for process to complete...');
    const processResult = await awaitProcessInstances(request, {
      timeoutSeconds: 60,
      expectedInstances: 1,
    });

    expect(processResult.success, `Process failed: ${processResult.message}`).toBe(true);

    // P2: tilpasset A003 (lovvalgsland FI ≠ NO) rutes til BESLUTNING_LOVVALG_ANNET_LAND
    console.log('📝 Step 3: Verifying custom A003 routed correctly...');
    const ruting = await verifiserSedRutetTilTema({
      forventetTema: 'BESLUTNING_LOVVALG_ANNET_LAND',
      rutingProsess: 'ARBEID_FLERE_LAND_NY_SAK',
    });

    // P3: SED-en skal journalføres
    await verifiserInngaaendeSedJournalfoert(request, {
      saksnummer: ruting.saksnummer,
      sedType: 'A003',
    });

    console.log('✅ Custom SED configuration routed + journalført');
  });

  test('skal verifisere at SED fører til oppgave i systemet', async ({ page, request }) => {
    // Full end-to-end test: SED -> Case visible in UI
    console.log('📝 Step 1: Sending SED with specific person...');

    const result = await sedHelper.sendSed(SED_SCENARIOS.A003_MED_PERSON);

    expect(result.success, `Send SED failed: ${result.message}`).toBe(true);
    console.log(`   ✅ SED sent: sedId=${result.sedId}, fnr=${SED_SCENARIOS.A003_MED_PERSON.fnr}`);

    console.log('📝 Step 2: Waiting for processing...');
    const processResult = await awaitProcessInstances(request, {
      timeoutSeconds: 60,
      expectedInstances: 1,
    });

    expect(processResult.success, `Process failed: ${processResult.message}`).toBe(true);

    // P2/P3: bekreft at SED-en ble rutet riktig OG journalført FØR vi sjekker UI-søkbarhet
    const ruting = await verifiserSedRutetTilTema({
      forventetTema: 'BESLUTNING_LOVVALG_ANNET_LAND',
      rutingProsess: 'ARBEID_FLERE_LAND_NY_SAK',
    });
    await verifiserInngaaendeSedJournalfoert(request, {
      saksnummer: ruting.saksnummer,
      sedType: 'A003',
    });

    // Step 3: Login and verify case is accessible
    console.log('📝 Step 3: Logging in to verify case...');
    await auth.login();
    await hovedside.goto();

    // Search for the person
    console.log('📝 Step 4: Searching for person...');
    await hovedside.søkEtterBruker(SED_SCENARIOS.A003_MED_PERSON.fnr!);

    // Wait for search results
    await sokPage.ventPåResultater();

    // Step 5: ASSERT the actual claim of this test — SED-mottaket gjør bruker/sak søkbar.
    await sokPage.assertions.verifiserBrukerSøkbarMedBehandling(SED_SCENARIOS.A003_MED_PERSON.fnr!);
    console.log(`   ✅ Sak søkbar for ${SED_SCENARIOS.A003_MED_PERSON.fnr}`);

    console.log('✅ SED intake flow completed');
  });

  test('skal håndtere flere SED-typer i sekvens', async ({ request }) => {
    // Test sending multiple SEDs in sequence
    const sedConfigs = [
      { name: 'A001', config: SED_SCENARIOS.A001_FRA_DANMARK },
      { name: 'A003', config: SED_SCENARIOS.A003_FRA_SVERIGE },
      { name: 'A009', config: SED_SCENARIOS.A009_FRA_TYSKLAND },
    ];

    console.log('📝 Testing multiple SED types in sequence...');

    const sentSeds: { name: string; sedId: string }[] = [];

    for (const { name, config } of sedConfigs) {
      console.log(`   Sending ${name}...`);
      const result = await sedHelper.sendSed(config);

      expect(result.success, `Send ${name} failed: ${result.message}`).toBe(true);
      console.log(`   ${name}: ✅ (sedId=${result.sedId})`);

      sentSeds.push({ name, sedId: result.sedId! });

      // Small delay between sends to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('📝 Waiting for all processes to complete...');
    const processResult = await awaitProcessInstances(request, {
      timeoutSeconds: 90,
      expectedInstances: 3, // Expecting 3 process instances
    });

    console.log(`   Status: ${processResult.status}, Message: ${processResult.message}`);

    if (processResult.failedInstances && processResult.failedInstances.length > 0) {
      console.log(`   ⚠️ ${processResult.failedInstances.length} process(es) failed:`);
      for (const instance of processResult.failedInstances) {
        console.log(`      - ${instance.type}: ${instance.error?.melding || 'Unknown'}`);
      }
    }

    expect(processResult.success, `Processes failed: ${processResult.message}`).toBe(true);

    // P2: ingen av de 3 SED-ene skal ha gitt en FEILET prosessinstans
    console.log('📝 Verifying no failed process instances...');
    await withDatabase(async (db) => {
      const feilede = await db.query(
        `SELECT prosess_type FROM prosessinstans WHERE status = 'FEILET'`
      );
      expect(
        feilede.length,
        `Forventet ingen feilede prosessinstanser, fant: ${JSON.stringify(feilede)}`
      ).toBe(0);
    });

    // P3: hver av de 3 SED-typene skal ha gitt en INNGAAENDE EESSI-journalpost
    console.log('📝 Verifying each SED was journalført...');
    const journalposter = await fetchStoredJournalposter(request);
    const inngaaende = journalposter.filter(
      (jp) => jp.journalposttype === 'INNGAAENDE' && jp.kanal === 'EESSI'
    );
    for (const { name } of sedConfigs) {
      const found = inngaaende.find((jp) => (jp.tittel ?? '').includes(name));
      expect(found, `Forventet INNGAAENDE EESSI-journalpost for ${name}`).toBeTruthy();
    }
    expect(
      inngaaende.length,
      'Forventet minst én INNGAAENDE EESSI-journalpost per SED'
    ).toBeGreaterThanOrEqual(sedConfigs.length);

    console.log('✅ Multiple SED types handled + journalført successfully');
  });

  test('skal verifisere prosessinstanser i databasen', async ({ request }) => {
    // Send a SED and verify process instance is created in database
    console.log('📝 Step 1: Sending minimal A003...');
    const result = await sedHelper.sendSed(SED_SCENARIOS.A003_MINIMAL);

    expect(result.success, `Send SED failed: ${result.message}`).toBe(true);

    console.log('📝 Step 2: Waiting for process to complete...');
    const processResult = await awaitProcessInstances(request, {
      timeoutSeconds: 60,
      expectedInstances: 1,
    });

    expect(processResult.success, `Process failed: ${processResult.message}`).toBe(true);

    // P2: bekreft full ruting i databasen — MOTTAK_SED FERDIG + behandling med riktig tema
    // + ARBEID_FLERE_LAND_NY_SAK FERDIG (ingen FEILET). Erstatter den tidligere
    // MOTTAK_SED-status-sjekken med en hard ende-til-ende rutingsassert.
    console.log('📝 Step 3: Verifying process instances + routing in database...');
    const ruting = await verifiserSedRutetTilTema({
      forventetTema: 'BESLUTNING_LOVVALG_ANNET_LAND',
      rutingProsess: 'ARBEID_FLERE_LAND_NY_SAK',
    });

    // P3: journalføringen skal også finnes
    await verifiserInngaaendeSedJournalfoert(request, {
      saksnummer: ruting.saksnummer,
      sedType: 'A003',
    });

    console.log('✅ Process instance + routing verification complete');
  });
});

/**
 * Test suite for SED intake via melosys-eessi (real E2E flow)
 *
 * These tests exercise the FULL E2E pipeline:
 * 1. Test publishes SedHendelse to Kafka (eessibasis-sedmottatt-v1-local)
 * 2. melosys-eessi consumes SedHendelse
 * 3. melosys-eessi fetches SED from EUX mock (/eux/buc/*, /eux/v3/*)
 * 4. melosys-eessi identifies person via PDL mock
 * 5. melosys-eessi creates journalpost
 * 6. melosys-eessi publishes MelosysEessiMelding to Kafka
 * 7. melosys-api consumes and creates MOTTAK_SED process
 *
 * REQUIREMENTS:
 * - melosys-eessi must be running (docker-compose --profile eessi OR IntelliJ)
 * - Mock must have EUX endpoints (/eux/v3/buc/*, /eux/buc/*)
 *
 * These tests take longer (60-90s) because they go through melosys-eessi.
 */
test.describe('SED Mottak via melosys-eessi @eessi', () => {
  const E2E_API_BASE = 'http://localhost:8080/internal/e2e';
  const EESSI_BASE = 'http://localhost:8081';

  let sedHelper: SedHelper;

  test.beforeEach(async ({ request }) => {
    sedHelper = new SedHelper(request);
  });

  /**
   * Check if melosys-eessi is running
   */
  async function isEessiRunning(request: any): Promise<boolean> {
    try {
      const response = await request.get(`${EESSI_BASE}/internal/health`, {
        failOnStatusCode: false,
        timeout: 5000,
      });
      return response.ok();
    } catch {
      return false;
    }
  }

  /**
   * Wait for process instances to complete
   */
  async function awaitProcessInstances(
    request: any,
    options: { timeoutSeconds?: number; expectedInstances?: number } = {}
  ): Promise<{ success: boolean; status: string; message: string; failedInstances?: any[] }> {
    const timeout = options.timeoutSeconds || 60;
    const params = new URLSearchParams({ timeoutSeconds: timeout.toString() });
    if (options.expectedInstances) {
      params.set('expectedInstances', options.expectedInstances.toString());
    }

    const response = await request.get(
      `${E2E_API_BASE}/process-instances/await?${params}`,
      { failOnStatusCode: false }
    );

    const data = await response.json();
    return {
      success: response.ok(),
      status: data.status,
      message: data.message,
      failedInstances: data.failedInstances,
    };
  }

  // Merk: melosys-eessi-tilgjengelighet sjekkes nå én gang i global-setup.ts (PÅKREVD
  // tjeneste — hele kjøringen aborter om den er nede). Den tidligere frittstående
  // «skal verifisere at melosys-eessi er tilgjengelig»-testen er fjernet (ren infra-ping
  // uten forretningsmening). Per-test-sjekken under beholdes som defense-in-depth.

  test('skal trigge MOTTAK_SED via melosys-eessi flow', async ({ request }) => {
    const eessiRunning = await isEessiRunning(request);
    expect(eessiRunning, 'melosys-eessi must be running for this test').toBe(true);

    console.log('📝 Step 1: Sending SedHendelse via melosys-eessi flow...');
    console.log('   This publishes to eessibasis-sedmottatt-v1-local Kafka topic');

    const result = await sedHelper.sendSedViaEessi(EESSI_SED_SCENARIOS.A003_EESSI_FRA_DANMARK);

    expect(result.success, `Send SedHendelse failed: ${result.message}`).toBe(true);
    console.log(`   ✅ SedHendelse published: sedId=${result.sedId}, rinaSaksnummer=${result.rinaSaksnummer}`);

    console.log('📝 Step 2: Waiting for melosys-eessi to process and forward to melosys-api...');
    console.log('   Flow: SedHendelse → melosys-eessi → EUX mock → PDL mock → MelosysEessiMelding → melosys-api');

    // Give melosys-eessi time to process (it needs to fetch from EUX mock, identify person, etc.)
    const processResult = await awaitProcessInstances(request, {
      timeoutSeconds: 90, // Longer timeout for eessi flow
      expectedInstances: 1,
    });

    console.log(`   Status: ${processResult.status}`);
    console.log(`   Message: ${processResult.message}`);

    if (processResult.failedInstances && processResult.failedInstances.length > 0) {
      console.log('   ❌ Failed instances:');
      for (const instance of processResult.failedInstances) {
        console.log(`      - ${instance.type}: ${instance.error?.melding || 'Unknown error'}`);
      }
    }

    expect(processResult.success, `Process failed: ${processResult.message}`).toBe(true);
    console.log('✅ MOTTAK_SED process completed via melosys-eessi flow');
  });

  test('skal opprette fagsak via full eessi-flow med A003 fra Sverige', async ({ request }) => {
    const eessiRunning = await isEessiRunning(request);
    expect(eessiRunning, 'melosys-eessi must be running for this test').toBe(true);

    console.log('📝 Step 1: Sending A003 from Sweden via melosys-eessi...');
    const result = await sedHelper.sendSedViaEessi(EESSI_SED_SCENARIOS.A003_EESSI_FRA_SVERIGE);

    expect(result.success, `Send failed: ${result.message}`).toBe(true);
    console.log(`   ✅ SedHendelse published`);

    console.log('📝 Step 2: Waiting for Kafka message to be consumed...');
    // Poll database until process instance appears (Kafka consumption can take a few seconds)
    let processInstanceFound = false;
    const maxWaitMs = 30000;
    const pollIntervalMs = 1000;
    const startTime = Date.now();

    while (!processInstanceFound && Date.now() - startTime < maxWaitMs) {
      const hasInstance = await withDatabase(async (db) => {
        const result = await db.query(
          `SELECT COUNT(*) as CNT FROM PROSESSINSTANS WHERE REGISTRERT_DATO > SYSDATE - INTERVAL '1' MINUTE`
        );
        return result[0]?.CNT > 0;
      });

      if (hasInstance) {
        processInstanceFound = true;
        console.log(`   ✅ Process instance found after ${Date.now() - startTime}ms`);
      } else {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }

    if (!processInstanceFound) {
      console.log(`   ⚠️ No process instance found after ${maxWaitMs}ms - Kafka message may not have been consumed`);
    }

    console.log('📝 Step 3: Waiting for process to complete...');
    const processResult = await awaitProcessInstances(request, {
      timeoutSeconds: 90,
      expectedInstances: 1,
    });

    expect(processResult.success, `Process failed: ${processResult.message}`).toBe(true);

    console.log('📝 Step 4: Verifying fagsak was created...');
    const fagsak = await withDatabase(async (db) => {
      const fagsaker = await db.query(
        `SELECT f.SAKSNUMMER, f.GSAK_SAKSNUMMER, f.STATUS, f.REGISTRERT_DATO
         FROM FAGSAK f
         WHERE f.REGISTRERT_DATO > SYSDATE - INTERVAL '5' MINUTE
         ORDER BY f.REGISTRERT_DATO DESC`
      );

      if (fagsaker.length > 0) {
        console.log(`   ✅ Fagsak found: SAKSNUMMER=${fagsaker[0].SAKSNUMMER}, STATUS=${fagsaker[0].STATUS}`);
        return fagsaker[0];
      }

      // No fagsak found - gather debug info
      console.log('   ❌ No fagsak found - gathering debug info...');

      const processes = await db.query(
        `SELECT PI.PROSESS_TYPE, PI.STATUS, PI.SIST_FULLFORT_STEG
         FROM PROSESSINSTANS PI
         WHERE PI.REGISTRERT_DATO > SYSDATE - INTERVAL '5' MINUTE
         ORDER BY PI.REGISTRERT_DATO DESC`
      );
      console.log('   Process instances:');
      for (const p of processes) {
        console.log(`      - ${p.PROSESS_TYPE}: ${p.STATUS} (step: ${p.SIST_FULLFORT_STEG})`);
      }

      if (processes.length === 0) {
        console.log('   No process instances found - Kafka message may not have reached melosys-api');
        console.log('   Check: Is melosys-api consuming from teammelosys.eessi.v1-local?');
      }

      return null;
    });

    expect(fagsak, 'Expected fagsak to be created by A003 EESSI flow').not.toBeNull();
    console.log('✅ Full eessi flow completed - fagsak created');
  });

  test('skal håndtere A009 informasjonsforespørsel via eessi', async ({ request }) => {
    const eessiRunning = await isEessiRunning(request);
    expect(eessiRunning, 'melosys-eessi must be running for this test').toBe(true);

    console.log('📝 Sending A009 from Germany via melosys-eessi...');
    const result = await sedHelper.sendSedViaEessi(EESSI_SED_SCENARIOS.A009_EESSI_FRA_TYSKLAND);

    expect(result.success, `Send failed: ${result.message}`).toBe(true);

    console.log('📝 Waiting for processing...');
    const processResult = await awaitProcessInstances(request, {
      timeoutSeconds: 90,
      expectedInstances: 1,
    });

    console.log(`   Status: ${processResult.status}, Message: ${processResult.message}`);
    expect(processResult.success, `Process failed: ${processResult.message}`).toBe(true);

    console.log('✅ A009 via eessi processed');
  });

  test('skal sammenligne direkte vs eessi-flow @comparison', async ({ request }) => {
    const eessiRunning = await isEessiRunning(request);
    expect(eessiRunning, 'melosys-eessi must be running for this test').toBe(true);

    console.log('📝 Test 1: Direct flow (bypasses melosys-eessi)...');
    const directStart = Date.now();
    const directResult = await sedHelper.sendSed({ sedType: 'A003', bucType: 'LA_BUC_02' });
    expect(directResult.success).toBe(true);

    await awaitProcessInstances(request, { timeoutSeconds: 60, expectedInstances: 1 });
    const directTime = Date.now() - directStart;
    console.log(`   Direct flow: ${directTime}ms`);

    console.log('📝 Test 2: EESSI flow (through melosys-eessi)...');
    const eessiStart = Date.now();
    const eessiResult = await sedHelper.sendSedViaEessi({ bucType: 'LA_BUC_02', sedType: 'A003' });
    expect(eessiResult.success).toBe(true);

    await awaitProcessInstances(request, { timeoutSeconds: 90, expectedInstances: 1 });
    const eessiTime = Date.now() - eessiStart;
    console.log(`   EESSI flow: ${eessiTime}ms`);

    console.log(`\n📊 Comparison:`);
    console.log(`   Direct: ${directTime}ms`);
    console.log(`   EESSI:  ${eessiTime}ms`);
    console.log(`   Difference: ${eessiTime - directTime}ms (EESSI adds ${Math.round((eessiTime - directTime) / directTime * 100)}% overhead)`);

    console.log('✅ Both flows completed successfully');
  });
});
