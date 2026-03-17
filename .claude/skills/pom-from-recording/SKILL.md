---
name: pom-from-recording
description: |
  Convert Playwright recordings into proper Page Object Models (POMs) with correct
  waitForProcessInstances usage, fixture integration, and assertion patterns.
  Use this skill whenever:
  (1) Creating new E2E tests from Playwright codegen recordings,
  (2) Converting existing inline-selector tests to POM style,
  (3) Adding new page objects or extending existing ones,
  (4) Writing tests that involve vedtak, saksopprettelse, or SED verification,
  (5) Reviewing test code for correct async process handling.
  Triggers: "new test", "POM", "page object", "recording", "codegen",
  "konverter test", "lag ny test", "opprett POM", "playwright recording".
---

# POM from Recording

Transform Playwright codegen recordings into maintainable Page Object Model tests
for the melosys-e2e-tests project.

## The Conversion Process

### Step 1: Record with codegen

```bash
npm run codegen
```

This opens a browser where you perform the workflow. The Playwright Inspector generates raw test code with inline selectors.

### Step 2: Identify which pages are involved

Map the recording's actions to existing POMs. Check `pages/` for what already exists before creating new ones.

**Existing POMs** (read `pages/` directory for current list):
- `HovedsidePage` — main page, search, navigation
- `OpprettNySakPage` — create case (brukerID, sakstype, sakstema, behandlingstema)
- `EuEosBehandlingPage` — EU/EOS case setup (dates, countries)
- `ArbeidFlereLandBehandlingPage` — multi-country treatment flow
- `VedtakPage` / `EuEosVedtakPage` — decision pages
- `TrygdeavgiftPage` — tax calculation
- `JournalforingPage` — document journaling

### Step 3: Create or extend POMs

See the [POM Architecture](#pom-architecture) section below.

### Step 4: Write the test

See the [Test Structure](#test-structure) section below.

---

## POM Architecture

### File structure

```
pages/
├── shared/
│   ├── base.page.ts      # Abstract base — NEVER modify without good reason
│   └── constants.ts       # Shared test data and enums
├── feature-name/
│   ├── feature-name.page.ts         # Actions (what you CAN DO)
│   └── feature-name.assertions.ts   # Verifications (what you EXPECT)
```

### Page Object template

```typescript
import { Page, Locator } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { FeatureAssertions } from './feature.assertions';

export class FeaturePage extends BasePage {
  readonly assertions: FeatureAssertions;

  // Locators are ALWAYS private readonly
  private readonly myButton: Locator;
  private readonly myField: Locator;

  constructor(page: Page) {
    super(page);
    this.assertions = new FeatureAssertions(page);

    // Initialize locators in constructor
    this.myButton = this.page.getByRole('button', { name: 'Opprett' });
    this.myField = this.page.getByLabel('Bruttoinntekt');
  }

  // Public action methods — Norwegian names matching UI
  async klikkOpprett(): Promise<void> {
    await this.myButton.click();
  }

  async fyllInnBeløp(beløp: string): Promise<void> {
    await this.myField.fill(beløp);
  }
}
```

### Assertions template

```typescript
import { Page, expect } from '@playwright/test';
import { withDatabase } from '../../helpers/db-helper';

export class FeatureAssertions {
  constructor(readonly page: Page) {}

  // All methods start with "verifiser"
  async verifiserOpprettet(): Promise<void> {
    await expect(this.page.getByText('Behandling opprettet')).toBeVisible();
  }

  // DB assertions return typed values for chaining
  async verifiserIDatabase(fnr: string): Promise<string> {
    return await withDatabase(async (db) => {
      const result = await db.queryOne(
        'SELECT SAK_ID FROM SAK WHERE PERSONNUMMER = :pnr ORDER BY SAK_ID DESC',
        { pnr: fnr }
      );
      expect(result, 'Fant ingen sak i databasen').not.toBeNull();
      return result.SAK_ID;
    });
  }
}
```

### Naming conventions

| Pattern | Example | When |
|---------|---------|------|
| `fyllInn*` | `fyllInnBrukerID()` | Fill text fields |
| `velg*` | `velgSakstype()` | Select dropdowns/radios |
| `klikk*` | `klikkOpprettNyBehandling()` | Click buttons |
| `verifiser*` | `verifiserBehandlingOpprettet()` | Assertions only |

### Using BasePage utilities

BasePage provides these — use them instead of raw Playwright calls:

```typescript
// Step transitions with retry (handles flaky CI)
// IMPORTANT: Always pass waitForContent with an element from the NEXT step.
// This gives clickStepButtonWithRetry a fallback signal via Promise.race
// when the heading visibility check fails (common on CI).
await this.clickStepButtonWithRetry(this.bekreftButton, {
  waitForContent: this.nextStepElement,  // e.g. a radio, checkbox, or button on next step
  verifyHeadingChange: true,             // required for EU/EØS multi-step wizards
});

// Dropdown that depends on a previous selection
await this.waitForDropdownToPopulate(this.kommuneDropdown);
await this.selectByVisibleText(this.kommuneDropdown, 'Oslo');

// Conditional elements
await this.checkRadioIfExists(this.radioButton);

// Multiple possible selectors
await this.trySelectors([
  this.page.getByRole('button', { name: 'Bekreft' }),
  this.page.getByRole('button', { name: 'Bekreft og fortsett' }),
]);
```

### Step transition anti-patterns

Radio buttons on step wizard pages trigger auto-save API calls. Be aware of this
when creating POMs that call `klikkBekreftOgFortsett` after radio selections:

```typescript
// BAD — no waitForContent, heading check is the only signal
async velgYrkesaktivOgFortsett(): Promise<void> {
  await this.velgYrkesaktiv();
  await this.klikkBekreftOgFortsett();
}

// GOOD — waitForContent provides fallback detection
async velgYrkesaktivOgFortsett(): Promise<void> {
  await this.velgYrkesaktiv();
  await this.klikkBekreftOgFortsett({
    waitForContent: this.arbeidsgiverCheckbox,  // element on next step
  });
}
```

### Constants

Add shared test data to `pages/shared/constants.ts` — never hardcode in tests:

```typescript
export const EU_EOS_LAND = {
  SVERIGE: 'Sverige',
  DANMARK: 'Danmark',
  FAROEYENE: 'Færøyene',  // Ikke-EESSI
  GRONLAND: 'Grønland',    // Ikke-EESSI
} as const;
```

---

## Test Structure

### Standard test template

```typescript
import { test, expect } from '../../fixtures';  // ALWAYS use fixtures, not @playwright/test
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { USER_ID_VALID } from '../../pages/shared/constants';

test.describe('Feature Name', () => {
  test('should complete workflow', async ({ page }) => {
    test.setTimeout(120000);  // 2 min — vedtak can be slow on CI

    // 1. Auth
    const auth = new AuthHelper(page);
    await auth.login();

    // 2. Instantiate POMs
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);

    // 3. Create case
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.klikkOpprettNyBehandling();

    // 4. Wait for process instances (see rules below)
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();

    // 5. Navigate to behandling
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    await page.waitForLoadState('networkidle');

    // 6. Perform behandling steps...

    // 7. Assertions
    await opprettSak.assertions.verifiserBehandlingOpprettet();
  });
});
```

### Critical: Import from fixtures, not @playwright/test

```typescript
// CORRECT — gets auto-cleanup, docker log checking, known-error handling
import { test, expect } from '../../fixtures';

// WRONG — no automatic cleanup, tests will pollute each other
import { test, expect } from '@playwright/test';
```

The fixture automatically:
- Cleans database BEFORE each test
- Clears mock data BEFORE each test
- Resets Unleash toggles BEFORE each test
- Waits for process instances AFTER each test
- Checks docker logs for errors AFTER each test

---

## waitForProcessInstances — When and How

This is the most common source of flaky tests. The rules are simple but critical.

### The function

`waitForProcessInstances(request, timeoutSeconds)` calls the melosys-api endpoint
`/internal/e2e/process-instances/await` which blocks until all async process instances
(IVERKSETT_VEDTAK, SEND_BREV, MOTTAK_SED, etc.) are complete or the timeout expires.

### Decision tree

```
After klikkOpprettNyBehandling():
  → ALWAYS call waitForProcessInstances(page.request, 30)
  → Then navigate: await hovedside.goto()

After fattVedtak() as FINAL step of test:
  → DO NOT call manually — the cleanup fixture handles it
  → The fixture calls waitForProcessInstances(30) and FAILS the test
    if any process instance errors occur

After fattVedtak() when test CONTINUES (multi-vedtak, DB verification):
  → ALWAYS call waitForProcessInstances(page.request, 60)
  → Use 60s timeout — vedtak processes chain (IVERKSETT_VEDTAK → SEND_BREV)
    and take longer than saksopprettelse processes

After journalføring:
  → ALWAYS call waitForProcessInstances(page.request, 30)
  → Before navigating to the created behandling
```

### Race condition with chained processes

When a vedtak triggers IVERKSETT_VEDTAK_EOS, which in turn creates SEND_BREV
instances, there is a risk that `waitForProcessInstances` completes before the
child processes (SEND_BREV) are created. This manifests as:

- "Forventet N papir-A1 SEND_BREV, men fant M" (M < N)
- Intermittent failures on CI but passes locally

If you verify process instance state in the database after vedtak, be aware of
this. If tests become flaky, consider polling the DB directly with retry logic
instead of relying solely on `waitForProcessInstances`.

### Correct patterns

**After saksopprettelse:**
```typescript
await opprettSak.klikkOpprettNyBehandling();

console.log('📝 Venter på prosessinstanser...');
await waitForProcessInstances(page.request, 30);
await hovedside.goto();
```

**After vedtak with DB verification:**
```typescript
await behandling.fattVedtak();

await waitForProcessInstances(page.request, 60);  // 60s for chained processes
await verifiserProsessinstanserEtterVedtak(['FO', 'GL']);
```

**After vedtak as final step (NO manual wait needed):**
```typescript
await behandling.fattVedtak();
console.log('✅ Vedtak fattet');
// Test ends here — fixture handles waitForProcessInstances
```

**Multi-vedtak workflow:**
```typescript
// First vedtak
await vedtak.klikkFattVedtak();
await waitForProcessInstances(page.request, 30);  // Wait before continuing

// Navigate to ny vurdering
await hovedside.goto();
await page.getByRole('link', { name: /TRIVIELL KARAFFEL/ }).click();

// Second vedtak
await vedtak.fattVedtakForNyVurdering('FEIL_I_BEHANDLING');
// Test ends — fixture handles final wait
```

### Common mistakes

```typescript
// WRONG: Missing wait after saksopprettelse
await opprettSak.klikkOpprettNyBehandling();
await hovedside.goto();  // Race condition! Processes may not be done

// WRONG: Waiting after final vedtak AND in fixture (double wait, wastes time)
await behandling.fattVedtak();
await waitForProcessInstances(page.request, 60);  // Unnecessary if test ends here

// WRONG: Too short timeout for vedtak processes
await behandling.fattVedtak();
await waitForProcessInstances(page.request, 10);  // IVERKSETT_VEDTAK can take 30s+
```

---

## SED Verification Pattern

When verifying that SED documents were sent to EESSI after vedtak:

```typescript
import { fetchStoredSedDocuments, findNewNavFormatSed } from '../../helpers/mock-helper';

// 1. Snapshot BEFORE vedtak
const docsBefore = await fetchStoredSedDocuments(request, 'A003');

// 2. Fatt vedtak
await behandling.fattVedtak();

// 3. Wait for processes
await waitForProcessInstances(page.request, 60);

// 4. Find new SED (polls mock for 30s)
const sedContent = await findNewNavFormatSed(request, 'A003', docsBefore);
expect(sedContent, 'A003 SED was not sent to EESSI').toBeTruthy();
```

The before-snapshot is critical — `findNewNavFormatSed` compares before/after to
find only the SED created by THIS test's vedtak.

---

## Dynamic Forms and API Waits

Melosys forms trigger API calls on blur. Codegen recordings don't capture this,
leading to timing issues. Use `page.waitForResponse()` or `waitForLoadState('networkidle')`
when fields trigger backend calculations.

**Pattern for fields that trigger API calls:**
```typescript
async fyllInnBruttoinntekt(beløp: string): Promise<void> {
  await this.bruttoinntektField.fill(beløp);
  // Tab out to trigger blur → API call
  await this.page.keyboard.press('Tab');
  await this.page.waitForLoadState('networkidle');
}
```

**Pattern for vedtak button with API response wait:**
```typescript
async klikkFattVedtak(): Promise<void> {
  const responsePromise = this.page.waitForResponse(
    response => response.url().includes('/api/saksflyt/vedtak/') &&
                response.url().includes('/fatt') &&
                response.request().method() === 'POST' &&
                (response.status() === 200 || response.status() === 204),
    { timeout: 60000 }
  );

  await this.fattVedtakButton.click();
  await responsePromise;
}
```

---

## Database Verification

For tests that verify DB state, use `withDatabase` from `helpers/db-helper`:

```typescript
import { withDatabase } from '../../helpers/db-helper';

await withDatabase(async (db) => {
  const vedtak = await db.queryOne<{ STATUS: string }>(
    `SELECT STATUS FROM PROSESSINSTANS
     WHERE PROSESS_TYPE = 'IVERKSETT_VEDTAK_EOS'
       AND REGISTRERT_DATO > SYSDATE - INTERVAL '10' MINUTE
     ORDER BY REGISTRERT_DATO DESC
     FETCH FIRST 1 ROWS ONLY`,
    {}
  );
  expect(vedtak).not.toBeNull();
  expect(vedtak!.STATUS).toBe('FERDIG');
});
```

**Tips:**
- Always use `SYSDATE - INTERVAL 'N' MINUTE` to scope queries to current test
- Use 10 minutes as window (accounts for retries on CI)
- Order by `DESC` and `FETCH FIRST 1 ROWS ONLY` to get latest
- Use parameterized queries (`:param` syntax) to prevent SQL injection
- For CLOB columns (e.g. DATA), `oracledb.fetchAsString = [oracledb.CLOB]` is set in db-helper

---

## Checklist: Converting a Recording to POM Test

1. **Record** with `npm run codegen`
2. **Map actions** to existing POMs — check `pages/` directory first
3. **Create new POMs** only for pages not yet covered
4. **Import from `../../fixtures`** — never from `@playwright/test`
5. **Add `test.setTimeout(120000)`** for tests involving vedtak
6. **Use `AuthHelper`** for login — first action in every test
7. **Call `waitForProcessInstances`** after saksopprettelse and journalføring
8. **Do NOT call `waitForProcessInstances`** after final fattVedtak (fixture handles it)
9. **Use `waitForProcessInstances(60)`** if you verify DB state after vedtak
10. **Snapshot SED documents BEFORE vedtak** if verifying SED sending
11. **Use constants** from `pages/shared/constants.ts` — no hardcoded values
12. **Add assertions** — both UI (expect visible elements) and DB (withDatabase)
13. **Use `page.waitForLoadState('networkidle')`** after navigation and form fills
14. **Navigate via `hovedside.goto()`** after waitForProcessInstances, not direct URL

## Reference

For deeper details on specific topics, read these files:
- `pages/shared/base.page.ts` — BasePage utilities and clickStepButtonWithRetry
- `fixtures/cleanup.ts` — What the fixture does automatically
- `helpers/api-helper.ts` — waitForProcessInstances implementation
- `docs/pom/MIGRATION-PLAN.md` — Full POM migration strategy
- `docs/guides/FIXTURES.md` — Fixture behavior and configuration
