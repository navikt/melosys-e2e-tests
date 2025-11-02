# Page Object Model (POM) Migration Plan

**Created:** 2025-11-02
**Status:** In Progress
**Goal:** Migrate melosys-e2e-tests to use Page Object Model pattern, combining best practices from melosys-web with our existing strengths (fixtures, database helpers, FormHelper).

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Target Architecture](#target-architecture)
4. [Migration Strategy](#migration-strategy)
5. [Implementation Phases](#implementation-phases)
6. [Code Examples](#code-examples)
7. [Testing Strategy](#testing-strategy)
8. [Success Metrics](#success-metrics)

---

## Executive Summary

### Why POM?

**Current Problems:**
- 5 test files with significant code duplication
- `example-workflow.spec.ts` has 183 lines of inline selectors
- UI changes require updating multiple test files
- No reusable workflow components
- Tests are hard to read and maintain

**Solution:**
Adopt Page Object Model from melosys-web while keeping our unique strengths:
- ✅ Keep: Fixtures (auto-cleanup, docker logs)
- ✅ Keep: Database helpers (`withDatabase`, `cleanDatabase`)
- ✅ Keep: FormHelper with API wait handling
- ✅ Keep: Always-on tracing
- ✅ Add: POM structure (pages/, actions/assertions separation)
- ✅ Add: Test data utilities
- ✅ Add: Feature-based organization
- ✅ Add: Error assertion framework

**Expected Benefits:**
- 80% reduction in code duplication
- UI changes = update 1 file instead of 10 tests
- Tests read like documentation
- Faster test authoring (compose POMs)
- Better error messages

---

## Current State Analysis

### Directory Structure (Before)

```
melosys-e2e-tests/
├── tests/                           # Flat structure
│   ├── clean-db.spec.ts
│   ├── example-workflow.spec.ts     # 183 lines, inline selectors
│   ├── form-helper-example.spec.ts
│   ├── utenfor-avtaleland.spec.ts   # Duplicates example-workflow
│   └── workflow-rune-tester.spec.ts
├── helpers/
│   ├── auth-helper.ts               # ✅ Good
│   ├── auth-state-helper.ts
│   ├── db-helper.ts                 # ✅ Good
│   ├── form-helper.ts               # ✅ Good
│   ├── mock-helper.ts               # ✅ Good
│   ├── api-helper.ts
│   └── check-docker-logs.ts
├── fixtures/
│   ├── cleanup-fixture.ts           # ✅ Excellent (melosys-web doesn't have)
│   └── docker-log-fixture.ts        # ✅ Excellent (melosys-web doesn't have)
└── CLAUDE.md                        # ✅ Well documented
```

### Key Issues

1. **Code Duplication Example:**
   ```typescript
   // Repeated in 3+ files:
   await page.getByRole('button', { name: 'Opprett ny sak/behandling' }).click();
   await page.getByRole('textbox', { name: 'Brukers f.nr. eller d-nr.:' }).fill('30056928150');
   await page.getByRole('radio', { name: 'Opprett ny sak' }).check();
   await page.getByLabel('Sakstype').selectOption('FTRL');
   ```

2. **Brittle Selectors:**
   - Hardcoded role/label selectors throughout tests
   - UI text changes break multiple tests
   - No centralized selector management

3. **Workflow Duplication:**
   - `example-workflow.spec.ts` and `utenfor-avtaleland.spec.ts` share 80% of code
   - No way to reuse "create case" workflow
   - Database verification patterns duplicated

---

## Target Architecture

### Directory Structure (After)

```
melosys-e2e-tests/
├── pages/                           # NEW - Page Object Models
│   ├── shared/
│   │   ├── base.page.ts            # Base class with common functionality
│   │   └── constants.ts            # Shared constants (user IDs, org numbers)
│   ├── hovedside.page.ts           # Main page actions
│   ├── opprett-ny-sak/
│   │   ├── opprett-ny-sak.page.ts
│   │   └── opprett-ny-sak.assertions.ts
│   ├── behandling/
│   │   ├── medlemskap.page.ts
│   │   ├── arbeidsforhold.page.ts
│   │   ├── lovvalg.page.ts
│   │   └── behandling.assertions.ts
│   ├── trygdeavgift/
│   │   ├── trygdeavgift.page.ts
│   │   └── trygdeavgift.assertions.ts
│   └── vedtak/
│       ├── vedtak.page.ts
│       └── vedtak.assertions.ts
│
├── specs/                           # RENAMED from tests/
│   ├── 1-setup/
│   │   └── setup-testdata.spec.ts  # Setup shared test data
│   ├── 2-opprett-sak/
│   │   ├── avtaleland.spec.ts
│   │   └── utenfor-avtaleland.spec.ts
│   ├── 3-behandle-sak/
│   │   ├── yrkesaktiv.spec.ts
│   │   └── selvstendig.spec.ts
│   └── 4-vedtak/
│       └── fatt-vedtak.spec.ts
│
├── helpers/                         # ENHANCED
│   ├── auth-helper.ts              # Keep as-is
│   ├── db-helper.ts                # Keep as-is
│   ├── form-helper.ts              # Keep as-is
│   ├── mock-helper.ts              # Keep as-is
│   └── testdata-utils.ts           # NEW - Workflow builders
│
├── utils/                           # NEW
│   ├── assertions.ts               # Error assertion framework (from melosys-web)
│   ├── waits.ts                    # Polling strategies
│   └── selectors.ts                # Fallback selector patterns
│
├── fixtures/                        # Keep as-is
│   ├── cleanup-fixture.ts
│   └── docker-log-fixture.ts
│
├── docs/                            # NEW
│   ├── POM-MIGRATION-PLAN.md       # This document
│   ├── POM-STYLE-GUIDE.md          # Coding standards
│   └── IMPLEMENTATION-LOG.md       # Work log
│
└── CLAUDE.md                        # Update with POM patterns
```

### Architecture Principles

#### 1. **Separation of Concerns**

```typescript
// Actions: What you CAN DO
class OpprettNySakPage {
  async fyllInnBrukerID(fnr: string) { /* action */ }
  async velgSakstype(type: string) { /* action */ }
  async klikkOpprettNyBehandling() { /* action */ }
}

// Assertions: What you EXPECT
class OpprettNySakAssertions {
  async verifiserBrukerIDFelt() { /* verify state */ }
  async verifiserBehandlingOpprettet() { /* verify state */ }
}
```

#### 2. **Composition Over Inheritance**

```typescript
class OpprettNySakPage extends BasePage {
  readonly assertions: OpprettNySakAssertions;

  constructor(page: Page) {
    super(page, new FormHelper(page));
    this.assertions = new OpprettNySakAssertions(page);
  }
}
```

#### 3. **Keep Our Strengths**

```typescript
// Database verification still works!
await withDatabase(async (db) => {
  const sak = await db.queryOne('SELECT * FROM SAK WHERE id = :id', { id });
  expect(sak).not.toBeNull();
});

// Fixtures still auto-cleanup!
test('scenario', async ({ page }) => {
  // Test runs...
}); // <- cleanup-fixture automatically cleans database
```

---

## Migration Strategy

### Phase 1: Foundation (Week 1)
**Goal:** Build core infrastructure without breaking existing tests

**Tasks:**
1. Create `pages/` directory structure
2. Create `BasePage` class
3. Port error assertion framework from melosys-web
4. Create `HovedsidePage` as proof-of-concept
5. Create documentation

**Validation:**
- All existing tests still pass
- New POMs can be imported and used
- Documentation is clear

---

### Phase 2: Core POMs (Week 2)
**Goal:** Build POMs for main workflows

**Tasks:**
1. Create `OpprettNySakPage` + assertions
2. Create `BehandlingPage` (Medlemskap, Arbeidsforhold, Lovvalg)
3. Create `TrygdeavgiftPage` + assertions
4. Create `VedtakPage` + assertions
5. Refactor 1-2 tests as examples

**Validation:**
- POMs cover main user journeys
- Refactored tests are shorter and more readable
- Both old and new test styles work

---

### Phase 3: Test Data Utilities (Week 3)
**Goal:** Build reusable workflow functions

**Tasks:**
1. Create `helpers/testdata-utils.ts`
2. Build `opprettAvtalelandSak()` workflow
3. Build `opprettUtenforAvtalelandSak()` workflow
4. Build `behandleYrkesaktivSak()` workflow
5. Create setup test file

**Validation:**
- Can create test data with 1 function call
- Workflows integrate with database helpers
- Setup tests populate data for other tests

---

### Phase 4: Mass Migration (Week 4)
**Goal:** Refactor all existing tests

**Tasks:**
1. Rename `tests/` → `specs/`
2. Organize into feature directories
3. Refactor all 5 test files to use POMs
4. Update playwright.config with project organization
5. Update CLAUDE.md

**Validation:**
- All tests pass with new structure
- Code duplication reduced by 80%
- New structure is documented

---

## Implementation Phases

### Phase 1: Foundation - Detailed Tasks

#### Task 1.1: Create Directory Structure
```bash
mkdir -p pages/shared
mkdir -p pages/opprett-ny-sak
mkdir -p pages/behandling
mkdir -p pages/trygdeavgift
mkdir -p pages/vedtak
mkdir -p utils
mkdir -p docs
mkdir -p specs/1-setup
mkdir -p specs/2-opprett-sak
mkdir -p specs/3-behandle-sak
mkdir -p specs/4-vedtak
```

#### Task 1.2: Create Shared Constants
**File:** `pages/shared/constants.ts`

```typescript
// Test user data
export const USER_ID_VALID = "30056928150";
export const USER_ID_INVALID = "INVALID123";
export const ORG_NUMBER_VALID = "999999999";

// URLs
export const BASE_URL = "http://localhost:3000";
export const MELOSYS_URL = `${BASE_URL}/melosys/`;

// Timeouts (ms)
export const TIMEOUT_SHORT = 2000;
export const TIMEOUT_MEDIUM = 5000;
export const TIMEOUT_LONG = 10000;
export const TIMEOUT_API = 15000;

// Common dropdown values
export const SAKSTYPER = {
  FTRL: 'FTRL',
  AVTALELAND: 'AVTALELAND',
} as const;

export const SAKSTEMA = {
  MEDLEMSKAP_LOVVALG: 'MEDLEMSKAP_LOVVALG',
} as const;

export const BEHANDLINGSTEMA = {
  YRKESAKTIV: 'YRKESAKTIV',
  SELVSTENDIG: 'SELVSTENDIG',
} as const;
```

#### Task 1.3: Create BasePage
**File:** `pages/shared/base.page.ts`

```typescript
import { Page, Locator, expect } from '@playwright/test';
import { FormHelper } from '../../helpers/form-helper';
import { TIMEOUT_MEDIUM } from './constants';

/**
 * Base Page Object class providing common functionality
 * All page objects should extend this class
 */
export abstract class BasePage {
  protected readonly formHelper: FormHelper;

  constructor(readonly page: Page) {
    this.formHelper = new FormHelper(page);
  }

  /**
   * Navigate to a specific URL
   */
  async goto(url: string): Promise<void> {
    await this.page.goto(url);
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Wait for element with polling strategy (from melosys-web)
   */
  async waitForElement(
    locator: Locator,
    options: { timeout?: number; state?: 'visible' | 'hidden' | 'attached' } = {}
  ): Promise<void> {
    const { timeout = TIMEOUT_MEDIUM, state = 'visible' } = options;
    await locator.waitFor({ state, timeout });
  }

  /**
   * Check if element exists and is visible
   */
  async isElementVisible(locator: Locator, timeout = 1000): Promise<boolean> {
    try {
      await locator.waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Try multiple selectors until one works (fallback pattern from melosys-web)
   */
  async trySelectors(selectors: string[]): Promise<Locator | null> {
    for (const selector of selectors) {
      const element = this.page.locator(selector);
      if (await this.isElementVisible(element)) {
        return element;
      }
    }
    return null;
  }

  /**
   * Select dropdown option by visible text (user-friendly)
   */
  async selectByVisibleText(dropdown: Locator, visibleText: string): Promise<void> {
    const options = await dropdown.locator('option').all();
    let foundValue: string | null = null;

    for (const option of options) {
      const text = await option.textContent();
      if (text?.trim() === visibleText.trim()) {
        foundValue = await option.getAttribute('value');
        break;
      }
    }

    if (!foundValue) {
      const availableOptions = await Promise.all(
        options.map(opt => opt.textContent())
      );
      throw new Error(
        `Could not find option with text "${visibleText}". ` +
        `Available options: ${availableOptions.join(', ')}`
      );
    }

    await dropdown.selectOption({ value: foundValue });
  }

  /**
   * Polling strategy for dependent dropdowns (from melosys-web)
   */
  async waitForDropdownToPopulate(
    dropdown: Locator,
    maxRetries = 50,
    retryDelay = 200
  ): Promise<void> {
    let retries = 0;
    let optionCount = await dropdown.locator('option').count();

    while (optionCount <= 1 && retries < maxRetries) {
      await this.page.waitForTimeout(retryDelay);
      optionCount = await dropdown.locator('option').count();
      retries++;
    }

    if (optionCount <= 1) {
      throw new Error(
        `Dropdown hasn't loaded values after ${maxRetries * retryDelay}ms`
      );
    }
  }

  /**
   * Fill field and wait for API response (using FormHelper)
   */
  async fillFieldWithApiWait(
    locator: Locator,
    value: string,
    apiPattern: string
  ): Promise<void> {
    await this.formHelper.fillAndWaitForApi(locator, value, apiPattern);
  }

  /**
   * Fill field and wait fixed time (using FormHelper)
   */
  async fillFieldWithDelay(
    locator: Locator,
    value: string,
    delay = 1000
  ): Promise<void> {
    await this.formHelper.fillAndWait(locator, value, delay);
  }

  /**
   * Check radio button if it exists
   */
  async checkRadioIfExists(locator: Locator): Promise<void> {
    if (await this.isElementVisible(locator)) {
      await locator.check();
    }
  }

  /**
   * Get current URL
   */
  currentUrl(): string {
    return this.page.url();
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(urlPattern: RegExp, timeout = TIMEOUT_MEDIUM): Promise<void> {
    await this.page.waitForURL(urlPattern, { timeout });
  }

  /**
   * Take screenshot for debugging
   */
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `test-results/debug-${name}.png`,
      fullPage: true,
    });
  }
}
```

#### Task 1.4: Create Error Assertion Framework
**File:** `utils/assertions.ts`

```typescript
import { Page, Locator, expect } from '@playwright/test';

/**
 * Error assertion framework ported from melosys-web
 * Provides comprehensive error checking for forms
 */

/**
 * Assert that specific errors are present (or absent if empty array)
 */
export async function assertErrors(
  scope: Page | Locator,
  expectedErrors: (string | RegExp)[]
): Promise<void> {
  // If empty array, verify NO errors present
  if (expectedErrors.length === 0) {
    await assertNoErrors(scope);
    return;
  }

  // Otherwise, verify expected errors are present
  await assertFieldErrors(scope, expectedErrors);
  await assertErrorSummary(scope, expectedErrors);
}

/**
 * Assert no errors are present on the page
 */
async function assertNoErrors(scope: Page | Locator): Promise<void> {
  // Check for field errors
  const fieldErrorSelectors = [
    '.skjemaelement__feilmelding',
    '.navds-error-message',
    '[class*="error"]',
  ];

  for (const selector of fieldErrorSelectors) {
    const errors = scope.locator(selector);
    const count = await errors.count();

    if (count > 0) {
      const errorTexts = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          errors.nth(i).textContent()
        )
      );

      throw new Error(
        `Expected no errors, but found ${count} field error(s):\n` +
        errorTexts.map((text, i) => `  ${i + 1}. ${text}`).join('\n')
      );
    }
  }

  // Check for error summary box
  const errorSummary = scope.locator('.alertstripe--advarsel, .navds-alert--error');
  const summaryCount = await errorSummary.count();

  if (summaryCount > 0) {
    const summaryText = await errorSummary.first().textContent();
    throw new Error(
      `Expected no errors, but found error summary:\n${summaryText}`
    );
  }
}

/**
 * Assert specific field errors are present
 */
async function assertFieldErrors(
  scope: Page | Locator,
  expectedErrors: (string | RegExp)[]
): Promise<void> {
  const errorLocator = scope.locator(
    '.skjemaelement__feilmelding, .navds-error-message'
  );

  for (const expectedError of expectedErrors) {
    if (typeof expectedError === 'string') {
      await expect(errorLocator).toContainText(expectedError);
    } else {
      // RegExp
      const allErrors = await errorLocator.allTextContents();
      const found = allErrors.some(text => expectedError.test(text));

      if (!found) {
        throw new Error(
          `Expected error matching ${expectedError}, but found: ${allErrors.join(', ')}`
        );
      }
    }
  }
}

/**
 * Assert error summary box contains expected errors
 */
async function assertErrorSummary(
  scope: Page | Locator,
  expectedErrors: (string | RegExp)[]
): Promise<void> {
  const errorSummary = scope.locator('.alertstripe--advarsel, .navds-alert--error');

  if (await errorSummary.count() === 0) {
    // No summary box - that's ok, field errors are enough
    return;
  }

  const summaryText = await errorSummary.first().textContent() || '';

  for (const expectedError of expectedErrors) {
    if (typeof expectedError === 'string') {
      if (!summaryText.includes(expectedError)) {
        throw new Error(
          `Expected error summary to contain "${expectedError}"\n` +
          `But found: ${summaryText}`
        );
      }
    } else {
      if (!expectedError.test(summaryText)) {
        throw new Error(
          `Expected error summary to match ${expectedError}\n` +
          `But found: ${summaryText}`
        );
      }
    }
  }
}

/**
 * Assert workflow completed successfully (no errors on final page)
 */
export async function assertWorkflowCompleted(
  page: Page,
  expectedUrl: RegExp
): Promise<void> {
  // Wait for navigation
  await page.waitForURL(expectedUrl, { timeout: 10000 });

  // Verify no errors on destination page
  await assertErrors(page, []);
}

/**
 * Assert form submission succeeded
 */
export async function assertFormSubmitted(
  page: Page,
  formPagePattern: RegExp,
  successPagePattern: RegExp
): Promise<void> {
  // Check for errors if still on form page
  if (formPagePattern.test(page.url())) {
    await assertErrors(page, []);
  }

  // Wait for navigation to success page
  await page.waitForURL(successPagePattern);

  // Verify no errors on success page
  await assertErrors(page, []);
}
```

#### Task 1.5: Create HovedsidePage (Proof of Concept)
**File:** `pages/hovedside.page.ts`

```typescript
import { Page } from '@playwright/test';
import { BasePage } from './shared/base.page';
import { MELOSYS_URL } from './shared/constants';

/**
 * Page Object for the Melosys main page (hovedside)
 *
 * Responsibilities:
 * - Navigation to main page
 * - Initiating "create new case" workflow
 * - Search functionality (future)
 */
export class HovedsidePage extends BasePage {
  // Locators
  private readonly opprettNySakButton = this.page.getByRole('button', {
    name: 'Opprett ny sak/behandling',
  });

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the main Melosys page
   */
  async goto(): Promise<void> {
    await super.goto(MELOSYS_URL);
  }

  /**
   * Click "Opprett ny sak/behandling" button
   */
  async klikkOpprettNySak(): Promise<void> {
    await this.opprettNySakButton.click();
  }

  /**
   * Navigate and click "Opprett ny sak" in one step
   */
  async gotoOgOpprettNySak(): Promise<void> {
    await this.goto();
    await this.klikkOpprettNySak();
  }

  /**
   * Verify main page is loaded
   */
  async verifiserHovedside(): Promise<void> {
    await this.waitForElement(this.opprettNySakButton);
  }
}
```

#### Task 1.6: Create Implementation Log
**File:** `docs/IMPLEMENTATION-LOG.md`

```markdown
# POM Migration Implementation Log

This document tracks the day-by-day implementation progress.

---

## 2025-11-02

### Phase 1: Foundation - Day 1

**Completed:**
- ✅ Created directory structure
- ✅ Created `pages/shared/constants.ts`
- ✅ Created `pages/shared/base.page.ts`
- ✅ Created `utils/assertions.ts` (ported from melosys-web)
- ✅ Created `pages/hovedside.page.ts` (proof of concept)
- ✅ Created `docs/POM-MIGRATION-PLAN.md`
- ✅ Created `docs/IMPLEMENTATION-LOG.md`

**Decisions Made:**
1. Extend BasePage for all POMs (composition pattern)
2. Include FormHelper in BasePage (keep our strength)
3. Port error assertions from melosys-web (proven pattern)
4. Keep fixtures and database helpers unchanged (working well)

**Next Steps:**
1. Create OpprettNySakPage + assertions
2. Create example refactored test
3. Validate that both old and new patterns work together

**Blockers:** None

---

## Template for Future Entries

## YYYY-MM-DD

### Phase X: [Phase Name] - Day N

**Completed:**
- ✅ Task 1
- ✅ Task 2

**In Progress:**
- 🔄 Task 3

**Decisions Made:**
1. Decision with rationale

**Next Steps:**
1. Next task

**Blockers:**
- Issue description

---
```

#### Task 1.7: Create Style Guide
**File:** `docs/POM-STYLE-GUIDE.md`

```markdown
# Page Object Model Style Guide

This document defines coding standards and best practices for our POM implementation.

---

## Core Principles

### 1. Single Responsibility
Each page object represents ONE page or logical UI section.

✅ **Good:**
```typescript
class OpprettNySakPage {
  // Only methods related to creating a new case
}

class BehandlingMedlemskapPage {
  // Only methods related to membership treatment section
}
```

❌ **Bad:**
```typescript
class MelosysPage {
  // Everything mixed together
  async opprettSak() {}
  async behandleMedlemskap() {}
  async fattVedtak() {}
}
```

---

### 2. Actions vs Assertions Separation

✅ **Good:**
```typescript
// opprett-ny-sak.page.ts - ACTIONS
class OpprettNySakPage {
  async fyllInnBrukerID(fnr: string) { /* action */ }
  async velgSakstype(type: string) { /* action */ }
}

// opprett-ny-sak.assertions.ts - ASSERTIONS
class OpprettNySakAssertions {
  async verifiserBrukerIDFelt() { /* verify */ }
  async verifiserSakstypeDropdown() { /* verify */ }
}
```

❌ **Bad:**
```typescript
class OpprettNySakPage {
  async fyllInnBrukerID(fnr: string) {
    await this.field.fill(fnr);
    await expect(this.field).toHaveValue(fnr); // ❌ Don't mix
  }
}
```

---

### 3. Encapsulation

Keep locators private, expose high-level methods.

✅ **Good:**
```typescript
class OpprettNySakPage {
  private readonly brukerIDField = this.page.getByRole('textbox', {
    name: 'Brukers f.nr. eller d-nr.:'
  });

  async fyllInnBrukerID(fnr: string): Promise<void> {
    await this.brukerIDField.fill(fnr);
  }
}

// Usage in test:
await opprettSak.fyllInnBrukerID('30056928150');
```

❌ **Bad:**
```typescript
class OpprettNySakPage {
  readonly brukerIDField = this.page.getByRole('textbox', {...}); // ❌ Public
}

// Usage in test:
await opprettSak.brukerIDField.fill('30056928150'); // ❌ Test knows about implementation
```

---

## Naming Conventions

### Page Classes
- `[Feature]Page` for actions
- `[Feature]Assertions` for verifications

Examples:
- `OpprettNySakPage`, `OpprettNySakAssertions`
- `TrygdeavgiftPage`, `TrygdeavgiftAssertions`

### Methods

**Actions (Norwegian - matches UI):**
- `fyllInn[Field]()` - Fill input field
- `velg[Option]()` - Select from dropdown
- `klikk[Button]()` - Click button
- `åpne[Dialog]()` - Open dialog/modal

**Assertions (Norwegian with "verifiser"):**
- `verifiser[State]()` - Verify state
- Examples: `verifiserFeltSynlig()`, `verifiserFeilmelding()`

**Navigation:**
- `goto()` - Navigate to page
- `gotoOg[Action]()` - Navigate and perform action

### Variables
- Locators: `readonly [element]Button/Field/Dropdown`
- Constants: `UPPER_SNAKE_CASE`
- Parameters: `camelCase`

---

## File Organization

### Page Files
```typescript
// pages/opprett-ny-sak/opprett-ny-sak.page.ts

import { Page } from '@playwright/test';
import { BasePage } from '../shared/base.page';
import { OpprettNySakAssertions } from './opprett-ny-sak.assertions';

/**
 * [JSDOC description]
 */
export class OpprettNySakPage extends BasePage {
  readonly assertions: OpprettNySakAssertions;

  // 1. Locators (private, readonly)
  private readonly brukerIDField = ...;
  private readonly sakstypeDropdown = ...;

  // 2. Constructor
  constructor(page: Page) {
    super(page);
    this.assertions = new OpprettNySakAssertions(page);
  }

  // 3. Public methods (alphabetically)
  async fyllInnBrukerID(fnr: string): Promise<void> { }
  async klikkOpprettNyBehandling(): Promise<void> { }
  async velgSakstype(type: string): Promise<void> { }

  // 4. Private helper methods (if needed)
  private async waitForFormToLoad(): Promise<void> { }
}
```

---

## Integration with Existing Helpers

### FormHelper
Use for fields that trigger API calls:

```typescript
class TrygdeavgiftPage extends BasePage {
  async fyllInnBruttoinntekt(beløp: string): Promise<void> {
    // Use FormHelper from BasePage
    await this.formHelper.fillAndWaitForApi(
      this.bruttoinntektField,
      beløp,
      '/trygdeavgift/beregning'
    );
  }
}
```

### Database Helper
Use in assertions for verification:

```typescript
class OpprettNySakAssertions {
  async verifiserSakOpprettetIDatabase(fnr: string): Promise<void> {
    await withDatabase(async (db) => {
      const sak = await db.queryOne(
        'SELECT * FROM SAK WHERE personnummer = :pnr',
        { pnr: fnr }
      );
      expect(sak).not.toBeNull();
    });
  }
}
```

### Fixtures
Still work automatically - no changes needed!

```typescript
test('scenario', async ({ page }) => {
  const opprettSak = new OpprettNySakPage(page);
  await opprettSak.fyllInnBrukerID('123');
  // ... test runs
}); // <- cleanup-fixture automatically cleans database
```

---

## Error Handling

### Use Error Assertions
```typescript
import { assertErrors } from '../../utils/assertions';

class OpprettNySakAssertions {
  async verifiserIngenFeil(): Promise<void> {
    await assertErrors(this.page, []);
  }

  async verifiserFeilmelding(feil: string): Promise<void> {
    await assertErrors(this.page, [feil]);
  }
}
```

### Provide Helpful Error Messages
```typescript
async velgSakstype(type: string): Promise<void> {
  try {
    await this.sakstypeDropdown.selectOption(type);
  } catch (error) {
    throw new Error(
      `Failed to select sakstype "${type}". ` +
      `Ensure the dropdown has loaded and the value exists.`
    );
  }
}
```

---

## Testing POMs

### Write Tests for Complex POMs
For POMs with complex logic (polling, retries), write unit tests:

```typescript
// pages/__tests__/base.page.spec.ts
test.describe('BasePage', () => {
  test('waitForDropdownToPopulate should poll until options appear', async ({ page }) => {
    // Test the polling logic
  });
});
```

---

## Documentation

### JSDoc for All Public Methods
```typescript
/**
 * Fill in the user's national ID number (fødselsnummer)
 *
 * @param fnr - 11-digit national ID (e.g., "30056928150")
 * @throws {Error} If field is not visible or disabled
 */
async fyllInnBrukerID(fnr: string): Promise<void> {
  await this.brukerIDField.fill(fnr);
}
```

### File-Level Documentation
```typescript
/**
 * Page Object for creating a new case in Melosys
 *
 * Responsibilities:
 * - Fill in user identification
 * - Select case type and treatment type
 * - Submit case creation form
 *
 * Related pages:
 * - HovedsidePage (navigates here)
 * - BehandlingPage (navigates after creation)
 */
export class OpprettNySakPage extends BasePage {
```

---

## Performance Considerations

### Avoid Unnecessary Waits
❌ **Bad:**
```typescript
await this.page.waitForTimeout(5000); // Arbitrary wait
```

✅ **Good:**
```typescript
await this.waitForElement(this.dropdown);
```

### Use Playwright Auto-Waiting
Playwright automatically waits for actionability. Don't add extra waits unless needed for API calls.

---

## Checklist for New POMs

- [ ] Extends `BasePage`
- [ ] Has corresponding `Assertions` class
- [ ] All locators are private and readonly
- [ ] Public methods have JSDoc
- [ ] Error messages are helpful
- [ ] Uses FormHelper for API-triggered fields
- [ ] Integrates with database helpers if needed
- [ ] Follows naming conventions
- [ ] Has file-level documentation
- [ ] Added to this guide as example (if complex pattern)

---
```

---

## Code Examples

### Example 1: Simple POM

```typescript
// pages/hovedside.page.ts
export class HovedsidePage extends BasePage {
  private readonly opprettNySakButton = this.page.getByRole('button', {
    name: 'Opprett ny sak/behandling'
  });

  async goto(): Promise<void> {
    await super.goto(MELOSYS_URL);
  }

  async klikkOpprettNySak(): Promise<void> {
    await this.opprettNySakButton.click();
  }
}
```

### Example 2: POM with Assertions

```typescript
// pages/opprett-ny-sak/opprett-ny-sak.page.ts
export class OpprettNySakPage extends BasePage {
  readonly assertions: OpprettNySakAssertions;

  constructor(page: Page) {
    super(page);
    this.assertions = new OpprettNySakAssertions(page);
  }

  async fyllInnBrukerID(fnr: string): Promise<void> {
    await this.page.getByRole('textbox', {
      name: 'Brukers f.nr. eller d-nr.:'
    }).fill(fnr);
  }
}

// pages/opprett-ny-sak/opprett-ny-sak.assertions.ts
export class OpprettNySakAssertions {
  constructor(readonly page: Page) {}

  async verifiserBehandlingOpprettet(): Promise<void> {
    await this.page.waitForURL(/\/melosys\/$/);
    await assertErrors(this.page, []);
  }
}
```

### Example 3: Test Using POMs

```typescript
// specs/2-opprett-sak/avtaleland.spec.ts
import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { withDatabase } from '../../helpers/db-helper';

test.describe('Opprett Avtaleland-sak', () => {
  test('should create new case', async ({ page }) => {
    // Setup
    const auth = new AuthHelper(page);
    await auth.login();

    // Page objects
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);

    // Actions
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID('30056928150');
    await opprettSak.velgSakstype('FTRL');
    await opprettSak.klikkOpprettNyBehandling();

    // Assertions
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Database verification (still works!)
    await withDatabase(async (db) => {
      const sak = await db.queryOne(
        'SELECT * FROM SAK WHERE personnummer = :pnr',
        { pnr: '30056928150' }
      );
      expect(sak).not.toBeNull();
    });
  });
});
```

### Example 4: Testdata Utility

```typescript
// helpers/testdata-utils.ts
import { Page } from '@playwright/test';
import { AuthHelper } from './auth-helper';
import { HovedsidePage } from '../pages/hovedside.page';
import { OpprettNySakPage } from '../pages/opprett-ny-sak/opprett-ny-sak.page';
import { withDatabase } from './db-helper';

/**
 * Create a complete Avtaleland case and return its ID
 */
export async function opprettAvtalelandSak(page: Page): Promise<string> {
  const auth = new AuthHelper(page);
  await auth.login();

  const hovedside = new HovedsidePage(page);
  await hovedside.goto();
  await hovedside.klikkOpprettNySak();

  const opprettSak = new OpprettNySakPage(page);
  await opprettSak.fyllInnBrukerID('30056928150');
  await opprettSak.velgSakstype('FTRL');
  await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
  await opprettSak.velgBehandlingstema('YRKESAKTIV');
  await opprettSak.klikkOpprettNyBehandling();

  await opprettSak.assertions.verifiserBehandlingOpprettet();

  // Get case ID from database
  const sakId = await withDatabase(async (db) => {
    const result = await db.queryOne(
      'SELECT id FROM SAK WHERE personnummer = :pnr ORDER BY id DESC',
      { pnr: '30056928150' }
    );
    return result.ID;
  });

  return sakId;
}
```

---

## Testing Strategy

### Existing Tests Continue to Work

**Important:** During migration, both old and new test styles will coexist.

```typescript
// OLD STYLE - Still works!
test('old style test', async ({ page }) => {
  await page.goto('http://localhost:3000/melosys/');
  await page.getByRole('button', { name: 'Opprett' }).click();
  // ... inline selectors
});

// NEW STYLE - Also works!
test('new style test', async ({ page }) => {
  const auth = new AuthHelper(page);
  await auth.login();

  const hovedside = new HovedsidePage(page);
  await hovedside.gotoOgOpprettNySak();
  // ... using POMs
});
```

### Validation at Each Phase

**Phase 1: Foundation**
- Run: `npm test` - all existing tests should pass
- Import POMs in a test to verify they work
- Check that fixtures still auto-cleanup

**Phase 2: Core POMs**
- Refactor 1 test to use POMs
- Verify refactored test is shorter and more readable
- Ensure test still passes with auto-cleanup

**Phase 3: Test Data Utilities**
- Create a test that uses `opprettAvtalelandSak()`
- Verify it creates data correctly
- Verify fixtures clean up after utility-created data

**Phase 4: Mass Migration**
- All tests use POMs
- Code duplication reduced by 80%
- All tests pass
- CI/CD pipeline works

---

## Success Metrics

### Quantitative Metrics

1. **Code Duplication Reduction**
   - Target: 80% reduction in duplicated code
   - Measure: Lines of code in tests before/after

2. **Test Authoring Speed**
   - Target: 50% faster to write new tests
   - Measure: Time to write new test (before: ~2 hours, after: ~1 hour)

3. **Maintenance Cost**
   - Target: UI changes require updating 1 file instead of N files
   - Measure: Number of files changed per UI update

4. **Test Readability**
   - Target: Non-developers can understand test intent
   - Measure: Qualitative review

### Qualitative Metrics

1. **Developer Experience**
   - POMs are easy to use
   - Documentation is clear
   - New team members can write tests quickly

2. **Test Stability**
   - Tests fail for the right reasons (actual bugs)
   - Fewer flaky tests
   - Better error messages when tests fail

3. **Code Quality**
   - Tests read like documentation
   - Clear separation of concerns
   - Easy to find and update specific functionality

---

## Rollback Plan

If POM migration encounters major issues:

1. **Partial Rollback**
   - Keep POMs for working areas
   - Revert problematic tests to old style
   - Both styles can coexist

2. **Full Rollback**
   - All POM files are in new directories (`pages/`, `specs/`)
   - Original tests are in `tests/`
   - Delete new directories, keep old tests

3. **Lessons Learned**
   - Document what didn't work
   - Adjust strategy for future attempt

---

## Getting Help

### Resources

1. **melosys-web E2E tests**
   - `/Users/rune/source/nav/melosys-web/tests/e2e/`
   - Reference implementation

2. **Playwright Documentation**
   - https://playwright.dev/docs/pom
   - Official POM guide

3. **This Documentation**
   - `docs/POM-MIGRATION-PLAN.md` (this file)
   - `docs/POM-STYLE-GUIDE.md`
   - `docs/IMPLEMENTATION-LOG.md`

### Questions?

When starting a new session:
1. Read `docs/IMPLEMENTATION-LOG.md` to see current progress
2. Check `docs/POM-MIGRATION-PLAN.md` for overall strategy
3. Reference `docs/POM-STYLE-GUIDE.md` for coding standards
4. Look at existing POMs in `pages/` for examples

---

## Appendix: Decision Log

### Decision 1: Extend BasePage
**Date:** 2025-11-02
**Decision:** All POMs extend BasePage
**Rationale:**
- Provides common functionality (waits, polling, FormHelper access)
- Consistent pattern across all POMs
- Easy to add new shared functionality

**Alternatives Considered:**
- Composition (pass helpers to constructor) - Too verbose
- Utility functions - Less discoverable

### Decision 2: Keep Fixtures Unchanged
**Date:** 2025-11-02
**Decision:** Don't modify cleanup-fixture.ts or docker-log-fixture.ts
**Rationale:**
- Already working perfectly
- melosys-web doesn't have this (our unique strength)
- POMs don't affect fixture behavior

### Decision 3: Actions/Assertions Separation
**Date:** 2025-11-02
**Decision:** Separate action methods from assertion methods
**Rationale:**
- Proven pattern from melosys-web
- Clearer test intent (do vs verify)
- Prevents bloated page objects

### Decision 4: Port Error Assertions from melosys-web
**Date:** 2025-11-02
**Decision:** Port `assertErrors()` framework
**Rationale:**
- Comprehensive error checking
- Handles both presence and absence of errors
- Provides detailed failure messages

---

**End of Migration Plan**
