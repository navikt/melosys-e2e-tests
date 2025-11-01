# Using showAllData() for Test Debugging

The `showAllData()` method helps you see what data exists in the database during test development and debugging.

## Basic Usage

```typescript
import { test, expect } from '@playwright/test';
import { withDatabase } from '../helpers/db-helper';
import { AuthHelper } from '../helpers/auth-helper';

test('my workflow test', async ({ page }) => {
  const auth = new AuthHelper(page);
  await auth.login();

  // ... perform your workflow ...
  await page.goto('http://localhost:3000/melosys/');
  // ... click buttons, fill forms, etc ...

  // Show what data was created (before cleanup)
  await withDatabase(async (db) => {
    await db.showAllData();
  });

  // Your assertions
  expect(page.locator('.success-message')).toBeVisible();
});
```

## Example Output

```
🔍 Analyzing database contents...

Found 61 total tables

📊 Tables with data (5 tables):

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

## When to Use

✅ **DO use when:**
- Developing a new test to see what data gets created
- Debugging why a test is failing
- Understanding the data flow in your workflow
- Verifying that cleanup is working properly

❌ **DON'T use when:**
- Running tests in CI (it adds noise to the logs)
- You already know the test works
- You're using the cleanup-fixture (it will clean the data anyway)

## Combining with Cleanup Fixture

If you're using the `cleanup-fixture`, call `showAllData()` BEFORE the test completes so you can see the data before it's cleaned:

```typescript
import { test, expect } from '../fixtures/cleanup-fixture'; // Auto-cleanup enabled
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

## Alternative: Show Only Specific Tables

If you only want to see specific data, use direct queries instead:

```typescript
await withDatabase(async (db) => {
  const behandlinger = await db.query('SELECT * FROM BEHANDLING');
  console.log('Behandlinger:', behandlinger);

  const vedtak = await db.query('SELECT * FROM VEDTAK');
  console.log('Vedtak:', vedtak);
});
```

## Tips

1. **Remove before committing** - Add `showAllData()` temporarily for debugging, then remove it before pushing
2. **Use in development** - Great for understanding how your workflow creates data
3. **Skip lookup tables** - By default, lookup tables (_TYPE, _TEMA, _STATUS) are skipped to reduce noise
4. **Include lookup tables** - Use `await db.showAllData(false)` to include them
