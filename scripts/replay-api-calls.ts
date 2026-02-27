/**
 * API Call Replay Script
 *
 * Reads a recording JSON file and replays all API calls to the backend
 * without requiring a browser. Useful for:
 * - Reproducing race conditions (like SaksopplysningKilde)
 * - Testing backend behavior in isolation
 * - Investigating flaky test failures
 *
 * Usage:
 *   npx ts-node scripts/replay-api-calls.ts recordings/my-test.json
 *
 * Options (via environment variables):
 *   REPLAY_BASE_URL=http://localhost:8080  (default: derived from recording URLs)
 *   REPLAY_PRESERVE_TIMING=true            (replay with original delays between calls)
 *   REPLAY_AUTH_TOKEN=<token>              (override auth token)
 *   REPLAY_VERBOSE=true                    (show request/response bodies)
 *   REPLAY_STOP_ON_ERROR=true              (stop on first non-2xx response)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as dotenv from 'dotenv';
import type { ApiRecording, RecordedExchange } from '../recording/types';

// Load .env for LOCAL_AUTH_TOKEN
dotenv.config({ path: resolve(__dirname, '../.env') });
dotenv.config({ path: resolve(__dirname, '../.env.local'), override: true });

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function colorStatus(status: number): string {
  if (status >= 200 && status < 300) return `${colors.green}${status}${colors.reset}`;
  if (status >= 300 && status < 400) return `${colors.yellow}${status}${colors.reset}`;
  return `${colors.red}${status}${colors.reset}`;
}

/**
 * Convert a recorded URL (browser-side) to a backend URL.
 * Browser records: http://localhost:3000/melosys/api/...
 * Backend expects: http://localhost:8080/api/...
 * Strip the /melosys prefix since the backend doesn't use it.
 */
function toBackendUrl(recordedUrl: string, baseUrl: string): string {
  const url = new URL(recordedUrl);
  const pathname = url.pathname.replace(/^\/melosys/, '');
  return `${baseUrl}${pathname}${url.search}`;
}

/**
 * Get an auth token for API calls.
 * Priority: REPLAY_AUTH_TOKEN env var → LOCAL_AUTH_TOKEN from .env
 */
function getAuthToken(): string {
  if (process.env.REPLAY_AUTH_TOKEN) {
    console.log(`${colors.green}Using REPLAY_AUTH_TOKEN from environment${colors.reset}`);
    return process.env.REPLAY_AUTH_TOKEN;
  }

  if (process.env.LOCAL_AUTH_TOKEN) {
    console.log(`${colors.green}Using LOCAL_AUTH_TOKEN from .env${colors.reset}`);
    return process.env.LOCAL_AUTH_TOKEN;
  }

  console.log(`${colors.yellow}Warning: No auth token found. Set LOCAL_AUTH_TOKEN in .env or REPLAY_AUTH_TOKEN.${colors.reset}`);
  return '';
}

/**
 * Replay a single API exchange.
 */
async function replayExchange(
  exchange: RecordedExchange,
  baseUrl: string,
  authToken: string,
  verbose: boolean,
): Promise<{ success: boolean; status: number; durationMs: number; error?: string }> {
  const { request } = exchange;
  const url = toBackendUrl(request.url, baseUrl);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
    fetchOptions.body = JSON.stringify(request.body);
  }

  const startTime = Date.now();
  try {
    const response = await fetch(url, fetchOptions);
    const durationMs = Date.now() - startTime;
    let responseBody: unknown = null;

    try {
      const text = await response.text();
      if (text) {
        responseBody = JSON.parse(text);
      }
    } catch {
      // Non-JSON response
    }

    const success = response.status >= 200 && response.status < 400;

    if (verbose && !success) {
      const responseBodyString = JSON.stringify(responseBody, null, 2) ?? '';
      console.log(`  ${colors.dim}Response body:${colors.reset}`, responseBodyString.substring(0, 500));
    }

    return { success, status: response.status, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, status: 0, durationMs, error: msg };
  }
}

/**
 * Main replay function.
 */
async function replay(recordingPath: string): Promise<void> {
  // Load recording
  const absolutePath = resolve(recordingPath);
  const content = readFileSync(absolutePath, 'utf-8');
  const recording: ApiRecording = JSON.parse(content);

  const baseUrl = process.env.REPLAY_BASE_URL || 'http://localhost:8080';
  const preserveTiming = process.env.REPLAY_PRESERVE_TIMING === 'true';
  const verbose = process.env.REPLAY_VERBOSE === 'true';
  const stopOnError = process.env.REPLAY_STOP_ON_ERROR === 'true';

  console.log(`\n${colors.bold}API Call Replay${colors.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`Recording: ${absolutePath}`);
  console.log(`Test: ${recording.testName}`);
  console.log(`Recorded: ${recording.recordedAt}`);
  console.log(`Exchanges: ${recording.exchangeCount}`);
  console.log(`Original duration: ${(recording.testDurationMs / 1000).toFixed(1)}s`);
  console.log(`Target: ${baseUrl}`);
  console.log(`Preserve timing: ${preserveTiming}`);
  console.log(`${'─'.repeat(60)}\n`);

  // Get auth token
  const authToken = getAuthToken();

  let succeeded = 0;
  let failed = 0;
  let lastElapsedMs = 0;

  for (const exchange of recording.exchanges) {
    // Preserve original timing if requested
    if (preserveTiming && exchange.elapsedMs > lastElapsedMs) {
      const delayMs = exchange.elapsedMs - lastElapsedMs;
      if (delayMs > 50) { // Only delay if > 50ms
        if (verbose) {
          console.log(`  ${colors.dim}⏳ waiting ${delayMs}ms${colors.reset}`);
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      lastElapsedMs = exchange.elapsedMs;
    }

    // Replay the exchange
    const result = await replayExchange(exchange, baseUrl, authToken, verbose);

    // Format output
    const method = exchange.request.method.padEnd(6);
    const pathname = exchange.request.pathname;
    const originalStatus = exchange.response.status;
    const replayStatus = result.status;
    const statusMatch = originalStatus === replayStatus;
    const statusIndicator = statusMatch ? '✓' : '✗';
    const statusColor = statusMatch ? colors.green : colors.red;

    console.log(
      `${statusColor}${statusIndicator}${colors.reset} ` +
      `${colors.dim}#${String(exchange.index).padStart(3)}${colors.reset} ` +
      `${method} ${pathname} ` +
      `${colors.dim}→${colors.reset} ` +
      `recorded:${colorStatus(originalStatus)} ` +
      `replay:${colorStatus(replayStatus)} ` +
      `${colors.dim}(${result.durationMs}ms)${colors.reset}`
    );

    if (result.error) {
      console.log(`  ${colors.red}Error: ${result.error}${colors.reset}`);
    }

    if (result.success) {
      succeeded++;
    } else {
      failed++;
      if (stopOnError) {
        console.log(`\n${colors.red}Stopping on error (REPLAY_STOP_ON_ERROR=true)${colors.reset}`);
        break;
      }
    }
  }

  // Summary
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${colors.bold}Results:${colors.reset} ${colors.green}${succeeded} succeeded${colors.reset}, ${failed > 0 ? colors.red : colors.dim}${failed} failed${colors.reset}`);
  console.log(`${'─'.repeat(60)}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

// CLI entry point
const recordingFile = process.argv[2];
if (!recordingFile) {
  console.error('Usage: npx ts-node scripts/replay-api-calls.ts <recording.json>');
  console.error('');
  console.error('Options (env vars):');
  console.error('  REPLAY_BASE_URL=http://localhost:8080   Target API base URL');
  console.error('  REPLAY_PRESERVE_TIMING=true             Replay with original delays');
  console.error('  REPLAY_AUTH_TOKEN=<token>                Override auth token');
  console.error('  REPLAY_VERBOSE=true                     Show response bodies on errors');
  console.error('  REPLAY_STOP_ON_ERROR=true                Stop on first error');
  process.exit(1);
}

replay(recordingFile).catch(error => {
  console.error('Replay failed:', error);
  process.exit(1);
});
