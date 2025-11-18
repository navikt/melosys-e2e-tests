# POM Quick Start Guide

**New to the POM implementation? Start here!**

---

## 🎯 What We Built Today

### Foundation Complete ✅

We've implemented the **Page Object Model (POM)** foundation combining the best of:
- melosys-web's proven POM architecture
- Your existing strengths (fixtures, database helpers, FormHelper)

**Status:** Phase 1 Foundation - Complete
**Date:** 2025-11-02

---

## 📁 What's New

### New Files Created

```
pages/                           # NEW - Page Object Models
├── shared/
│   ├── base.page.ts            # Base class (180 lines)
│   └── constants.ts            # Shared constants
├── hovedside.page.ts           # Main page POM
└── opprett-ny-sak/
    ├── opprett-ny-sak.page.ts  # Create case actions
    └── opprett-ny-sak.assertions.ts  # Create case verifications

tests/                           # Tests (renamed file)
└── opprett-sak-pom-eksempel.spec.ts

utils/                           # NEW - Shared utilities
└── assertions.ts               # Error assertion framework

docs/                            # NEW - Documentation
├── POM-MIGRATION-PLAN.md       # Complete migration strategy (1500 lines)
├── IMPLEMENTATION-LOG.md       # Day-by-day progress log
└── POM-QUICK-START.md          # This file
```

### Updated Files

- `CLAUDE.md` - Added comprehensive POM section

---

## 🚀 Quick Examples

### Before (Old Style - Still Works!)

```typescript
test('create case', async ({ page }) => {
  await page.goto('http://localhost:3000/melosys/');
  await page.getByRole('button', { name: 'Opprett ny sak' }).click();
  await page.getByRole('textbox', { name: 'Brukers f.nr.' }).fill('30056928150');
  await page.getByLabel('Sakstype').selectOption('FTRL');
  await page.getByRole('button', { name: 'Opprett ny behandling' }).click();
});
```

**Problems:**
- 183 lines of inline selectors
- Duplicated in 3+ test files
- UI change breaks multiple tests
- Hard to read and maintain

---

### After (New POM Style - Recommended!)

```typescript
test('create case', async ({ page }) => {
  // Setup
  const auth = new AuthHelper(page);
  await auth.login();

  const hovedside = new HovedsidePage(page);
  const opprettSak = new OpprettNySakPage(page);

  // Actions - Reads like documentation!
  await hovedside.gotoOgOpprettNySak();
  await opprettSak.fyllInnBrukerID('30056928150');
  await opprettSak.velgSakstype('FTRL');
  await opprettSak.klikkOpprettNyBehandling();

  // Assertions - Separate from actions
  await opprettSak.assertions.verifiserBehandlingOpprettet();
});
```

**Benefits:**
- 80% less code (20 lines vs 183)
- UI change = update 1 POM file
- Tests read like documentation
- Reusable across all tests
- Better error messages

---

## 💡 Using POMs

### 1. Import Page Objects

```typescript
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
```

### 2. Create Instances

```typescript
const hovedside = new HovedsidePage(page);
const opprettSak = new OpprettNySakPage(page);
```

### 3. Use Actions

```typescript
// Navigation
await hovedside.goto();
await hovedside.klikkOpprettNySak();

// Form filling
await opprettSak.fyllInnBrukerID('30056928150');
await opprettSak.velgSakstype('FTRL');
await opprettSak.klikkOpprettNyBehandling();
```

### 4. Use Assertions

```typescript
// UI verification
await opprettSak.assertions.verifiserBehandlingOpprettet();

// Database verification
const sakId = await opprettSak.assertions.verifiserSakIDatabase('30056928150');
```

---

## 🔧 Key Features

### 1. BasePage - Common Functionality

All POMs extend `BasePage` and automatically get:

```typescript
class MyPage extends BasePage {
  // Available properties:
  this.page                    // Playwright Page
  this.formHelper             // FormHelper for API waits

  // Available methods:
  this.goto(url)              // Navigate
  this.waitForElement()       // Wait for element
  this.isElementVisible()     // Check visibility
  this.fillFieldWithApiWait() // Fill + wait for API
  this.waitForDropdownToPopulate() // Poll dropdowns
  this.checkRadioIfExists()   // Conditional check
  // ... and more
}
```

### 2. Actions vs Assertions Separation

```typescript
// Actions class - What you CAN DO
class OpprettNySakPage {
  async fyllInnBrukerID(fnr: string) { /* action */ }
  async klikkOpprettNyBehandling() { /* action */ }
}

// Assertions class - What you EXPECT
class OpprettNySakAssertions {
  async verifiserBehandlingOpprettet() { /* verify */ }
  async verifiserSakIDatabase(fnr: string) { /* verify */ }
}
```

### 3. Integration with Existing Helpers

**Everything still works!**

```typescript
// FormHelper - Built into BasePage
await this.formHelper.fillAndWaitForApi(field, value, '/api/endpoint');

// Database Helper - Use in assertions
await withDatabase(async (db) => {
  const result = await db.queryOne('SELECT ...');
});

// Fixtures - Still auto-cleanup!
test('scenario', async ({ page }) => {
  // Test runs...
}); // <- Cleanup happens automatically
```

### 4. Error Assertions

```typescript
import { assertErrors } from '../../utils/assertions';

// Verify NO errors
await assertErrors(page, []);

// Verify specific error
await assertErrors(page, ["Feltet er påkrevd"]);

// Multiple errors with regex
await assertErrors(page, [/påkrevd/i, "Ugyldig format"]);
```

---

## 📖 Available POMs

### Currently Implemented

**HovedsidePage** - Main page
```typescript
await hovedside.goto();
await hovedside.klikkOpprettNySak();
await hovedside.verifiserHovedside();
```

**OpprettNySakPage** - Create case
```typescript
// Actions
await opprettSak.fyllInnBrukerID('30056928150');
await opprettSak.velgSakstype('FTRL');
await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
await opprettSak.velgBehandlingstema('YRKESAKTIV');
await opprettSak.klikkOpprettNyBehandling();

// Convenience method
await opprettSak.opprettStandardSak('30056928150');

// Assertions
await opprettSak.assertions.verifiserBehandlingOpprettet();
await opprettSak.assertions.verifiserSakIDatabase('30056928150');
```

### Coming Soon

- BehandlingPage (Medlemskap, Arbeidsforhold, Lovvalg)
- TrygdeavgiftPage
- VedtakPage

---

## 🏃 Running Tests

### Run Example POM Test

```bash
# Run the example test
npm test tests/opprett-sak-pom-eksempel.spec.ts

# Run in UI mode
npm run test:ui tests/opprett-sak-pom-eksempel.spec.ts
```

### Run All Tests (Old + New)

```bash
# Both old and new style tests work!
npm test
```

---

## 📚 Documentation

### Quick References

- **This file** - Quick start guide
- `CLAUDE.md` - Updated with POM section (see "Page Object Model (POM) Pattern")
- `docs/POM-MIGRATION-PLAN.md` - Complete strategy and roadmap
- `docs/IMPLEMENTATION-LOG.md` - Day-by-day progress

### Code Examples

- `tests/opprett-sak-pom-eksempel.spec.ts` - Example test
- `pages/hovedside.page.ts` - Simple POM example
- `pages/opprett-ny-sak/opprett-ny-sak.page.ts` - Complex POM with assertions

---

## 🎯 Next Steps

### For This Session

If you want to continue today:
1. Create more POMs (BehandlingPage, TrygdeavgiftPage)
2. Refactor existing test to use POMs
3. Create testdata utilities

### For Next Session

When starting a new session:

1. **Read this file** - Quick overview
2. **Read `docs/IMPLEMENTATION-LOG.md`** - See what's been done
3. **Check `docs/POM-MIGRATION-PLAN.md`** - Full roadmap
4. **Look at examples:**
   - `pages/opprett-ny-sak/opprett-ny-sak.page.ts`
   - `tests/opprett-sak-pom-eksempel.spec.ts`

---

## ✅ What You Can Do NOW

### Write New Tests with POMs

```typescript
import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';

test('my new test', async ({ page }) => {
  const auth = new AuthHelper(page);
  await auth.login();

  const hovedside = new HovedsidePage(page);
  const opprettSak = new OpprettNySakPage(page);

  await hovedside.gotoOgOpprettNySak();
  await opprettSak.opprettStandardSak('30056928150');
  await opprettSak.assertions.verifiserBehandlingOpprettet();
});
```

### Create New POMs

Follow the pattern in existing POMs:
1. Extend `BasePage`
2. Define private locators
3. Create public action methods
4. Create separate assertions file
5. Use in tests

---

## 🔥 Key Achievements Today

✅ **Foundation Complete**
- BasePage with FormHelper integration
- Error assertion framework
- First 2 POMs (Hovedside, OpprettNySak)
- Example test showing the pattern

✅ **Backwards Compatible**
- Old tests still work
- Fixtures still work
- Database helpers still work
- FormHelper still works

✅ **Well Documented**
- 1500-line migration plan
- Updated CLAUDE.md
- Implementation log
- This quick start guide

✅ **Ready for Next Phase**
- Pattern proven to work
- TypeScript compiles successfully
- Clear path forward

---

## 💪 Remember

**The POM pattern gives you:**
- 80% less code duplication
- Single point of change for UI updates
- Tests that read like documentation
- Faster test authoring
- Better error messages

**You keep all your strengths:**
- Fixtures (auto-cleanup)
- Database helpers
- FormHelper
- Docker log checking

**Best of both worlds! 🎉**

---

**Questions? Check the docs or ask in a new session!**
