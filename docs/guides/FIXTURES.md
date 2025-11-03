# Test Fixtures Guide

Comprehensive guide to Playwright test fixtures for automatic cleanup, Docker log monitoring, and cache management.

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

---

## What Fixtures Do

### Before Each Test
```
🧹 Cleaning test data before test...
   ✅ Database: 5 tables cleaned (27 rows)
   ✅ API caches cleared: JPA + Hibernate + Spring
   ✅ Mock data: 3 items cleared

🏁 Starting test: my workflow test
```

### After Each Test
```
🔍 Checking docker logs for: my workflow test
✅ No errors found in melosys-api logs

🧹 Cleaning up test data after test...
   ✅ Process instances: 2 completed in 3s
   ✅ Database: 8 tables cleaned (43 rows)
   ✅ API caches cleared: JPA + Hibernate + Spring
   ✅ Mock data: 2 items cleared
```

---

## Fixtures Architecture

```
fixtures/
├── index.ts          # Main export - combines all fixtures
├── cleanup.ts        # Database and mock cleanup (before & after)
└── docker-logs.ts    # Docker log error checking (after)
```

---

## 1. Automatic Cleanup

### What Gets Cleaned

**Database:**
- All data tables (excludes lookup tables ending with _TYPE, _TEMA, _STATUS)
- Excludes PROSESS_STEG and flyway_schema_history
- Uses foreign key constraint handling for safe deletion
- Uses TRUNCATE for performance and to reset sequences

**Mock Service:**
- Journalposter from melosys-mock
- Oppgaver from melosys-mock

**API Caches:**
- JPA/Hibernate second-level cache
- Hibernate query cache
- Spring cache regions

### Process Instance Waiting

After each test, the fixture automatically waits for all async process instances (saksflyt) to complete before cleaning up. This prevents:
- Race conditions where cleanup happens while processes are still running
- Failed foreign key constraints
- Lost error information from async processes

**Success output:**
```
✅ Process instances: 2 completed in 3s
```

**Failure output (shows detailed errors):**
```
❌ Process instances: 1 FAILED
   - OPPRETT_SAK_OG_BEH: ORA-02291: FK_BEHANDLINGSMAATE constraint violated
```

### Manual Cleanup (Rare)

If you need to manually clean during a test:

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

---

## 2. Docker Log Checking

### How It Works

1. **Per-test isolation**: Each test only sees logs from its own execution time
2. **Timestamp tracking**: Records test start time and only checks logs after that point
3. **Automatic checking**: Uses Playwright fixtures to automatically check logs after each test
4. **Categorized output**: Groups errors into SQL, Connection, and Other categories

### Example Output

**When no errors found:**
```
🔍 Checking docker logs for errors during: should create new behandling
✅ No docker errors during test
```

**When errors are found:**
```
🔍 Checking docker logs for errors during: should create new behandling

⚠️  Found 3 error(s) in melosys-api logs:

📊 SQL Errors (2):
  [18:45:27.362] ORA-00942: tabellen eller utsnittet finnes ikke...
  [18:45:28.123] SQL Error: 942, SQLState: 42000...

🔌 Connection Errors (1):
  [18:45:30.005] HikariPool-1 - Exception during pool initialization...

💡 To see full logs, run: docker logs melosys-api
```

### Error Categories

- **📊 SQL Errors**: Database syntax errors, missing tables, constraint violations
- **🔌 Connection Errors**: HikariPool issues, database connection failures
- **❌ Other Errors**: Any other ERROR-level logs

### Configuration

#### Containers to Monitor

By default, only `melosys-api` is monitored. To add more containers, modify `fixtures/docker-logs.ts`:

```typescript
const apiErrors = checkDockerLogs('melosys-api', minutesAgo);
const webErrors = checkDockerLogs('melosys-web', minutesAgo);
```

#### Fail Tests on Errors

To make tests fail when critical errors are found, uncomment this line in `fixtures/docker-logs.ts`:

```typescript
// Optional: Fail test if critical errors found
if (errors.some(e => e.level === 'ERROR')) {
  throw new Error(`Found ${errors.filter(e => e.level === 'ERROR').length} ERROR(s) in melosys-api logs`);
}
```

### GitHub Actions Integration

When running in CI, docker log analysis appears directly in the workflow summary:

**Test Summary Shows:**
- 🎭 **Playwright Test Results** - Pass/fail counts and failed test names
- 🐳 **Docker Log Analysis** - Error/warning counts from melosys-api
- 📋 **Expandable error samples** - Click to view actual error messages

**Annotations:**
The GitHub reporter creates inline annotations for failed tests, making it easy to see which tests failed directly in the workflow view.

**Attachments:**
Docker log errors are attached to each test result in the HTML report artifact, so you can:
1. Download the playwright-results artifact
2. Open playwright-report/index.html
3. Click on any test
4. View the "docker-logs-errors" attachment

---

## 3. API Cache Clearing

### Why Cache Clearing is Needed

When E2E tests clean the database, Spring Boot's JPA/Hibernate caches may still have references to deleted entities. This causes errors like:

```
ORA-02291: integrity constraint violated - parent key not found
```

The application tries to access entities that no longer exist in the database.

### Solutions Implemented

#### 1. TRUNCATE Instead of DELETE ✅

We use `TRUNCATE TABLE` instead of `DELETE` which:
- Resets auto-increment sequences
- Is faster than DELETE
- Helps invalidate some caches

#### 2. Cache Clearing Endpoint ✅

The `melosys-api` includes E2E endpoints:

```java
@RestController
@RequestMapping("/internal/e2e")
@Profile({"local", "dev"}) // Only in test environments!
public class E2EController {

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    /**
     * Clear all JPA/Hibernate caches
     * Called by E2E tests after database cleanup
     */
    @PostMapping("/caches/clear")
    public void clearCaches() {
        // Clear second-level cache
        Cache cache = entityManagerFactory.getCache();
        if (cache != null) {
            cache.evictAll();
        }

        // Clear query caches
        entityManagerFactory.unwrap(org.hibernate.SessionFactory.class)
            .getCache()
            .evictAllRegions();
    }

    /**
     * Wait for all async process instances to complete
     * Called by E2E tests before database cleanup
     */
    @GetMapping("/process-instances/await")
    public ProcessInstanceStatus waitForProcessInstances() {
        // Implementation details...
    }
}
```

### How Fixtures Use Cache Clearing

The cleanup fixture automatically tries to clear caches after database cleanup:

```typescript
// fixtures/cleanup.ts
async function cleanupTestData(page: any): Promise<void> {
  // 1. Clean database (uses TRUNCATE)
  await db.cleanDatabase();

  // 2. Try to clear API caches (prevents JPA errors)
  await clearApiCaches(page.request);

  // 3. Clean mock data
  await clearMockData(page.request);
}
```

It uses these endpoints:
1. `POST http://localhost:8080/internal/e2e/caches/clear` - Clear all caches
2. `GET http://localhost:8080/internal/e2e/process-instances/await` - Wait for async processes

If endpoints don't exist, it logs a warning but continues.

### Testing Cache Endpoints

Test manually:
```bash
# Clear all caches
curl -X POST http://localhost:8080/internal/e2e/caches/clear

# Wait for process instances (30s default timeout)
curl http://localhost:8080/internal/e2e/process-instances/await
```

### Benefits

✅ Eliminates JPA cache errors
✅ Fast (< 100ms vs 10-20s for container restart)
✅ No need to restart services
✅ Tests can run back-to-back without errors

---

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

---

## Debugging

### View Database Contents

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

**Example output:**
```
🔍 Analyzing database contents...

Found 61 total tables

📊 Tables with data (3 tables):

────────────────────────────────────────────────────────────
📋 BEHANDLING                                    1 rows
   Columns: ID, SAK_ID, BEHANDLINGSTYPE, STATUS, OPPRETTET_DATO

📋 SAK                                          1 rows
   Columns: ID, SAKSTYPE, AKTOER_ID, OPPRETTET_DATO, JOURNALPOST_ID

📋 VEDTAK                                       1 rows
   Columns: ID, BEHANDLING_ID, VEDTAKSTYPE, FATTET_DATO, JOURNALPOST_ID

────────────────────────────────────────────────────────────

Total rows across all tables: 3
```

**Note:** Remove `showAllData()` calls before committing - they're for debugging only.

---

## Best Practices

✅ **DO:**
- Import from `../fixtures` in all tests
- Let automatic cleanup handle test isolation
- Trust the fixtures to clean before and after
- Check docker logs output for errors
- Use process instance waiting for async operations

❌ **DON'T:**
- Import from old fixture files (they're removed)
- Manually clean unless you have a specific reason
- Skip using fixtures (tests won't be isolated)
- Commit tests with `showAllData()` calls (debugging only)

---

## Troubleshooting

### "Cannot find docker logs"
Make sure docker containers are running:
```bash
docker ps | grep melosys
```

### Seeing errors from previous tests
This shouldn't happen with the timestamp-based approach, but if it does:
- Check your system clock is accurate
- Verify docker container time matches host time

### Too many logs
If output is overwhelming, adjust the error filtering in `docker-logs.ts` to be more selective about what counts as an error.

### Process instances timing out
Default timeout is 30 seconds. If processes take longer:
- Check melosys-api logs for actual errors
- Increase timeout in `cleanup.ts` if needed
- Investigate why processes are taking so long

---

## Current Status

- ✅ TRUNCATE implementation (faster than DELETE)
- ✅ Cache clearing helper implemented
- ✅ E2E endpoints added to melosys-api (`/internal/e2e/caches/clear`)
- ✅ Process instance waiting endpoint (`/internal/e2e/process-instances/await`)
- ✅ Fixtures automatically use these endpoints
- ✅ Per-test docker log checking
- ✅ Automatic cleanup before and after each test
