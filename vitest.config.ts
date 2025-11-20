import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for unit tests
 *
 * These tests verify the reporter and summary generation logic
 * without running actual E2E tests.
 *
 * Run tests:
 *   npm run test:unit         # Watch mode
 *   npm run test:unit:run     # Single run (for CI)
 *   npm run test:unit:ui      # UI mode
 */
export default defineConfig({
  test: {
    // Test file patterns
    include: ['**/*.test.ts'],
    exclude: ['node_modules', 'test-results', 'playwright-report'],

    // Environment
    environment: 'node',

    // Coverage (optional - can enable later)
    // coverage: {
    //   provider: 'v8',
    //   reporter: ['text', 'json', 'html'],
    // },

    // Globals (allows using describe/test without imports)
    globals: true,
  },
});
