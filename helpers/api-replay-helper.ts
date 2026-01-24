import { APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import { ApiTraceEntry, ApiTraceResult } from './api-trace-helper';

/**
 * API Replay Helper - Replays recorded API traces for debugging race conditions
 *
 * Purpose:
 * - Replay recorded API calls without the frontend
 * - Determine if race conditions are caused by frontend behavior
 * - Isolate which API call sequences trigger issues
 *
 * Usage:
 * 1. Record a trace with RECORD_API_TRACE=true
 * 2. Create a replay test using the trace file
 * 3. Run the replay test to see if race condition reproduces
 *
 * If replay is stable but real test is flaky → frontend is causing the issue
 * If replay is also flaky → API call sequence itself is the problem
 */

export interface ReplayOptions {
  /** Base URL for API calls (default: http://localhost:8080) */
  baseUrl?: string;

  /** Whether to preserve original timing between requests */
  preserveTiming?: boolean;

  /** Minimum delay between requests in ms (default: 0) */
  minDelay?: number;

  /** Maximum delay between requests in ms (default: 0, unlimited) */
  maxDelay?: number;

  /** Filter to only replay certain endpoints (regex pattern) */
  filterPattern?: RegExp;

  /** Skip certain endpoints (regex pattern) */
  skipPattern?: RegExp;

  /** Callback before each request */
  beforeRequest?: (entry: ApiTraceEntry) => Promise<void>;

  /** Callback after each request */
  afterRequest?: (entry: ApiTraceEntry, status: number, duration: number) => Promise<void>;

  /** Authorization token for API calls */
  authToken?: string;

  /** Additional headers to include */
  headers?: Record<string, string>;

  /** Replace patterns in URLs (e.g., { '/63': '/${newId}' }) */
  urlReplacements?: Record<string, string>;

  /** Log each request */
  verbose?: boolean;
}

export interface ReplayResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  entries: Array<{
    original: ApiTraceEntry;
    replayStatus: number;
    replayDuration: number;
    error?: string;
  }>;
  totalDuration: number;
}

export class ApiReplayHelper {
  private request: APIRequestContext;
  private options: ReplayOptions;

  constructor(request: APIRequestContext, options: ReplayOptions = {}) {
    this.request = request;
    this.options = {
      baseUrl: 'http://localhost:8080',
      preserveTiming: false,
      minDelay: 0,
      maxDelay: 0,
      verbose: true,
      ...options
    };
  }

  /**
   * Load a trace from a JSON file
   */
  static loadTrace(filePath: string): ApiTraceResult {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ApiTraceResult;
  }

  /**
   * Replay all API calls from a trace
   */
  async replayTrace(trace: ApiTraceResult): Promise<ReplayResult> {
    const result: ReplayResult = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      entries: [],
      totalDuration: 0
    };

    const startTime = performance.now();
    let lastElapsed = 0;

    console.log('\n' + '='.repeat(70));
    console.log(`🔄 Replaying API trace: ${trace.testName}`);
    console.log(`   Original trace ID: ${trace.traceId}`);
    console.log(`   Total requests: ${trace.entries.length}`);
    console.log('='.repeat(70) + '\n');

    for (const entry of trace.entries) {
      // Apply filters
      if (this.options.filterPattern && !this.options.filterPattern.test(entry.pathname)) {
        continue;
      }
      if (this.options.skipPattern && this.options.skipPattern.test(entry.pathname)) {
        continue;
      }

      // Skip non-API endpoints (like graphql for now, unless we have the body)
      if (entry.pathname === '/graphql/' && !entry.requestBody) {
        if (this.options.verbose) {
          console.log(`   ⏭️  Skipping GraphQL (no body): ${entry.pathname}`);
        }
        continue;
      }

      // Calculate delay if preserving timing
      if (this.options.preserveTiming && lastElapsed > 0) {
        let delay = entry.elapsed - lastElapsed;
        if (this.options.minDelay) {
          delay = Math.max(delay, this.options.minDelay);
        }
        if (this.options.maxDelay && delay > this.options.maxDelay) {
          delay = this.options.maxDelay;
        }
        if (delay > 0) {
          await this.sleep(delay);
        }
      } else if (this.options.minDelay) {
        await this.sleep(this.options.minDelay);
      }

      lastElapsed = entry.elapsed;

      // Replay the request
      const replayEntry = await this.replayRequest(entry);
      result.entries.push(replayEntry);
      result.totalRequests++;

      if (replayEntry.error) {
        result.failedRequests++;
      } else {
        result.successfulRequests++;
      }
    }

    result.totalDuration = performance.now() - startTime;

    console.log('\n' + '='.repeat(70));
    console.log('📊 Replay Summary');
    console.log('='.repeat(70));
    console.log(`   Total: ${result.totalRequests} requests`);
    console.log(`   Success: ${result.successfulRequests}`);
    console.log(`   Failed: ${result.failedRequests}`);
    console.log(`   Duration: ${Math.round(result.totalDuration)}ms`);
    console.log('='.repeat(70) + '\n');

    return result;
  }

  /**
   * Replay a single API request
   */
  private async replayRequest(entry: ApiTraceEntry): Promise<{
    original: ApiTraceEntry;
    replayStatus: number;
    replayDuration: number;
    error?: string;
  }> {
    const startTime = performance.now();

    // Build URL
    let url = entry.pathname;

    // Apply URL replacements
    if (this.options.urlReplacements) {
      for (const [pattern, replacement] of Object.entries(this.options.urlReplacements)) {
        url = url.replace(new RegExp(pattern, 'g'), replacement);
      }
    }

    // Handle query string from original URL
    const originalUrl = new URL(entry.url);
    if (originalUrl.search) {
      url += originalUrl.search;
    }

    const fullUrl = `${this.options.baseUrl}${url}`;

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.options.headers
    };

    if (this.options.authToken) {
      headers['Authorization'] = `Bearer ${this.options.authToken}`;
    }

    // Callback before request
    if (this.options.beforeRequest) {
      await this.options.beforeRequest(entry);
    }

    let status = 0;
    let error: string | undefined;

    try {
      let response;

      switch (entry.method) {
        case 'GET':
          response = await this.request.get(fullUrl, { headers, failOnStatusCode: false });
          break;
        case 'POST':
          response = await this.request.post(fullUrl, {
            headers,
            data: entry.requestBody || {},
            failOnStatusCode: false
          });
          break;
        case 'PUT':
          response = await this.request.put(fullUrl, {
            headers,
            data: entry.requestBody || {},
            failOnStatusCode: false
          });
          break;
        case 'DELETE':
          response = await this.request.delete(fullUrl, { headers, failOnStatusCode: false });
          break;
        case 'PATCH':
          response = await this.request.patch(fullUrl, {
            headers,
            data: entry.requestBody || {},
            failOnStatusCode: false
          });
          break;
        default:
          throw new Error(`Unsupported method: ${entry.method}`);
      }

      status = response.status();

      // Check for error responses
      if (status >= 400) {
        const body = await response.text().catch(() => '');
        error = `HTTP ${status}: ${body.substring(0, 200)}`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      status = 0;
    }

    const duration = performance.now() - startTime;

    // Callback after request
    if (this.options.afterRequest) {
      await this.options.afterRequest(entry, status, duration);
    }

    // Log if verbose
    if (this.options.verbose) {
      const statusIcon = error ? '❌' : '✅';
      const raceMarker = entry.isRaceConditionEndpoint ? ' ⚡RACE' : '';
      console.log(
        `   ${statusIcon} ${entry.method.padEnd(6)} ${entry.pathname.substring(0, 50).padEnd(50)} → ${status} (${Math.round(duration)}ms)${raceMarker}`
      );
      if (error) {
        console.log(`      Error: ${error.substring(0, 100)}`);
      }
    }

    return {
      original: entry,
      replayStatus: status,
      replayDuration: duration,
      error
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract unique endpoints from a trace for analysis
   */
  static analyzeTrace(trace: ApiTraceResult): {
    uniqueEndpoints: string[];
    postEndpoints: string[];
    raceConditionEndpoints: string[];
    timeline: Array<{ elapsed: number; method: string; pathname: string }>;
  } {
    const uniqueEndpoints = new Set<string>();
    const postEndpoints = new Set<string>();
    const raceConditionEndpoints = new Set<string>();

    for (const entry of trace.entries) {
      uniqueEndpoints.add(`${entry.method} ${entry.pathname}`);
      if (entry.method === 'POST') {
        postEndpoints.add(entry.pathname);
      }
      if (entry.isRaceConditionEndpoint) {
        raceConditionEndpoints.add(entry.pathname);
      }
    }

    return {
      uniqueEndpoints: Array.from(uniqueEndpoints).sort(),
      postEndpoints: Array.from(postEndpoints).sort(),
      raceConditionEndpoints: Array.from(raceConditionEndpoints),
      timeline: trace.entries.map(e => ({
        elapsed: e.elapsed,
        method: e.method,
        pathname: e.pathname
      }))
    };
  }
}

/**
 * Create a minimal replay that only calls the race-condition-triggering endpoints
 * plus surrounding context
 */
export function extractRaceConditionSequence(
  trace: ApiTraceResult,
  windowMs: number = 1000
): ApiTraceEntry[] {
  const raceEntries = trace.entries.filter(e => e.isRaceConditionEndpoint);

  if (raceEntries.length === 0) {
    return [];
  }

  const sequences: ApiTraceEntry[] = [];

  for (const raceEntry of raceEntries) {
    const windowStart = raceEntry.elapsed - windowMs;
    const windowEnd = raceEntry.elapsed + windowMs;

    const contextEntries = trace.entries.filter(
      e => e.elapsed >= windowStart && e.elapsed <= windowEnd
    );

    sequences.push(...contextEntries);
  }

  // Deduplicate by ID
  const seen = new Set<string>();
  return sequences.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  }).sort((a, b) => a.elapsed - b.elapsed);
}
