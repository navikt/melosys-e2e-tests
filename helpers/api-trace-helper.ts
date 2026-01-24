import { Page, Route, Request, Response } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * API Trace Helper - Records API calls with precise timestamps for race condition debugging
 *
 * Purpose:
 * - Record exact sequence and timing of frontend requests
 * - Correlate with backend docker logs using timestamps
 * - Identify which frontend actions trigger race conditions
 *
 * Key race condition to debug:
 * - ObjectOptimisticLockingFailureException on SaksopplysningKilde
 * - Occurs when SAGA step HENT_REGISTEROPPLYSNINGER (async background)
 *   runs concurrently with frontend calls to:
 *   - /api/kontroll/ferdigbehandling
 *   - /api/saksflyt/vedtak/{id}/fatt
 *
 * Environment variables:
 * - RECORD_API_TRACE=true - Enable API trace recording
 * - API_TRACE_VERBOSE=true - Include request/response bodies
 */

export interface ApiTraceEntry {
  id: string;
  timestamp: string;
  elapsed: number;
  method: string;
  pathname: string;
  url: string;
  status?: number;
  duration?: number;
  requestBody?: unknown;
  responseBody?: unknown;
  headers?: Record<string, string>;
  isRaceConditionEndpoint?: boolean;
}

export interface ApiTraceResult {
  testName: string;
  traceId: string;
  startTime: string;
  endTime?: string;
  entries: ApiTraceEntry[];
  timeline: string;
  summary: {
    totalRequests: number;
    raceConditionEndpoints: string[];
    longestRequests: Array<{ pathname: string; duration: number }>;
  };
}

// Endpoints known to trigger race conditions with async SAGA processing
const RACE_CONDITION_ENDPOINTS = [
  '/api/kontroll/ferdigbehandling',
  '/api/saksflyt/vedtak/',
  '/api/registeropplysninger/',
  '/api/behandling/'
];

export class ApiTraceRecorder {
  private entries: ApiTraceEntry[] = [];
  private startTime: number = 0;
  private startDate: Date = new Date();
  private traceId: string = '';
  private testName: string = '';
  private pendingRequests: Map<string, { entry: ApiTraceEntry; startTime: number }> = new Map();
  private isAttached: boolean = false;
  private verbose: boolean = false;

  constructor(testName: string = 'unknown') {
    this.testName = testName;
    this.traceId = `e2e-${this.generateShortId()}-${Date.now()}`;
    this.verbose = process.env.API_TRACE_VERBOSE === 'true';
  }

  private generateShortId(): string {
    return Math.random().toString(36).substring(2, 8);
  }

  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  }

  private isApiEndpoint(url: string): boolean {
    const pathname = new URL(url).pathname;
    return (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/graphql') ||
      pathname.startsWith('/melosys/api/')
    );
  }

  private isRaceConditionEndpoint(pathname: string): boolean {
    return RACE_CONDITION_ENDPOINTS.some(endpoint => pathname.includes(endpoint));
  }

  private getPathname(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }

  /**
   * Attach the recorder to a Playwright page
   * Intercepts all API requests and records timing information
   */
  async attach(page: Page): Promise<void> {
    if (this.isAttached) {
      console.warn('ApiTraceRecorder already attached to page');
      return;
    }

    this.startTime = performance.now();
    this.startDate = new Date();
    this.isAttached = true;

    console.log(`📡 API Trace Recording started: ${this.traceId}`);

    // Use page.on('request') and page.on('response') for non-blocking interception
    page.on('request', (request: Request) => {
      const url = request.url();
      if (!this.isApiEndpoint(url)) return;

      const requestId = this.generateRequestId();
      const pathname = this.getPathname(url);
      const now = performance.now();
      const elapsed = now - this.startTime;

      const entry: ApiTraceEntry = {
        id: requestId,
        timestamp: new Date().toISOString(),
        elapsed: Math.round(elapsed * 100) / 100,
        method: request.method(),
        pathname,
        url,
        isRaceConditionEndpoint: this.isRaceConditionEndpoint(pathname)
      };

      // Include request body if verbose mode
      if (this.verbose) {
        try {
          const postData = request.postData();
          if (postData) {
            try {
              entry.requestBody = JSON.parse(postData);
            } catch {
              entry.requestBody = postData;
            }
          }
        } catch {
          // Ignore errors getting post data
        }
      }

      // Add trace header for backend correlation (if possible)
      // Note: We can't modify headers here, but we track it for the log
      if (entry.isRaceConditionEndpoint) {
        console.log(
          `  ⚡ [${this.formatElapsed(elapsed)}] ${entry.method} ${pathname} ← RACE TRIGGER`
        );
      }

      this.pendingRequests.set(url + '-' + requestId, { entry, startTime: now });
    });

    page.on('response', async (response: Response) => {
      const request = response.request();
      const url = request.url();
      if (!this.isApiEndpoint(url)) return;

      // Find matching pending request
      const pendingKey = Array.from(this.pendingRequests.keys()).find(key =>
        key.startsWith(url + '-')
      );

      if (!pendingKey) return;

      const pending = this.pendingRequests.get(pendingKey);
      if (!pending) return;

      this.pendingRequests.delete(pendingKey);

      const now = performance.now();
      const duration = Math.round((now - pending.startTime) * 100) / 100;

      pending.entry.status = response.status();
      pending.entry.duration = duration;

      // Include response body if verbose mode
      if (this.verbose) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            pending.entry.responseBody = await response.json().catch(() => null);
          }
        } catch {
          // Ignore errors getting response body
        }
      }

      this.entries.push(pending.entry);

      // Log long-running requests or race condition endpoints
      if (duration > 1000 || pending.entry.isRaceConditionEndpoint) {
        const durationStr = duration > 1000 ? `⏱️  ${duration}ms` : `${duration}ms`;
        const marker = pending.entry.isRaceConditionEndpoint ? ' ← RACE' : '';
        console.log(
          `  📡 [${this.formatElapsed(pending.entry.elapsed)}] ${pending.entry.method} ${pending.entry.pathname} → ${response.status()} (${durationStr})${marker}`
        );
      }
    });
  }

  private formatElapsed(ms: number): string {
    const seconds = ms / 1000;
    return `${seconds.toFixed(1)}s`;
  }

  /**
   * Get all recorded entries
   */
  getEntries(): ApiTraceEntry[] {
    return [...this.entries].sort((a, b) => a.elapsed - b.elapsed);
  }

  /**
   * Generate a text visualization of the request timeline
   */
  getTimeline(): string {
    const sortedEntries = this.getEntries();
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push(`API Request Timeline: ${this.testName}`);
    lines.push(`Trace ID: ${this.traceId}`);
    lines.push(`Started: ${this.startDate.toISOString()}`);
    lines.push('='.repeat(80));
    lines.push('');

    for (const entry of sortedEntries) {
      const elapsed = `[${this.formatElapsed(entry.elapsed)}]`.padEnd(10);
      const method = entry.method.padEnd(6);
      const pathname = entry.pathname.substring(0, 50).padEnd(50);
      const status = entry.status ? `${entry.status}` : 'pending';
      const duration = entry.duration ? `(${entry.duration}ms)` : '';
      const marker = entry.isRaceConditionEndpoint ? ' ← RACE TRIGGER' : '';

      lines.push(`${elapsed} ${method} ${pathname} ${status.padStart(3)} ${duration.padStart(10)}${marker}`);
    }

    lines.push('');
    lines.push('='.repeat(80));

    // Add summary
    const raceEndpoints = sortedEntries.filter(e => e.isRaceConditionEndpoint);
    if (raceEndpoints.length > 0) {
      lines.push('');
      lines.push('⚠️  Race Condition Endpoints Called:');
      for (const entry of raceEndpoints) {
        lines.push(`   [${this.formatElapsed(entry.elapsed)}] ${entry.method} ${entry.pathname}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get the complete trace result object
   */
  getResult(): ApiTraceResult {
    const sortedEntries = this.getEntries();
    const raceConditionEndpoints = Array.from(
      new Set(
        sortedEntries
          .filter(e => e.isRaceConditionEndpoint)
          .map(e => e.pathname)
      )
    );

    const longestRequests = sortedEntries
      .filter(e => e.duration !== undefined)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 5)
      .map(e => ({ pathname: e.pathname, duration: e.duration || 0 }));

    return {
      testName: this.testName,
      traceId: this.traceId,
      startTime: this.startDate.toISOString(),
      endTime: new Date().toISOString(),
      entries: sortedEntries,
      timeline: this.getTimeline(),
      summary: {
        totalRequests: sortedEntries.length,
        raceConditionEndpoints,
        longestRequests
      }
    };
  }

  /**
   * Save the trace to a JSON file
   */
  saveToFile(outputPath: string): void {
    const result = this.getResult();

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write JSON file
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    // Also write timeline as text file
    const timelinePath = outputPath.replace('.json', '.txt');
    fs.writeFileSync(timelinePath, result.timeline);

    console.log(`📄 API trace saved to: ${outputPath}`);
    console.log(`📄 Timeline saved to: ${timelinePath}`);
  }

  /**
   * Check if recording is enabled via environment variable
   */
  static isEnabled(): boolean {
    return process.env.RECORD_API_TRACE === 'true';
  }

  /**
   * Get the trace ID for this recorder (for backend correlation)
   */
  getTraceId(): string {
    return this.traceId;
  }

  /**
   * Print a summary to console
   */
  printSummary(): void {
    const result = this.getResult();

    console.log('\n' + '='.repeat(60));
    console.log('📊 API Trace Summary');
    console.log('='.repeat(60));
    console.log(`Trace ID: ${result.traceId}`);
    console.log(`Total Requests: ${result.summary.totalRequests}`);

    if (result.summary.raceConditionEndpoints.length > 0) {
      console.log(`\n⚠️  Race Condition Endpoints:`);
      for (const endpoint of result.summary.raceConditionEndpoints) {
        console.log(`   - ${endpoint}`);
      }
    }

    if (result.summary.longestRequests.length > 0) {
      console.log(`\n⏱️  Longest Requests:`);
      for (const req of result.summary.longestRequests) {
        console.log(`   - ${req.pathname}: ${req.duration}ms`);
      }
    }

    console.log('='.repeat(60) + '\n');
  }
}
