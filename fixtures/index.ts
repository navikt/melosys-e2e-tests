import { mergeTests } from '@playwright/test';
import { cleanupFixture } from './cleanup';
import { dockerLogsFixture } from './docker-logs';
import { test as knownErrorFixture } from './known-error';

/**
 * Main test fixture - combines all fixtures for E2E tests
 *
 * Features:
 * - Automatic database cleanup before and after each test
 * - Automatic mock service cleanup before and after each test
 * - Docker log error checking after each test (skipped for @expect-docker-errors tests)
 * - Automatic detection of @known-error tagged tests (expected failures)
 *
 * Usage in tests:
 *   import { test, expect } from '../fixtures';
 *
 * All tests automatically get:
 * - Clean database state before test starts
 * - Clean mock data before test starts
 * - Automatic cleanup after test completes
 * - Docker log error reporting
 * - Known error handling (@known-error tag support)
 */

export const test = mergeTests(cleanupFixture, dockerLogsFixture, knownErrorFixture);
export { expect } from '@playwright/test';

/**
 * Re-export individual fixtures if tests need specific combinations
 */
export { cleanupFixture } from './cleanup';
export { dockerLogsFixture } from './docker-logs';
export { test as knownErrorFixture } from './known-error';
