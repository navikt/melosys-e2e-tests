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

  // Display Unleash toggle overrides if any toggles were pinned for this run
  const overrides = data.unleashOverrides;
  if (overrides && ((overrides.forceDisable?.length ?? 0) > 0 || (overrides.forceEnable?.length ?? 0) > 0)) {
    md += `## 🎚️ Unleash Toggle Overrides\n\n`;
    for (const name of overrides.forceDisable ?? []) {
      md += `- ❌ **OFF:** \`${name}\`\n`;
    }
    for (const name of overrides.forceEnable ?? []) {
      md += `- ✅ **ON:** \`${name}\`\n`;
    }
    md += '\n';
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

  md += `- **Duration:** ${formatDuration(data.duration)}\n`;
  md += `- **Status:** ${ciStatus}\n\n`;

  if (knownErrorFailed + knownErrorPassed > 0) {
    md += `> **Note:** ${knownErrorFailed + knownErrorPassed} test(s) marked as @known-error do not affect CI status.\n\n`;
  }

  if (data.retriesDisabled && flaky > 0) {
    md += `> ⚠️ **Retries disabled:** ${flaky} flaky test(s) are treated as failures.\n\n`;
  }

  // Needs-attention panel: hoist failures + flaky to the very top
  md += generateNeedsAttentionPanel(tests);

  // Test results table (grouped by domain, collapsible, with duration rollup)
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
 * Format a millisecond duration as a compact human string ("8s", "4m 12s").
 */
function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

/** First non-blank line of a (possibly multi-line) string. */
function firstLine(text: string): string {
  return (text || '').split('\n').map(l => l.trim()).find(Boolean) || '';
}

/** Light escape so error snippets can't break the surrounding HTML table. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface ParsedTestPath {
  domain: string;  // top-level folder under tests/ (e.g. "eu-eos")
  sub: string;     // any nested folders (e.g. "unntak")
  base: string;    // raw filename (e.g. "eu-eos-art13-...spec.ts")
  label: string;   // de-duplicated label (domain prefix + .spec.ts stripped)
}

/**
 * Parse a test file path into domain / file label, stripping the redundant
 * leading "<domain>-" so file labels don't repeat the folder name.
 */
function parseTestPath(file: string): ParsedTestPath {
  const parts = file.split('/');
  const i = parts.indexOf('tests');
  const after = i !== -1 ? parts.slice(i + 1) : parts.slice(-1);
  const base = after[after.length - 1];
  const domain = after.length > 1 ? after[0] : 'root';
  const sub = after.length > 2 ? after.slice(1, -1).join('/') : '';

  let label = base.replace(/\.spec\.ts$/, '');
  if (domain !== 'root' && label.startsWith(`${domain}-`)) {
    label = label.slice(domain.length + 1);
  }
  if (sub) label = `${sub}/${label}`;
  return { domain, sub, base, label };
}

interface DomainGroup {
  name: string;
  tests: TestData[];
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  knownErrorFailed: number;
  knownErrorPassed: number;
  duration: number;
  hasFail: boolean;
}

/** Group tests by top-level domain folder; failing domains sort first. */
function groupTestsByDomain(tests: TestData[]): DomainGroup[] {
  const map = new Map<string, TestData[]>();
  for (const t of tests) {
    const { domain } = parseTestPath(t.file);
    if (!map.has(domain)) map.set(domain, []);
    map.get(domain)!.push(t);
  }

  const groups: DomainGroup[] = Array.from(map.entries()).map(([name, ts]) => {
    const count = (s: TestData['status']) => ts.filter(t => t.status === s).length;
    const failed = count('failed');
    const flaky = count('flaky');
    return {
      name,
      tests: ts,
      passed: count('passed'),
      failed,
      flaky,
      skipped: count('skipped'),
      knownErrorFailed: count('known-error-failed'),
      knownErrorPassed: count('known-error-passed'),
      duration: ts.reduce((sum, t) => sum + t.duration, 0),
      hasFail: failed > 0 || flaky > 0,
    };
  });

  groups.sort((a, b) =>
    (Number(b.hasFail) - Number(a.hasFail)) || a.name.localeCompare(b.name));
  return groups;
}

interface FileGroup {
  label: string;
  tests: TestData[];
  duration: number;
  hasFail: boolean;
}

/** Group a domain's tests by file label; failing files (and tests) sort first. */
function groupTestsByFile(tests: TestData[]): FileGroup[] {
  const map = new Map<string, TestData[]>();
  for (const t of tests) {
    const { label } = parseTestPath(t.file);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(t);
  }

  const files: FileGroup[] = Array.from(map.entries()).map(([label, ts]) => ({
    label,
    tests: ts,
    duration: ts.reduce((sum, t) => sum + t.duration, 0),
    hasFail: ts.some(t => t.status === 'failed' || t.status === 'flaky'),
  }));

  const isBad = (t: TestData) => t.status === 'failed' || t.status === 'flaky';
  for (const f of files) {
    f.tests.sort((a, b) => Number(isBad(b)) - Number(isBad(a)));
  }
  files.sort((a, b) =>
    (Number(b.hasFail) - Number(a.hasFail)) || a.label.localeCompare(b.label));
  return files;
}

/**
 * Needs-attention panel: a compact list of failed/flaky tests hoisted above
 * the per-domain table, so problems are the first thing you read.
 */
function generateNeedsAttentionPanel(tests: TestData[]): string {
  const bad = tests.filter(t => t.status === 'failed' || t.status === 'flaky');
  if (bad.length === 0) return '';

  let md = `## ❗ Needs Attention (${bad.length})\n\n`;
  md += '<table>\n<thead>\n<tr><th>Test</th><th>Where</th><th>Why</th><th>Duration</th></tr>\n</thead>\n<tbody>\n';
  for (const t of bad) {
    const { domain, label } = parseTestPath(t.file);
    let why: string;
    if (t.status === 'flaky') {
      why = `🔄 flaky (${t.failedAttempts}/${t.totalAttempts} failed)`;
    } else if (t.error) {
      why = `<code>${escapeHtml(firstLine(cleanAnsiCodes(t.error)).slice(0, 140))}</code>`;
    } else {
      why = 'failed';
    }
    md += `<tr><td>${getStatusEmoji(t.status)} ${t.title}</td><td><code>${domain}/${label}</code></td><td>${why}</td><td>${formatDuration(t.duration)}</td></tr>\n`;
  }
  md += '</tbody>\n</table>\n\n';
  return md;
}

/**
 * Generate the test results table: one collapsible <details> per domain,
 * failing domains expanded and first, each summary carrying counts and a
 * summed duration.
 */
function generateTestResultsTable(tests: TestData[]): string {
  let md = `## 📊 Test Results\n\n`;
  for (const group of groupTestsByDomain(tests)) {
    md += generateDomainGroup(group);
  }
  return md;
}

/** Render one domain as a collapsible section with a per-file/per-test table. */
function generateDomainGroup(group: DomainGroup): string {
  const open = group.hasFail ? ' open' : '';
  const icon = group.hasFail ? '❌' : '✅';

  const counts = [
    group.passed ? `${group.passed} ✅` : null,
    group.failed ? `${group.failed} ❌` : null,
    group.flaky ? `${group.flaky} 🔄` : null,
    group.knownErrorFailed ? `${group.knownErrorFailed} ⚠️` : null,
    group.knownErrorPassed ? `${group.knownErrorPassed} ✨` : null,
    group.skipped ? `${group.skipped} ⏭️` : null,
  ].filter(Boolean).join(' · ');

  let md = `<details${open}>\n`;
  md += `<summary>${icon} <strong>${group.name}</strong> — ${counts} · ⏱️ ${formatDuration(group.duration)}</summary>\n\n`;
  md += '<table>\n<thead>\n<tr><th>Test</th><th>Status</th><th>Attempts</th><th>Duration</th></tr>\n</thead>\n<tbody>\n';

  for (const file of groupTestsByFile(group.tests)) {
    md += `<tr><td colspan="4"><sub>📄 ${file.label} · ${formatDuration(file.duration)}</sub></td></tr>\n`;
    for (const testInfo of file.tests) {
      md += generateTestRow(testInfo);
    }
  }

  md += '</tbody>\n</table>\n</details>\n\n';
  return md;
}

/**
 * Generate a single test row. Docker log issues are shown as an inline badge
 * under the title rather than a dedicated column.
 */
function generateTestRow(testInfo: TestData): string {
  const statusEmoji = getStatusEmoji(testInfo.status);

  const attempts = testInfo.totalAttempts > 1
    ? `${testInfo.totalAttempts} (${testInfo.failedAttempts} failed)`
    : '1';

  const duration = formatDuration(testInfo.duration);

  let dockerBadge = '';
  if (testInfo.dockerErrors && testInfo.dockerErrors.length > 0) {
    const n = testInfo.dockerErrors.reduce((sum, de) => sum + de.errors.length, 0);
    const services = testInfo.dockerErrors.map(de => de.service).join(', ');
    dockerBadge = ` <sub>🐳 ${services} (${n})</sub>`;
  }

  let row = '<tr>\n';
  row += `<td>${testInfo.title}${dockerBadge}</td>\n`;
  row += `<td>${statusEmoji}</td>\n`;
  row += `<td>${attempts}</td>\n`;
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
