# Error Reporting System - Implementation Summary

## What Changed

Tests now **automatically fail** when Docker errors or process instance failures are detected. Previously, tests would pass even with errors in the background.

## Changes Made

### 1. Docker Log Fixture (`fixtures/docker-logs.ts`)

**Before:**
- Logged Docker errors to console
- Attached errors to test report
- Test still passed ✅

**After:**
- Logs Docker errors to console
- Attaches errors to test report (JSON + text summary)
- **Fails the test** ❌ with descriptive error message

**Error Categories:**
- SQL Errors (ORA-, SQLSyntaxErrorException)
- Connection Errors (HikariPool, connection timeouts)
- Other Errors (all other ERROR-level logs)

### 2. Cleanup Fixture (`fixtures/cleanup.ts`)

**Before:**
- Waited for process instances
- Logged failures
- Test still passed ✅

**After:**
- Waits for process instances
- Logs failures with detailed stack traces
- **Fails the test** ❌ with error details

### 3. API Helper (`helpers/api-helper.ts`)

**Enhanced process instance error reporting:**
- Shows process type (e.g., `OPPRETT_OG_DISTRIBUER_BREV`)
- Shows error message
- Shows first 5 lines of stack trace
- Includes all details in error message

### 4. Test Summary Reporter (`reporters/test-summary.ts`)

**New custom reporter** that generates:

**`playwright-report/test-summary.md`** - Human-readable summary:
- Overall test statistics (passed/failed/skipped)
- Failed tests with error details
- Docker errors by service
- Process instance failures
- Artifact links

**`playwright-report/test-summary.json`** - Machine-readable summary:
- Complete test results
- Error details
- Docker log errors
- Process errors
- Timestamps and durations

### 5. Playwright Config (`playwright.config.ts`)

Added custom reporter to reporter list:
```typescript
reporter: [
  ['html'],
  ['list'],
  ['./reporters/test-summary.ts'],  // NEW!
  ...(process.env.CI ? [['github']] : []),
]
```

### 6. GitHub Actions Workflow (`.github/workflows/e2e-tests.yml`)

**Updated artifact uploads:**
- All artifacts now upload on **both success and failure** (`if: always()`)
- New artifact: `test-summary` (30-day retention)
- Includes `test-summary.md` and `test-summary.json`

**Updated summary generation:**
- Uses custom reporter summary if available
- Falls back to directory-based counting
- Shows detailed error information in workflow summary

**Artifact retention:**
- `test-summary`: 30 days (for trend analysis)
- `playwright-results`: 7 days
- `playwright-videos`: 7 days
- `playwright-traces`: 7 days

### 7. Documentation

**New:**
- `docs/guides/ERROR-REPORTING.md` - Complete error reporting guide

**Updated:**
- `README.md` - Added links to new documentation

## Example Output

### Before (Test Passed Despite Errors)
```bash
✅ Workflow completed

🔍 Checking docker logs for: skal fullføre komplett saksflyt...

⚠️  Found 1 error(s) across 1 service(s) during test:

🐳 melosys-api (1 error(s)):
  ❌ Other Errors (1):
    [16:24:01.222] Feil ved behandling...

   ❌ Process instances: 1 FAILED
      - OPPRETT_OG_DISTRIBUER_BREV: Trygdeavgiftsperiode ikke funnet...

# TEST STILL PASSED! ✅ <-- PROBLEM
```

### After (Test Fails)
```bash
✅ Workflow completed

🔍 Checking docker logs for: skal fullføre komplett saksflyt...

⚠️  Found 1 error(s) across 1 service(s) during test:

🐳 melosys-api (1 error(s)):
  ❌ Other Errors (1):
    [16:24:01.222] Feil ved behandling...

   ❌ Process instances: 1 FAILED
      - OPPRETT_OG_DISTRIBUER_BREV: Trygdeavgiftsperiode ikke funnet, id = 2
        at no.nav.melosys.domain.Behandlingsresultat.utledSkatteplikttype...
        at no.nav.melosys.service.dokument.brev.mapper.InnvilgelseFtrlMapper...

Error: Test failed due to 1 Docker error(s) across 1 service(s).
See attached 'docker-logs-errors' for details.

# TEST FAILED! ❌ <-- CORRECT!
```

## Benefits

### 1. Immediate Detection
- Errors no longer slip through
- CI/CD fails when issues occur
- Prevents buggy code from being deployed

### 2. Better Debugging
- Detailed error messages with context
- Stack traces included
- Per-test and complete logs available

### 3. Trend Analysis
- 30-day summary retention
- Machine-readable JSON format
- Can track error patterns over time

### 4. Comprehensive Reports
- Test summary shows all failures
- Docker errors grouped by service
- Process failures clearly identified

### 5. Downloadable Artifacts
- All reports available for download
- Works on both success and failure
- Easy to share with team

## Migration Impact

### Tests That Will Now Fail

Any test that previously had:
- Docker log errors (ERROR-level)
- Process instance failures
- Background process errors

These tests were **already broken** - they just weren't being detected!

### Action Required

1. **Review failing tests** - Check error messages
2. **Fix root causes** - Don't suppress errors
3. **Download artifacts** - Use traces/videos to debug
4. **Check test summary** - Understand failure patterns

### No Breaking Changes for Passing Tests

Tests that genuinely pass (no errors, no process failures) continue to pass.

## Usage

### Local Development

Tests fail immediately when errors detected:
```bash
npm test
```

View summary:
```bash
cat playwright-report/test-summary.md
```

### CI/CD

1. Check workflow summary for overview
2. Download `test-summary` artifact for details
3. Download `playwright-results` for complete logs
4. Download traces/videos for debugging

### Debugging

See [docs/guides/ERROR-REPORTING.md](docs/guides/ERROR-REPORTING.md) for complete debugging guide.

## Configuration

### Skip Error Checks (Local Only)

**Not recommended** - Fix root causes instead!

If needed for debugging, can modify fixtures to log warnings instead of throwing.

### Environment Variables

- `SKIP_UNLEASH_CLEANUP_AFTER=true` - Skip Unleash cleanup after test (preserves state for debugging)

## Files Changed

### New Files
- `reporters/test-summary.ts` - Custom summary reporter
- `docs/guides/ERROR-REPORTING.md` - Error reporting documentation
- `CHANGELOG-error-reporting.md` - This file

### Modified Files
- `fixtures/docker-logs.ts` - Added test failure on errors
- `fixtures/cleanup.ts` - Added test failure on process errors
- `helpers/api-helper.ts` - Enhanced error details
- `playwright.config.ts` - Added custom reporter
- `.github/workflows/e2e-tests.yml` - Updated artifacts and summary
- `README.md` - Added documentation links

## Next Steps

1. **Run tests** - See which tests now fail (that were silently broken)
2. **Fix issues** - Address root causes revealed by error detection
3. **Monitor trends** - Use 30-day summaries to track patterns
4. **Update docs** - Add any team-specific debugging procedures

## Questions?

See [docs/guides/ERROR-REPORTING.md](docs/guides/ERROR-REPORTING.md) for complete guide.
