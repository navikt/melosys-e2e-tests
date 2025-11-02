import { mergeTests } from '@playwright/test';
import { cleanupFixture } from './cleanup';
import { dockerLogsFixture } from './docker-logs';

/**
 * Main test fixture - combines all fixtures for E2E tests
 *
 * Features:
 * - Automatic database cleanup before and after each test
 * - Automatic mock service cleanup before and after each test
 * - Docker log error checking after each test
 *
 * Usage in tests:
 *   import { test, expect } from '../fixtures';
 *
 * All tests automatically get:
 * - Clean database state before test starts
 * - Clean mock data before test starts
 * - Automatic cleanup after test completes
 * - Docker log error reporting
 */

export const test = mergeTests(cleanupFixture, dockerLogsFixture);
export { expect } from '@playwright/test';

/**
 * Re-export individual fixtures if tests need specific combinations
 */
export { cleanupFixture } from './cleanup';
export { dockerLogsFixture } from './docker-logs';
