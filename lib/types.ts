/**
 * Shared types for test summary generation
 *
 * These types define the structure of test data used by:
 * - reporters/test-summary.ts (Playwright reporter)
 * - scripts/generate-summary-from-json.ts (Standalone script)
 * - lib/summary-generator.ts (Shared logic)
 */

/**
 * Docker log error entry
 */
export interface DockerError {
  service: string;
  errors: Array<{
    timestamp: string;
    message: string;
  }>;
}

/**
 * Individual test result data
 */
export interface TestData {
  title: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped' | 'flaky' | 'known-error-failed' | 'known-error-passed';
  isKnownError: boolean;
  totalAttempts: number;
  failedAttempts: number;
  duration: number;
  error?: string;
  dockerErrors?: DockerError[];
  processErrors?: string;
}

/**
 * Complete test summary data (matches test-summary.json format)
 */
export interface TestSummaryData {
  status: 'passed' | 'failed';
  startTime?: Date;
  duration: number;
  tests: TestData[];
}

/**
 * Summary generation options
 */
export interface SummaryOptions {
  includeArtifactsSection?: boolean;
  includeTimestamp?: boolean;
}
