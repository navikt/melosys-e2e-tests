import type {
  FullConfig, FullResult, Reporter, Suite, TestCase, TestResult
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Custom Playwright reporter that creates a test summary
 *
 * Creates a markdown summary file showing:
 * - Overall pass/fail statistics
 * - Failed tests with error details
 * - Docker log errors by service
 * - Process instance failures
 *
 * Output: playwright-report/test-summary.md
 */
class TestSummaryReporter implements Reporter {
  private testResults: Array<{
    test: TestCase;
    result: TestResult;
    dockerErrors?: any;
    processErrors?: string;
  }> = [];

  onTestEnd(test: TestCase, result: TestResult) {
    // Collect all test results
    const dockerErrors = result.attachments.find(a => a.name === 'docker-logs-errors');
    const dockerSummary = result.attachments.find(a => a.name === 'docker-logs-summary');

    // Check if error message indicates process failures
    const errorMessage = result.error?.message || '';
    const hasProcessError = errorMessage.includes('process instance');

    this.testResults.push({
      test,
      result,
      dockerErrors: dockerErrors ? this.parseAttachment(dockerErrors) : null,
      processErrors: hasProcessError ? errorMessage : undefined
    });
  }

  onEnd(result: FullResult) {
    // Generate summary
    const summary = this.generateSummary(result);

    // Write to file
    const outputDir = path.join(process.cwd(), 'playwright-report');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'test-summary.md');
    fs.writeFileSync(outputPath, summary, 'utf-8');

    console.log(`\n📊 Test summary written to: ${outputPath}`);

    // Also write JSON version for programmatic access
    const jsonPath = path.join(outputDir, 'test-summary.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
      status: result.status,
      startTime: result.startTime,
      duration: result.duration,
      tests: this.testResults.map(tr => ({
        title: tr.test.title,
        file: tr.test.location.file,
        status: tr.result.status,
        duration: tr.result.duration,
        error: tr.result.error?.message,
        dockerErrors: tr.dockerErrors,
        processErrors: tr.processErrors
      }))
    }, null, 2));

    console.log(`📊 JSON summary written to: ${jsonPath}`);
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

  private generateSummary(result: FullResult): string {
    const passed = this.testResults.filter(tr => tr.result.status === 'passed').length;
    const failed = this.testResults.filter(tr => tr.result.status === 'failed').length;
    const skipped = this.testResults.filter(tr => tr.result.status === 'skipped').length;
    const flaky = this.testResults.filter(tr => tr.result.status === 'flaky').length;

    let md = '# E2E Test Summary\n\n';
    md += `**Generated:** ${new Date().toISOString()}\n\n`;
    md += `## Overall Results\n\n`;
    md += `- ✅ Passed: ${passed}\n`;
    md += `- ❌ Failed: ${failed}\n`;
    md += `- ⏭️ Skipped: ${skipped}\n`;
    md += `- 🔄 Flaky: ${flaky}\n`;
    md += `- **Total:** ${this.testResults.length}\n`;
    md += `- **Duration:** ${Math.round(result.duration / 1000)}s\n`;
    md += `- **Status:** ${result.status}\n\n`;

    // Failed tests section
    if (failed > 0) {
      md += `## ❌ Failed Tests (${failed})\n\n`;

      const failedTests = this.testResults.filter(tr => tr.result.status === 'failed');

      for (const { test, result, dockerErrors, processErrors } of failedTests) {
        md += `### ${test.title}\n\n`;
        md += `**File:** \`${path.basename(test.location.file)}\`\n`;
        md += `**Duration:** ${Math.round(result.duration / 1000)}s\n\n`;

        // Error message
        if (result.error?.message) {
          md += `**Error:**\n\`\`\`\n${result.error.message}\n\`\`\`\n\n`;
        }

        // Process instance errors
        if (processErrors) {
          md += `**Process Instance Failures:**\n\`\`\`\n${processErrors}\n\`\`\`\n\n`;
        }

        // Docker log errors
        if (dockerErrors && Array.isArray(dockerErrors)) {
          md += `**Docker Log Errors:**\n\n`;
          for (const { service, errors } of dockerErrors) {
            md += `- 🐳 **${service}** (${errors.length} error(s))\n`;
            // Show first 3 errors
            for (const err of errors.slice(0, 3)) {
              md += `  - \`[${err.timestamp}]\` ${err.message.substring(0, 100)}\n`;
            }
            if (errors.length > 3) {
              md += `  - _(${errors.length - 3} more errors...)_\n`;
            }
          }
          md += '\n';
        }

        md += '---\n\n';
      }
    }

    // Service Error Summary (across all tests)
    const allDockerErrors = this.testResults
      .filter(tr => tr.dockerErrors)
      .flatMap(tr => tr.dockerErrors);

    if (allDockerErrors.length > 0) {
      md += `## 🐳 Docker Log Errors by Service\n\n`;

      // Group by service
      const errorsByService = new Map<string, number>();
      for (const { service, errors } of allDockerErrors) {
        errorsByService.set(service, (errorsByService.get(service) || 0) + errors.length);
      }

      // Sort by error count
      const sorted = Array.from(errorsByService.entries())
        .sort((a, b) => b[1] - a[1]);

      for (const [service, count] of sorted) {
        md += `- **${service}:** ${count} error(s)\n`;
      }
      md += '\n';
    }

    // Process Error Summary
    const processErrorTests = this.testResults.filter(tr => tr.processErrors);
    if (processErrorTests.length > 0) {
      md += `## ⚙️ Process Instance Failures\n\n`;
      md += `**Tests with process failures:** ${processErrorTests.length}\n\n`;
      for (const { test } of processErrorTests) {
        md += `- ${test.title}\n`;
      }
      md += '\n';
    }

    md += `## 📎 Artifacts\n\n`;
    md += `The following artifacts are available for download:\n\n`;
    md += `- \`playwright-report/\` - HTML test report\n`;
    md += `- \`test-results/\` - Individual test results, traces, videos, screenshots\n`;
    md += `- \`playwright-report/*-complete.log\` - Complete Docker logs for each service\n`;
    md += `- \`playwright-report/test-summary.json\` - Machine-readable test summary\n\n`;

    return md;
  }
}

export default TestSummaryReporter;
