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
 * Clean ANSI escape codes and other terminal formatting from a string.
 * Handles:
 * - Standard ANSI escape sequences: \x1b[...m or \u001b[...m
 * - Broken encoding showing as replacement character: �[...]
 * - Spring Boot coloring patterns like [1;31m that appear as literal text
 */
function cleanAnsiCodes(text: string): string {
  return text
    // Standard ANSI escape sequences (hex and unicode escape)
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    // Broken encoding showing as replacement character (�)
    .replace(/�\[[0-9;]*m/g, '')
    // Literal bracket color codes that sometimes appear in logs (e.g., [1;31mERROR[0;39m)
    .replace(/\[([0-9;]+)m/g, '')
    // Clean up any leftover escape sequences
    .replace(/\x1b\[[\d;]*[A-Za-z]/g, '')
    .replace(/\u001b\[[\d;]*[A-Za-z]/g, '');
}

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
  // When retries are disabled, flaky tests are treated as failures
  const realFailures = data.retriesDisabled ? (failed + flaky) : failed;
  const ciStatus = realFailures > 0 ? 'failed' : 'passed';

  let md = '# E2E Test Summary\n\n';

  if (includeTimestamp) {
    md += `**Generated:** ${new Date().toISOString()}\n\n`;
  }

  // Display Docker image tags if available (only non-latest tags)
  if (data.tags && Object.keys(data.tags).length > 0) {
    const tags = data.tags;

    // Filter to only non-latest tags
    const nonLatestTags = Object.entries(tags).filter(([_, value]) => value !== 'latest');

    if (nonLatestTags.length > 0) {
      md += `## 🏷️ Docker Image Tags\n\n`;

      // Sort tags alphabetically for consistent display
      const sortedTags = nonLatestTags.sort((a, b) => a[0].localeCompare(b[0]));
      for (const [key, value] of sortedTags) {
        md += `- **${key}:** \`${value}\`\n`;
      }
      md += '\n';
    }
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

  // Format attempts message based on whether retries are disabled
  const extraAttempts = totalAttempts - totalTests;
  if (extraAttempts === 0) {
    md += `- **Total Attempts:** ${totalAttempts}\n`;
  } else if (data.retriesDisabled) {
    md += `- **Total Attempts:** ${totalAttempts} (repeat_each enabled, retries disabled)\n`;
  } else {
    md += `- **Total Attempts:** ${totalAttempts} (including ${extraAttempts} retries)\n`;
  }

  md += `- **Duration:** ${Math.round(data.duration / 1000)}s\n`;
  md += `- **Status:** ${ciStatus}\n\n`;

  if (knownErrorFailed + knownErrorPassed > 0) {
    md += `> **Note:** ${knownErrorFailed + knownErrorPassed} test(s) marked as @known-error do not affect CI status.\n\n`;
  }

  if (data.retriesDisabled && flaky > 0) {
    md += `> ⚠️ **Retries disabled:** ${flaky} flaky test(s) are treated as failures.\n\n`;
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

  // Docker logs status - show errors regardless of test status (flaky tests can have errors too)
  let dockerStatus = '✅';
  if (testInfo.dockerErrors && testInfo.dockerErrors.length > 0) {
    const services = testInfo.dockerErrors.map(de => `${de.service} (${de.errors.length})`).join(', ');
    dockerStatus = `⚠️ ${services}`;
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
      const cleanError = cleanAnsiCodes(testInfo.error);
      md += `**Error:**\n\`\`\`\n${cleanError}\n\`\`\`\n\n`;
    }

    // Process instance errors
    if (testInfo.processErrors && testInfo.processErrors !== testInfo.error) {
      const cleanProcessError = cleanAnsiCodes(testInfo.processErrors);
      md += `**Process Instance Failures:**\n\`\`\`\n${cleanProcessError}\n\`\`\`\n\n`;
    }

    // Docker log errors
    if (testInfo.dockerErrors && testInfo.dockerErrors.length > 0) {
      md += `**Docker Log Errors:**\n\n`;
      for (const { service, errors } of testInfo.dockerErrors) {
        md += `<details>\n`;
        md += `<summary>🐳 <strong>${service}</strong> (${errors.length} error(s))</summary>\n\n`;
        // Show unique errors with full messages in expandable section
        const uniqueErrors = deduplicateErrors(errors);
        md += `\`\`\`\n`;
        for (const err of uniqueErrors.slice(0, 10)) {
          const cleanMessage = cleanAnsiCodes(err.message);
          md += `[${err.timestamp}] ${cleanMessage}\n\n`;
        }
        if (uniqueErrors.length > 10) {
          md += `... and ${uniqueErrors.length - 10} more unique error(s)\n`;
        }
        md += `\`\`\`\n`;
        md += `</details>\n\n`;
      }
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

  // Group errors by service
  const errorsByService = new Map<string, Array<{ timestamp: string; message: string }>>();
  for (const { service, errors } of dockerErrors) {
    if (!errorsByService.has(service)) {
      errorsByService.set(service, []);
    }
    errorsByService.get(service)!.push(...errors);
  }

  // Sort services by error count
  const sorted = Array.from(errorsByService.entries())
    .sort((a, b) => b[1].length - a[1].length);

  for (const [service, errors] of sorted) {
    const uniqueErrors = deduplicateErrors(errors);

    md += `<details>\n`;
    md += `<summary><strong>${service}</strong>: ${errors.length} error(s) (${uniqueErrors.length} unique)</summary>\n\n`;
    md += `\`\`\`\n`;

    // Show up to 10 unique errors with full messages
    for (const err of uniqueErrors.slice(0, 10)) {
      const cleanMessage = cleanAnsiCodes(err.message);
      md += `[${err.timestamp}] ${cleanMessage}\n\n`;
    }

    if (uniqueErrors.length > 10) {
      md += `... and ${uniqueErrors.length - 10} more unique error(s)\n`;
    }

    md += `\`\`\`\n`;
    md += `</details>\n\n`;
  }

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
