# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an E2E testing project for Melosys using Playwright and TypeScript. The project records user workflows from "melosys flyt" to "vedtak" for automated regression testing and local debugging.

**📖 See [IMPROVEMENTS.md](reports/better-visibility-and-debugging.md) for recent enhancements to CI reporting and docker log checking.**

## Essential Commands

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test tests/example-workflow.spec.ts

# Run specific test by name
npx playwright test "should complete a basic workflow" --project=chromium

# Run with browser visible (headed mode)
npm run test:headed

# Debug mode (step through test)
npm run test:debug

# Interactive UI mode (best for development)
npm run test:ui
```

### Recording Workflows

```bash
# Record a new workflow (opens browser with Playwright Inspector)
npm run codegen

# Run test with trace for debugging
npx playwright test --trace on
```

### Viewing Results

```bash
# View HTML report
npm run show-report

# View specific trace file
npm run show-trace test-results/.../trace.zip

# Open videos
npm run open-videos

# Open screenshots
npm run open-screenshots

# Clean results
npm run clean-results
```

### Setup

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Start required services (must be running before tests)
cd ../melosys-docker-compose
make start-all
```

## Architecture

### Test Structure

- **tests/** - Test spec files using Playwright Test
- **helpers/** - Reusable helper classes for common tasks
  - `auth-helper.ts` - Authentication and session management
  - `db-helper.ts` - Oracle database verification utilities
  - `form-helper.ts` - Form filling with API wait handling
  - `auth-state-helper.ts` - Authentication state persistence

### Helper Classes

**FormHelper** - Critical for handling dynamic forms where fields trigger API requests. Use this when codegen-recorded tests break due to timing issues.

```typescript
const formHelper = new FormHelper(page);

// Fill field and wait for API response
await formHelper.fillAndWaitForApi(
  page.getByRole('textbox', { name: 'Bruttoinntekt' }),
  '100000',
  '/trygdeavgift/beregning'
);

// Fill field and wait fixed time (most reliable for API-triggered fields)
await formHelper.fillAndWait(locator, '100000', 1000);
```

**DatabaseHelper** - Verify database state after workflows complete.

```typescript
await withDatabase(async (db) => {
  const result = await db.queryOne(
    'SELECT * FROM BEHANDLING WHERE id = :id',
    { id: 123 }
  );
  expect(result).not.toBeNull();
});
```

### Docker Services Architecture

The test suite depends on a full Docker Compose stack running in `../melosys-docker-compose`. Key services:

- **melosys-web** (port 3000) - Frontend application
- **melosys-api** (port 8080) - Backend API
- **melosys-oracle** (port 1521) - Oracle database
- **kafka** + **zookeeper** - Message queue
- **mock-oauth2-server** (ports 8082, 8086) - OAuth authentication
- **faktureringskomponenten** (port 8084) - Billing component
- **melosys-dokgen** (port 8888) - Document generation
- **melosys-trygdeavgift-beregning** (port 8095) - Tax calculation
- **melosys-mock** (port 8083) - Mock external services

All services must be healthy before tests run. The GitHub Actions workflow waits for `http://localhost:3000/melosys/` to be responsive.

### Database Configuration

Oracle database connection (configured via `.env` or environment variables):

- **DB_USER**: `MELOSYS` (default)
- **DB_PASSWORD**: `melosys` (default)
- **DB_CONNECT_STRING**:
  - Mac ARM: `localhost:1521/freepdb1`
  - Intel/GitHub Actions: `localhost:1521/XEPDB1`

### Playwright Configuration

Key settings in `playwright.config.ts`:

- **Base URL**: `http://localhost:3000`
- **Trace**: Always on (`trace: 'on'`)
- **Screenshots**: Always captured (`screenshot: 'on'`)
- **Video**: Always recorded (`video: 'on'`)
- **Slow motion**: 100ms delay between actions (`slowMo: 100`)
- **Parallel execution**: Disabled (`fullyParallel: false`)
- **Workers**: 1 on CI, unlimited locally
- **Browser**: Chromium only (Firefox/WebKit commented out)

## Common Patterns

### Test Template

```typescript
import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth-helper';
import { FormHelper } from '../helpers/form-helper';
import { withDatabase } from '../helpers/db-helper';

test.describe('Workflow Name', () => {
  test('should complete workflow', async ({ page }) => {
    // Setup
    const auth = new AuthHelper(page);
    await auth.login();
    const formHelper = new FormHelper(page);

    // Workflow steps (from codegen)
    await page.goto('http://localhost:3000/melosys/');
    // ... recorded steps ...

    // Database verification
    await withDatabase(async (db) => {
      const result = await db.queryOne('SELECT * FROM TABLE WHERE id = :id', { id: 123 });
      expect(result).not.toBeNull();
    });
  });
});
```

### Handling Dynamic Forms

Forms in Melosys trigger API calls on blur. Standard codegen doesn't wait for these. Use `FormHelper` to handle timing:

```typescript
// Instead of codegen's direct fill:
await page.getByRole('textbox', { name: 'Bruttoinntekt' }).fill('100000');

// Use FormHelper:
await formHelper.fillAndWait(
  page.getByRole('textbox', { name: 'Bruttoinntekt' }),
  '100000',
  2000  // Wait 2 seconds for calculation
);
```

### Conditional UI Elements

Check if elements exist before interacting:

```typescript
// Check radio button only if visible
const radioButton = page.getByRole('radio', { name: 'Opprett ny sak' });
if (await radioButton.isVisible()) {
  await radioButton.check();
}

// Using FormHelper
await formHelper.checkRadioIfExists(
  page.getByRole('radio', { name: 'Opprett ny sak' })
);
```

## CI/CD Integration

### GitHub Actions Workflow

Located at `.github/workflows/e2e-tests.yml`. Runs on:
- Pull requests
- Pushes to main branch

Key steps:
1. Checkout and setup Node.js 20
2. Install dependencies and Playwright browsers
3. Login to NAIS registry (for Docker images)
4. Create Docker network `melosys.docker-internal`
5. Start Docker Compose services
6. Wait for services to be healthy (checks `http://localhost:3000/melosys/`)
7. Run tests with `npx playwright test`
8. Upload artifacts (test results, videos, traces)
9. Publish test report comment on PRs

### Environment Variables in CI

- `MELOSYS_ORACLE_DB_NAME=XEPDB1` (Intel architecture)
- `ORACLE_IMAGE=gvenzl/oracle-xe:18.4.0-slim`
- `CI=true` (enables retries and single worker)

## Debugging Failed Tests

1. **Check trace file first** - Most comprehensive debugging info
   ```bash
   npm run show-trace test-results/.../trace.zip
   ```

2. **View video recording** - See what actually happened
   ```bash
   npm run open-videos
   ```

3. **Check screenshots** - Captured at failure point
   ```bash
   npm run open-screenshots
   ```

4. **Run in UI mode** - Best for live debugging
   ```bash
   npm run test:ui
   ```

5. **Increase slow motion** - See actions more clearly
   ```typescript
   // In playwright.config.ts
   launchOptions: { slowMo: 500 }
   ```

## Recording New Workflows

1. Start services: `cd ../melosys-docker-compose && make start-all`
2. Run codegen: `npm run codegen`
3. Perform workflow in opened browser
4. Copy generated code from Playwright Inspector
5. Create new test file in `tests/` directory
6. Add `AuthHelper`, `FormHelper` imports
7. Replace direct `fill()` calls with `formHelper.fillAndWait()` for dynamic fields
8. Add database verification with `withDatabase()`
9. Test locally: `npm run test:ui`

## Important Notes

- **Always run Docker Compose services first** - Tests will fail if services aren't running
- **Use FormHelper for dynamic forms** - Many fields trigger API calls that need explicit waits
- **Database verification is optional** - Commented out by default, uncomment when needed
- **Traces are always captured** - Even for successful tests, useful for understanding workflows
- **Tests run sequentially** - `fullyParallel: false` to avoid race conditions
- **Network must be idle on Trygdeavgift page** - Wait for calculations to complete before proceeding