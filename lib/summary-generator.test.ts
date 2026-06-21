/**
 * Unit tests for summary-generator
 *
 * These tests verify the markdown generation logic works correctly
 * for all test scenarios without running actual E2E tests.
 *
 * Run tests:
 *   npm run test:unit
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { generateMarkdownSummary } from './summary-generator';
import { TestSummaryData, TestData } from './types';

describe('Summary Generator', () => {

  describe('CI Status Calculation', () => {

    test('should mark CI as passed when all tests pass', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({ title: 'test1', status: 'passed' }),
          createTest({ title: 'test2', status: 'passed' }),
        ]
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('**Status:** passed'));
      assert(result.includes('✅ Passed: 2'));
      assert(result.includes('❌ Failed: 0'));
    });

    test('should mark CI as failed when regular test fails', () => {
      const data: TestSummaryData = {
        status: 'failed',
        duration: 10000,
        tests: [
          createTest({ title: 'test1', status: 'passed' }),
          createTest({ title: 'test2', status: 'failed' }),
        ]
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('**Status:** failed'));
      assert(result.includes('✅ Passed: 1'));
      assert(result.includes('❌ Failed: 1'));
    });

    test('should mark CI as passed when only known-error test fails', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({ title: 'test1', status: 'passed' }),
          createTest({
            title: 'test2 @known-error',
            status: 'known-error-failed',
            isKnownError: true
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      // CI should pass because only known-error failed
      assert(result.includes('**Status:** passed'));
      assert(result.includes('✅ Passed: 1'));
      assert(result.includes('⚠️ Known Error (Failed): 1'));
      assert(result.includes('❌ Failed: 0'));
    });

    test('should mark CI as failed when both regular and known-error tests fail', () => {
      const data: TestSummaryData = {
        status: 'failed',
        duration: 10000,
        tests: [
          createTest({ title: 'test1', status: 'failed' }),
          createTest({
            title: 'test2 @known-error',
            status: 'known-error-failed',
            isKnownError: true
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      // CI should fail because of regular failure
      assert(result.includes('**Status:** failed'));
      assert(result.includes('❌ Failed: 1'));
      assert(result.includes('⚠️ Known Error (Failed): 1'));
    });

  });

  describe('Known Error Tests', () => {

    test('should show known-error-failed test with warning emoji', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({
            title: 'tax calculation bug @known-error #JIRA-123',
            status: 'known-error-failed',
            isKnownError: true
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('⚠️ Known Error (Failed): 1'));
      assert(result.includes('⚠️')); // Emoji in table
      assert(result.includes('## ⚠️ Known Error Tests (Failed)'));
      assert(result.includes('Failed as expected'));
      assert(result.includes('do not affect CI status'));
    });

    test('should show known-error-passed test with sparkle emoji and warning', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({
            title: 'previously failing test @known-error',
            status: 'known-error-passed',
            isKnownError: true
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('✨ Known Error (Passed): 1'));
      assert(result.includes('✨')); // Emoji in table
      assert(result.includes('## ✨ Known Error Tests (Passed)'));
      assert(result.includes('bug might be fixed'));
      assert(result.includes('Unexpectedly passing'));
      assert(result.includes('consider removing @known-error tag'));
    });

    test('should show note about known-error tests not affecting CI', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({
            title: 'test1 @known-error',
            status: 'known-error-failed',
            isKnownError: true
          }),
          createTest({
            title: 'test2 @known-error',
            status: 'known-error-passed',
            isKnownError: true
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('> **Note:** 2 test(s) marked as @known-error do not affect CI status'));
    });

  });

  describe('Test Status Emojis', () => {

    test('should use correct emoji for each test status', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({ title: 'passed', status: 'passed' }),
          createTest({ title: 'failed', status: 'failed' }),
          createTest({ title: 'skipped', status: 'skipped' }),
          createTest({ title: 'flaky', status: 'flaky' }),
          createTest({ title: 'known-failed', status: 'known-error-failed', isKnownError: true }),
          createTest({ title: 'known-passed', status: 'known-error-passed', isKnownError: true }),
        ]
      };

      const result = generateMarkdownSummary(data);

      // Check that all emojis are present
      assert(result.includes('✅')); // passed
      assert(result.includes('❌')); // failed
      assert(result.includes('⏭️')); // skipped
      assert(result.includes('🔄')); // flaky
      assert(result.includes('⚠️')); // known-error-failed
      assert(result.includes('✨')); // known-error-passed
    });

  });

  describe('Retry Attempts', () => {

    test('should show single attempt for tests that pass first time', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({
            title: 'test1',
            status: 'passed',
            totalAttempts: 1,
            failedAttempts: 0
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('<td>1</td>')); // Should show "1", not "1 (0 failed)"
    });

    test('should show multiple attempts with failure count', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({
            title: 'flaky test',
            status: 'flaky',
            totalAttempts: 3,
            failedAttempts: 2
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('3 (2 failed)'));
      assert(result.includes('**Total Attempts:** 3 (including 2 retries)'));
    });

    test('should calculate total attempts correctly', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({ totalAttempts: 1 }),
          createTest({ totalAttempts: 3 }),
          createTest({ totalAttempts: 2 }),
        ]
      };

      const result = generateMarkdownSummary(data);

      // Total attempts: 1 + 3 + 2 = 6
      // Retries: 6 - 3 tests = 3
      assert(result.includes('**Total Attempts:** 6 (including 3 retries)'));
    });

  });

  describe('Failed Tests Section', () => {

    test('should show failed test with error message', () => {
      const data: TestSummaryData = {
        status: 'failed',
        duration: 10000,
        tests: [
          createTest({
            title: 'my failing test',
            status: 'failed',
            error: 'Timeout 10000ms exceeded.\nExpected: visible\nReceived: hidden'
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('## ❌ Failed Tests (1)'));
      assert(result.includes('### my failing test'));
      assert(result.includes('**Error:**'));
      assert(result.includes('Timeout 10000ms exceeded'));
    });

    test('should not include known-error-failed tests in failed section', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({ title: 'real failure', status: 'failed' }),
          createTest({
            title: 'known bug @known-error',
            status: 'known-error-failed',
            isKnownError: true
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      // Failed section should only have 1 test (not 2)
      assert(result.includes('## ❌ Failed Tests (1)'));
      assert(result.includes('real failure'));
      assert(!result.includes('## ❌ Failed Tests (2)'));

      // Known error should be in separate section
      assert(result.includes('## ⚠️ Known Error Tests (Failed) (1)'));
      assert(result.includes('known bug @known-error'));
    });

  });

  describe('Flaky Tests Section', () => {

    test('should show flaky test with attempt details', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({
            title: 'unstable test',
            status: 'flaky',
            totalAttempts: 3,
            failedAttempts: 2
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('## 🔄 Flaky Tests (1)'));
      assert(result.includes('unstable test'));
      assert(result.includes('Attempts: 3 (2 failed, 1 passed)'));
    });

  });

  describe('Docker and Process Errors', () => {

    test('should show Docker errors in failed test details', () => {
      const data: TestSummaryData = {
        status: 'failed',
        duration: 10000,
        tests: [
          createTest({
            title: 'test with docker errors',
            status: 'failed',
            dockerErrors: [{
              service: 'melosys-api',
              errors: [
                { timestamp: '2025-01-01T12:00:00Z', message: 'SQL Error: ORA-00001' },
                { timestamp: '2025-01-01T12:00:01Z', message: 'Connection timeout' },
              ]
            }]
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('**Docker Log Errors:**'));
      assert(result.includes('🐳 <strong>melosys-api</strong> (2 error(s))'));
      assert(result.includes('SQL Error: ORA-00001'));
    });

    test('should show Docker errors summary by service', () => {
      const data: TestSummaryData = {
        status: 'failed',
        duration: 10000,
        tests: [
          createTest({
            status: 'failed',
            dockerErrors: [{
              service: 'melosys-api',
              errors: [{ timestamp: '12:00:00', message: 'error1' }, { timestamp: '12:00:01', message: 'error2' }]
            }]
          }),
          createTest({
            status: 'failed',
            dockerErrors: [{
              service: 'melosys-web',
              errors: [{ timestamp: '12:00:02', message: 'error3' }]
            }]
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('## 🐳 Docker Log Errors by Service'));
      // Rendered as collapsible <details> per service with the error messages inside
      assert(result.includes('<strong>melosys-api</strong>: 2 error(s)'));
      assert(result.includes('<strong>melosys-web</strong>: 1 error(s)'));
      // Should show actual error messages
      assert(result.includes('error1'));
      assert(result.includes('error2'));
      assert(result.includes('error3'));
    });

    test('should show process errors summary', () => {
      const data: TestSummaryData = {
        status: 'failed',
        duration: 10000,
        tests: [
          createTest({
            title: 'test1',
            status: 'failed',
            processErrors: 'Process instance failed'
          }),
          createTest({
            title: 'test2',
            status: 'failed',
            processErrors: 'Another process error'
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('## ⚙️ Process Instance Failures'));
      assert(result.includes('**Tests with process failures:** 2'));
      assert(result.includes('test1'));
      assert(result.includes('test2'));
    });

  });

  describe('Domain Grouping', () => {

    test('should group tests into collapsible domain sections with file sub-headers', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({
            title: 'test1',
            file: 'tests/eu-eos/scenario1.spec.ts'
          }),
          createTest({
            title: 'test2',
            file: 'tests/eu-eos/scenario1.spec.ts'
          }),
          createTest({
            title: 'test3',
            file: 'tests/trygdeavgift/calculation.spec.ts'
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      // Collapsible domain sections (all-pass domains are collapsed)
      assert(result.includes('<summary>✅ <strong>eu-eos</strong>'));
      assert(result.includes('<summary>✅ <strong>trygdeavgift</strong>'));
      // File sub-header rows inside the domain table
      assert(result.includes('📄 scenario1'));
      assert(result.includes('📄 calculation'));
    });

    test('should strip the redundant domain prefix from file labels', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({
            title: 'test1',
            file: 'tests/eu-eos/eu-eos-art13-arbeid-flere-land.spec.ts'
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      // The "eu-eos-" prefix and ".spec.ts" are stripped so the domain isn't repeated
      assert(result.includes('📄 art13-arbeid-flere-land'));
      assert(!result.includes('eu-eos-art13'));
    });

    test('should sort failing domains first and expand them', () => {
      const data: TestSummaryData = {
        status: 'failed',
        duration: 10000,
        tests: [
          createTest({
            title: 'passing test',
            file: 'tests/aaa/pass.spec.ts',
            status: 'passed'
          }),
          createTest({
            title: 'failing test',
            file: 'tests/zzz/fail.spec.ts',
            status: 'failed'
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      // Failing domain 'zzz' should appear before passing 'aaa', despite alpha order
      const zzzIndex = result.indexOf('<strong>zzz</strong>');
      const aaaIndex = result.indexOf('<strong>aaa</strong>');

      assert(zzzIndex !== -1 && aaaIndex !== -1);
      assert(zzzIndex < aaaIndex);
      // Failing domain is expanded, passing domain stays collapsed
      assert(result.includes('<details open>\n<summary>❌ <strong>zzz</strong>'));
      assert(result.includes('<details>\n<summary>✅ <strong>aaa</strong>'));
    });

    test('should hoist failures into a Needs Attention panel above the table', () => {
      const data: TestSummaryData = {
        status: 'failed',
        duration: 10000,
        tests: [
          createTest({
            title: 'broken scenario',
            file: 'tests/eu-eos/eu-eos-foo.spec.ts',
            status: 'failed',
            error: "expect(received).toBe(expected)\nExpected: 'AVSLUTTET'"
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('## ❗ Needs Attention (1)'));
      assert(result.includes('<code>eu-eos/foo</code>')); // de-duplicated location
      // Panel appears before the per-domain table
      assert(result.indexOf('## ❗ Needs Attention') < result.indexOf('## 📊 Test Results'));
    });

  });

  describe('Duration Rollup', () => {

    test('should sum and format duration per domain group', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 250000,
        tests: [
          createTest({ title: 't1', file: 'tests/eu-eos/a.spec.ts', duration: 90000 }),
          createTest({ title: 't2', file: 'tests/eu-eos/b.spec.ts', duration: 160000 }),
        ]
      };

      const result = generateMarkdownSummary(data);

      // 90s + 160s = 250s = 4m 10s rolled up onto the domain summary line
      assert(result.includes('⏱️ 4m 10s</summary>'));
    });

  });

  describe('Options', () => {

    test('should exclude artifacts section when option is false', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: []
      };

      const result = generateMarkdownSummary(data, { includeArtifactsSection: false });

      assert(!result.includes('## 📎 Artifacts'));
    });

    test('should exclude timestamp when option is false', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: []
      };

      const result = generateMarkdownSummary(data, { includeTimestamp: false });

      assert(!result.includes('**Generated:**'));
    });

  });

  describe('Edge Cases', () => {

    test('should handle empty test array', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 0,
        tests: []
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('**Total Tests:** 0'));
      assert(result.includes('**Status:** passed'));
    });

    test('should handle test with very long title', () => {
      const longTitle = 'a'.repeat(500);
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({ title: longTitle, status: 'passed' }),
        ]
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes(longTitle));
    });

    test('should handle special characters in test title', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({ title: 'test with <html> & "quotes"', status: 'passed' }),
        ]
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('test with <html> & "quotes"'));
    });

  });

  describe('Duration Formatting', () => {

    test('should format duration in seconds', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 45678, // milliseconds
        tests: []
      };

      const result = generateMarkdownSummary(data);

      // 45678ms = 45.678s ≈ 46s
      assert(result.includes('**Duration:** 46s'));
    });

  });

  describe('Docker Image Tags', () => {

    test('should display only non-latest tags', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [],
        tags: {
          'melosys-api': 'v1.2.3',
          'melosys-web': 'latest',
          'faktureringskomponenten': 'dev-branch-abc123'
        }
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('## 🏷️ Docker Image Tags'));
      assert(result.includes('**melosys-api:** `v1.2.3`'));
      assert(!result.includes('**melosys-web:** `latest`')); // latest should NOT be shown
      assert(result.includes('**faktureringskomponenten:** `dev-branch-abc123`'));
    });

    test('should sort non-latest tags alphabetically', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [],
        tags: {
          'zzz-service': 'v2.0.0',
          'aaa-service': 'v1.0.0',
          'mmm-service': 'dev',
          'bbb-service': 'latest' // should be excluded
        }
      };

      const result = generateMarkdownSummary(data);

      // Find indices to ensure alphabetical order (only non-latest)
      const aaaIndex = result.indexOf('**aaa-service:**');
      const mmmIndex = result.indexOf('**mmm-service:**');
      const zzzIndex = result.indexOf('**zzz-service:**');

      assert(aaaIndex < mmmIndex);
      assert(mmmIndex < zzzIndex);
      assert(!result.includes('**bbb-service:**')); // latest should be excluded
    });

    test('should not display tags section when no tags provided', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: []
        // No tags field
      };

      const result = generateMarkdownSummary(data);

      assert(!result.includes('## 🏷️ Docker Image Tags'));
    });

    test('should not display tags section when tags object is empty', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [],
        tags: {}
      };

      const result = generateMarkdownSummary(data);

      assert(!result.includes('## 🏷️ Docker Image Tags'));
    });

    test('should not display tags section when all tags are latest', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [],
        tags: {
          'melosys-api': 'latest',
          'melosys-web': 'latest',
          'faktureringskomponenten': 'latest'
        }
      };

      const result = generateMarkdownSummary(data);

      assert(!result.includes('## 🏷️ Docker Image Tags'));
    });

  });

  describe('Retries Disabled Mode', () => {

    test('should mark CI as failed when flaky and retriesDisabled is true', () => {
      const data: TestSummaryData = {
        status: 'passed', // This will be recalculated by generateMarkdownSummary
        duration: 10000,
        tests: [
          createTest({ title: 'test1', status: 'passed' }),
          createTest({ title: 'flaky test', status: 'flaky', totalAttempts: 10, failedAttempts: 1 }),
        ],
        retriesDisabled: true
      };

      const result = generateMarkdownSummary(data);

      // With retriesDisabled, flaky tests count as failures
      assert(result.includes('**Status:** failed'));
      assert(result.includes('⚠️ **Retries disabled:** 1 flaky test(s) are treated as failures'));
    });

    test('should mark CI as passed when flaky and retriesDisabled is false', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({ title: 'test1', status: 'passed' }),
          createTest({ title: 'flaky test', status: 'flaky', totalAttempts: 3, failedAttempts: 1 }),
        ],
        retriesDisabled: false
      };

      const result = generateMarkdownSummary(data);

      // Without retriesDisabled, flaky tests don't count as failures
      assert(result.includes('**Status:** passed'));
      assert(!result.includes('⚠️ **Retries disabled:**'));
    });

    test('should show correct attempts text when retriesDisabled is true', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({ title: 'test1', status: 'passed', totalAttempts: 10 }),
        ],
        retriesDisabled: true
      };

      const result = generateMarkdownSummary(data);

      // Should not say "retries" when retries are disabled
      assert(result.includes('repeat_each enabled, retries disabled'));
      assert(!result.includes('including 9 retries'));
    });

    test('should show retries text when retriesDisabled is false', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({ title: 'test1', status: 'passed', totalAttempts: 3 }),
        ],
        retriesDisabled: false
      };

      const result = generateMarkdownSummary(data);

      // Should say "retries" when retries are enabled
      assert(result.includes('including 2 retries'));
    });

    test('should not show retries text when only 1 attempt', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [
          createTest({ title: 'test1', status: 'passed', totalAttempts: 1 }),
        ],
        retriesDisabled: false
      };

      const result = generateMarkdownSummary(data);

      // Should not mention retries when there are no extra attempts
      assert(result.includes('**Total Attempts:** 1\n'));
      assert(!result.includes('retries'));
    });

  });

  describe('Unleash Toggle Overrides', () => {

    test('should render forced-off toggles', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [createTest({ status: 'passed' })],
        unleashOverrides: { forceDisable: ['melosys.trygdeavgift.25-prosentregel'] }
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('## 🎚️ Unleash Toggle Overrides'));
      assert(result.includes('❌ **OFF:** `melosys.trygdeavgift.25-prosentregel`'));
    });

    test('should render forced-on toggles', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [createTest({ status: 'passed' })],
        unleashOverrides: { forceEnable: ['melosys.some.toggle'] }
      };

      const result = generateMarkdownSummary(data);

      assert(result.includes('## 🎚️ Unleash Toggle Overrides'));
      assert(result.includes('✅ **ON:** `melosys.some.toggle`'));
    });

    test('should omit section when no overrides are set', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [createTest({ status: 'passed' })]
      };

      const result = generateMarkdownSummary(data);

      assert(!result.includes('Unleash Toggle Overrides'));
    });

    test('should omit section when override lists are empty', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: [createTest({ status: 'passed' })],
        unleashOverrides: { forceDisable: [], forceEnable: [] }
      };

      const result = generateMarkdownSummary(data);

      assert(!result.includes('Unleash Toggle Overrides'));
    });

  });

});

/**
 * Helper to create test data with defaults
 */
function createTest(overrides: Partial<TestData> = {}): TestData {
  return {
    title: 'Test',
    file: 'tests/example.spec.ts',
    status: 'passed',
    isKnownError: false,
    totalAttempts: 1,
    failedAttempts: 0,
    duration: 1000,
    ...overrides
  };
}
