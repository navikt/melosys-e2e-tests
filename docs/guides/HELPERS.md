# Test Helpers Guide

Comprehensive reference for all helper utilities in the project.

---

## Quick Reference

| Helper | Purpose | Import |
|--------|---------|--------|
| **FormHelper** | Handle dynamic forms with API triggers | `import { FormHelper } from '../helpers/form-helper'` |
| **AuthHelper** | Authentication and login | `import { AuthHelper } from '../helpers/auth-helper'` |
| **DatabaseHelper** | Oracle database queries and verification | `import { withDatabase } from '../helpers/db-helper'` |
| **MockHelper** | Clear mock service data | `import { clearMockData } from '../helpers/mock-helper'` |

---

## 1. FormHelper

Handle dynamic forms that trigger API calls. **Critical for preventing flaky tests.**

### Import

```typescript
import { FormHelper } from '../helpers/form-helper';

const formHelper = new FormHelper(page);
```

### Fill Field with API Wait

For fields that trigger API calls (like Bruttoinntekt):

```typescript
await formHelper.fillAndWaitForApi(
  page.getByRole('textbox', { name: 'Bruttoinntekt' }),
  '100000',
  '/trygdeavgift/beregning'
);
```

**What it does:**
1. Fills the field with the value
2. Presses Tab (to trigger blur event)
3. Waits for the API response
4. Waits 100ms for UI to update

### Fill with Network Idle (Most Reliable)

When you're not sure which API is called:

```typescript
await formHelper.fillAndWaitForNetworkIdle(
  page.getByRole('textbox', { name: 'Bruttoinntekt' }),
  '100000'
);
```

**Note:** Slower but handles all network activity automatically.

### Fill Multiple Fields

Fill multiple fields that each trigger APIs:

```typescript
await formHelper.fillMultipleFieldsWithApi([
  {
    locator: page.getByRole('textbox', { name: 'Bruttoinntekt' }),
    value: '100000',
    apiPattern: '/trygdeavgift/beregning'
  },
  {
    locator: page.getByRole('textbox', { name: 'Arbeidstimer' }),
    value: '37.5',
    apiPattern: '/trygdeavgift/beregning'
  }
]);
```

### Conditional Radio Button

Check radio only if not already checked:

```typescript
await formHelper.checkRadioIfNeeded(
  page.getByRole('radio', { name: 'Opprett ny sak' })
);
```

Or check only if it exists (useful for optional elements):

```typescript
await formHelper.checkRadioIfExists(
  page.getByRole('radio', { name: 'Opprett ny sak' })
);
```

### Conditional Checkbox

```typescript
await formHelper.checkCheckboxIfNeeded(
  page.getByRole('checkbox', { name: 'Godta vilkår' })
);
```

### Conditional Click

Click button only if it exists (useful for optional dialogs):

```typescript
await formHelper.clickIfExists(
  page.getByRole('button', { name: 'Lukk' })
);
```

### Common Patterns

**Pattern 1: Form with Multiple Dynamic Fields**
```typescript
const formHelper = new FormHelper(page);

await formHelper.fillMultipleFieldsWithApi([
  { locator: page.getByRole('textbox', { name: 'Felt 1' }), value: 'verdi', apiPattern: '/api/beregn' },
  { locator: page.getByRole('textbox', { name: 'Felt 2' }), value: 'verdi', apiPattern: '/api/beregn' },
]);
```

**Pattern 2: Optional Elements**
```typescript
// Check radio only if it exists (won't fail if missing)
await formHelper.checkRadioIfExists(
  page.getByRole('radio', { name: 'Optional Choice' })
);

// Click button only if it exists
await formHelper.clickIfExists(
  page.getByRole('button', { name: 'Optional Button' })
);
```

**Pattern 3: Network Idle for Complex Forms**
```typescript
// When you don't know which API is called
await formHelper.fillAndWaitForNetworkIdle(
  page.getByRole('textbox', { name: 'Complex Field' }),
  'value'
);
```

---

## 2. AuthHelper

Handle authentication and login.

### Basic Usage

```typescript
import { AuthHelper } from '../helpers/auth-helper';

const auth = new AuthHelper(page);
await auth.login();
```

### Customization

**Note:** Update `helpers/auth-helper.ts` with your actual login flow. The default implementation is a placeholder.

```typescript
// In helpers/auth-helper.ts
export class AuthHelper {
  async login(): Promise<void> {
    // TODO: Customize with your actual login flow
    // Example:
    await this.page.goto('/login');
    await this.page.fill('[name=username]', 'testuser');
    await this.page.fill('[name=password]', 'password');
    await this.page.click('[type=submit]');
    await this.page.waitForURL('/melosys/');
  }
}
```

---

## 3. DatabaseHelper

Query and verify data in the Oracle database.

### Basic Query

```typescript
import { withDatabase } from '../helpers/db-helper';

await withDatabase(async (db) => {
  const behandling = await db.queryOne(
    'SELECT * FROM BEHANDLING WHERE id = :id',
    { id: 123 }
  );

  expect(behandling).not.toBeNull();
  expect(behandling.STATUS).toBe('OPPRETTET');
});
```

### Query Multiple Rows

```typescript
await withDatabase(async (db) => {
  const behandlinger = await db.query(
    'SELECT * FROM BEHANDLING WHERE sak_id = :sakId',
    { sakId: 456 }
  );

  expect(behandlinger.length).toBeGreaterThan(0);
});
```

### Clean Database (Manual)

```typescript
await withDatabase(async (db) => {
  await db.cleanDatabase(); // Removes all data except lookup tables
});
```

**Note:** Automatic cleanup is handled by fixtures. Manual cleanup is rarely needed.

### Show All Data (Debugging)

Display all tables with data (useful during test development):

```typescript
await withDatabase(async (db) => {
  await db.showAllData();
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

**When to use:**
- ✅ Developing a new test to see what data gets created
- ✅ Debugging why a test is failing
- ✅ Understanding the data flow in your workflow
- ✅ Verifying that cleanup is working properly

**When NOT to use:**
- ❌ Running tests in CI (adds noise to logs)
- ❌ You already know the test works
- ❌ In final committed tests (debugging only)

**With fixtures:**
Call `showAllData()` BEFORE the test completes so you see data before auto-cleanup:

```typescript
import { test, expect } from '../fixtures';
import { withDatabase } from '../helpers/db-helper';

test('my workflow test', async ({ page }) => {
  // ... perform workflow ...

  // Show data before auto-cleanup runs
  await withDatabase(async (db) => {
    await db.showAllData();
  });

  // Test ends here - cleanup-fixture will clean database automatically
});
```

### Show Only Specific Tables

For targeted debugging, use direct queries:

```typescript
await withDatabase(async (db) => {
  const behandlinger = await db.query('SELECT * FROM BEHANDLING');
  console.log('Behandlinger:', behandlinger);

  const vedtak = await db.query('SELECT * FROM VEDTAK');
  console.log('Vedtak:', vedtak);
});
```

### Tips

1. **Remove before committing** - Add `showAllData()` temporarily for debugging, then remove before pushing
2. **Use in development** - Great for understanding how workflows create data
3. **Skip lookup tables** - By default, lookup tables (_TYPE, _TEMA, _STATUS) are skipped to reduce noise
4. **Include lookup tables** - Use `await db.showAllData(false)` to include them

---

## 4. MockHelper

Clear mock service data (journalposter and oppgaver).

### Import

```typescript
import { clearMockData } from '../helpers/mock-helper';
```

### Clear Mock Data

```typescript
await clearMockData(page.request);
```

**What it clears:**
- Journalposter from melosys-mock
- Oppgaver from melosys-mock

**Note:** Automatic cleanup is handled by fixtures. Manual cleanup is rarely needed.

---

## Complete Example

Putting it all together:

```typescript
import { test, expect } from '../fixtures';
import { AuthHelper } from '../helpers/auth-helper';
import { FormHelper } from '../helpers/form-helper';
import { withDatabase } from '../helpers/db-helper';

test('complete workflow', async ({ page }) => {
  // 1. Login
  const auth = new AuthHelper(page);
  await auth.login();

  // 2. Setup form helper
  const formHelper = new FormHelper(page);

  // 3. Navigate to your page
  await page.goto('/melosys/behandling/new');

  // 4. Conditional radio button
  await formHelper.checkRadioIfNeeded(
    page.getByRole('radio', { name: 'Opprett ny sak' })
  );

  // 5. Fill field with API wait
  await formHelper.fillAndWaitForApi(
    page.getByRole('textbox', { name: 'Bruttoinntekt' }),
    '100000',
    '/trygdeavgift/beregning'
  );

  // 6. Submit form
  await page.getByRole('button', { name: 'Lagre' }).click();

  // 7. Verify in UI
  await expect(page.locator('text=/Lagret/')).toBeVisible();

  // 8. Verify in database
  await withDatabase(async (db) => {
    const result = await db.queryOne(
      'SELECT * FROM BEHANDLING WHERE personnummer = :pnr',
      { pnr: '12345678901' }
    );
    expect(result).not.toBeNull();
    expect(result.STATUS).toBe('OPPRETTET');
  });

  // 9. Debug if needed (remove before committing)
  // await withDatabase(async (db) => {
  //   await db.showAllData();
  // });
});
```

---

## Best Practices

### FormHelper

✅ **DO:**
- Use `fillAndWaitForApi` for fields that trigger API calls
- Use `checkRadioIfNeeded` for conditional elements
- Use `fillAndWaitForNetworkIdle` when in doubt (slower but reliable)

❌ **DON'T:**
- Fill API-triggered fields without waiting (causes flaky tests)
- Check radio buttons without checking if already selected (causes errors)

### DatabaseHelper

✅ **DO:**
- Verify critical data in database after workflows
- Use `showAllData()` during development to understand data flow
- Remove `showAllData()` calls before committing

❌ **DON'T:**
- Commit tests with `showAllData()` calls (debugging only)
- Manually clean database unless you have a specific reason (fixtures handle it)

### AuthHelper

✅ **DO:**
- Update `auth-helper.ts` with your actual login flow
- Reuse the same helper across all tests

❌ **DON'T:**
- Implement login logic inline in each test
- Skip authentication when testing protected pages

---

## Common Patterns

### Pattern 1: Test with Database Verification

```typescript
test('workflow creates data', async ({ page }) => {
  const auth = new AuthHelper(page);
  await auth.login();

  // Perform workflow...

  // Verify in database
  await withDatabase(async (db) => {
    const sak = await db.queryOne(
      'SELECT * FROM SAK WHERE personnummer = :pnr',
      { pnr: '12345678901' }
    );
    expect(sak).not.toBeNull();
  });
});
```

### Pattern 2: Test with Dynamic Forms

```typescript
test('workflow with API-triggered fields', async ({ page }) => {
  const auth = new AuthHelper(page);
  await auth.login();

  const formHelper = new FormHelper(page);

  // Fill multiple fields that trigger APIs
  await formHelper.fillMultipleFieldsWithApi([
    { locator: page.getByRole('textbox', { name: 'Field 1' }), value: 'value', apiPattern: '/api/calculate' },
    { locator: page.getByRole('textbox', { name: 'Field 2' }), value: 'value', apiPattern: '/api/calculate' },
  ]);
});
```

### Pattern 3: Test with Conditional Elements

```typescript
test('workflow with optional elements', async ({ page }) => {
  const auth = new AuthHelper(page);
  await auth.login();

  const formHelper = new FormHelper(page);

  // Check radio only if it exists
  await formHelper.checkRadioIfExists(
    page.getByRole('radio', { name: 'Optional' })
  );

  // Click button only if it exists
  await formHelper.clickIfExists(
    page.getByRole('button', { name: 'Optional' })
  );
});
```

---

## Tips

1. **Always use FormHelper for fields that trigger API calls** - otherwise tests will be flaky
2. **Use checkRadioIfNeeded for conditional elements** - prevents errors when already selected
3. **Use fillAndWaitForNetworkIdle when in doubt** - slower but most reliable
4. **Update auth-helper.ts with your actual login flow** - the default is just a placeholder
5. **Use database verification for critical workflows** - ensures data is actually persisted
6. **Remove showAllData() before committing** - it's for debugging only

---

## Migration from Old Patterns

**Old way (inline selectors, no helpers):**
```typescript
// ❌ Flaky - no API wait
await page.getByRole('textbox', { name: 'Bruttoinntekt' }).fill('100000');
await page.getByRole('textbox', { name: 'Bruttoinntekt' }).press('Tab');
// Button might not be enabled yet!
```

**New way (using helpers):**
```typescript
// ✅ Reliable - waits for API
const formHelper = new FormHelper(page);
await formHelper.fillAndWaitForApi(
  page.getByRole('textbox', { name: 'Bruttoinntekt' }),
  '100000',
  '/trygdeavgift/beregning'
);
```

---

## Related Documentation

- **Fixtures Guide**: `docs/guides/FIXTURES.md` - Automatic cleanup and monitoring
- **Troubleshooting Guide**: `docs/guides/TROUBLESHOOTING.md` - Common issues and solutions
- **POM Guide**: `docs/pom/QUICK-START.md` - Page Object Model usage (integrates helpers)
