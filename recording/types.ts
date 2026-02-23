/**
 * Types for API Recording System
 *
 * Used by the API recorder to capture request/response pairs during E2E tests,
 * and by the replay script to reproduce API call sequences without a browser.
 */

export interface RecordedRequest {
  method: string;
  url: string;
  pathname: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

export interface RecordedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface RecordedExchange {
  /** Monotonic index preserving call order */
  index: number;
  /** ISO timestamp when the request was made */
  timestamp: string;
  /** Milliseconds since test start */
  elapsedMs: number;
  /** Response time in milliseconds */
  durationMs: number;
  request: RecordedRequest;
  response: RecordedResponse;
}

export interface ApiRecording {
  version: string;
  recordedAt: string;
  testFile: string;
  testName: string;
  /** Total test duration in milliseconds */
  testDurationMs: number;
  /** Number of exchanges captured */
  exchangeCount: number;
  exchanges: RecordedExchange[];
}
