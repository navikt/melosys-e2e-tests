# 🚀 Quick Start Guide

## Setup (One Time)

```bash
cd melosys-e2e-tests

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install
```

## Recording Your First Workflow

### 1. Start Docker Services

```bash
cd ../melosys-docker-compose
make start-all

# Verify services are running
curl http://localhost:3000/melosys/
```

### 2. Record Workflow

```bash
cd ../melosys-e2e-tests

# Start recording
npm run codegen
```

A browser will open. Perform your workflow:
1. Login
2. Navigate through your flow (e.g., oppgave → behandling → vedtak)
3. Playwright records every action
4. Copy the generated code

### 3. Create Test File

Create `tests/my-workflow.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth-helper';

test('my workflow', async ({ page }) => {
  const auth = new AuthHelper(page);
  await auth.login();
  
  // PASTE RECORDED STEPS HERE
  
  // Add assertions
  await expect(page.locator('text=Success')).toBeVisible();
});
```

### 4. Run Test

```bash
# Run test
npm test tests/my-workflow.spec.ts

# Or run in UI mode (recommended for development)
npm run test:ui
```

## Common Commands

```bash
# Record workflow
npm run codegen

# Run all tests
npm test

# Run specific test
npm test tests/my-workflow.spec.ts

# Interactive UI mode (best for development)
npm run test:ui

# Debug mode (step through)
npm run test:debug

# View test report
npm run show-report

# View trace after test failure
npm run show-trace test-results/.../trace.zip
```

## Debugging a Failed Test

When a test fails:

```bash
# 1. View HTML report
npm run show-report

# 2. Open the trace file
npm run show-trace test-results/my-workflow-chromium/trace.zip
```

The trace shows:
- Every action
- Screenshots at each step
- Network requests
- Console logs
- DOM snapshots

## Tips

### Recording Stable Tests

1. Wait for elements to be visible before clicking
2. Use data-testid attributes when possible
3. Add meaningful waits: `await page.waitForLoadState('networkidle')`

### Debugging Locally

Instead of clicking through manually:
1. Record the workflow once
2. Run the test to replay it
3. Use trace viewer to see what happened

### Database Verification

Add database checks to verify data:

```typescript
import { withDatabase } from '../helpers/db-helper';

await withDatabase(async (db) => {
  const result = await db.queryOne(
    'SELECT * FROM BEHANDLING WHERE id = :id',
    { id: 123 }
  );
  expect(result).not.toBeNull();
});
```

## Next Steps

1. ✅ Record your first workflow
2. ✅ Add assertions
3. ✅ Add database verification
4. ✅ Run test and verify trace
5. ✅ Create more workflows

---

Need help? Check README.md for detailed documentation.
