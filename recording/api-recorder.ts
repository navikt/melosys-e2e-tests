/**
 * API Recorder for E2E Tests
 *
 * Intercepts all API calls during test execution and records request/response pairs
 * with timestamps and ordering. Designed for race condition analysis - preserves
 * exact call timing and sequence (unlike melosys-web's recorder which normalizes for mocking).
 *
 * Usage:
 *   RECORD_API=true npx playwright test tests/eu-eos/eu-eos-arbeid-flere-land.spec.ts
 *
 * Recordings are saved to recordings/<sanitized-test-name>.json
 */

import type { Page, Route, Request, APIResponse } from '@playwright/test';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { RecordedExchange, RecordedRequest, RecordedResponse, ApiRecording } from './types';

/**
 * Parse URL query parameters into a plain object.
 */
function parseQuery(url: URL): Record<string, string> {
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return query;
}

/**
 * Extract relevant headers, redacting sensitive values.
 */
function extractHeaders(headers: Record<string, string>): Record<string, string> {
  const extracted: Record<string, string> = {};
  const keep = ['content-type', 'accept', 'authorization', 'x-melosys-admin-apikey'];
  for (const key of keep) {
    if (headers[key]) {
      extracted[key] = (key === 'authorization' || key === 'x-melosys-admin-apikey')
        ? '[REDACTED]'
        : headers[key];
    }
  }
  return extracted;
}

/**
 * Safely parse response body as JSON or text.
 */
async function safeParseBody(response: APIResponse): Promise<unknown> {
  try {
    const contentType = response.headers()['content-type'] || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    const text = await response.text();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/**
 * Sanitize a string for use as a filename.
 */
function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

export class ApiRecorder {
  private exchanges: RecordedExchange[] = [];
  private testFile: string;
  private testName: string;
  private startTime: number;
  private exchangeIndex = 0;

  constructor(testFile: string, testName: string) {
    this.testFile = testFile;
    this.testName = testName;
    this.startTime = Date.now();
  }

  /**
   * Attach the recorder to a Playwright page.
   * Intercepts all /api/* requests from the browser.
   */
  async attachToPage(page: Page): Promise<void> {
    // Intercept all API calls (browser requests go to /melosys/api/... or /api/...)
    await page.route(/\/api\//, async (route: Route) => {
      await this.handleRoute(route);
    });
  }

  /**
   * Handle an intercepted route: fetch from real backend and record the exchange.
   */
  private async handleRoute(route: Route): Promise<void> {
    const request = route.request();
    const requestTime = Date.now();

    try {
      // Fetch from the real API
      const response = await route.fetch();
      const durationMs = Date.now() - requestTime;

      // Record the exchange
      const exchange = await this.captureExchange(request, response, requestTime, durationMs);
      this.exchanges.push(exchange);

      // Continue with the real response
      await route.fulfill({
        status: response.status(),
        headers: response.headers(),
        body: await response.body(),
      });
    } catch (error) {
      console.warn(`[Recorder] Failed to capture ${request.method()} ${request.url()}: ${error}`);
      await route.continue();
    }
  }

  /**
   * Capture a request/response exchange with timing information.
   */
  private async captureExchange(
    request: Request,
    response: APIResponse,
    requestTime: number,
    durationMs: number
  ): Promise<RecordedExchange> {
    const url = new URL(request.url());

    // Parse request body
    let requestBody: unknown = null;
    try {
      const postData = request.postData();
      if (postData) {
        requestBody = JSON.parse(postData);
      }
    } catch {
      requestBody = request.postData();
    }

    // Parse response body (no normalization - we want raw data)
    const responseBody = await safeParseBody(response);

    const recordedRequest: RecordedRequest = {
      method: request.method(),
      url: request.url(),
      pathname: url.pathname,
      query: parseQuery(url),
      headers: extractHeaders(request.headers()),
      body: requestBody,
    };

    const recordedResponse: RecordedResponse = {
      status: response.status(),
      statusText: response.statusText(),
      headers: extractHeaders(response.headers()),
      body: responseBody,
    };

    return {
      index: this.exchangeIndex++,
      timestamp: new Date(requestTime).toISOString(),
      elapsedMs: requestTime - this.startTime,
      durationMs,
      request: recordedRequest,
      response: recordedResponse,
    };
  }

  get exchangeCount(): number {
    return this.exchanges.length;
  }

  /**
   * Save the recording to a JSON file.
   * Preserves call order and timing (unlike melosys-web which sorts deterministically).
   */
  save(): string {
    if (this.exchanges.length === 0) {
      console.log('[Recorder] No exchanges to save');
      return '';
    }

    const recordingsDir = join(process.cwd(), 'recordings');
    if (!existsSync(recordingsDir)) {
      mkdirSync(recordingsDir, { recursive: true });
    }

    const fileName = `${sanitizeFileName(this.testName)}.json`;
    const outputPath = join(recordingsDir, fileName);

    const recording: ApiRecording = {
      version: '1.0',
      recordedAt: new Date().toISOString(),
      testFile: this.testFile,
      testName: this.testName,
      testDurationMs: Date.now() - this.startTime,
      exchangeCount: this.exchanges.length,
      exchanges: this.exchanges,
    };

    writeFileSync(outputPath, JSON.stringify(recording, null, 2));
    console.log(`[Recorder] Saved ${this.exchanges.length} exchanges to ${outputPath}`);
    return outputPath;
  }
}
