# Test Fixtures

This directory contains Playwright test fixtures that extend base test functionality.

## Available Fixtures

### cleanup-fixture.ts

Automatically cleans database and mock service data after each test to ensure test isolation.

**Usage:**
```typescript
import { test, expect } from '../fixtures/cleanup-fixture';

test('my test', async ({ page }) => {
  // Your test code here
  // Database and mock data will be automatically cleaned after this test
});
```

**What it cleans:**
- Database tables (excluding lookup tables, PROSESS_STEG, and flyway_schema_history)
- Mock service test data (journalposter and oppgaver)

**Output:**
```
🧹 Cleaning up test data...
   ✅ Database: 5 tables cleaned (91 rows)
   ✅ Mock data: 3 items cleared
```

### docker-log-fixture.ts

Checks Docker logs for errors after each test and attaches findings to test results.

**Usage:**
```typescript
import { test, expect } from '../fixtures/docker-log-fixture';

test('my test', async ({ page }) => {
  // Your test code here
  // Docker logs will be checked automatically after this test
});
```

**Output:**
```
🔍 Checking docker logs for errors during: my test
✅ No docker errors during test
```

## Combining Fixtures

You can combine multiple fixtures by creating a new fixture file:

```typescript
import { test as base } from '@playwright/test';
import { test as dockerTest } from './docker-log-fixture';
import { test as cleanupTest } from './cleanup-fixture';

// Merge fixtures
export const test = base.extend({
  ...dockerTest,
  ...cleanupTest,
});

export { expect } from '@playwright/test';
```

## When to Use Auto-Cleanup

Use the `cleanup-fixture` for:
- ✅ E2E workflow tests that create data
- ✅ Tests that should start with a clean database
- ✅ Tests that need isolation from other tests

Don't use it for:
- ❌ Tests that verify database cleanup itself (like clean-db.spec.ts)
- ❌ Tests that need to inspect data after completion
- ❌ Read-only tests that don't modify data
