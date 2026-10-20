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
 * En pin fra .github/e2e-pins.json: tjenesten holdes på `tag` i stedet for `latest`.
 * Se docs/ci-cd/KOBLEDE-ENDRINGER.md.
 */
export interface E2EPin {
  tag: string;
  e2e_branch?: string;
  service_pr?: number;
  jira: string;
  utloper: string;
}

/**
 * Complete test summary data (matches test-summary.json format)
 */
export interface TestSummaryData {
  // 'skipped' skrives bare av plan-jobben når regel 6 hopper over testene.
  status: 'passed' | 'failed' | 'skipped';
  skipped?: boolean;
  skipReason?: 'pinned-service';
  startTime?: Date;
  duration: number;
  tests: TestData[];
  tags?: Record<string, string>; // Docker image tags used in the test run
  retriesDisabled?: boolean; // When true, flaky tests are treated as failures
  bddRun?: boolean; // When true, this run executed only the opt-in ATDD/BDD example (--project=bdd)
  unleashOverrides?: {
    forceDisable?: string[]; // Toggles forced OFF for the whole run
    forceEnable?: string[]; // Toggles forced ON for the whole run
  };
  pins?: Record<string, E2EPin>; // Pinnene i .github/e2e-pins.json, når minst én er brukt
}

/**
 * Summary generation options
 */
export interface SummaryOptions {
  includeArtifactsSection?: boolean;
  includeTimestamp?: boolean;
}
