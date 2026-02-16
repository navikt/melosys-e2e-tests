import type {
  FullConfig, FullResult, Reporter, Suite, TestCase, TestResult
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import { generateMarkdownSummary } from '../lib/summary-generator';
import { TestSummaryData, TestData } from '../lib/types';

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

    // Check if test is marked as known-error
    const isKnownError = test.annotations.some(a => a.type === 'known-error') ||
                        test.title.toLowerCase().includes('@known-error');

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
      if (result.status === 'failed') {
        testInfo.failedAttempts++;
        testInfo.finalStatus = 'known-error-failed';
      } else if (result.status === 'passed') {
        testInfo.finalStatus = 'known-error-passed';
      } else if (result.status === 'skipped') {
        testInfo.finalStatus = 'skipped';
      }
    } else {
      // Regular tests: normal status handling
      if (result.status === 'failed') {
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

    // Collect errors from the last failed attempt (most recent)
    if (result.status === 'failed') {
      const dockerErrors = result.attachments.find(a => a.name === 'docker-logs-errors');
      const errorMessage = result.error?.message || '';
      const hasProcessError = errorMessage.includes('process instance');

      testInfo.dockerErrors = dockerErrors ? this.parseAttachment(dockerErrors) : null;
      testInfo.processErrors = hasProcessError ? errorMessage : undefined;
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

    // Collect Docker image tags from environment variables
    const tags: Record<string, string> = {};
    const tagEnvVars = [
      { key: 'melosys-api', envVar: 'MELOSYS_API_TAG' },
      { key: 'melosys-web', envVar: 'MELOSYS_WEB_TAG' },
      { key: 'faktureringskomponenten', envVar: 'FAKTURERINGSKOMPONENTEN_TAG' },
      { key: 'melosys-trygdeavgift-beregning', envVar: 'MELOSYS_TRYGDEAVGIFT_TAG' },
      { key: 'melosys-trygdeavtale', envVar: 'MELOSYS_TRYGDEAVTALE_TAG' },
      { key: 'melosys-inngangsvilkar', envVar: 'MELOSYS_INNGANGSVILKAR_TAG' },
      { key: 'melosys-eessi', envVar: 'MELOSYS_EESSI_TAG' },
      { key: 'melosys-mock', envVar: 'MELOSYS_MOCK_TAG' },
    ];

    for (const { key, envVar } of tagEnvVars) {
      const value = process.env[envVar];
      if (value) {
        tags[key] = value;
      }
    }

    const summaryData: TestSummaryData = {
      status: ciStatus,
      startTime: result.startTime,
      duration: result.duration,
      tests: testData,
      tags: Object.keys(tags).length > 0 ? tags : undefined,
      retriesDisabled: retriesDisabled || undefined
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
