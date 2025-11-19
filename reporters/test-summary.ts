import type {
  FullConfig, FullResult, Reporter, Suite, TestCase, TestResult
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

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
  finalStatus: 'passed' | 'failed' | 'skipped' | 'flaky';
  totalAttempts: number;
  failedAttempts: number;
}

class TestSummaryReporter implements Reporter {
  private testsByKey: Map<string, TestInfo> = new Map();

  onTestEnd(test: TestCase, result: TestResult) {
    // Create unique key for test (file + title)
    const key = `${test.location.file}::${test.title}`;

    // Get or create test info
    let testInfo = this.testsByKey.get(key);
    if (!testInfo) {
      testInfo = {
        test,
        results: [],
        finalStatus: result.status,
        totalAttempts: 0,
        failedAttempts: 0
      };
      this.testsByKey.set(key, testInfo);
    }

    // Add result
    testInfo.results.push(result);
    testInfo.totalAttempts++;

    // Update status
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
    const tests = Array.from(this.testsByKey.values());
    fs.writeFileSync(jsonPath, JSON.stringify({
      status: result.status,
      startTime: result.startTime,
      duration: result.duration,
      tests: tests.map(ti => ({
        title: ti.test.title,
        file: ti.test.location.file,
        status: ti.finalStatus,
        totalAttempts: ti.totalAttempts,
        failedAttempts: ti.failedAttempts,
        duration: ti.results[ti.results.length - 1].duration,
        error: ti.results[ti.results.length - 1].error?.message,
        dockerErrors: ti.dockerErrors,
        processErrors: ti.processErrors
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
    const tests = Array.from(this.testsByKey.values());

    const passed = tests.filter(t => t.finalStatus === 'passed').length;
    const failed = tests.filter(t => t.finalStatus === 'failed').length;
    const skipped = tests.filter(t => t.finalStatus === 'skipped').length;
    const flaky = tests.filter(t => t.finalStatus === 'flaky').length;
    const totalTests = tests.length;

    // Count total attempts (including retries)
    const totalAttempts = tests.reduce((sum, t) => sum + t.totalAttempts, 0);

    let md = '# E2E Test Summary\n\n';
    md += `**Generated:** ${new Date().toISOString()}\n\n`;
    md += `## Overall Results\n\n`;
    md += `- ✅ Passed: ${passed}\n`;
    md += `- ❌ Failed: ${failed}\n`;
    md += `- ⏭️ Skipped: ${skipped}\n`;
    md += `- 🔄 Flaky: ${flaky}\n`;
    md += `- **Total Tests:** ${totalTests}\n`;
    md += `- **Total Attempts:** ${totalAttempts} (including ${totalAttempts - totalTests} retries)\n`;
    md += `- **Duration:** ${Math.round(result.duration / 1000)}s\n`;
    md += `- **Status:** ${result.status}\n\n`;

    // Test summary in one big table
    if (totalTests > 0) {
      md += `## 📊 Test Results\n\n`;

      // Group by folder and file
      const byFolder = new Map<string, Map<string, TestInfo[]>>();

      for (const test of tests) {
        const filePath = test.test.location.file;
        const parts = filePath.split('/');
        const fileName = parts[parts.length - 1];

        // Find "tests" directory index and extract complete path after it
        const testsIndex = parts.indexOf('tests');
        let folderPath = 'root';

        if (testsIndex !== -1 && testsIndex < parts.length - 1) {
          // Get all folders between 'tests' and the filename
          const foldersAfterTests = parts.slice(testsIndex + 1, parts.length - 1);
          folderPath = foldersAfterTests.length > 0 ? foldersAfterTests.join('/') : 'root';
        }

        if (!byFolder.has(folderPath)) {
          byFolder.set(folderPath, new Map());
        }

        const folder = byFolder.get(folderPath)!;
        if (!folder.has(fileName)) {
          folder.set(fileName, []);
        }

        folder.get(fileName)!.push(test);
      }

      // HTML table with proper colspan
      md += '<table>\n';
      md += '<thead>\n';
      md += '<tr>\n';
      md += '<th>Test</th>\n';
      md += '<th>Status</th>\n';
      md += '<th>Attempts</th>\n';
      md += '<th>Playwright</th>\n';
      md += '<th>Docker Logs</th>\n';
      md += '<th>Duration</th>\n';
      md += '</tr>\n';
      md += '</thead>\n';
      md += '<tbody>\n';

      // Flatten all files with their folder info
      interface FileWithFolder {
        folderName: string;
        fileName: string;
        tests: TestInfo[];
      }
      const allFiles: FileWithFolder[] = [];
      byFolder.forEach((files, folderName) => {
        files.forEach((tests, fileName) => {
          allFiles.push({ folderName, fileName, tests });
        });
      });

      // Sort ALL files: files with failures first, then alphabetically
      const sortedAllFiles = allFiles.sort((a, b) => {
        const aHasFailures = a.tests.some(test => test.finalStatus === 'failed');
        const bHasFailures = b.tests.some(test => test.finalStatus === 'failed');

        if (aHasFailures && !bHasFailures) return -1;
        if (!aHasFailures && bHasFailures) return 1;
        return `${a.folderName}/${a.fileName}`.localeCompare(`${b.folderName}/${b.fileName}`);
      });

      for (const { folderName, fileName, tests: fileTests } of sortedAllFiles) {
          // Sort tests: failed first, then passed
          const sortedTests = fileTests.sort((a, b) => {
            if (a.finalStatus === 'failed' && b.finalStatus !== 'failed') return -1;
            if (a.finalStatus !== 'failed' && b.finalStatus === 'failed') return 1;
            return 0;
          });

          // Count failures
          const failedCount = fileTests.filter(t => t.finalStatus === 'failed').length;
          const totalCount = fileTests.length;
          const failureInfo = failedCount > 0 ? ` (${failedCount}/${totalCount} failed)` : '';

          // Folder/File header row (TRUE colspan spanning all 6 columns, left-aligned)
          md += '<tr>\n';
          md += `<td colspan="6"><strong>📁 ${folderName} / <code>${fileName}</code>${failureInfo}</strong></td>\n`;
          md += '</tr>\n';

          // Test rows
          for (const testInfo of sortedTests) {
            const statusEmoji = testInfo.finalStatus === 'passed' ? '✅' :
                               testInfo.finalStatus === 'failed' ? '❌' :
                               testInfo.finalStatus === 'flaky' ? '🔄' : '⏭️';

            const attempts = testInfo.totalAttempts > 1
              ? `${testInfo.totalAttempts} (${testInfo.failedAttempts} failed)`
              : '1';

            const duration = Math.round(testInfo.results[testInfo.results.length - 1].duration / 1000) + 's';

            // Playwright status (check if error is playwright-related vs process/docker)
            let playwrightStatus = '✅';
            if (testInfo.finalStatus === 'failed') {
              const hasPlaywrightError = testInfo.results.some(r =>
                r.status === 'failed' && r.error && !r.error.message.includes('Docker error') && !r.error.message.includes('process instance')
              );
              playwrightStatus = hasPlaywrightError ? '❌' : '✅';
            }

            // Docker logs status
            let dockerStatus = '✅';
            if (testInfo.finalStatus === 'failed') {
              if (testInfo.dockerErrors && Array.isArray(testInfo.dockerErrors) && testInfo.dockerErrors.length > 0) {
                const services = testInfo.dockerErrors.map((de: any) => `${de.service} (${de.errors.length})`).join(', ');
                dockerStatus = `❌ ${services}`;
              }
            }

            md += '<tr>\n';
            md += `<td>${testInfo.test.title}</td>\n`;
            md += `<td>${statusEmoji}</td>\n`;
            md += `<td>${attempts}</td>\n`;
            md += `<td>${playwrightStatus}</td>\n`;
            md += `<td>${dockerStatus}</td>\n`;
            md += `<td>${duration}</td>\n`;
            md += '</tr>\n';
          }
      }

      md += '</tbody>\n';
      md += '</table>\n\n';

      md += '\n';
    }

    // Failed tests section
    if (failed > 0) {
      md += `## ❌ Failed Tests (${failed})\n\n`;

      const failedTests = tests.filter(t => t.finalStatus === 'failed');

      for (const testInfo of failedTests) {
        const { test, dockerErrors, processErrors, totalAttempts, failedAttempts } = testInfo;

        const filePath = test.location.file;
        const parts = filePath.split('/');
        const fileName = parts[parts.length - 1];

        // Find "tests" directory index and extract complete path after it
        const testsIndex = parts.indexOf('tests');
        let folderPath = 'root';

        if (testsIndex !== -1 && testsIndex < parts.length - 1) {
          // Get all folders between 'tests' and the filename
          const foldersAfterTests = parts.slice(testsIndex + 1, parts.length - 1);
          folderPath = foldersAfterTests.length > 0 ? foldersAfterTests.join('/') : 'root';
        }

        md += `### ${test.title}\n\n`;
        md += `**Folder:** \`${folderPath}\`  \n`;
        md += `**File:** \`${fileName}\`  \n`;
        md += `**Attempts:** ${totalAttempts} (${failedAttempts} failed)  \n`;
        md += `**Duration:** ${Math.round(testInfo.results[testInfo.results.length - 1].duration / 1000)}s\n\n`;

        // Get the last error (most recent failure)
        const lastFailedResult = testInfo.results.filter(r => r.status === 'failed').pop();
        if (lastFailedResult?.error?.message) {
          md += `**Error:**\n\`\`\`\n${lastFailedResult.error.message}\n\`\`\`\n\n`;
        }

        // Process instance errors (don't repeat if it's the same as error message)
        if (processErrors && processErrors !== lastFailedResult?.error?.message) {
          md += `**Process Instance Failures:**\n\`\`\`\n${processErrors}\n\`\`\`\n\n`;
        }

        // Docker log errors
        if (dockerErrors && Array.isArray(dockerErrors)) {
          md += `**Docker Log Errors:**\n\n`;
          for (const { service, errors } of dockerErrors) {
            md += `- 🐳 **${service}** (${errors.length} error(s))\n`;
            // Show first 3 unique errors
            const uniqueErrors = this.deduplicateErrors(errors);
            for (const err of uniqueErrors.slice(0, 3)) {
              md += `  - \`[${err.timestamp}]\` ${err.message.substring(0, 100)}\n`;
            }
            if (uniqueErrors.length > 3) {
              md += `  - _(${uniqueErrors.length - 3} more unique errors...)_\n`;
            }
          }
          md += '\n';
        }

        md += '---\n\n';
      }
    }

    // Flaky tests section
    if (flaky > 0) {
      md += `## 🔄 Flaky Tests (${flaky})\n\n`;
      md += `Tests that failed on some attempts but eventually passed:\n\n`;

      const flakyTests = tests.filter(t => t.finalStatus === 'flaky');
      for (const testInfo of flakyTests) {
        md += `- **${testInfo.test.title}** (\`${path.basename(testInfo.test.location.file)}\`)\n`;
        md += `  - Attempts: ${testInfo.totalAttempts} (${testInfo.failedAttempts} failed, ${testInfo.totalAttempts - testInfo.failedAttempts} passed)\n`;
      }
      md += '\n';
    }

    // Service Error Summary (across all tests)
    const allDockerErrors = tests
      .filter(t => t.dockerErrors)
      .flatMap(t => t.dockerErrors);

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
    const processErrorTests = tests.filter(t => t.processErrors);
    if (processErrorTests.length > 0) {
      md += `## ⚙️ Process Instance Failures\n\n`;
      md += `**Tests with process failures:** ${processErrorTests.length}\n\n`;
      for (const testInfo of processErrorTests) {
        md += `- ${testInfo.test.title} (\`${path.basename(testInfo.test.location.file)}\`)\n`;
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

  private getErrorCount(testInfo: TestInfo): number {
    let count = 0;
    if (testInfo.dockerErrors && Array.isArray(testInfo.dockerErrors)) {
      for (const { errors } of testInfo.dockerErrors) {
        count += errors.length;
      }
    }
    if (testInfo.processErrors) {
      count++;
    }
    return count;
  }

  private getDockerErrorServices(testInfo: TestInfo): string[] {
    const services: string[] = [];
    if (testInfo.dockerErrors && Array.isArray(testInfo.dockerErrors)) {
      for (const { service, errors } of testInfo.dockerErrors) {
        if (errors.length > 0) {
          services.push(`❌ ${service} (${errors.length})`);
        }
      }
    }
    return services;
  }

  private deduplicateErrors(errors: any[]): any[] {
    const seen = new Set<string>();
    const unique: any[] = [];

    for (const err of errors) {
      // Create a key from the error message (ignore timestamp)
      const key = err.message.substring(0, 200); // First 200 chars
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(err);
      }
    }

    return unique;
  }
}

export default TestSummaryReporter;
