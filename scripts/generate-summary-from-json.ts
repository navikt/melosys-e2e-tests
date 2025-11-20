#!/usr/bin/env ts-node

/**
 * Standalone script to generate test-summary.md from test-summary.json
 *
 * This script reads the JSON summary created by the Playwright reporter
 * and regenerates the markdown summary using the shared generator logic.
 *
 * Useful for:
 * - Regenerating summary with different options
 * - Creating custom summaries from test results
 * - Testing summary generation without running tests
 *
 * Usage:
 *   node scripts/generate-summary-from-json.ts
 *   ts-node scripts/generate-summary-from-json.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateMarkdownSummary } from '../lib/summary-generator';
import { TestSummaryData } from '../lib/types';

function main() {
  // Read test-summary.json
  const summaryPath = path.join(__dirname, '..', 'test-summary.json');

  if (!fs.existsSync(summaryPath)) {
    console.error('❌ Error: test-summary.json not found');
    console.error(`   Expected path: ${summaryPath}`);
    console.error('   Run tests first to generate the JSON file.');
    process.exit(1);
  }

  const data: TestSummaryData = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

  // Generate markdown summary using shared module
  const markdown = generateMarkdownSummary(data);

  // Write to file
  const outputPath = path.join(__dirname, '..', 'test-summary.md');
  fs.writeFileSync(outputPath, markdown, 'utf8');

  // Print statistics
  const passed = data.tests.filter(t => t.status === 'passed').length;
  const failed = data.tests.filter(t => t.status === 'failed').length;
  const skipped = data.tests.filter(t => t.status === 'skipped').length;
  const knownErrorFailed = data.tests.filter(t => t.status === 'known-error-failed').length;
  const knownErrorPassed = data.tests.filter(t => t.status === 'known-error-passed').length;
  const durationSeconds = Math.round(data.duration / 1000);

  console.log('✅ Generated test-summary.md');
  console.log(`   Tests: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (knownErrorFailed > 0) {
    console.log(`   Known Errors: ${knownErrorFailed} failed (expected)`);
  }
  if (knownErrorPassed > 0) {
    console.log(`   Known Errors: ${knownErrorPassed} passed (bug might be fixed!)`);
  }
  console.log(`   Duration: ${durationSeconds}s`);
  console.log(`   Status: ${data.status}`);
}

main();
