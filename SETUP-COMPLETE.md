# ✅ Melosys E2E Tests - Setup Complete

**Date:** October 26, 2025  
**Status:** Ready to Use 🎉

---

## What Has Been Set Up

### 📦 Project Structure

```
melosys-e2e-tests/
├── tests/
│   └── example-workflow.spec.ts    # Example test with comments
├── helpers/
│   ├── auth-helper.ts              # Authentication helper
│   └── db-helper.ts                # Oracle database helper
├── playwright.config.ts            # Playwright configuration
│   ├── ✅ Trace recording on failure
│   ├── ✅ Video recording on failure
│   ├── ✅ Screenshots on failure
│   └── ✅ Slow motion for stability
├── package.json                    # NPM scripts
├── tsconfig.json                   # TypeScript config
├── .gitignore                      # Git ignore rules
├── .env.example                    # Environment template
├── README.md                       # Full documentation
├── QUICK-START.md                  # Quick reference
└── SETUP-COMPLETE.md              # This file
```

### ✅ Features Configured

1. **Workflow Recording**
   - ✅ Codegen for automatic test generation
   - ✅ Browser opens and records your actions
   - ✅ Generates TypeScript code automatically

2. **Debugging Support**
   - ✅ Trace recording (shows every step)
   - ✅ Video recording on failure
   - ✅ Screenshots on failure
   - ✅ Network request logging
   - ✅ Console log capture

3. **Database Verification**
   - ✅ Oracle database helper
   - ✅ Query functions with TypeScript types
   - ✅ Connection pooling
   - ✅ Works with Docker Compose Oracle

4. **Test Helpers**
   - ✅ Authentication helper (customize for your needs)
   - ✅ Database verification utilities
   - ✅ Page object pattern ready

### 📋 NPM Scripts Available

```bash
npm test              # Run all tests
npm run test:headed   # Run with visible browser
npm run test:debug    # Debug mode (step through)
npm run test:ui       # Interactive UI mode
npm run codegen       # Record workflow
npm run show-report   # View HTML report
npm run show-trace    # View trace file
```

---

## 🚀 Next Steps

### 1. Verify Docker Services Are Running

```bash
cd ../melosys-docker-compose
make start-all

# Verify
curl http://localhost:3000/melosys/
curl http://localhost:8080/internal/health
```

### 2. Install Playwright Browsers (One Time)

```bash
cd /Users/rune/source/nav/melosys-e2e-tests
npx playwright install
```

This downloads Chromium, Firefox, and WebKit browsers (~500MB).

### 3. Record Your First Workflow

```bash
# Start recording
npm run codegen
```

**What happens:**
1. Browser opens at http://localhost:3000/melosys/
2. Playwright Inspector opens (shows generated code)
3. Perform your workflow in the browser
4. Code is generated automatically
5. Copy code to a new test file

**Example workflow to record:**
1. Login (if needed)
2. Navigate to oppgave list
3. Click on an oppgave
4. Fill in required fields
5. Click submit
6. Verify vedtak is created

### 4. Create Test File

Create `tests/oppgave-to-vedtak.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth-helper';
import { withDatabase } from '../helpers/db-helper';

test.describe('Oppgave to Vedtak Flow', () => {
  test('should complete workflow from oppgave to vedtak', async ({ page }) => {
    // Login
    const auth = new AuthHelper(page);
    await auth.login();
    
    // PASTE YOUR RECORDED STEPS HERE
    // The codegen tool will generate code like:
    // await page.click('button:has-text("Opprett")');
    // await page.fill('[name="personnummer"]', '12345678901');
    // etc.
    
    // Verify final state
    await expect(page.locator('text=Vedtak opprettet')).toBeVisible();
    
    // Verify database
    await withDatabase(async (db) => {
      const vedtak = await db.queryOne(
        'SELECT * FROM VEDTAK WHERE behandling_id = :id',
        { id: 123 } // Use actual ID from your test
      );
      expect(vedtak).not.toBeNull();
      expect(vedtak.STATUS).toBe('GODKJENT');
    });
  });
});
```

### 5. Run Your Test

```bash
# Run in UI mode (recommended for first time)
npm run test:ui

# Or run in headless mode
npm test tests/oppgave-to-vedtak.spec.ts
```

### 6. Debug If Needed

If test fails:

```bash
# View HTML report
npm run show-report

# View trace (shows exactly what happened)
npm run show-trace test-results/.../trace.zip
```

---

## 🎯 Use Cases

### Use Case 1: Regression Testing

**Goal:** Ensure changes don't break existing workflows

```bash
# Record all critical workflows once
npm run codegen  # Record workflow 1
# Create test file
npm run codegen  # Record workflow 2
# Create test file

# Run before making changes
npm test

# Make changes to code

# Run again to verify nothing broke
npm test
```

### Use Case 2: Local Debugging

**Goal:** Debug locally without manual clicking

```bash
# Instead of:
# 1. Start app
# 2. Click through 10 steps manually
# 3. Try to reproduce bug
# 4. Repeat...

# Do this:
npm test tests/my-workflow.spec.ts

# View trace to see exactly what happened
npm run show-trace test-results/.../trace.zip
```

### Use Case 3: Documentation

**Goal:** Document how workflows should work

```typescript
test.describe('Complete User Journey', () => {
  test('Case 1: Norwegian citizen working in Sweden', async ({ page }) => {
    // Step 1: Create case
    // Step 2: Fill in details
    // Step 3: Submit
    // etc.
  });
  
  test('Case 2: Swedish citizen working in Norway', async ({ page }) => {
    // Different workflow
  });
});
```

Tests serve as executable documentation!

---

## 💡 Tips for Success

### Recording Good Tests

1. **Wait for elements**
   ```typescript
   await page.waitForSelector('button:has-text("Save")');
   await page.click('button:has-text("Save")');
   ```

2. **Use stable selectors**
   - Prefer: `[data-testid="submit-button"]`
   - Over: `button.btn-primary.large`

3. **Add assertions**
   ```typescript
   await expect(page.locator('text=Success')).toBeVisible();
   ```

4. **Verify database state**
   ```typescript
   await withDatabase(async (db) => {
     const result = await db.queryOne('SELECT ...');
     expect(result).not.toBeNull();
   });
   ```

### Maintaining Tests

1. **Update auth-helper.ts** with your actual login flow
2. **Create page objects** for complex pages
3. **Use fixtures** for common test data
4. **Run tests in CI/CD** (GitHub Actions example in README.md)

### Debugging

1. **Use test:ui mode** during development
2. **Check traces first** when tests fail
3. **Use slowMo** to see what's happening
4. **Check screenshots** in test-results/

---

## 🆘 Need Help?

### Quick Issues

**"Services not available"**
```bash
cd ../melosys-docker-compose
make start-all
docker ps  # Verify services running
```

**"Test timeout"**
```typescript
// In playwright.config.ts
use: {
  actionTimeout: 30000,  // Increase timeout
}
```

**"Database connection failed"**
```bash
# Check Oracle is running
docker logs melosys-oracle

# Check credentials in .env
cp .env.example .env
# Edit .env with correct credentials
```

### Documentation

- **Quick Start:** `QUICK-START.md`
- **Full Documentation:** `README.md`
- **Playwright Docs:** https://playwright.dev
- **Trace Viewer:** https://playwright.dev/docs/trace-viewer

---

## ✅ Verification Checklist

Before you start recording workflows:

- [ ] Docker Compose services are running
- [ ] Can access http://localhost:3000/melosys/
- [ ] Can access http://localhost:8080/internal/health
- [ ] npm dependencies installed
- [ ] Playwright browsers installed (`npx playwright install`)
- [ ] Understand how codegen works (`npm run codegen`)
- [ ] Understand how to view traces (`npm run show-trace`)

---

## 🎉 You're Ready!

Your Playwright E2E test setup is complete and ready to use!

### Start Recording Your First Workflow:

```bash
cd /Users/rune/source/nav/melosys-e2e-tests
npm run codegen
```

### Questions?

Check the documentation files:
- `QUICK-START.md` - Fast reference
- `README.md` - Complete guide
- Example test in `tests/example-workflow.spec.ts`

---

**Happy Testing! 🎭**

The setup is designed to:
1. ✅ Make recording workflows easy (codegen)
2. ✅ Make debugging easy (traces, videos, screenshots)
3. ✅ Make tests maintainable (helpers, page objects)
4. ✅ Work with your Docker Compose stack
5. ✅ Support both local development and CI/CD

You now have a professional E2E testing setup! 🚀
