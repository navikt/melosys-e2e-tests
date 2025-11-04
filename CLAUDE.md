# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an E2E testing project for Melosys using Playwright and TypeScript. The project records user workflows from "melosys flyt" to "vedtak" for automated regression testing and local debugging.

**📖 See [GitHub Actions Guide](docs/ci-cd/GITHUB-ACTIONS.md) for CI/CD setup and [Fixtures Guide](docs/guides/FIXTURES.md) for automatic cleanup and docker log checking.**

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
  - `db-helper.ts` - Oracle database verification, cleanup, and debugging utilities
  - `mock-helper.ts` - Mock service data management
  - `form-helper.ts` - Form filling with API wait handling
  - `auth-state-helper.ts` - Authentication state persistence
- **fixtures/** - Playwright test fixtures for automatic cleanup and logging
  - `cleanup-fixture.ts` - Auto-cleanup database and mock data after each test
  - `docker-log-fixture.ts` - Check Docker logs for errors after tests

### Helper Classes

**FormHelper** - Critical for handling dynamic forms where fields trigger API requests. Use this when codegen-recorded tests break due to timing issues.

```typescript
const formHelper = new FormHelper(page);

// Fill field and wait for API respons
**DatabaseHelper** - Verify database state, clean data, and debug tests.

```typescript
// Query database
await withDatabase(async (db) => {
  const result = await db.queryOne(
    'SELECT * FROM BEHANDLING WHERE id = :id',
    { id: 123 }
  );
  expect(result).not.toBeNull();
});

// Show all database tables (useful for debugging)
await withDatabase(async (db) => {
  await db.showAllData(); // Displays all tables with row counts and sample columns
});

// Clean database manually
await withDatabase(async (db) => {
  await db.cleanDatabase(); // Removes all data except lookup tables
});
```

**MockHelper** - Manage test data in melosys-mock service.

```typescript
import { clearMockData } from '../helpers/mock-helper';

// Clear mock service data (journalposter and oppgaver)
await clearMockData(page.request);
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

### Docker Log Monitoring

The test suite automatically monitors Docker logs from all Melosys services for errors and warnings:

**Monitored Services:**
- melosys-api
- melosys-web
- melosys-mock
- faktureringskomponenten
- melosys-dokgen
- melosys-trygdeavgift-beregning
- melosys-trygdeavtale

**Per-Test Logs:**
- Captures logs from each test's execution time using `--timestamps`
- Checks all monitored services for errors during the test
- Saves `playwright-report/docker-logs-{test-name}.log` when errors/warnings detected
- Categorizes issues: SQL Errors, Connection Errors, Warnings, Other Errors
- Uses precise RFC3339 timestamps (e.g., `2025-11-02T12:03:26.560105507Z`)

**Complete Logs Files:**
- After all tests complete, creates `playwright-report/{service-name}-complete.log` for each service
- Contains all logs from entire test run with timestamps
- Always created (regardless of errors)
- Included in the `playwright-results` artifact
- Useful for debugging issues that span multiple tests or services

**What's Captured:**
- All ERROR-level logs
- All WARN-level logs
- Logs are filtered per-test using test start/end timestamps

## Page Object Model (POM) Pattern

**📖 See [docs/pom/MIGRATION-PLAN.md](docs/pom/MIGRATION-PLAN.md) for complete migration guide and strategy.**

This project is migrating to use the Page Object Model pattern for better maintainability and reusability. POMs are being added incrementally - both old and new test styles can coexist.

### Why POM?

**Benefits:**
- 80% less code duplication
- UI changes = update 1 file instead of 10 tests
- Tests read like documentation
- Easier to write new tests (compose POMs)
- Better error messages

**Our Unique Approach:**
- Combines melosys-web's POM structure with our strengths
- ✅ Keep: Fixtures (auto-cleanup, docker logs)
- ✅ Keep: Database helpers (`withDatabase`, `cleanDatabase`)
- ✅ Keep: FormHelper with API wait handling
- ✅ Add: Page Objects for encapsulation
- ✅ Add: Actions/Assertions separation

### Directory Structure

```
melosys-e2e-tests/
├── pages/                           # Page Object Models
│   ├── shared/
│   │   ├── base.page.ts            # Base class with common functionality
│   │   └── constants.ts            # Shared test data
│   ├── hovedside.page.ts           # Main page
│   └── opprett-ny-sak/
│       ├── opprett-ny-sak.page.ts  # Actions (what you CAN DO)
│       └── opprett-ny-sak.assertions.ts  # Verifications (what you EXPECT)
├── specs/                           # Test specifications (NEW)
│   ├── 2-opprett-sak/
│   └── 3-behandle-sak/
├── tests/                           # Original tests (OLD - still work!)
├── helpers/                         # Unchanged - still use these!
├── fixtures/                        # Unchanged - still auto-cleanup!
└── utils/
    └── assertions.ts               # Error assertion framework
```

### POM Architecture

#### 1. BasePage - Common Functionality

All page objects extend `BasePage`:

```typescript
import { BasePage } from '../shared/base.page';

export class MyPage extends BasePage {
  // Automatic access to:
  // - this.page (Playwright Page)
  // - this.formHelper (FormHelper for API waits)
  // - Navigation, wait, polling utilities
}
```

#### 2. Actions vs Assertions Separation

```typescript
// opprett-ny-sak.page.ts - ACTIONS
export class OpprettNySakPage extends BasePage {
  readonly assertions: OpprettNySakAssertions;

  async fyllInnBrukerID(fnr: string) { /* action */ }
  async velgSakstype(type: string) { /* action */ }
  async klikkOpprettNyBehandling() { /* action */ }
}

// opprett-ny-sak.assertions.ts - ASSERTIONS
export class OpprettNySakAssertions {
  async verifiserBehandlingOpprettet() { /* verify */ }
  async verifiserSakIDatabase(fnr: string) { /* verify */ }
}
```

#### 3. Integration with Existing Helpers

POMs work seamlessly with our existing helpers:

```typescript
// FormHelper - Available in all POMs via BasePage
class TrygdeavgiftPage extends BasePage {
  async fyllInnBruttoinntekt(beløp: string): Promise<void> {
    await this.formHelper.fillAndWaitForApi(
      this.bruttoinntektField,
      beløp,
      '/trygdeavgift/beregning'
    );
  }
}

// Database Helper - Use in assertions
class OpprettNySakAssertions {
  async verifiserSakIDatabase(fnr: string): Promise<string> {
    return await withDatabase(async (db) => {
      const sak = await db.queryOne(
        'SELECT * FROM SAK WHERE personnummer = :pnr',
        { pnr: fnr }
      );
      expect(sak).not.toBeNull();
      return sak.SAK_ID;
    });
  }
}

// Fixtures - Still work automatically!
test('scenario', async ({ page }) => {
  const opprettSak = new OpprettNySakPage(page);
  // ... test runs
}); // <- cleanup-fixture automatically cleans database
```

### Using POMs in Tests

#### POM Style (New - Recommended)

```typescript
import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';

test('should create case', async ({ page }) => {
  // Setup
  const auth = new AuthHelper(page);
  await auth.login();

  // Page Objects
  const hovedside = new HovedsidePage(page);
  const opprettSak = new OpprettNySakPage(page);

  // Actions - Read like documentation!
  await hovedside.goto();
  await hovedside.klikkOpprettNySak();
  await opprettSak.fyllInnBrukerID('30056928150');
  await opprettSak.velgSakstype('FTRL');
  await opprettSak.klikkOpprettNyBehandling();

  // Assertions - Separate from actions
  await opprettSak.assertions.verifiserBehandlingOpprettet();
  await opprettSak.assertions.verifiserSakIDatabase('30056928150');
});
```

#### Old Style (Still Works)

```typescript
// Original inline selector tests still work!
test('should create case', async ({ page }) => {
  await page.goto('http://localhost:3000/melosys/');
  await page.getByRole('button', { name: 'Opprett' }).click();
  // ... inline selectors
});
```

Both styles can coexist during migration.

### Error Assertion Framework

POMs include a comprehensive error assertion framework:

```typescript
import { assertErrors } from '../../utils/assertions';

// Verify NO errors (pass empty array)
await assertErrors(page, []);

// Verify specific error
await assertErrors(page, ["Feltet er påkrevd"]);

// Verify multiple errors with regex
await assertErrors(page, [/påkrevd/i, "Ugyldig format"]);
```

### Creating New POMs

**Quick Guide:**

1. **Create page file:** `pages/my-feature/my-feature.page.ts`
   - Extend `BasePage`
   - Define private locators
   - Create public action methods (Norwegian names matching UI)

2. **Create assertions file:** `pages/my-feature/my-feature.assertions.ts`
   - Verification methods only
   - Use `verifiser...()` naming
   - Can use database helpers

3. **Use in test:**
   ```typescript
   const myFeature = new MyFeaturePage(page);
   await myFeature.someAction();
   await myFeature.assertions.verifySomething();
   ```

**See:** `docs/pom/MIGRATION-PLAN.md` for detailed style guide and examples.

### Available POMs

**Currently Implemented:**
- ✅ `HovedsidePage` - Main page navigation
- ✅ `OpprettNySakPage` - Create new case

**Coming Soon:**
- 🔄 `BehandlingPage` - Case treatment (Medlemskap, Arbeidsforhold, Lovvalg)
- 🔄 `TrygdeavgiftPage` - Tax calculation
- 🔄 `VedtakPage` - Decision making

**Example Test:**
See `specs/2-opprett-sak/opprett-sak-pom-example.spec.ts` for complete example.

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

6. **Check Docker logs** - View logs from all services
   ```bash
   # Per-test logs (saved when errors/warnings detected)
   cat playwright-report/docker-logs-{test-name}.log
   open playwright-report/docker-logs-*.log

   # Complete logs files (all tests, always created)
   # View specific service:
   cat playwright-report/melosys-api-complete.log
   cat playwright-report/melosys-web-complete.log
   less playwright-report/faktureringskomponenten-complete.log

   # View all complete logs:
   ls playwright-report/*-complete.log
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

## Resources

- **Quick Start**: `QUICK-START.md` - Get started in 5 minutes
- **Troubleshooting**: `docs/guides/TROUBLESHOOTING.md` - Common issues and solutions
- **Helpers**: `docs/guides/HELPERS.md` - FormHelper, DatabaseHelper, AuthHelper
- **Fixtures**: `docs/guides/FIXTURES.md` - Auto-cleanup and Docker log checking
- **POM Guide**: `docs/pom/QUICK-START.md` - Page Object Model quick reference
- **POM Migration**: `docs/pom/MIGRATION-PLAN.md` - Complete POM strategy
- **GitHub Actions**: `docs/ci-cd/GITHUB-ACTIONS.md` - CI/CD setup and usage
- [Playwright Documentation](https://playwright.dev) - Official Playwright docs
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Trace Viewer Guide](https://playwright.dev/docs/trace-viewer)