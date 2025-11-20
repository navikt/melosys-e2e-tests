/**
 * Shared test summary generation logic
 *
 * This module contains the core logic for generating markdown summaries
 * from test result data. It's used by both:
 * - reporters/test-summary.ts (Playwright reporter)
 * - scripts/generate-summary-from-json.ts (Standalone script)
 *
 * Benefits:
 * - Single source of truth for summary format
 * - Testable in isolation (see summary-generator.test.ts)
 * - No duplication between reporter and script
 */

import * as path from 'path';
import { TestSummaryData, TestData, DockerError, SummaryOptions } from './types';

/**
 * Generate markdown summary from test data
 *
 * @param data - Test result data (from JSON or reporter)
 * @param options - Generation options
 * @returns Markdown-formatted summary string
 */
export function generateMarkdownSummary(
  data: TestSummaryData,
  options: SummaryOptions = {}
): string {
  const {
    includeArtifactsSection = true,
    includeTimestamp = true,
  } = options;

  const tests = data.tests;

  // Calculate statistics
  const passed = tests.filter(t => t.status === 'passed').length;
  const failed = tests.filter(t => t.status === 'failed').length;
  const skipped = tests.filter(t => t.status === 'skipped').length;
  const flaky = tests.filter(t => t.status === 'flaky').length;
  const knownErrorFailed = tests.filter(t => t.status === 'known-error-failed').length;
  const knownErrorPassed = tests.filter(t => t.status === 'known-error-passed').length;
  const totalTests = tests.length;

  // Count total attempts (including retries)
  const totalAttempts = tests.reduce((sum, t) => sum + t.totalAttempts, 0);

  // Calculate actual CI status (excluding known-error tests from failure count)
  const realFailures = failed; // Only count non-known-error failures
  const ciStatus = realFailures > 0 ? 'failed' : 'passed';

  let md = '# E2E Test Summary\n\n';

  if (includeTimestamp) {
    md += `**Generated:** ${new Date().toISOString()}\n\n`;
  }

  md += `## Overall Results\n\n`;
  md += `- ✅ Passed: ${passed}\n`;
  md += `- ❌ Failed: ${failed}\n`;
  md += `- ⏭️ Skipped: ${skipped}\n`;
  md += `- 🔄 Flaky: ${flaky}\n`;

  if (knownErrorFailed > 0) {
    md += `- ⚠️ Known Error (Failed): ${knownErrorFailed}\n`;
  }
  if (knownErrorPassed > 0) {
    md += `- ✨ Known Error (Passed): ${knownErrorPassed}\n`;
  }

  md += `- **Total Tests:** ${totalTests}\n`;
  md += `- **Total Attempts:** ${totalAttempts} (including ${totalAttempts - totalTests} retries)\n`;
  md += `- **Duration:** ${Math.round(data.duration / 1000)}s\n`;
  md += `- **Status:** ${ciStatus}\n\n`;

  if (knownErrorFailed + knownErrorPassed > 0) {
    md += `> **Note:** ${knownErrorFailed + knownErrorPassed} test(s) marked as @known-error do not affect CI status.\n\n`;
  }

  // Test results table
  if (totalTests > 0) {
    md += generateTestResultsTable(tests);
  }

  // Failed tests section (exclude known-error tests)
  if (failed > 0) {
    md += generateFailedTestsSection(tests.filter(t => t.status === 'failed'));
  }

  // Flaky tests section
  if (flaky > 0) {
    md += generateFlakyTestsSection(tests.filter(t => t.status === 'flaky'));
  }

  // Known error tests sections
  const knownErrorFailedTests = tests.filter(t => t.status === 'known-error-failed');
  const knownErrorPassedTests = tests.filter(t => t.status === 'known-error-passed');

  if (knownErrorFailedTests.length > 0) {
    md += generateKnownErrorFailedSection(knownErrorFailedTests);
  }

  if (knownErrorPassedTests.length > 0) {
    md += generateKnownErrorPassedSection(knownErrorPassedTests);
  }

  // Service Error Summary (across all tests)
  const allDockerErrors = tests
    .filter(t => t.dockerErrors)
    .flatMap(t => t.dockerErrors || []);

  if (allDockerErrors.length > 0) {
    md += generateDockerErrorsSummary(allDockerErrors);
  }

  // Process Error Summary
  const processErrorTests = tests.filter(t => t.processErrors);
  if (processErrorTests.length > 0) {
    md += generateProcessErrorsSummary(processErrorTests);
  }

  // Artifacts section
  if (includeArtifactsSection) {
    md += generateArtifactsSection();
  }

  return md;
}

/**
 * Generate the test results table
 */
function generateTestResultsTable(tests: TestData[]): string {
  let md = `## 📊 Test Results\n\n`;

  // Group by folder and file
  const byFolder = groupTestsByFolder(tests);

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
    tests: TestData[];
  }

  const allFiles: FileWithFolder[] = [];
  byFolder.forEach((files, folderName) => {
    files.forEach((tests, fileName) => {
      allFiles.push({ folderName, fileName, tests });
    });
  });

  // Sort ALL files: files with failures first, then alphabetically
  const sortedAllFiles = allFiles.sort((a, b) => {
    const aHasFailures = a.tests.some(test => test.status === 'failed');
    const bHasFailures = b.tests.some(test => test.status === 'failed');

    if (aHasFailures && !bHasFailures) return -1;
    if (!aHasFailures && bHasFailures) return 1;
    return `${a.folderName}/${a.fileName}`.localeCompare(`${b.folderName}/${b.fileName}`);
  });

  for (const { folderName, fileName, tests: fileTests } of sortedAllFiles) {
    // Sort tests: failed first, then passed
    const sortedTests = fileTests.sort((a, b) => {
      if (a.status === 'failed' && b.status !== 'failed') return -1;
      if (a.status !== 'failed' && b.status === 'failed') return 1;
      return 0;
    });

    // Count failures
    const failedCount = fileTests.filter(t => t.status === 'failed').length;
    const totalCount = fileTests.length;
    const failureInfo = failedCount > 0 ? ` (${failedCount}/${totalCount} failed)` : '';

    // Folder/File header row (TRUE colspan spanning all 6 columns)
    md += '<tr>\n';
    md += `<td colspan="6"><strong>📁 ${folderName} / <code>${fileName}</code>${failureInfo}</strong></td>\n`;
    md += '</tr>\n';

    // Test rows
    for (const testInfo of sortedTests) {
      md += generateTestRow(testInfo);
    }
  }

  md += '</tbody>\n';
  md += '</table>\n\n';
  md += '\n';

  return md;
}

/**
 * Generate a single test row for the table
 */
function generateTestRow(testInfo: TestData): string {
  const statusEmoji = getStatusEmoji(testInfo.status);

  const attempts = testInfo.totalAttempts > 1
    ? `${testInfo.totalAttempts} (${testInfo.failedAttempts} failed)`
    : '1';

  const duration = Math.round(testInfo.duration / 1000) + 's';

  // Playwright status (check if error is playwright-related vs process/docker)
  let playwrightStatus = '✅';
  if (testInfo.status === 'failed' || testInfo.status === 'known-error-failed') {
    const hasPlaywrightError = testInfo.error &&
      !testInfo.error.includes('Docker error') &&
      !testInfo.error.includes('process instance');
    playwrightStatus = hasPlaywrightError ? '❌' : '✅';
  }

  // Docker logs status
  let dockerStatus = '✅';
  if (testInfo.status === 'failed' || testInfo.status === 'known-error-failed') {
    if (testInfo.dockerErrors && testInfo.dockerErrors.length > 0) {
      const services = testInfo.dockerErrors.map(de => `${de.service} (${de.errors.length})`).join(', ');
      dockerStatus = `❌ ${services}`;
    }
  }

  let row = '<tr>\n';
  row += `<td>${testInfo.title}</td>\n`;
  row += `<td>${statusEmoji}</td>\n`;
  row += `<td>${attempts}</td>\n`;
  row += `<td>${playwrightStatus}</td>\n`;
  row += `<td>${dockerStatus}</td>\n`;
  row += `<td>${duration}</td>\n`;
  row += '</tr>\n';

  return row;
}

/**
 * Get status emoji for a test status
 */
function getStatusEmoji(status: TestData['status']): string {
  switch (status) {
    case 'passed': return '✅';
    case 'failed': return '❌';
    case 'flaky': return '🔄';
    case 'known-error-failed': return '⚠️';
    case 'known-error-passed': return '✨';
    case 'skipped': return '⏭️';
    default: return '❓';
  }
}

/**
 * Group tests by folder and file
 */
function groupTestsByFolder(tests: TestData[]): Map<string, Map<string, TestData[]>> {
  const byFolder = new Map<string, Map<string, TestData[]>>();

  for (const test of tests) {
    const filePath = test.file;
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

  return byFolder;
}

/**
 * Generate failed tests section
 */
function generateFailedTestsSection(failedTests: TestData[]): string {
  let md = `## ❌ Failed Tests (${failedTests.length})\n\n`;

  for (const testInfo of failedTests) {
    const filePath = testInfo.file;
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];

    // Find "tests" directory index
    const testsIndex = parts.indexOf('tests');
    let folderPath = 'root';

    if (testsIndex !== -1 && testsIndex < parts.length - 1) {
      const foldersAfterTests = parts.slice(testsIndex + 1, parts.length - 1);
      folderPath = foldersAfterTests.length > 0 ? foldersAfterTests.join('/') : 'root';
    }

    md += `### ${testInfo.title}\n\n`;
    md += `**Folder:** \`${folderPath}\`  \n`;
    md += `**File:** \`${fileName}\`  \n`;
    md += `**Attempts:** ${testInfo.totalAttempts} (${testInfo.failedAttempts} failed)  \n`;
    md += `**Duration:** ${Math.round(testInfo.duration / 1000)}s\n\n`;

    if (testInfo.error) {
      md += `**Error:**\n\`\`\`\n${testInfo.error}\n\`\`\`\n\n`;
    }

    // Process instance errors
    if (testInfo.processErrors && testInfo.processErrors !== testInfo.error) {
      md += `**Process Instance Failures:**\n\`\`\`\n${testInfo.processErrors}\n\`\`\`\n\n`;
    }

    // Docker log errors
    if (testInfo.dockerErrors && testInfo.dockerErrors.length > 0) {
      md += `**Docker Log Errors:**\n\n`;
      for (const { service, errors } of testInfo.dockerErrors) {
        md += `- 🐳 **${service}** (${errors.length} error(s))\n`;
        // Show first 3 unique errors
        const uniqueErrors = deduplicateErrors(errors);
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

  return md;
}

/**
 * Generate flaky tests section
 */
function generateFlakyTestsSection(flakyTests: TestData[]): string {
  let md = `## 🔄 Flaky Tests (${flakyTests.length})\n\n`;
  md += `Tests that failed on some attempts but eventually passed:\n\n`;

  for (const testInfo of flakyTests) {
    md += `- **${testInfo.title}** (\`${path.basename(testInfo.file)}\`)\n`;
    md += `  - Attempts: ${testInfo.totalAttempts} (${testInfo.failedAttempts} failed, ${testInfo.totalAttempts - testInfo.failedAttempts} passed)\n`;
  }
  md += '\n';

  return md;
}

/**
 * Generate known-error failed section
 */
function generateKnownErrorFailedSection(tests: TestData[]): string {
  let md = `## ⚠️ Known Error Tests (Failed) (${tests.length})\n\n`;
  md += `These tests are marked with @known-error and are expected to fail. They do not affect CI status.\n\n`;

  for (const testInfo of tests) {
    md += `- **${testInfo.title}** (\`${path.basename(testInfo.file)}\`)\n`;
    md += `  - Status: Failed as expected\n`;
    md += `  - Attempts: ${testInfo.totalAttempts}\n`;
  }
  md += '\n';

  return md;
}

/**
 * Generate known-error passed section
 */
function generateKnownErrorPassedSection(tests: TestData[]): string {
  let md = `## ✨ Known Error Tests (Passed) (${tests.length})\n\n`;
  md += `These tests are marked with @known-error but are now passing. The bug might be fixed!\n\n`;

  for (const testInfo of tests) {
    md += `- **${testInfo.title}** (\`${path.basename(testInfo.file)}\`)\n`;
    md += `  - Status: ⚠️ **Unexpectedly passing** - consider removing @known-error tag\n`;
    md += `  - Attempts: ${testInfo.totalAttempts}\n`;
  }
  md += '\n';

  return md;
}

/**
 * Generate Docker errors summary
 */
function generateDockerErrorsSummary(dockerErrors: DockerError[]): string {
  let md = `## 🐳 Docker Log Errors by Service\n\n`;

  // Group by service
  const errorsByService = new Map<string, number>();
  for (const { service, errors } of dockerErrors) {
    errorsByService.set(service, (errorsByService.get(service) || 0) + errors.length);
  }

  // Sort by error count
  const sorted = Array.from(errorsByService.entries())
    .sort((a, b) => b[1] - a[1]);

  for (const [service, count] of sorted) {
    md += `- **${service}:** ${count} error(s)\n`;
  }
  md += '\n';

  return md;
}

/**
 * Generate process errors summary
 */
function generateProcessErrorsSummary(processErrorTests: TestData[]): string {
  let md = `## ⚙️ Process Instance Failures\n\n`;
  md += `**Tests with process failures:** ${processErrorTests.length}\n\n`;

  for (const testInfo of processErrorTests) {
    md += `- ${testInfo.title} (\`${path.basename(testInfo.file)}\`)\n`;
  }
  md += '\n';

  return md;
}

/**
 * Generate artifacts section
 */
function generateArtifactsSection(): string {
  let md = `## 📎 Artifacts\n\n`;
  md += `The following artifacts are available for download:\n\n`;
  md += `- \`playwright-report/\` - HTML test report\n`;
  md += `- \`test-results/\` - Individual test results, traces, videos, screenshots\n`;
  md += `- \`playwright-report/*-complete.log\` - Complete Docker logs for each service\n`;
  md += `- \`playwright-report/test-summary.json\` - Machine-readable test summary\n\n`;

  return md;
}

/**
 * Deduplicate error messages
 */
function deduplicateErrors(errors: Array<{ timestamp: string; message: string }>): Array<{ timestamp: string; message: string }> {
  const seen = new Set<string>();
  const unique: Array<{ timestamp: string; message: string }> = [];

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
