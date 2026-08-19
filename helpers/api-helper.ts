import { APIRequestContext } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'node:path';

// Load .env (required, checked in with dev config)
dotenv.config({ path: path.resolve(__dirname, '../.env') });
// Load .env.local (optional, for local overrides - not on CI/CD)
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });

/**
 * Helper for managing melosys-api application state
 *
 * When we clean the database, the Spring Boot application's JPA/Hibernate
 * caches may still have references to deleted entities. This can cause
 * errors like "ORA-02291: parent key not found".
 *
 * Solutions:
 * 1. Clear JPA caches via API endpoint (if available)
 * 2. Restart the API container
 * 3. Use TRUNCATE instead of DELETE (already implemented)
 */

/**
 * Admin API Helper
 *
 * Provides authenticated access to melosys-api admin endpoints.
 * Requires both admin API key and JWT token for authentication.
 */
export class AdminApiHelper {
  private readonly apiKey: string;
  private readonly authToken: string;
  private readonly baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8080') {
    this.baseUrl = baseUrl;
    this.apiKey = process.env.ADMIN_API_KEY || 'dummy';
    this.authToken = process.env.LOCAL_AUTH_TOKEN || '';

    if (!this.authToken) {
      throw new Error('LOCAL_AUTH_TOKEN not found in environment');
    }
  }

  /**
   * Call an admin API endpoint with proper authentication headers
   */
  private async callAdminEndpoint(
    request: APIRequestContext,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    params?: Record<string, string | boolean>,
    body?: any
  ) {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    // Add query parameters if provided
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.append(key, String(value));
      }
    }

    const options: any = {
      headers: {
        'X-MELOSYS-ADMIN-APIKEY': this.apiKey,
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      }
    };

    // Add body for POST/PUT requests
    if (body && (method === 'POST' || method === 'PUT')) {
      options.data = body;
    }

    // Make the request based on method
    switch (method) {
      case 'GET':
        return await request.get(url.toString(), options);
      case 'POST':
        return await request.post(url.toString(), options);
      case 'PUT':
        return await request.put(url.toString(), options);
      case 'DELETE':
        return await request.delete(url.toString(), options);
    }
  }

  /**
   * Find ikke-skattepliktige saker (non-taxable cases) for annual settlement
   *
   * @param request - Playwright API request context
   * @param fomDato - Start date (YYYY-MM-DD)
   * @param tomDato - End date (YYYY-MM-DD)
   * @param lagProsessinstanser - Whether to create process instances (default: false)
   * @returns API response with job details
   */
  async finnIkkeSkattepliktigeSaker(
    request: APIRequestContext,
    fomDato: string,
    tomDato: string,
    lagProsessinstanser: boolean = false
  ) {
    return await this.callAdminEndpoint(
      request,
      'POST',
      '/admin/aarsavregninger/saker/ikke-skattepliktige/finn',
      {
        lagProsessinstanser: lagProsessinstanser,
        fomDato: fomDato,
        tomDato: tomDato
      }
    );
  }

  /**
   * Get status of ikke-skattepliktige saker job (single check)
   *
   * @param request - Playwright API request context
   * @returns API response with job status
   */
  async getIkkeSkattepliktigeSakerStatus(request: APIRequestContext) {
    return await this.callAdminEndpoint(
      request,
      'GET',
      '/admin/aarsavregninger/saker/ikke-skattepliktige/status'
    );
  }

  /**
   * Wait for ikke-skattepliktige saker job to complete
   *
   * Polls the status endpoint until the job is done (isRunning becomes false)
   *
   * @param request - Playwright API request context
   * @param timeoutSeconds - Maximum time to wait (default: 10 seconds)
   * @param pollIntervalMs - Time between polls (default: 100ms)
   * @returns Final job status data
   */
  async waitForIkkeSkattepliktigeSakerJob(
    request: APIRequestContext,
    timeoutSeconds: number = 10,
    pollIntervalMs: number = 100
  ) {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    console.log(`\n⏳ Waiting for ikke-skattepliktige saker job to complete (timeout: ${timeoutSeconds}s)...`);

    while (true) {
      const response = await this.getIkkeSkattepliktigeSakerStatus(request);
      const data = await response.json();

      if (!response.ok()) {
        throw new Error(`Failed to get job status: HTTP ${response.status()}`);
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);

      if (!data.isRunning && (data.antallProsessert > 0 || elapsed > 2)) {
        console.log(`✅ Job completed after ${elapsed}s`);
        console.log(`   - Funnet: ${data.antallFunnet || 0}`);
        console.log(`   - Prosessert: ${data.antallProsessert || 0}`);
        console.log(`   - Errors: ${data.errorCount || 0}`);
        return data;
      }

      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        console.log(`\n❌ Timeout after ${elapsed}s - job still running`);
        console.log(`   - Funnet: ${data.antallFunnet || 0}`);
        console.log(`   - Prosessert: ${data.antallProsessert || 0}`);
        throw new Error(`Job did not complete within ${timeoutSeconds} seconds`);
      }

      // Log progress
      if (elapsed % 10 === 0 && elapsed > 0) { // Log every 10 seconds
        console.log(`   Still running... ${elapsed}s elapsed (funnet: ${data.antallFunnet || 0}, prosessert: ${data.antallProsessert || 0})`);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }

  /**
   * MELOSYS-8084: Trigger massesynk av saksstatus til melosys-skjema-api.
   *
   * Kaller POST /admin/skjema-saksstatus/synk i melosys-api, som går gjennom alle rader i
   * SKJEMA_SAK_MAPPING, mapper fagsakens status (OPPRETTET → MOTTATT, alt annet → AVSLUTTET)
   * og kaller PUT /m2m/api/skjema/saksstatus/bulk mot skjema-api (én oppdatering per skjemaId).
   * Responsen er SkjemaSaksstatusSynkRapport; antallOppdatert/ukjenteSkjemaIder/konfliktSkjemaIder
   * settes kun ved reell synk (null i dry-run).
   *
   * @param request - Playwright API request context
   * @param dryRun - true: kun rapport, ingen endringer skrives til skjema-api
   * @returns API-respons med synk-rapport
   */
  async synkSkjemaSaksstatus(request: APIRequestContext, dryRun: boolean) {
    return await this.callAdminEndpoint(
      request,
      'POST',
      '/admin/skjema-saksstatus/synk',
      { dryRun }
    );
  }

  /**
   * Add more admin API methods here following this pattern:
   *
   * @example
   * async someOtherAdminEndpoint(request: APIRequestContext, param1: string) {
   *   return await this.callAdminEndpoint(
   *     request,
   *     'GET',  // or 'POST', 'PUT', 'DELETE'
   *     '/admin/some/endpoint',
   *     { param1 }  // query parameters
   *   );
   * }
   */
}

const PROCESS_INSTANCE_BASE_URL = 'http://localhost:8080/internal/e2e/process-instances';

/**
 * Hent en markør (servertid) FØR handlingen som starter en prosess.
 *
 * Markøren er nøkkelen til race-fri venting: sendes den til `waitForNewProcessInstances`,
 * teller kun prosessinstanser registrert etter den — forrige stegs arbeid kan ikke oppfylle
 * ventingen.
 *
 * Bruk helst `runAndWaitForProcessInstances`, som gjør dette for deg.
 */
export async function getProcessMarker(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${PROCESS_INSTANCE_BASE_URL}/marker`, {
    failOnStatusCode: false,
    timeout: 10_000
  });

  if (!response.ok()) {
    throw new Error(
      `Kunne ikke hente prosessmarkør (HTTP ${response.status()}). melosys-api-imaget må ha ` +
      `/internal/e2e/process-instances/marker (navikt/melosys-api#3436) — kjører du et eldre image?`
    );
  }

  const {marker} = await response.json();
  if (typeof marker !== 'string' || marker.length === 0) {
    // Uten dette ville en tom respons gitt `after=undefined`, som serveren avviser med 400
    // FØRST etter at handlingen er kjørt — altså en langt mer forvirrende feilmelding.
    throw new Error(`Prosessmarkør-endepunktet svarte uten markør: ${JSON.stringify(marker)}`);
  }
  return marker;
}

/**
 * Vent på at prosessene som ble startet ETTER markøren er ferdige.
 *
 * I motsetning til `waitForProcessInstances` kan denne ikke svare COMPLETED på forrige stegs
 * arbeid: serveren krever at minst `expectedNew` prosessinstanser registrert etter markøren
 * finnes, og at alle er FERDIG.
 *
 * @param markør - fra `getProcessMarker`, hentet FØR handlingen
 * @param expectedNew - antall nye prosessinstanser handlingen starter (default 1).
 *                      0 betyr ren tømming: «alt som er registrert etter markøren skal være
 *                      ferdig», uten å kreve at noe nytt finnes. Brukes av cleanup-fixturen.
 */
export async function waitForNewProcessInstances(
  request: APIRequestContext,
  markør: string,
  options: { expectedNew?: number; timeoutSeconds?: number } = {}
): Promise<void> {
  const {expectedNew = 1, timeoutSeconds = 30} = options;

  return await awaitProcessInstances(request, timeoutSeconds, {
    after: markør,
    expectedNew: String(expectedNew)
  });
}

/**
 * Hent markør → kjør handlingen → vent på prosessene handlingen startet.
 *
 * Dette er den anbefalte formen. Den er umulig å bruke feil, fordi markøren alltid tas før
 * handlingen:
 *
 * ```typescript
 * await runAndWaitForProcessInstances(page.request, () => vedtak.klikkFattVedtak());
 * ```
 *
 * Returverdien fra handlingen sendes videre, så den kan brukes rundt handlinger som gir data.
 */
export async function runAndWaitForProcessInstances<T>(
  request: APIRequestContext,
  handling: () => Promise<T>,
  options: { expectedNew?: number; timeoutSeconds?: number } = {}
): Promise<T> {
  const markør = await getProcessMarker(request);
  const resultat = await handling();
  await waitForNewProcessInstances(request, markør, options);
  return resultat;
}

/**
 * Wait for all process instances to complete
 *
 * This calls the melosys-api test endpoint that monitors async process instances.
 * It ensures all background processes complete before we clean up the database.
 *
 * ⚠️ Uten markør kan endepunktet svare COMPLETED på arbeid fra FORRIGE steg — det ser bare
 * på alt som er registrert de siste 60 sekundene. For venting rundt en konkret handling,
 * bruk `runAndWaitForProcessInstances`.
 *
 * De gjenværende kallstedene på denne formen står IGJEN MED VILJE. De venter ikke på én
 * bestemt handling, men på at etterslep skal roe seg — «lukk auto-prosesser (oppgave, brev)
 * før DB-asserten», eller «ikke la cleanup-fixturen treffe aktive prosesser». Det finnes
 * ingen enkelthandling å ta markør rundt, og en markør med expectedNew=0 ville ikke hjulpet:
 * den venter heller ikke på at prosessen rekker å bli registrert. Skal de bli race-frie,
 * må de vite hvor mange prosesser de faktisk venter på — en egen jobb, ikke en omskriving.
 *
 * Returns:
 * - COMPLETED: All processes finished successfully
 * - FAILED: Some processes failed (details included)
 * - TIMEOUT: Processes didn't complete in time
 * - ERROR: Unexpected error occurred
 */
export async function waitForProcessInstances(request: APIRequestContext, timeoutSeconds: number = 30): Promise<void> {
  return await awaitProcessInstances(request, timeoutSeconds);
}

async function awaitProcessInstances(
  request: APIRequestContext,
  timeoutSeconds: number,
  ekstraParametre: Record<string, string> = {}
): Promise<void> {
  const params = new URLSearchParams({timeoutSeconds: String(timeoutSeconds), ...ekstraParametre});

  {
    const response = await request.get(`${PROCESS_INSTANCE_BASE_URL}/await?${params}`, {
      failOnStatusCode: false,
      timeout: (timeoutSeconds + 5) * 1000 // Add 5s buffer
    });

    const result = await response.json();

    // Serveren advarer bl.a. om gjenbrukt markør — en venting som ser koordinert ut, men som
    // instanser fra FØR handlingen kan oppfylle. Serverloggen er usynlig i CI, så den må hit.
    if (result.warning) {
      console.log(`   ⚠️  ${result.warning}`);
    }

    if (result.status === 'COMPLETED') {
      if (result.totalInstances > 0) {
        console.log(`   ✅ Process instances: ${result.totalInstances} completed in ${result.elapsedSeconds}s`);
      }
      return;
    }

    if (result.status === 'FAILED') {
      console.log(`   ❌ Process instances: ${result.failedInstances?.length || 0} FAILED`);
      let errorDetails = '';
      if (result.failedInstances) {
        for (const failure of result.failedInstances) {
          const errorMsg = failure.error?.melding || 'No error message';
          const stackTrace = failure.error?.stackTrace || '';
          console.log(`      - ${failure.type}: ${errorMsg}`);
          errorDetails += `\n  - ${failure.type}: ${errorMsg}`;
          if (stackTrace) {
            // Show first few lines of stack trace
            const stackLines = stackTrace.split('\n').slice(0, 5).join('\n');
            console.log(`        ${stackLines.substring(0, 200)}...`);
            errorDetails += `\n    ${stackLines}`;
          }
        }
      }
      throw new Error(`Found ${result.failedInstances?.length || 0} failed process instance(s)${errorDetails}`);
    }

    if (result.status === 'TIMEOUT') {
      console.log(`   ⚠️  Process instances: TIMEOUT after ${timeoutSeconds}s`);
      console.log(`      Not finished: ${result.notFinished}/${result.totalInstances}`);
      console.log(`      Active threads: ${result.activeThreads}, Queue: ${result.queueSize}`);
      throw new Error(`Process instances timed out: ${result.message}`);
    }

    // ERROR or other status
    console.log(`   ❌ Process instances: ${result.status} - ${result.message}`);
    throw new Error(`Process instance check failed: ${result.message}`);
  }
  // Ingen catch her med vilje. Den forrige svelget alt som inneholdt «connect» — også et api
  // som døde midt i ventingen — og returnerte som om ventingen var oppfylt. Da asserter testen
  // videre på en tilstand ingen prosess har produsert: nøyaktig den stille grønnheten
  // markørkontrakten finnes for å fjerne. Er api-et nede, skal testen si det høyt.
}

/**
 * Attempt to clear JPA/Hibernate caches in melosys-api
 *
 * Calls the POST /internal/e2e/caches/clear endpoint which clears:
 * - JPA first-level cache (EntityManager)
 * - JPA second-level cache (Hibernate)
 * - Spring caches
 */
export async function clearApiCaches(request: APIRequestContext): Promise<boolean> {
  try {
    const response = await request.post('http://localhost:8080/internal/e2e/caches/clear', {
      failOnStatusCode: false,
      timeout: 5000
    });

    if (response.ok()) {
      console.log(`   ✅ API caches cleared: JPA + Hibernate + Spring`);
      return true;
    }

    console.log(`   ⚠️  Cache clearing failed: HTTP ${response.status()}`);
    return false;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connect')) {
      console.log(`   ⚠️  Could not connect to cache endpoint - may not be available`);
    } else {
      console.log(`   ⚠️  Cache clearing error: ${errorMessage}`);
    }
    return false;
  }
}

/**
 * Restart melosys-api container to force cache clearing
 * This is a heavy-handed approach but guaranteed to work
 */
export async function restartApiContainer(): Promise<void> {
  const { execSync } = require('node:child_process');

  try {
    console.log('   🔄 Restarting melosys-api container...');
    execSync('docker restart melosys-api', { encoding: 'utf-8' });

    // Wait for API to be healthy
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        execSync('curl -s http://localhost:8080/actuator/health > /dev/null 2>&1');
        console.log('   ✅ API restarted and healthy');
        return;
      } catch {
        // Ignore health check errors, continue waiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('   ⚠️  API restarted but health check timed out');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`   ⚠️  Failed to restart API: ${errorMessage}`);
  }
}
