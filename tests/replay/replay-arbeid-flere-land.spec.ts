import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as dotenv from 'dotenv';
import type { ApiRecording, RecordedExchange } from '../../recording/types';

// Load env for LOCAL_AUTH_TOKEN
dotenv.config({ path: resolve(__dirname, '../../.env') });
dotenv.config({ path: resolve(__dirname, '../../.env.local'), override: true } as any);

const RECORDING_PATH = resolve(__dirname, '../../recordings/skal-fullfore-arbeid-i-flere-land-arbeidsflyt.json');
const BASE_URL = process.env.MELOSYS_API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:8080';

// IDs from the original recording that need substitution
const RECORDED_BEHANDLING_ID = '46';
const RECORDED_SAKSNUMMER = 'MEL-46';
const BRUKER_ID = '30056928150';

function getAuthToken(): string {
  return process.env.REPLAY_AUTH_TOKEN || process.env.LOCAL_AUTH_TOKEN || '';
}

function makeHeaders(authToken: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

/**
 * Create a new sak via the API and return the new behandlingID and saksnummer.
 */
async function createSakAndGetIds(authToken: string): Promise<{ behandlingId: string; saksnummer: string }> {
  const headers = makeHeaders(authToken);

  // Create sak (same payload as the recording)
  const createResp = await fetch(`${BASE_URL}/api/fagsaker`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      behandlingstema: 'ARBEID_FLERE_LAND',
      behandlingstype: 'FØRSTEGANG',
      skalTilordnes: true,
      mottaksdato: new Date().toISOString().split('T')[0],
      behandlingsaarsakType: 'SØKNAD',
      hovedpart: 'BRUKER',
      brukerID: BRUKER_ID,
      virksomhetOrgnr: null,
      sakstype: 'EU_EOS',
      sakstema: 'MEDLEMSKAP_LOVVALG',
      soknadDto: {
        periode: { fom: '2024-01-01', tom: '2025-12-31' },
        land: { landkoder: ['EE', 'NO'], flereLandUkjentHvilke: false },
      },
    }),
  });

  if (createResp.status !== 204 && createResp.status !== 200) {
    const body = await createResp.text();
    throw new Error(`Failed to create sak: ${createResp.status} ${body}`);
  }

  // Poll for oppgave (async processing can take longer on CI)
  let oppgave: { behandling: { behandlingID: number }; hovedpartIdent: string } | undefined;
  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise(r => setTimeout(r, 2000));
    const oppgaverResp = await fetch(`${BASE_URL}/api/oppgaver/oversikt`, { headers });
    const oppgaver = await oppgaverResp.json() as {
      saksbehandling: Array<{ behandling: { behandlingID: number }; hovedpartIdent: string }>;
    };
    oppgave = oppgaver.saksbehandling.find(o => o.hovedpartIdent === BRUKER_ID);
    if (oppgave) break;
  }

  if (!oppgave) {
    throw new Error(`No oppgave found for bruker ${BRUKER_ID} after 30s polling`);
  }

  const behandlingId = String(oppgave.behandling.behandlingID);

  // Find saksnummer via fagsaker/sok
  const sokResp = await fetch(`${BASE_URL}/api/fagsaker/sok`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ident: BRUKER_ID, saksnummer: null, orgnr: null }),
  });
  const saker = await sokResp.json() as Array<{ saksnummer: string }>;

  if (!saker.length) {
    throw new Error(`No sak found for bruker ${BRUKER_ID}`);
  }
  // Use the latest sak (highest saksnummer)
  const saksnummer = saker[saker.length - 1].saksnummer;

  return { behandlingId, saksnummer };
}

/**
 * Substitute recorded IDs with new IDs in a URL string.
 */
function substituteUrl(recordedUrl: string, newBehandlingId: string, newSaksnummer: string): string {
  const url = new URL(recordedUrl);
  let pathname = url.pathname.replace(/^\/melosys/, '');
  pathname = pathname.replace(`/${RECORDED_BEHANDLING_ID}`, `/${newBehandlingId}`);
  pathname = pathname.replace(RECORDED_SAKSNUMMER, newSaksnummer);
  return `${BASE_URL}${pathname}${url.search}`;
}

/**
 * Replay a single exchange with substituted IDs.
 */
async function replayExchange(
  exchange: RecordedExchange,
  authToken: string,
  newBehandlingId: string,
  newSaksnummer: string,
): Promise<{ status: number; durationMs: number; url: string }> {
  const { request } = exchange;
  const url = substituteUrl(request.url, newBehandlingId, newSaksnummer);
  const headers = makeHeaders(authToken);

  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
    fetchOptions.body = JSON.stringify(request.body);
  }

  const start = Date.now();
  const response = await fetch(url, fetchOptions);
  return { status: response.status, durationMs: Date.now() - start, url };
}

/**
 * Replay the recorded API calls from the arbeid-i-flere-land E2E test.
 *
 * Creates a fresh sak/behandling, substitutes IDs in all 84 recorded API calls,
 * and replays them with original timing preserved. Goal: reproduce the
 * SaksopplysningKilde OptimisticLockingFailureException race condition.
 *
 * The race occurs when HENT_REGISTEROPPLYSNINGER saga and frontend
 * oppfriskning both write to SaksopplysningKilde simultaneously.
 */
test.describe('API Replay - Arbeid i flere land', () => {
  test('replay recorded API sequence with original timing', async () => {
    test.setTimeout(120_000);

    const content = readFileSync(RECORDING_PATH, 'utf-8');
    const recording: ApiRecording = JSON.parse(content);
    const authToken = getAuthToken();

    expect(authToken, 'Auth token required (LOCAL_AUTH_TOKEN in .env)').toBeTruthy();

    // Step 1: Create a fresh sak and get new IDs
    console.log('\nCreating fresh sak for replay...');
    const { behandlingId, saksnummer } = await createSakAndGetIds(authToken);
    console.log(`Created: saksnummer=${saksnummer}, behandlingId=${behandlingId}`);
    console.log(`Substituting: ${RECORDED_SAKSNUMMER}→${saksnummer}, ${RECORDED_BEHANDLING_ID}→${behandlingId}`);

    // Step 2: Skip the sak-creation exchanges (already done above),
    // replay from the first exchange that references the behandling ID.
    // Exchanges 0-18 are pre-creation (login, search, create sak, navigation)
    // Exchange 19+ are the actual behandling interactions
    const replayStart = recording.exchanges.findIndex(
      e => e.request.pathname.includes(`/${RECORDED_BEHANDLING_ID}`) ||
           e.request.pathname.includes(RECORDED_SAKSNUMMER)
    );

    const exchangesToReplay = recording.exchanges.slice(replayStart);
    console.log(`\nReplaying ${exchangesToReplay.length} exchanges (skipping ${replayStart} pre-creation calls)`);
    console.log(`Original test duration: ${(recording.testDurationMs / 1000).toFixed(1)}s\n`);

    let succeeded = 0;
    let failed = 0;
    let mismatched = 0;
    let lastElapsedMs = exchangesToReplay[0]?.elapsedMs ?? 0;

    for (const exchange of exchangesToReplay) {
      // Preserve original timing between calls
      if (exchange.elapsedMs > lastElapsedMs) {
        const delayMs = exchange.elapsedMs - lastElapsedMs;
        if (delayMs > 50) {
          await new Promise(r => setTimeout(r, delayMs));
        }
        lastElapsedMs = exchange.elapsedMs;
      }

      const result = await replayExchange(exchange, authToken, behandlingId, saksnummer);

      const method = exchange.request.method.padEnd(6);
      const originalStatus = exchange.response.status;
      const statusMatch = originalStatus === result.status;
      const pathname = new URL(result.url).pathname;

      if (result.status >= 200 && result.status < 400) {
        succeeded++;
      } else {
        failed++;
      }

      if (!statusMatch) {
        mismatched++;
        console.log(
          `  MISMATCH #${exchange.index} ${method} ${pathname} → ` +
          `recorded:${originalStatus} replay:${result.status} (${result.durationMs}ms)`
        );
      }
    }

    console.log(`\nResults: ${succeeded} ok, ${failed} failed, ${mismatched} status mismatches`);
    console.log('Check docker logs for SaksopplysningKilde / OptimisticLockingFailureException errors.\n');

    // Don't hard-fail on mismatches — the value is reproducing the race condition.
    // Docker log fixture will catch the actual OptimisticLockingFailureException.
  });
});
