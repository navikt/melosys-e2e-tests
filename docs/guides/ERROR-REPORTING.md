# Error Reporting System

This guide explains how the E2E test suite detects, reports, and fails tests when Docker errors or process instance failures occur.

## Overview

The test suite now **automatically fails tests** when:
1. **Docker log errors** are detected in any monitored service during test execution
2. **Process instance failures** occur (async background processes in melosys-api)

This ensures that issues are caught immediately rather than silently passing tests.

## Architecture

### 1. Docker Log Monitoring (`fixtures/docker-logs.ts`)

**Monitored Services:**
- melosys-api
- melosys-web
- melosys-mock
- faktureringskomponenten
- melosys-dokgen
- melosys-trygdeavgift-beregning
- melosys-trygdeavtale

**How it works:**
1. Records test start time
2. After test completes, captures logs from all services (using `--since` timestamp)
3. Categorizes errors: SQL Errors, Connection Errors, Other Errors
4. If errors found:
   - Logs errors to console
   - Attaches JSON details to test report
   - **Fails the test** with descriptive error message

**Error Categories:**
- **SQL Errors**: ORA- errors, SQL exceptions
- **Connection Errors**: HikariPool issues, connection timeouts
- **Other Errors**: All other ERROR-level logs

### 2. Process Instance Monitoring (`fixtures/cleanup.ts`)

**How it works:**
1. After each test completes, calls `/internal/e2e/process-instances/await` endpoint
2. Waits up to 30 seconds for all async processes to complete
3. If processes fail:
   - Logs failure details with stack traces
   - **Fails the test** with detailed error message

**Process Types Monitored:**
- `OPPRETT_OG_DISTRIBUER_BREV` - Document generation and distribution
- Other async background processes in melosys-api

### 3. Test Summary Reporter (`reporters/test-summary.ts`)

**Generated Files:**
- `playwright-report/test-summary.md` - Human-readable markdown summary
- `playwright-report/test-summary.json` - Machine-readable JSON summary

**Summary Contents:**
- Overall test statistics (passed/failed/skipped)
- Failed tests with:
  - Error messages
  - Process instance failures
  - Docker log errors by service
- Service error summary (total errors per service)
- Artifact links

## What You'll See When Tests Fail

### Console Output

```bash
✅ Workflow completed

🔍 Checking docker logs for: skal fullføre komplett saksflyt med § 2-8 første ledd bokstav a (arbeidstaker)

⚠️  Found 1 error(s) across 1 service(s) during test:

🐳 melosys-api (1 error(s)):
  ❌ Other Errors (1):
    [16:24:01.222] Feil ved behandling av prosessinstans...

   ❌ Process instances: 1 FAILED
      - OPPRETT_OG_DISTRIBUER_BREV: Trygdeavgiftsperiode ikke funnet, og det er ikke åpen sluttdato, id = 2
        at no.nav.melosys.domain.Behandlingsresultat.utledSkatteplikttype(Behandlingsresultat.kt:161)
        ...

Error: Test failed due to 1 Docker error(s) across 1 service(s). See attached 'docker-logs-errors' for details.
```

### Test Report Attachments

Each failed test includes:
- **docker-logs-errors** (JSON) - Detailed error data
- **docker-logs-summary** (Text) - Human-readable summary

### GitHub Actions Summary

The workflow summary shows:
- Test statistics table
- Failed tests with error details
- Docker errors by service
- Process instance failures
- Links to downloadable artifacts

## Artifacts Available for Download

### 1. `test-summary` (Retention: 30 days)
- `test-summary.md` - Markdown report
- `test-summary.json` - JSON report

**Use Case:** Quick overview of test run, identify patterns across multiple runs

### 2. `playwright-results` (Retention: 7 days)
- `test-results/` - Per-test results, screenshots, videos, traces
- `playwright-report/` - HTML report + Docker logs
- `*-complete.log` - Complete logs from each service

**Use Case:** Deep debugging of specific test failures

### 3. `playwright-videos` (Retention: 7 days)
- All test execution videos

**Use Case:** See what actually happened visually

### 4. `playwright-traces` (Retention: 7 days)
- Playwright trace files (viewable with `npx playwright show-trace`)

**Use Case:** Step-by-step debugging with network, console, DOM snapshots

## Debugging Failed Tests

### Step 1: Check Test Summary
Download `test-summary/test-summary.md`:
```bash
gh run download <run-id> -n test-summary
cat test-summary.md
```

This shows:
- Which tests failed
- Which services had errors
- Error counts and samples

### Step 2: Check Complete Docker Logs
Download `playwright-results`:
```bash
gh run download <run-id> -n playwright-results
ls playwright-report/*-complete.log
```

View specific service logs:
```bash
cat playwright-report/melosys-api-complete.log
less playwright-report/faktureringskomponenten-complete.log
```

### Step 3: View Test Trace
Download and view the trace:
```bash
gh run download <run-id> -n playwright-traces
npx playwright show-trace test-results/*/trace.zip
```

### Step 4: Watch Test Video
Download and watch:
```bash
gh run download <run-id> -n playwright-videos
open test-results/*/video.webm
```

## Local Development

### Running Tests Locally

Tests will fail locally too when errors are detected:
```bash
npm test
```

### Skipping Error Checking (Not Recommended)

If you need to debug a specific test without error checks failing it, you can temporarily modify the fixtures to log warnings instead of throwing errors.

**NOT recommended** - Fix the root cause instead!

### Viewing Local Test Summary

After running tests locally:
```bash
cat playwright-report/test-summary.md
open playwright-report/index.html  # HTML report
```

## CI/CD Integration

### Automatic Uploads

All artifacts are uploaded on **both success and failure** (`if: always()`):
- Test results: Always uploaded
- Test summary: Always uploaded (30-day retention for trend analysis)
- Videos/Traces: Always uploaded

### GitHub Actions Summary

The workflow creates a detailed summary showing:
- Trigger information (which repo/commit triggered the run)
- Test statistics
- Failed test details
- Docker log analysis
- Links to artifacts

### Retention Policies

- **Test summary**: 30 days (for trend analysis)
- **Test results**: 7 days
- **Videos/Traces**: 7 days

## Common Error Patterns

### Process Instance Failures

**Symptom:**
```
Process instances failed: Found 1 failed process instance(s)
  - OPPRETT_OG_DISTRIBUER_BREV: Trygdeavgiftsperiode ikke funnet
```

**Cause:** Missing or invalid data in database when document generation runs

**Solution:** Check test data setup, ensure all required periods are created

### SQL Errors

**Symptom:**
```
📊 SQL Errors (3):
  [timestamp] ORA-02291: parent key not found
```

**Cause:** Database constraint violations, missing parent records

**Solution:** Check database cleanup order, ensure proper test isolation

### Connection Errors

**Symptom:**
```
🔌 Connection Errors (2):
  [timestamp] HikariPool - Connection is not available
```

**Cause:** Database connection pool exhausted or timeout

**Solution:** Check for connection leaks, increase pool size, or reduce test parallelism

## Configuration

### Environment Variables

**`SKIP_UNLEASH_CLEANUP_AFTER=true`**
- Skip Unleash toggle cleanup after tests
- Useful for local debugging
- Preserves feature toggle state after failed test

### Monitored Services

Edit `fixtures/docker-logs.ts` to add/remove services:
```typescript
const MONITORED_SERVICES = [
  'melosys-api',
  'melosys-web',
  // Add more services here
];
```

### Process Instance Timeout

Edit `fixtures/cleanup.ts` to change timeout:
```typescript
await waitForProcessInstances(page.request, 30); // 30 seconds
```

## Best Practices

1. **Always investigate failures** - Don't ignore Docker errors or process failures
2. **Download artifacts** - Use traces and videos to understand what happened
3. **Check test summary first** - Quick overview before diving into details
4. **Fix root causes** - Don't suppress errors, fix the underlying issues
5. **Monitor trends** - Use 30-day summary retention to spot patterns

## Troubleshooting

### "Test passed but has Docker errors"

This should no longer happen! Tests now fail automatically when Docker errors are detected.

If you see this, check:
1. Fixture is imported correctly: `import { test } from '../fixtures'`
2. Not using bare `@playwright/test` import

### "Test failed but no errors in summary"

Check:
1. Test is using custom fixtures (not bare Playwright test)
2. Fixtures are executing (check console output for cleanup messages)
3. Reporter is configured in `playwright.config.ts`

### "Summary not generated"

Check:
1. Reporter is in `playwright.config.ts`: `['./reporters/test-summary.ts']`
2. Tests completed (reporter only runs at the end)
3. Check for reporter errors in console

## See Also

- [Fixtures Guide](FIXTURES.md) - Auto-cleanup and Docker log checking
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common issues
- [GitHub Actions Guide](../ci-cd/GITHUB-ACTIONS.md) - CI/CD setup
