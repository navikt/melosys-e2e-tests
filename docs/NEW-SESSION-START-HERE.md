# 🚀 New Session - Start Here

**Last Updated:** 2025-11-02 (Late Evening)
**Current Status:** Phase 2 Complete - **SOME TESTS HAVE ERRORS**
**Branch:** `feature/add-poms`

---

## ⚠️ CURRENT ISSUES

### Known Failing Test

**File:** `tests/example-workflow-pom.spec.ts`

**Status:** Has errors - needs debugging

**What to do:**
1. Run the test to see the errors
2. Check the trace and screenshots
3. Fix the issues based on error messages
4. The test structure is correct, likely small selector or timing issues

---

## 🎯 Quick Start

### 1. Run Tests Without Browser Opening

**Headless mode (no browser window):**
```bash
# Run specific test
npx playwright test tests/example-workflow-pom.spec.ts --project=chromium

# Run with line reporter (cleaner output)
npx playwright test tests/example-workflow-pom.spec.ts --project=chromium --reporter=line

# Run in background (non-blocking)
npx playwright test tests/example-workflow-pom.spec.ts --project=chromium --reporter=line 2>&1 &

# Run and save output to file
npx playwright test tests/example-workflow-pom.spec.ts --project=chromium --reporter=line > test-output.txt 2>&1
```

**See results after test completes:**
```bash
# View HTML report
npm run show-report

# View specific trace
npm run show-trace test-results/[path-to-trace]/trace.zip

# View videos
npm run open-videos

# View screenshots
npm run open-screenshots
```

### 2. Debug Failing Tests

**Best approach - UI mode (interactive):**
```bash
npm run test:ui tests/example-workflow-pom.spec.ts
```

**Alternative - headed mode (see browser):**
```bash
npm run test:headed tests/example-workflow-pom.spec.ts
```

**Check what went wrong:**
```bash
# List all test result folders
ls -la test-results/

# Find the latest trace
find test-results -name "trace.zip" -type f | head -1

# View the trace
npx playwright show-trace [path-to-trace.zip]
```

---

## 📋 What Was Done This Session

### Phase 1: Foundation ✅ COMPLETE

**Created:**
- BasePage class with FormHelper integration (180 lines)
- HovedsidePage for main navigation (60 lines)
- OpprettNySakPage for case creation (150 lines) + Assertions (130 lines)
- Error assertion framework (200 lines)
- Example test with 3 scenarios - **ALL PASSING** ✅

**Files:**
- `pages/shared/base.page.ts`
- `pages/shared/constants.ts`
- `pages/hovedside.page.ts`
- `pages/opprett-ny-sak/opprett-ny-sak.page.ts`
- `pages/opprett-ny-sak/opprett-ny-sak.assertions.ts`
- `utils/assertions.ts`
- `tests/opprett-sak-pom-example.spec.ts` ✅

### Phase 2: Core POMs ✅ COMPLETE (with errors)

**Created 5 POMs for complete workflow:**

1. **MedlemskapPage** + Assertions
   - Location: `pages/behandling/medlemskap.page.ts`
   - Features: Date selection, React Select dropdown, trygdedekning
   - Convenience method: `fyllUtMedlemskap()`

2. **ArbeidsforholdPage**
   - Location: `pages/behandling/arbeidsforhold.page.ts`
   - Features: Employer selection
   - Convenience method: `fyllUtArbeidsforhold()`

3. **LovvalgPage**
   - Location: `pages/behandling/lovvalg.page.ts`
   - Features: Rules, questions, multi-step navigation
   - Convenience method: `fyllUtLovvalg()`

4. **TrygdeavgiftPage** + Assertions
   - Location: `pages/trygdeavgift/trygdeavgift.page.ts`
   - Features: Tax calculation with API wait handling
   - **CRITICAL:** Three API wait approaches
   - Convenience method: `fyllUtTrygdeavgift()`

5. **VedtakPage** + Assertions
   - Location: `pages/vedtak/vedtak.page.ts`
   - Features: Quill editor handling, decision submission
   - Convenience method: `fattVedtak()`

**Refactored Test:**
- `tests/example-workflow-pom.spec.ts` ⚠️ **HAS ERRORS**

---

## 🔍 How to Debug the Failing Test

### Step 1: Run the Test

```bash
# Run in headless mode to see errors quickly
npx playwright test tests/example-workflow-pom.spec.ts --project=chromium --reporter=line
```

### Step 2: Check Output

The test will show you:
- Which step failed
- The error message
- Which POM/method had the issue

### Step 3: View Trace (BEST for debugging)

```bash
# Find the trace file
ls -la test-results/

# Open the trace
npx playwright show-trace test-results/[folder-name]/trace.zip
```

**Trace shows:**
- Every action taken
- Screenshots at each step
- Network requests
- Console logs
- Timing information

### Step 4: Common Issues to Check

**Issue 1: Selector not found**
```
Error: Locator.click: Error: element not found
```
**Fix:** Check if the selector changed or element is hidden
**Where:** Open POM file, update the locator

**Issue 2: Timeout waiting for element**
```
Error: Timeout 5000ms exceeded
```
**Fix:** Element may take longer to load, increase timeout
**Where:** Add `{ timeout: 10000 }` to waitFor calls

**Issue 3: API wait failed**
```
Error: waiting for response failed
```
**Fix:** API endpoint may have changed
**Where:** Check TrygdeavgiftPage API wait URL

**Issue 4: Button not enabled**
```
Error: expect(locator).toBeEnabled
```
**Fix:** Check if validation is failing, or need to wait longer
**Where:** Add logging before button click to debug

### Step 5: Add Debug Logging

Add to the failing POM method:
```typescript
console.log('🔍 DEBUG: Current URL:', this.currentUrl());
console.log('🔍 DEBUG: Checking if element visible...');
await this.screenshot('debug-before-click');
```

### Step 6: Run Test in UI Mode

```bash
npm run test:ui tests/example-workflow-pom.spec.ts
```

This lets you:
- Step through the test
- See what's happening
- Pause and inspect
- Rerun specific steps

---

## 📁 Project Structure

```
melosys-e2e-tests/
├── pages/                          # Page Object Models
│   ├── shared/
│   │   ├── base.page.ts           # Base class ✅
│   │   └── constants.ts           # Shared constants ✅
│   ├── hovedside.page.ts          # Main page ✅
│   ├── opprett-ny-sak/
│   │   ├── opprett-ny-sak.page.ts          # Create case ✅
│   │   └── opprett-ny-sak.assertions.ts    # Verifications ✅
│   ├── behandling/
│   │   ├── medlemskap.page.ts              # Membership ✅
│   │   ├── medlemskap.assertions.ts        # Verifications ✅
│   │   ├── arbeidsforhold.page.ts          # Employment ✅
│   │   └── lovvalg.page.ts                 # Rules ✅
│   ├── trygdeavgift/
│   │   ├── trygdeavgift.page.ts            # Tax calc ✅
│   │   └── trygdeavgift.assertions.ts      # Verifications ✅
│   └── vedtak/
│       ├── vedtak.page.ts                  # Decision ✅
│       └── vedtak.assertions.ts            # Verifications ✅
│
├── tests/
│   ├── opprett-sak-pom-example.spec.ts    # ✅ PASSING
│   ├── example-workflow-pom.spec.ts       # ⚠️ HAS ERRORS
│   ├── example-workflow.spec.ts           # Old style (still works)
│   └── [other old tests]                  # Still work
│
├── utils/
│   └── assertions.ts                       # Error framework ✅
│
├── helpers/                                # Unchanged ✅
├── fixtures/                               # Unchanged ✅
│
└── docs/
    ├── NEW-SESSION-START-HERE.md          # This file
    ├── POM-MIGRATION-PLAN.md              # Complete strategy
    ├── POM-QUICK-START.md                 # Quick reference
    └── IMPLEMENTATION-LOG.md              # Progress log
```

---

## 🛠️ Useful Commands

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test tests/example-workflow-pom.spec.ts

# Run specific test by name
npx playwright test "should complete entire workflow" --project=chromium

# Run in UI mode (BEST for development/debugging)
npm run test:ui

# Run in headed mode (see browser)
npm run test:headed

# Run specific test in UI mode
npm run test:ui tests/example-workflow-pom.spec.ts
```

### Viewing Results

```bash
# HTML report
npm run show-report

# Specific trace
npx playwright show-trace test-results/[path]/trace.zip

# Videos
npm run open-videos

# Screenshots
npm run open-screenshots

# Clean results
npm run clean-results
```

### TypeScript Check

```bash
# Check all files
npx tsc --noEmit

# Check specific files
npx tsc --noEmit pages/**/*.ts tests/example-workflow-pom.spec.ts
```

### Git

```bash
# Check current branch
git branch

# See recent commits
git log --oneline -5

# See what changed
git diff

# Commit fixes
git add [files]
git commit -m "Fix example-workflow-pom.spec.ts issues"
```

---

## 📖 Documentation to Read

### Must Read (5 min each)

1. **This file** - Current status and how to run tests
2. **`docs/POM-QUICK-START.md`** - Quick POM reference
3. **`docs/IMPLEMENTATION-LOG.md`** - What was done, decisions made

### Reference (when needed)

4. **`docs/POM-MIGRATION-PLAN.md`** - Complete strategy and examples
5. **`CLAUDE.md`** - Project overview and patterns

---

## 🎯 Next Steps (Priority Order)

### HIGH PRIORITY

1. **Fix `example-workflow-pom.spec.ts`**
   - Run the test
   - Check trace for errors
   - Fix issues in POMs or test
   - Validate all POMs work correctly

### MEDIUM PRIORITY

2. **Validate all POMs individually**
   - Create small test for each POM
   - Ensure each page works in isolation
   - Fix any selector or timing issues

3. **Test the working example**
   ```bash
   npm test tests/opprett-sak-pom-example.spec.ts
   ```
   - This should still pass
   - If not, something broke

### LOW PRIORITY

4. **Phase 3: Test Data Utilities** (Optional)
   - Create `helpers/testdata-utils.ts`
   - Build composite workflows

5. **Refactor more tests** (Optional)
   - Convert existing tests to use POMs
   - Reduce code duplication

---

## 🔧 Common Fixes

### Fix 1: Element Not Found

```typescript
// Problem
await this.someButton.click(); // ❌ Not found

// Solution 1: Add wait
await this.someButton.waitFor({ state: 'visible', timeout: 5000 });
await this.someButton.click(); // ✅

// Solution 2: Check selector in trace, update locator
private readonly someButton = this.page.getByRole('button', {
  name: 'Corrected Button Text' // Updated
});
```

### Fix 2: Timing Issues

```typescript
// Problem
await this.dropdown.selectOption('value');
await this.nextField.fill('text'); // ❌ Next field not ready

// Solution: Add wait between steps
await this.dropdown.selectOption('value');
await this.page.waitForTimeout(500); // Wait for dependent field
await this.nextField.waitFor({ state: 'visible' });
await this.nextField.fill('text'); // ✅
```

### Fix 3: API Wait Not Working

```typescript
// Problem
await this.field.fill('value');
await this.page.waitForResponse(...); // ❌ API already responded

// Solution: Create promise BEFORE action
const responsePromise = this.page.waitForResponse(
  response => response.url().includes('/api/endpoint')
);
await this.field.fill('value'); // Triggers API
await responsePromise; // ✅ Wait for response
```

---

## 💡 Tips for Debugging

### 1. Use Console Logging

Add to POMs:
```typescript
console.log('🔍 DEBUG: About to click button');
console.log('🔍 DEBUG: Current URL:', this.currentUrl());
console.log('🔍 DEBUG: Button visible:', await this.isElementVisible(this.button));
```

### 2. Take Screenshots

Add to POMs:
```typescript
await this.screenshot('before-click');
await this.button.click();
await this.screenshot('after-click');
```

### 3. Check Element States

```typescript
const button = this.page.getByRole('button', { name: 'Submit' });

// Check all states
console.log('Visible:', await button.isVisible());
console.log('Enabled:', await button.isEnabled());
console.log('Text:', await button.textContent());
console.log('Count:', await this.page.getByRole('button', { name: 'Submit' }).count());
```

### 4. Slow Down Tests

In `playwright.config.ts`:
```typescript
use: {
  slowMo: 500, // Slow down by 500ms per action
}
```

### 5. Use Playwright Inspector

```bash
npx playwright test --debug tests/example-workflow-pom.spec.ts
```

This opens inspector where you can:
- Step through each action
- Inspect elements
- See selectors
- Edit and rerun

---

## 📝 Example Debugging Session

**Scenario:** Test fails with "element not found"

```bash
# Step 1: Run test to see error
npx playwright test tests/example-workflow-pom.spec.ts --reporter=line

# Output shows:
# Error: Locator.click: Error: element with text "Bekreft" not found
# at LovvalgPage.klikkBekreftOgFortsett

# Step 2: Open trace
npx playwright show-trace test-results/[latest]/trace.zip

# In trace:
# - See screenshot shows button text is "Bekreft og fortsett" not "Bekreft"
# - Selector is wrong!

# Step 3: Fix the POM
# Edit pages/behandling/lovvalg.page.ts
# Change:
private readonly bekreftButton = this.page.getByRole('button', {
  name: 'Bekreft' // ❌ Wrong
});

# To:
private readonly bekreftButton = this.page.getByRole('button', {
  name: 'Bekreft og fortsett' // ✅ Correct
});

# Step 4: Re-run test
npx playwright test tests/example-workflow-pom.spec.ts --reporter=line

# Step 5: Success! ✅
```

---

## 🎓 Key Concepts

### 1. POMs Encapsulate Selectors

**Good:**
```typescript
// In POM
private readonly submitButton = this.page.getByRole('button', { name: 'Submit' });
async submit() { await this.submitButton.click(); }

// In test
await myPage.submit(); // ✅ Clean, encapsulated
```

**Bad:**
```typescript
// In test
await page.getByRole('button', { name: 'Submit' }).click(); // ❌ Inline selector
```

### 2. Use Convenience Methods

**Good:**
```typescript
// Single method call
await medlemskap.fyllUtMedlemskap(); // ✅ Fast, standard values
```

**Also Good (when you need custom values):**
```typescript
// Individual method calls
await medlemskap.velgPeriode('01.01.2024', '31.12.2024');
await medlemskap.velgLand('Norge');
await medlemskap.velgTrygdedekning('FULL_DEKNING');
```

### 3. Separate Actions from Assertions

**Good:**
```typescript
// Actions
await opprettSak.fyllInnBrukerID('123');
await opprettSak.klikkOpprettNyBehandling();

// Then assertions
await opprettSak.assertions.verifiserBehandlingOpprettet();
```

### 4. Use FormHelper for API Calls

**Good:**
```typescript
// In TrygdeavgiftPage
await this.fyllInnBruttoinntektMedApiVent('100000'); // ✅ Waits for API
```

**Bad:**
```typescript
await this.bruttoinntektField.fill('100000'); // ❌ Doesn't wait for API
await this.klikkBekreftOgFortsett(); // ❌ Button not enabled yet!
```

---

## ✅ Success Criteria

You'll know you're done when:

1. ✅ `tests/example-workflow-pom.spec.ts` passes
2. ✅ `tests/opprett-sak-pom-example.spec.ts` still passes
3. ✅ All POMs work correctly
4. ✅ No TypeScript errors
5. ✅ Trace shows complete workflow
6. ✅ Fixtures still auto-cleanup

---

## 🆘 If You Get Stuck

### Check These First

1. **Is Docker running?**
   ```bash
   cd ../melosys-docker-compose
   make start-all
   # Wait for services to be healthy
   ```

2. **Are services healthy?**
   ```bash
   curl http://localhost:3000/melosys/
   # Should return HTML
   ```

3. **TypeScript compiling?**
   ```bash
   npx tsc --noEmit
   # Should show no errors in POM files
   ```

4. **Old tests still work?**
   ```bash
   npm test tests/example-workflow.spec.ts
   # Should pass - proves infrastructure works
   ```

### Where to Look

1. **Trace files** - Most comprehensive debugging info
2. **Screenshots** - See what browser saw
3. **Videos** - See full test execution
4. **Console logs** - See logging output
5. **Implementation log** - See what was done and why

---

## 📞 Getting Help

### Information to Gather

When asking for help, provide:

1. **Error message**
   ```
   Copy the full error from terminal
   ```

2. **Which test**
   ```
   tests/example-workflow-pom.spec.ts
   Test: "should complete entire workflow"
   ```

3. **Which step failed**
   ```
   📝 Step 3: Filling medlemskap information...
   Error: element not found
   ```

4. **Trace file location**
   ```
   test-results/example-workflow-pom-[hash]/trace.zip
   ```

5. **What you tried**
   ```
   - Checked selector in trace
   - Updated locator
   - Still failing
   ```

---

## 🎯 TL;DR - Start Here

```bash
# 1. Run the failing test
npx playwright test tests/example-workflow-pom.spec.ts --reporter=line

# 2. See what failed
# (Read the error message)

# 3. View the trace
find test-results -name "trace.zip" -type f | head -1
npx playwright show-trace [path-from-above]

# 4. Fix the issue in the POM or test

# 5. Re-run test
npx playwright test tests/example-workflow-pom.spec.ts --reporter=line

# 6. Repeat until green ✅
```

**Good luck! The foundation is solid, just needs some debugging! 🚀**

---

**Last Session Commit:** `f4e6320`
**Branch:** `feature/add-poms`
**Status:** Phase 2 Complete - Needs Debugging
