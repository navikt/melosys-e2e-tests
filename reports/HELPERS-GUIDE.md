# Test Helpers Guide

Quick reference for the helper functions available in this project.

## FormHelper

Handle dynamic forms that trigger API calls.

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

### Conditional Radio Button

Check radio only if not already checked:

```typescript
await formHelper.checkRadioIfNeeded(
  page.getByRole('radio', { name: 'Opprett ny sak' })
);
```

Or check only if it exists:

```typescript
await formHelper.checkRadioIfExists(
  page.getByRole('radio', { name: 'Opprett ny sak' })
);
```

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

## AuthHelper

Handle authentication.

```typescript
import { AuthHelper } from '../helpers/auth-helper';

const auth = new AuthHelper(page);
await auth.login();
```

**Note:** Update `helpers/auth-helper.ts` with your actual login flow.

## DatabaseHelper

Verify data in Oracle database.

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

## Complete Example

```typescript
import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth-helper';
import { FormHelper } from '../helpers/form-helper';
import { withDatabase } from '../helpers/db-helper';

test('complete workflow', async ({ page }) => {
  // Login
  const auth = new AuthHelper(page);
  await auth.login();
  
  // Setup form helper
  const formHelper = new FormHelper(page);
  
  // Navigate to your page
  await page.goto('/melosys/behandling/new');
  
  // Conditional radio button
  await formHelper.checkRadioIfNeeded(
    page.getByRole('radio', { name: 'Opprett ny sak' })
  );
  
  // Fill field with API wait
  await formHelper.fillAndWaitForApi(
    page.getByRole('textbox', { name: 'Bruttoinntekt' }),
    '100000',
    '/trygdeavgift/beregning'
  );
  
  // Continue with rest of workflow...
  await page.getByRole('button', { name: 'Lagre' }).click();
  
  // Verify in UI
  await expect(page.locator('text=/Lagret/')).toBeVisible();
  
  // Verify in database
  await withDatabase(async (db) => {
    const result = await db.queryOne(
      'SELECT * FROM BEHANDLING WHERE personnummer = :pnr',
      { pnr: '12345678901' }
    );
    expect(result).not.toBeNull();
  });
});
```

## Common Patterns

### Pattern 1: Form with Dynamic Fields

```typescript
const formHelper = new FormHelper(page);

// Fill all dynamic fields
await formHelper.fillMultipleFieldsWithApi([
  { locator: page.getByRole('textbox', { name: 'Felt 1' }), value: 'verdi', apiPattern: '/api/beregn' },
  { locator: page.getByRole('textbox', { name: 'Felt 2' }), value: 'verdi', apiPattern: '/api/beregn' },
]);
```

### Pattern 2: Optional Elements

### Pattern 3: Wait for Network

## Tips

1. **Always use FormHelper for fields that trigger API calls** - otherwise tests will be flaky
2. **Use checkRadioIfNeeded for conditional elements** - prevents errors when already selected
3. **Use fillAndWaitForNetworkIdle when in doubt** - slower but most reliable
4. **Update auth-helper.ts with your actual login flow** - the default is just a placeholder

## Examples

See `tests/form-helper-example.spec.ts` for complete working examples.
