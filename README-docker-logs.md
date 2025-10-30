# Docker Log Checking in E2E Tests

## Overview

This project includes automatic docker log checking for each test. After every test completes, the system checks `melosys-api` logs for errors that occurred during that specific test.

## How It Works

1. **Per-test isolation**: Each test only sees logs from its own execution time
2. **Timestamp tracking**: Records test start time and only checks logs after that point
3. **Automatic checking**: Uses Playwright fixtures to automatically check logs after each test
4. **Categorized output**: Groups errors into SQL, Connection, and Other categories

## Usage

**Just change one line in your test files:**

```typescript
// ❌ OLD - no docker log checking:
import { test, expect } from '@playwright/test';

// ✅ NEW - automatic docker log checking:
import { test, expect } from '../fixtures/docker-log-fixture';

// Everything else stays the same!
test.describe('My Tests', () => {
  test('should do something', async ({ page }) => {
    // Your test code - unchanged
    // Docker logs will be automatically checked after this test
  });
});
```

**That's it!** No other changes needed. Docker logs are checked automatically after each test.

## Example Output

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

## Error Categories

- **📊 SQL Errors**: Database syntax errors, missing tables, constraint violations
- **🔌 Connection Errors**: HikariPool issues, database connection failures
- **❌ Other Errors**: Any other ERROR-level logs

## Configuration

### Containers to Monitor

By default, only `melosys-api` is monitored. To add more containers, modify `fixtures/docker-log-fixture.ts`:

```typescript
const apiErrors = checkDockerLogs('melosys-api', minutesAgo);
const webErrors = checkDockerLogs('melosys-web', minutesAgo);
```

### Fail Tests on Errors

To make tests fail when critical errors are found, uncomment this line in `fixtures/docker-log-fixture.ts`:

```typescript
// Optional: Fail test if critical errors found
if (errors.some(e => e.level === 'ERROR')) {
  throw new Error(`Found ${errors.filter(e => e.level === 'ERROR').length} ERROR(s) in melosys-api logs`);
}
```

## GitHub Actions Integration

When running in CI, docker log analysis appears directly in the workflow summary:

### Test Summary Shows:
- 🎭 **Playwright Test Results** - Pass/fail counts and failed test names
- 🐳 **Docker Log Analysis** - Error/warning counts from melosys-api
- 📋 **Expandable error samples** - Click to view actual error messages

### Annotations:
The GitHub reporter creates inline annotations for failed tests, making it easy to see which tests failed directly in the workflow view.

### Attachments:
Docker log errors are attached to each test result in the HTML report artifact, so you can:
1. Download the playwright-results artifact
2. Open playwright-report/index.html
3. Click on any test
4. View the "docker-logs-errors" attachment

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
If output is overwhelming, adjust the error filtering in `docker-log-fixture.ts` to be more selective about what counts as an error.
