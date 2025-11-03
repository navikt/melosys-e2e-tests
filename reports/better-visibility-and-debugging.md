# E2E Test Improvements - Implementation Summary

## Overview

This document summarizes the improvements made to the Melosys E2E testing infrastructure for better visibility and debugging in both local and CI environments.

## 1. GitHub Actions Summary Reporting

### Problem
- Test results were only available as downloadable artifacts
- Had to download HTML reports to see what passed/failed
- No visibility into backend errors without downloading logs

### Solution
We added automatic test result summaries directly in the GitHub Actions workflow page.

### What You See Now

When you open a GitHub Actions run, the summary page shows:

#### 🎭 Playwright Test Results
- **Table with counts**: Passed/Failed/Total
- **Failed test names**: Listed automatically when tests fail
- **Link to download**: Full HTML report still available in artifacts

#### 🐳 Docker Log Analysis
- **Time window**: Last 15 minutes of logs checked
- **Error counts**: Number of ERROR-level messages
- **Warning counts**: Number of WARN-level messages
- **Expandable samples**: Click to view actual error/warning messages (last 20)
- **Recent activity**: Last 30 lines of logs always visible

### Implementation Details

**File**: `.github/workflows/e2e-tests.yml`

**Key improvements**:
1. **Test counting** - Properly counts passed/failed tests from `test-results/` directory structure
2. **Docker log checking** - Analyzes melosys-api logs for errors and warnings
3. **Expandable sections** - Uses `<details>` HTML to keep summary clean but detailed

**Code snippet** (lines 145-233):
```yaml
- name: Generate test summary
  if: always()
  run: |
    # Count tests from directory structure
    TOTAL=$(find test-results -mindepth 1 -maxdepth 1 -type d | grep -v "retry" | wc -l | tr -d ' ')

    # Count errors/warnings in docker logs
    ERROR_COUNT=$(docker logs melosys-api --since 15m 2>&1 | grep -cE "ERROR|\[1;31mERROR\[0;39m" || echo "0")
    WARN_COUNT=$(docker logs melosys-api --since 15m 2>&1 | grep -cE "WARN|\[31mWARN\[0;39m" || echo "0")

    # Write to GitHub Actions summary
    echo "## 🎭 Playwright Test Results" >> $GITHUB_STEP_SUMMARY
    # ... (see full file for complete implementation)
```

## 2. Per-Test Docker Log Checking

### Problem
- Global teardown only checked logs once at the end
- Couldn't correlate errors with specific tests
- Hard to debug which test caused backend issues

### Solution
Created a Playwright fixture that automatically checks docker logs after EACH test.

### How It Works

**File**: `fixtures/docker-log-fixture.ts`

1. **Before test**: Records start timestamp
2. **Test runs**: Normal Playwright test execution
3. **After test**: Checks docker logs from test start time to now
4. **Reports errors**: Categorizes and displays errors by type

### Using the Fixture

Simply change the import in your test files:

```typescript
// ❌ OLD - no docker log checking
import { test, expect } from '@playwright/test';

// ✅ NEW - automatic docker log checking
import { test, expect } from '../fixtures/docker-log-fixture';

// Everything else stays exactly the same!
test.describe('My Tests', () => {
  test('should do something', async ({ page }) => {
    // Your test code - unchanged
  });
});
```

### What You See

**After each test in console:**
```
🔍 Checking docker logs for errors during: should create new behandling
✅ No docker errors during test
```

**Or if errors found:**
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

### In HTML Reports

Error reports are automatically attached to each test result as `docker-logs-errors` attachment:

1. Download `playwright-results` artifact from GitHub Actions
2. Open `playwright-report/index.html`
3. Click on any test
4. View the "docker-logs-errors" attachment

### Error Categories

The checker looks for and categorizes:
- **📊 SQL Errors**: `ORA-`, `SQL Error`, `SQLSyntaxErrorException`, `tabellen eller utsnittet finnes ikke`
- **🔌 Connection Errors**: `HikariPool`, `connection`, database connection failures
- **❌ Other Errors**: Any other ERROR-level log messages

## 3. GitHub Reporter Integration

### What We Added

**File**: `playwright.config.ts` (line 32)

```typescript
reporter: [
  ['html'],
  ['list'],
  // GitHub Actions reporter - creates annotations and summary in CI
  ...(process.env.CI ? [['github']] : []),
],
```

### Benefits

- **Annotations**: Failed tests appear as inline annotations in GitHub Actions
- **Workflow integration**: Test failures highlighted in the workflow view
- **Quick navigation**: Click annotation to see which test failed

## 4. Issues We Fixed

### Issue #1: TypeScript Error in Fixture
**Problem**: `Object literal may only specify known properties, and 'dockerLogChecker' does not exist`

**Fix**: Added proper TypeScript typing to the fixture:
```typescript
export const test = base.extend<{ dockerLogChecker: void }>({
  // ...
});
```

### Issue #2: Test Count Showing 0
**Problem**: Workflow was looking for XML files that Playwright doesn't create

**Fix**: Changed to count actual test result directories:
```bash
TOTAL=$(find test-results -mindepth 1 -maxdepth 1 -type d | grep -v "retry" | wc -l)
```

### Issue #3: Missing Docker Errors in CI
**Problem**: Only checking 10 minutes, missing container startup errors

**Fix**:
- Extended to 15 minutes
- Include ALL warnings (not just SQL)
- Always show counts even if zero
- Added recent log activity section

### Issue #4: Duplicate Fixture Files
**Problem**: Had `helpers/docker-log-fixture.ts` AND `fixtures/docker-log-fixture.ts`

**Fix**:
- Removed old `helpers/docker-log-fixture.ts`
- Standardized all tests to use `fixtures/docker-log-fixture.ts`

## 5. Files Modified

### Created
- `fixtures/docker-log-fixture.ts` - Per-test docker log checking
- `global-setup.ts` - Global setup that loads the fixture hooks
- `README-docker-logs.md` - Documentation for docker log checking
- `IMPROVEMENTS.md` - This document

### Modified
- `.github/workflows/e2e-tests.yml` - Added summary generation
- `playwright.config.ts` - Added GitHub reporter, global setup
- `tests/example-workflow.spec.ts` - Updated import
- `tests/Utenfor avtaleland.spec.ts` - Updated import

### Removed
- `global-teardown.ts` - Replaced by per-test checking
- `helpers/docker-log-fixture.ts` - Duplicate, removed

## 6. How to Use

### Running Tests Locally

```bash
# Run tests - docker logs checked automatically per test
npm test

# Run specific test
npm test tests/example-workflow.spec.ts

# View HTML report
npm run show-report
```

### In GitHub Actions

1. **Push to main** or **create PR** - workflow runs automatically
2. **Go to Actions tab** - Click on your workflow run
3. **View Summary** - Scroll down to see:
   - 🎭 Playwright Test Results table
   - 🐳 Docker Log Analysis
   - Failed test names (if any)
   - Error/warning samples (expandable)
4. **Download artifacts** if you need:
   - Full HTML report
   - Videos
   - Traces

### Debugging Failed Tests

1. **Check GitHub Actions summary** - See which tests failed and docker errors
2. **Click expandable sections** - View error samples directly
3. **Download artifacts** if needed - Get full traces/videos
4. **Run locally** - Use `npm run test:ui` for interactive debugging

## 7. Configuration Options

### Fail Tests on Docker Errors

To make tests fail when ERROR-level logs are found, uncomment in `fixtures/docker-log-fixture.ts`:

```typescript
// Optional: Fail test if critical errors found
if (errors.some(e => e.level === 'ERROR')) {
  throw new Error(`Found ${errors.filter(e => e.level === 'ERROR').length} ERROR(s) in melosys-api logs`);
}
```

### Check Multiple Containers

To monitor additional containers, modify `fixtures/docker-log-fixture.ts`:

```typescript
const apiErrors = checkDockerLogs('melosys-api', minutesAgo);
const webErrors = checkDockerLogs('melosys-web', minutesAgo);

// Combine and report all errors
```

### Adjust Time Window

In the workflow file, change the `--since` parameter:

```bash
# Check last 30 minutes instead of 15
docker logs melosys-api --since 30m 2>&1
```

## 8. Best Practices

### For Test Writers

1. **Use the fixture**: Always import from `fixtures/docker-log-fixture.ts`
2. **Review docker logs**: Check console output after each test
3. **Investigate errors**: Even if test passes, backend errors should be fixed
4. **Attach to test**: Docker errors are attached to test results automatically

### For Reviewers

1. **Check GitHub Actions summary**: Review test results before merging
2. **Expand error sections**: Look at actual error messages, not just counts
3. **Verify docker logs**: Check if backend errors occurred during test
4. **Download traces**: For failed tests, download and review traces

### For Debugging

1. **Start with summary**: GitHub Actions summary gives quick overview
2. **Check per-test logs**: Console output shows errors per test
3. **Use HTML report**: Attached docker errors visible per test
4. **Run locally**: Use `npm run test:ui` for interactive debugging with docker logs

## 9. Lessons Learned

### TypeScript Fixtures
- Must properly type custom fixtures with `extend<{ name: type }>`
- Auto-fixtures run before/after each test automatically
- Can attach data to test results for HTML report

### GitHub Actions Summaries
- Use `$GITHUB_STEP_SUMMARY` to write markdown
- Supports tables, expandable sections, code blocks
- Always use `if: always()` to run even on failure

### Playwright Test Structure
- Test result directories: `test-results/testname-browser/`
- Failed tests with retries: `test-results/testname-browser-retry1/`
- Artifacts stored per test: traces, videos, screenshots

### Docker Logs
- Use `--since Nm` for time-based filtering (N minutes ago)
- ANSI color codes: `[1;31mERROR[0;39m` for colored output
- `2>&1` to capture both stdout and stderr

## 10. Future Improvements

### Potential Enhancements

1. **Slack/Discord Notifications**: Send test results to chat
2. **GitHub Pages**: Publish HTML reports to a website
3. **PR Comments**: Post test summary as PR comment automatically
4. **Trend Analysis**: Track error rates over time
5. **Multiple Container Monitoring**: Check melosys-web, kafka, etc.
6. **Performance Metrics**: Track test duration, slowest tests
7. **Flaky Test Detection**: Identify tests that pass/fail intermittently

### Known Limitations

1. **Docker log timing**: Checks fixed time window, might miss very quick tests
2. **Container startup errors**: HikariPool errors during startup are normal
3. **Kafka warnings**: Some warnings are expected in local environment
4. **Log volume**: Very verbose logs might exceed GitHub Actions limits

## Summary

We now have:
- ✅ **Visible test results** in GitHub Actions summary
- ✅ **Per-test docker log checking** with error categorization
- ✅ **Automatic error reporting** in CI and locally
- ✅ **Expandable detailed views** for debugging
- ✅ **Consistent imports** across all test files
- ✅ **Proper TypeScript typing** for fixtures

The E2E testing infrastructure is now much more transparent and easier to debug! 🎉
