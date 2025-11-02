# Test Fixtures

Playwright test fixtures that extend base test functionality with automatic cleanup and monitoring.

## Quick Start

**Import this in all your tests:**

```typescript
import { test, expect } from '../fixtures';

test('my test', async ({ page }) => {
  // Your test automatically gets:
  // ✅ Clean database before test
  // ✅ Clean mock data before test
  // ✅ Docker log checking after test
  // ✅ Automatic cleanup after test
});
```

## Available Fixtures

### Main Export (fixtures/index.ts)

The default export combines all fixtures. **Use this for all tests.**

**Features:**
- Automatic database cleanup before and after each test
- Automatic mock service cleanup before and after each test
- Docker log error checking after each test
- Test isolation - no data leakage between tests

### Individual Fixtures

You can also import individual fixtures if needed:

#### cleanup.ts
```typescript
import { test } from '../fixtures/cleanup';

// Provides only cleanup functionality (before and after test)
```

#### docker-logs.ts
```typescript
import { test } from '../fixtures/docker-logs';

// Provides only docker log checking (after test)
```

## What Happens During Tests

### Before Test
```
🧹 Cleaning test data before test...
   ✅ Database: 5 tables cleaned (27 rows)
   ✅ API caches cleared: JPA + Hibernate + Spring
   ✅ Mock data: 3 items cleared

🏁 Starting test: my workflow test
```

### After Test
```
🔍 Checking docker logs for: my workflow test
✅ No errors found in melosys-api logs

🧹 Cleaning up test data after test...
   ✅ Process instances: 2 completed in 3s
   ✅ Database: 8 tables cleaned (43 rows)
   ✅ API caches cleared: JPA + Hibernate + Spring
   ✅ Mock data: 2 items cleared
```

**Key Feature: Process Instance Waiting**

After each test, the fixture automatically waits for all async process instances (saksflyt) to complete before cleaning up. This prevents:
- Race conditions where cleanup happens while processes are still running
- Failed foreign key constraints
- Lost error information from async processes

If processes fail, you'll see detailed error information:
```
   ❌ Process instances: 1 FAILED
      - OPPRETT_SAK_OG_BEH: ORA-02291: FK_BEHANDLINGSMAATE constraint violated
```

## What Gets Cleaned

**Database:**
- All data tables (excludes lookup tables ending with _TYPE, _TEMA, _STATUS)
- Excludes PROSESS_STEG and flyway_schema_history
- Uses foreign key constraint handling for safe deletion

**Mock Service:**
- Journalposter from melosys-mock
- Oppgaver from melosys-mock

## Architecture

```
fixtures/
├── index.ts          # Main export - combines all fixtures
├── cleanup.ts        # Database and mock cleanup (before & after)
├── docker-logs.ts    # Docker log error checking (after)
└── README.md         # This file
```

## Migration Guide

**Old way (multiple imports):**
```typescript
// ❌ Don't do this anymore
import { test } from '../helpers/docker-log-fixture';
import { test } from '../fixtures/docker-log-fixture';
import { test } from '../fixtures/cleanup-fixture';
```

**New way (single import):**
```typescript
// ✅ Do this instead
import { test, expect } from '../fixtures';
```

## Manual Cleanup

If you need to manually clean during a test (rare):

```typescript
import { test, expect } from '../fixtures';
import { withDatabase } from '../helpers/db-helper';
import { clearMockData } from '../helpers/mock-helper';

test('my test', async ({ page }) => {
  // ... some test steps ...

  // Manual cleanup if needed
  await withDatabase(async (db) => {
    await db.cleanDatabase();
  });
  await clearMockData(page.request);

  // ... more test steps ...
});
```

## Debugging

To see what data exists in database:

```typescript
import { test, expect } from '../fixtures';
import { withDatabase } from '../helpers/db-helper';

test('my test', async ({ page }) => {
  // ... your test ...

  // Show all data before automatic cleanup runs
  await withDatabase(async (db) => {
    await db.showAllData();
  });
});
```

## Best Practices

✅ **DO:**
- Import from `../fixtures` in all tests
- Let automatic cleanup handle test isolation
- Trust the fixtures to clean before and after
- Check docker logs output for errors

❌ **DON'T:**
- Import from old fixture files (they're removed)
- Manually clean unless you have a specific reason
- Skip using fixtures (tests won't be isolated)
- Commit tests with `showAllData()` calls (debugging only)
