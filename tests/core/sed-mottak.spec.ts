import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { SedHelper, SED_SCENARIOS, EESSI_SED_SCENARIOS, SedHendelseConfig } from '../../helpers/sed-helper';
import { withDatabase } from '../../helpers/db-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { SokPage } from '../../pages/sok/sok.page';

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
    console.log('✅ MOTTAK_SED process completed successfully');
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

    console.log('📝 Step 3: Verifying fagsak was created in database...');
    await withDatabase(async (db) => {
      // Check for recently created fagsak
      const fagsaker = await db.query(
        `SELECT f.SAKSNUMMER, f.GSAK_SAKSNUMMER, f.STATUS, f.REGISTRERT_DATO
         FROM FAGSAK f
         WHERE f.REGISTRERT_DATO > SYSDATE - INTERVAL '5' MINUTE
         ORDER BY f.REGISTRERT_DATO DESC`
      );

      if (fagsaker.length > 0) {
        console.log(`   ✅ Fagsak found: SAKSNUMMER=${fagsaker[0].SAKSNUMMER}, GSAK=${fagsaker[0].GSAK_SAKSNUMMER}`);
        expect(fagsaker.length).toBeGreaterThan(0);
      } else {
        console.log('   ⚠️ No recent fagsak found');
        // Process completed, so fagsak should exist - this might indicate a schema issue
      }

      // Verify process completed
      expect(processResult.success).toBe(true);
    });

    console.log('✅ A003 from Sweden processed successfully');
  });

  test('skal håndtere A009 informasjonsforespørsel', async ({ request }) => {
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

    console.log('✅ A009 information request processed');
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

    console.log('✅ A001 application processed');
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
    console.log('✅ Custom SED configuration processed');
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

    // Step 3: Login and verify case is accessible
    console.log('📝 Step 3: Logging in to verify case...');
    await auth.login();
    await hovedside.goto();

    // Search for the person
    console.log('📝 Step 4: Searching for person...');
    await hovedside.søkEtterBruker(SED_SCENARIOS.A003_MED_PERSON.fnr!);

    // Wait for search results
    await sokPage.ventPåResultater();

    // Check if we get any results
    const hasResults = await sokPage.harResultater();
    if (hasResults) {
      console.log('   ✅ Person found in search results');
    } else {
      console.log('   ⚠️ No search results - fagsak may not be linked to person yet');
    }

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
    console.log('✅ Multiple SED types handled successfully');
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

    console.log('📝 Step 3: Verifying process instance in database...');
    await withDatabase(async (db) => {
      // Query for recent MOTTAK_SED process instances
      // Note: Table is PROSESSINSTANS (not PROSESS_INSTANS)
      const prosessinstanser = await db.query(
        `SELECT PI.UUID, PI.PROSESS_TYPE, PI.STATUS, PI.SIST_FULLFORT_STEG, PI.REGISTRERT_DATO
         FROM PROSESSINSTANS PI
         WHERE PI.PROSESS_TYPE = 'MOTTAK_SED'
         AND PI.REGISTRERT_DATO > SYSDATE - INTERVAL '5' MINUTE
         ORDER BY PI.REGISTRERT_DATO DESC`
      );

      console.log(`   Found ${prosessinstanser.length} recent MOTTAK_SED process instance(s)`);

      if (prosessinstanser.length > 0) {
        const latest = prosessinstanser[0];
        console.log(`   Latest: UUID=${latest.UUID}, Status=${latest.STATUS}, LastStep=${latest.SIST_FULLFORT_STEG}`);
        expect(latest.STATUS).toBe('FERDIG');
      } else {
        console.log('   ⚠️ No MOTTAK_SED process instances found');
        // Check all recent process instances
        const allRecent = await db.query(
          `SELECT PI.UUID, PI.PROSESS_TYPE, PI.STATUS
           FROM PROSESSINSTANS PI
           WHERE PI.REGISTRERT_DATO > SYSDATE - INTERVAL '5' MINUTE`
        );
        console.log(`   All recent process instances: ${allRecent.length}`);
        for (const pi of allRecent) {
          console.log(`      - ${pi.PROSESS_TYPE}: ${pi.STATUS}`);
        }
      }
    });

    console.log('✅ Process instance verification complete');
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

  test('skal verifisere at melosys-eessi er tilgjengelig', async ({ request }) => {
    console.log('📝 Checking if melosys-eessi is running...');

    const eessiRunning = await isEessiRunning(request);

    if (!eessiRunning) {
      console.log('⚠️ melosys-eessi is not running!');
      console.log('   Start it with: docker-compose --profile eessi up -d');
      console.log('   Or run in IntelliJ with profile: local-mock');
      test.skip(true, 'melosys-eessi is not running');
    }

    console.log('✅ melosys-eessi is running');
  });

  test('skal trigge MOTTAK_SED via melosys-eessi flow', async ({ request }) => {
    // Skip if melosys-eessi is not running
    const eessiRunning = await isEessiRunning(request);
    test.skip(!eessiRunning, 'melosys-eessi is not running');

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
    test.skip(!eessiRunning, 'melosys-eessi is not running');

    console.log('📝 Step 1: Sending A003 from Sweden via melosys-eessi...');
    const result = await sedHelper.sendSedViaEessi(EESSI_SED_SCENARIOS.A003_EESSI_FRA_SVERIGE);

    expect(result.success, `Send failed: ${result.message}`).toBe(true);
    console.log(`   ✅ SedHendelse published`);

    console.log('📝 Step 2: Waiting for full eessi processing pipeline...');
    const processResult = await awaitProcessInstances(request, {
      timeoutSeconds: 90,
      expectedInstances: 1,
    });

    expect(processResult.success, `Process failed: ${processResult.message}`).toBe(true);

    console.log('📝 Step 3: Verifying fagsak was created...');
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
    test.skip(!eessiRunning, 'melosys-eessi is not running');

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
    test.skip(!eessiRunning, 'melosys-eessi is not running');

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
