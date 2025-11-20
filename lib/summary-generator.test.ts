/**
 * Unit tests for summary-generator
 *
 * These tests verify the markdown generation logic works correctly
 * for all test scenarios without running actual E2E tests.
 *
 * Run tests:
 *   npm run test:unit
 *   npm run test:unit:ui
 */

import { describe, test, expect } from 'vitest';
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

      expect(result).toContain('**Status:** passed');
      expect(result).toContain('✅ Passed: 2');
      expect(result).toContain('❌ Failed: 0');
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

      expect(result).toContain('**Status:** failed');
      expect(result).toContain('✅ Passed: 1');
      expect(result).toContain('❌ Failed: 1');
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
      expect(result).toContain('**Status:** passed');
      expect(result).toContain('✅ Passed: 1');
      expect(result).toContain('⚠️ Known Error (Failed): 1');
      expect(result).toContain('❌ Failed: 0');
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
      expect(result).toContain('**Status:** failed');
      expect(result).toContain('❌ Failed: 1');
      expect(result).toContain('⚠️ Known Error (Failed): 1');
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

      expect(result).toContain('⚠️ Known Error (Failed): 1');
      expect(result).toContain('⚠️'); // Emoji in table
      expect(result).toContain('## ⚠️ Known Error Tests (Failed)');
      expect(result).toContain('Failed as expected');
      expect(result).toContain('do not affect CI status');
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

      expect(result).toContain('✨ Known Error (Passed): 1');
      expect(result).toContain('✨'); // Emoji in table
      expect(result).toContain('## ✨ Known Error Tests (Passed)');
      expect(result).toContain('bug might be fixed');
      expect(result).toContain('Unexpectedly passing');
      expect(result).toContain('consider removing @known-error tag');
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

      expect(result).toContain('> **Note:** 2 test(s) marked as @known-error do not affect CI status');
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
      expect(result).toContain('✅'); // passed
      expect(result).toContain('❌'); // failed
      expect(result).toContain('⏭️'); // skipped
      expect(result).toContain('🔄'); // flaky
      expect(result).toContain('⚠️'); // known-error-failed
      expect(result).toContain('✨'); // known-error-passed
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

      expect(result).toContain('<td>1</td>'); // Should show "1", not "1 (0 failed)"
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

      expect(result).toContain('3 (2 failed)');
      expect(result).toContain('**Total Attempts:** 3 (including 2 retries)');
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
      expect(result).toContain('**Total Attempts:** 6 (including 3 retries)');
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

      expect(result).toContain('## ❌ Failed Tests (1)');
      expect(result).toContain('### my failing test');
      expect(result).toContain('**Error:**');
      expect(result).toContain('Timeout 10000ms exceeded');
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
      expect(result).toContain('## ❌ Failed Tests (1)');
      expect(result).toContain('real failure');
      expect(result).not.toContain('## ❌ Failed Tests (2)');

      // Known error should be in separate section
      expect(result).toContain('## ⚠️ Known Error Tests (Failed) (1)');
      expect(result).toContain('known bug @known-error');
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

      expect(result).toContain('## 🔄 Flaky Tests (1)');
      expect(result).toContain('unstable test');
      expect(result).toContain('Attempts: 3 (2 failed, 1 passed)');
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

      expect(result).toContain('**Docker Log Errors:**');
      expect(result).toContain('🐳 **melosys-api** (2 error(s))');
      expect(result).toContain('SQL Error: ORA-00001');
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
              errors: [{ timestamp: '', message: 'error1' }, { timestamp: '', message: 'error2' }]
            }]
          }),
          createTest({
            status: 'failed',
            dockerErrors: [{
              service: 'melosys-web',
              errors: [{ timestamp: '', message: 'error3' }]
            }]
          }),
        ]
      };

      const result = generateMarkdownSummary(data);

      expect(result).toContain('## 🐳 Docker Log Errors by Service');
      expect(result).toContain('**melosys-api:** 2 error(s)');
      expect(result).toContain('**melosys-web:** 1 error(s)');
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

      expect(result).toContain('## ⚙️ Process Instance Failures');
      expect(result).toContain('**Tests with process failures:** 2');
      expect(result).toContain('test1');
      expect(result).toContain('test2');
    });

  });

  describe('Folder Grouping', () => {

    test('should group tests by folder and file', () => {
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

      expect(result).toContain('📁 eu-eos / <code>scenario1.spec.ts</code>');
      expect(result).toContain('📁 trygdeavgift / <code>calculation.spec.ts</code>');
    });

    test('should sort files with failures first', () => {
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

      // zzz/fail.spec.ts should appear before aaa/pass.spec.ts
      // even though 'aaa' comes before 'zzz' alphabetically
      const zzzIndex = result.indexOf('zzz / <code>fail.spec.ts</code>');
      const aaaIndex = result.indexOf('aaa / <code>pass.spec.ts</code>');

      expect(zzzIndex).toBeLessThan(aaaIndex);
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

      expect(result).not.toContain('## 📎 Artifacts');
    });

    test('should exclude timestamp when option is false', () => {
      const data: TestSummaryData = {
        status: 'passed',
        duration: 10000,
        tests: []
      };

      const result = generateMarkdownSummary(data, { includeTimestamp: false });

      expect(result).not.toContain('**Generated:**');
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

      expect(result).toContain('**Total Tests:** 0');
      expect(result).toContain('**Status:** passed');
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

      expect(result).toContain(longTitle);
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

      expect(result).toContain('test with <html> & "quotes"');
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
      expect(result).toContain('**Duration:** 46s');
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
