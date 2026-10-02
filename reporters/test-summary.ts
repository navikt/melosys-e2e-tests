import type {
  FullConfig, FullResult, Reporter, Suite, TestCase, TestResult
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import { generateMarkdownSummary } from '../lib/summary-generator';
import { TestSummaryData, TestData } from '../lib/types';
import { hasTag } from '../lib/test-tags';

/**
 * Custom Playwright reporter that creates a test summary
 *
 * Creates a markdown summary file showing:
 * - Overall pass/fail statistics (accounting for retries)
 * - Failed tests with error details (deduplicated across retries)
 * - Docker log errors by service
 * - Process instance failures
 *
 * Output: playwright-report/test-summary.md
 */

const TAG_ENV_VARS = [
  { key: 'melosys-api', envVar: 'MELOSYS_API_TAG' },
  { key: 'melosys-web', envVar: 'MELOSYS_WEB_TAG' },
  { key: 'faktureringskomponenten', envVar: 'FAKTURERINGSKOMPONENTEN_TAG' },
  { key: 'melosys-trygdeavgift-beregning', envVar: 'MELOSYS_TRYGDEAVGIFT_TAG' },
  { key: 'melosys-trygdeavtale', envVar: 'MELOSYS_TRYGDEAVTALE_TAG' },
  { key: 'melosys-inngangsvilkar', envVar: 'MELOSYS_INNGANGSVILKAR_TAG' },
  { key: 'melosys-eessi', envVar: 'MELOSYS_EESSI_TAG' },
  { key: 'melosys-mock', envVar: 'MELOSYS_MOCK_TAG' },
  { key: 'melosys-dokgen', envVar: 'MELOSYS_DOKGEN_TAG' },
];

/**
 * Docker image tags from environment variables, keyed by service. On CI the plan job pins each
 * tag to `<tag>@sha256:…` for docker compose; the summary and melosys-console show the tag only.
 */
export function imageTagsFromEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const { key, envVar } of TAG_ENV_VARS) {
    const value = env[envVar]?.replace(/@sha256:[0-9a-f]{64}$/, '');
    if (value) {
      tags[key] = value;
    }
  }
  return tags;
}

interface TestInfo {
  test: TestCase;
  results: TestResult[];
  dockerErrors?: any;
  processErrors?: string;
  finalStatus: 'passed' | 'failed' | 'skipped' | 'flaky' | 'known-error-failed' | 'known-error-passed';
  totalAttempts: number;
  failedAttempts: number;
  isKnownError: boolean;
}

class TestSummaryReporter implements Reporter {
  private testsByKey: Map<string, TestInfo> = new Map();

  onTestEnd(test: TestCase, result: TestResult) {
    // Create unique key for test (file + title)
    const key = `${test.location.file}::${test.title}`;

    // Check if test is marked as known-error: the fixture pushes an annotation,
    // but tests that bypass the shared fixtures (e.g. plain @playwright/test specs
    // or Gherkin scenarios tagged via test.tags) are covered by hasTag directly.
    const isKnownError = test.annotations.some(a => a.type === 'known-error') ||
                        hasTag({ title: test.title, tags: test.tags }, '@known-error');

    // Timeout og avbrudd er feilede forsøk: timeout og så grønt er flaky, ikke passed.
    const attemptFailed = result.status === 'failed' || result.status === 'timedOut' || result.status === 'interrupted';

    // Get or create test info
    let testInfo = this.testsByKey.get(key);
    if (!testInfo) {
      testInfo = {
        test,
        results: [],
        finalStatus: (result.status === 'timedOut' || result.status === 'interrupted') ? 'failed' : result.status,
        totalAttempts: 0,
        failedAttempts: 0,
        isKnownError
      };
      this.testsByKey.set(key, testInfo);
    }

    // Add result
    testInfo.results.push(result);
    testInfo.totalAttempts++;

    // Update status - handle known-error tests specially
    if (isKnownError) {
      // Known error tests: track separately, don't fail CI
      if (attemptFailed) {
        testInfo.failedAttempts++;
        testInfo.finalStatus = 'known-error-failed';
      } else if (result.status === 'passed') {
        testInfo.finalStatus = 'known-error-passed';
      } else if (result.status === 'skipped') {
        testInfo.finalStatus = 'skipped';
      }
    } else {
      // Regular tests: normal status handling
      if (attemptFailed) {
        testInfo.failedAttempts++;
        testInfo.finalStatus = 'failed';
      } else if (result.status === 'passed' && testInfo.failedAttempts > 0) {
        testInfo.finalStatus = 'flaky';
      } else if (result.status === 'passed') {
        testInfo.finalStatus = 'passed';
      } else if (result.status === 'skipped') {
        testInfo.finalStatus = 'skipped';
      }
    }

    // Hvert felt får verdien fra siste feilede forsøk som har en, så et forsøk som timer ut uten
    // prosessfeil, sletter ikke prosessfeilen fra forsøket før. Prosessfeilen fra fiksturens
    // teardown står etter testens egen feil i `errors`, så alle feilene leses.
    if (attemptFailed) {
      const dockerErrors = result.attachments.find(a => a.name === 'docker-logs-errors');
      const processError = (result.errors ?? [])
        .map(e => e.message ?? '')
        .find(message => message.includes('process instance'));

      if (dockerErrors) {
        testInfo.dockerErrors = this.parseAttachment(dockerErrors);
      }
      if (processError) {
        testInfo.processErrors = processError;
      }
    }
  }

  onEnd(result: FullResult) {
    const outputDir = path.join(process.cwd(), 'playwright-report');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Prepare data for shared summary generator
    const tests = Array.from(this.testsByKey.values());

    // Check if retries were disabled (set by workflow when disable_retries input is true)
    const retriesDisabled = process.env.RETRIES_DISABLED === 'true';

    // Check if this was a BDD-only run (set by workflow when run_bdd input is true)
    const bddRun = process.env.RUN_BDD === 'true';

    // Calculate actual CI status (excluding known-error tests from failure count)
    // When retries are disabled, flaky tests count as failures
    const failed = tests.filter(t => t.finalStatus === 'failed').length;
    const flaky = tests.filter(t => t.finalStatus === 'flaky').length;
    const realFailures = retriesDisabled ? (failed + flaky) : failed;
    const ciStatus = realFailures > 0 ? 'failed' : 'passed';

    // Convert internal TestInfo to TestData format
    const testData: TestData[] = tests.map(ti => ({
      title: ti.test.title,
      file: ti.test.location.file,
      status: ti.finalStatus,
      isKnownError: ti.isKnownError,
      totalAttempts: ti.totalAttempts,
      failedAttempts: ti.failedAttempts,
      duration: ti.results.reduce((sum, r) => sum + r.duration, 0),
      error: ti.results[ti.results.length - 1].error?.message,
      dockerErrors: ti.dockerErrors,
      processErrors: ti.processErrors
    }));

    const tags = imageTagsFromEnv(process.env);

    // Collect Unleash toggle overrides pinned for this run (UNLEASH_FORCE_DISABLE/ENABLE)
    const parseToggleList = (value?: string): string[] =>
      (value || '').split(',').map(s => s.trim()).filter(Boolean);
    const forceDisable = parseToggleList(process.env.UNLEASH_FORCE_DISABLE);
    const forceEnable = parseToggleList(process.env.UNLEASH_FORCE_ENABLE);
    const hasOverrides = forceDisable.length > 0 || forceEnable.length > 0;

    const summaryData: TestSummaryData = {
      status: ciStatus,
      startTime: result.startTime,
      duration: result.duration,
      tests: testData,
      tags: Object.keys(tags).length > 0 ? tags : undefined,
      retriesDisabled: retriesDisabled || undefined,
      bddRun: bddRun || undefined,
      unleashOverrides: hasOverrides
        ? {
            forceDisable: forceDisable.length > 0 ? forceDisable : undefined,
            forceEnable: forceEnable.length > 0 ? forceEnable : undefined,
          }
        : undefined
    };

    // Generate summary using shared module
    const summary = generateMarkdownSummary(summaryData);

    // Write markdown summary
    const outputPath = path.join(outputDir, 'test-summary.md');
    fs.writeFileSync(outputPath, summary, 'utf-8');
    console.log(`\n📊 Test summary written to: ${outputPath}`);

    // Write JSON version
    const jsonPath = path.join(outputDir, 'test-summary.json');
    fs.writeFileSync(jsonPath, JSON.stringify(summaryData, null, 2));
    console.log(`📊 JSON summary written to: ${jsonPath}`);

    // Copy metrics files from test-results to playwright-report (if they exist)
    const resultsDir = path.join(process.cwd(), 'test-results');
    const metricsFiles = ['metrics-summary.md', 'metrics-coverage.json'];
    for (const file of metricsFiles) {
      const srcPath = path.join(resultsDir, file);
      if (fs.existsSync(srcPath)) {
        const destPath = path.join(outputDir, file);
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private parseAttachment(attachment: any): any {
    try {
      if (attachment.body) {
        const content = attachment.body.toString('utf-8');
        return JSON.parse(content);
      }
    } catch (e) {
      return null;
    }
    return null;
  }

}

export default TestSummaryReporter;
