# Race Condition Debugging - Learnings and Strategies

**Date:** 2025-11-22
**Status:** Ongoing Investigation
**Issue:** Intermittent timeout waiting for employer checkbox in "Arbeid i flere land" workflow

---

## 🎯 Executive Summary

We've been debugging intermittent race conditions in the "Arbeid i flere land" E2E tests. Despite implementing network idle waits, increased timeouts, and React render delays, we're still seeing **flaky failures** where the employer checkbox doesn't appear within 45 seconds.

**Key Learning:** Simple timeout increases and network idle waits are **necessary but not sufficient** for deeply nested multi-step workflows with complex frontend state management.

---

## 📊 Problem Timeline

### Initial Issue (Run 1-3)
- **Error:** Timeout waiting for `velgArbeidsgiver` checkbox
- **Failure Rate:** ~33% (2 pass, 1 fail)
- **Fix Applied:** Network idle waits + increased timeouts

### After First Fix (Run 4-6)
- **Error:** Timeout on different checkbox (`bekreftArbeidIFlereLand`)
- **Failure Rate:** 100% (different test file)
- **Fix Applied:** More network idle waits across all step methods

### After Second Fix (Run 7-8)
- **Error:** Test timeout (60s exceeded)
- **Fix Applied:** Increased test timeout to 120s

### After Third Fix (Run 9)
- **Error:** Wrong page object used
- **Fix Applied:** Use `ArbeidFlereLandBehandlingPage` instead

### Current Issue (Run 10+)
- **Error:** SAME checkbox timeout (`velgArbeidsgiver`)
- **Failure Rate:** Flaky (intermittent, no logs captured)
- **Status:** ⚠️ UNRESOLVED

---

## 🔍 What We've Tried

### Strategy 1: Network Idle Waits ✅ Partially Effective

```typescript
await this.page.waitForLoadState('networkidle', { timeout: 15000 });
await this.page.waitForTimeout(1000); // React render
await checkbox.waitFor({ state: 'visible', timeout: 45000 });
```

**What it solves:**
- ✅ Ensures backend API calls have completed
- ✅ Gives React time to process state updates
- ✅ Handles slow CI environments

**What it doesn't solve:**
- ❌ Frontend errors that prevent rendering
- ❌ Backend errors that prevent data from arriving
- ❌ Navigation state issues (wrong step)
- ❌ Complex React state management issues

### Strategy 2: Increased Timeouts ✅ Partially Effective

**Element visibility:** 30s → 45s
**Network idle:** 10s → 15s
**Test timeout:** 60s → 120s

**What it solves:**
- ✅ Accommodates slow CI environments
- ✅ Gives more time for complex operations

**What it doesn't solve:**
- ❌ Fundamental issues where element never appears
- ❌ Makes tests slower without fixing root cause

### Strategy 3: Correct Page Object ✅ Necessary

**Issue:** Test was using `EuEosArbeidFlereLandPage` instead of `ArbeidFlereLandBehandlingPage`

**What it solved:**
- ✅ Ensures all tests use the robust implementation
- ✅ Consistency across test suite

**What it didn't solve:**
- ❌ The underlying intermittent issue

---

## 🐛 Current Failure Analysis

### The Error

```
TimeoutError: locator.waitFor: Timeout 45000ms exceeded.
Call log:
  - waiting for getByRole('checkbox', { name: 'Ståles Stål AS' }) to be visible

at arbeid-flere-land-behandling.page.ts:92
```

### Why It's Flaky

**Flaky = Intermittent failures that don't happen consistently**

Possible causes:
1. **Backend timing variations** - Sometimes data loads fast, sometimes slow
2. **CI resource contention** - Shared CI resources cause variable performance
3. **React state race** - Complex state updates sometimes fail/delay
4. **Hidden frontend errors** - JS errors that don't throw but prevent rendering
5. **Step navigation issue** - Sometimes not on the right step when trying to select employer

### Critical Questions to Answer

1. **Is the page even on the employer selection step?**
   - Need to log current URL when timeout occurs
   - Check page content to see what step we're actually on

2. **Are there frontend errors?**
   - Check browser console for JS errors
   - Look for React errors in melosys-web logs

3. **Did the employer list API call succeed?**
   - Check if GET request for employers completed
   - Look for 400/500 errors in API logs

4. **Is the behandling in the correct state?**
   - Check if "ikke-redigerbar" errors happened before timeout
   - Verify behandling hasn't been closed prematurely

---

## 🧪 Debugging Strategies

### Level 1: Add Diagnostic Logging

**In `velgArbeidsgiver()` method:**

```typescript
async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
  console.log(`🔍 Leter etter arbeidsgiver checkbox: "${arbeidsgiverNavn}"`);

  // DIAGNOSTIC: Log current page state BEFORE waiting
  const url = this.page.url();
  console.log(`📍 Current URL: ${url}`);

  const pageTitle = await this.page.title();
  console.log(`📄 Page title: ${pageTitle}`);

  // DIAGNOSTIC: Check if ANY checkboxes exist
  const allCheckboxes = await this.page.getByRole('checkbox').count();
  console.log(`✓ Total checkboxes on page: ${allCheckboxes}`);

  // Wait for network idle
  await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
    console.log('⚠️  Network idle timeout, continuing anyway');
  });

  // Wait for React render
  await this.page.waitForTimeout(1000);

  // DIAGNOSTIC: Check again after waits
  const checkboxesAfterWait = await this.page.getByRole('checkbox').count();
  console.log(`✓ Checkboxes after wait: ${checkboxesAfterWait}`);

  // DIAGNOSTIC: List all available checkboxes if target not found
  const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });
  const isVisible = await checkbox.isVisible().catch(() => false);

  if (!isVisible) {
    console.error(`❌ Checkbox "${arbeidsgiverNavn}" not visible!`);
    console.error(`📋 Listing all available checkboxes:`);

    const allBoxes = await this.page.getByRole('checkbox').all();
    for (let i = 0; i < allBoxes.length; i++) {
      const label = await allBoxes[i].getAttribute('aria-label') ||
                    await allBoxes[i].getAttribute('name') ||
                    'no label';
      console.error(`   ${i + 1}. ${label}`);
    }
  }

  // Wait for visibility
  await checkbox.waitFor({ state: 'visible', timeout: 45000 });

  // ... rest of method
}
```

**Benefits:**
- Shows exactly what state the page is in when timeout occurs
- Lists available checkboxes if target not found
- Helps identify if it's a navigation issue vs data loading issue

### Level 2: Add Screenshot on Failure

```typescript
async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
  try {
    // ... existing code with waits ...
    await checkbox.waitFor({ state: 'visible', timeout: 45000 });

  } catch (error) {
    // DIAGNOSTIC: Take screenshot on failure
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = `debug-arbeidsgiver-timeout-${timestamp}.png`;

    await this.page.screenshot({
      path: screenshotPath,
      fullPage: true
    });

    console.error(`❌ Screenshot saved: ${screenshotPath}`);
    console.error(`📍 URL at failure: ${this.page.url()}`);

    // Re-throw to fail the test
    throw error;
  }
}
```

### Level 3: Check Browser Console Errors

```typescript
// In BasePage or test setup
page.on('console', msg => {
  if (msg.type() === 'error') {
    console.error(`🔴 Browser console error: ${msg.text()}`);
  }
});

page.on('pageerror', err => {
  console.error(`🔴 Page error: ${err.message}`);
});
```

### Level 4: Monitor Specific API Calls

```typescript
async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
  // DIAGNOSTIC: Monitor employer list API call
  let employerApiCalled = false;

  const apiListener = (response: Response) => {
    if (response.url().includes('/api/arbeidsforhold') ||
        response.url().includes('/api/virksomheter')) {
      employerApiCalled = true;
      console.log(`✅ Employer API called: ${response.url()} -> ${response.status()}`);
    }
  };

  this.page.on('response', apiListener);

  try {
    await this.page.waitForLoadState('networkidle', { timeout: 15000 });

    if (!employerApiCalled) {
      console.warn('⚠️  WARNING: No employer API call detected!');
    }

    // ... rest of method ...

  } finally {
    this.page.off('response', apiListener);
  }
}
```

---

## 💡 Root Cause Hypotheses

### Hypothesis 1: Race Between Step Transitions ⚠️ LIKELY

**Theory:** The previous step's "Bekreft og fortsett" completes, but the NEXT step's initialization hasn't finished.

**Evidence:**
- Network idle wait completes (all requests done)
- But React might still be processing complex state transitions
- Step component might not be mounted yet

**Test:**
```typescript
// After klikkBekreftOgFortsett, explicitly wait for step URL to change
const currentUrl = this.page.url();
await this.page.waitForURL(url => url !== currentUrl, { timeout: 10000 });
console.log(`✅ URL changed from ${currentUrl} to ${this.page.url()}`);
```

### Hypothesis 2: Backend Returns Empty Employer List ⚠️ POSSIBLE

**Theory:** Sometimes the employer data is empty/missing from backend.

**Evidence:**
- Checkbox exists in DOM but not the specific one we're looking for
- Would explain why it's intermittent

**Test:**
- Check if employer API returns empty array
- Look for 404 or 400 errors on employer endpoint

### Hypothesis 3: Frontend Error Prevents Rendering ⚠️ POSSIBLE

**Theory:** JS error in React component prevents employer list from rendering.

**Evidence:**
- Intermittent nature suggests race condition in frontend code
- React error boundaries might swallow errors silently

**Test:**
- Monitor browser console for errors
- Check melosys-web logs for frontend errors

### Hypothesis 4: Behandling State Issue ⚠️ LESS LIKELY

**Theory:** Behandling is in wrong state, preventing progression.

**Evidence:**
- We saw "ikke-redigerbar" errors, but those are normal
- Other tests in same suite pass consistently

**Test:**
- Check behandling status in database
- Verify behandling hasn't been closed

---

## 📝 Action Plan

### Immediate (Add Diagnostics)

1. **Add comprehensive logging to `velgArbeidsgiver()`**
   - Log current URL, page state, checkbox count
   - List available checkboxes if target not found
   - This will tell us WHAT state the page is in when it fails

2. **Add screenshot on timeout**
   - Visual confirmation of page state
   - Can see if we're even on the right step

3. **Monitor browser console**
   - Catch frontend errors that might prevent rendering
   - Log all errors, not just exceptions

4. **Wait for URL change after step transition**
   - Explicitly verify navigation completed
   - Don't just rely on network idle

### Short-Term (Investigate Patterns)

1. **Run test 20 times on CI**
   - Capture failure rate
   - Look for patterns in failures
   - Analyze diagnostics from failures

2. **Check if employer API is called**
   - Monitor specific API endpoints
   - Verify data is being fetched

3. **Review melosys-web logs**
   - Look for frontend errors
   - Check React error boundaries

### Long-Term (Robust Solution)

1. **Consider adding retry logic at POM level**
   - If checkbox not found, retry entire step
   - More robust than just waiting longer

2. **Add step verification helper**
   - Method that explicitly verifies we're on expected step
   - Checks URL pattern, page content, key elements

3. **Consider test data isolation**
   - Ensure each test has clean data
   - Prevent cross-test contamination

---

## 🔧 Proposed Enhanced Implementation

### Enhanced `velgArbeidsgiver()` with Full Diagnostics

```typescript
async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
  console.log(`🔍 === Starting velgArbeidsgiver("${arbeidsgiverNavn}") ===`);

  // Step 1: Verify we're on the right step
  const url = this.page.url();
  console.log(`📍 Current URL: ${url}`);

  if (!url.includes('/behandling/')) {
    throw new Error(`Not on behandling page! URL: ${url}`);
  }

  // Step 2: Wait for network idle
  console.log(`⏳ Waiting for network idle...`);
  const networkIdleStart = Date.now();
  await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
    console.log('⚠️  Network idle timeout (15s exceeded)');
  });
  console.log(`✅ Network idle completed (${Date.now() - networkIdleStart}ms)`);

  // Step 3: Wait for React render
  console.log(`⏳ Waiting for React render (1s)...`);
  await this.page.waitForTimeout(1000);

  // Step 4: Diagnostic checks
  const allCheckboxes = await this.page.getByRole('checkbox').count();
  console.log(`✓ Total checkboxes found: ${allCheckboxes}`);

  if (allCheckboxes === 0) {
    console.error(`❌ CRITICAL: No checkboxes found on page!`);
    await this.page.screenshot({ path: 'debug-no-checkboxes.png', fullPage: true });
    throw new Error('No checkboxes found - page might not be loaded');
  }

  // Step 5: Try to find target checkbox
  const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });
  const isVisible = await checkbox.isVisible().catch(() => false);

  if (!isVisible) {
    console.error(`❌ Checkbox "${arbeidsgiverNavn}" not visible after waits!`);
    console.error(`📋 Available checkboxes:`);

    const allBoxes = await this.page.getByRole('checkbox').all();
    for (const box of allBoxes) {
      const label = await box.getAttribute('aria-label') ||
                    await box.getAttribute('name') ||
                    await box.textContent() ||
                    'unknown';
      console.error(`   - "${label}"`);
    }

    await this.page.screenshot({
      path: `debug-checkbox-not-found-${Date.now()}.png`,
      fullPage: true
    });
  }

  // Step 6: Wait for visibility with timeout
  console.log(`⏳ Waiting for checkbox "${arbeidsgiverNavn}" to be visible (45s timeout)...`);
  const visibilityStart = Date.now();

  try {
    await checkbox.waitFor({ state: 'visible', timeout: 45000 });
    console.log(`✅ Checkbox visible (${Date.now() - visibilityStart}ms)`);
  } catch (error) {
    console.error(`❌ TIMEOUT after 45s waiting for checkbox`);
    await this.page.screenshot({ path: `debug-timeout-${Date.now()}.png`, fullPage: true });
    throw error;
  }

  // Step 7: Set up API listener and check
  const responsePromise = this.page.waitForResponse(
    response => response.url().includes('/api/mottatteopplysninger/') &&
                response.request().method() === 'POST' &&
                response.status() === 200,
    { timeout: 5000 }
  ).catch(() => null);

  await checkbox.check();
  console.log(`✅ Checkbox checked`);

  const response = await responsePromise;
  if (response) {
    console.log(`✅ API save completed: ${response.url()} -> ${response.status()}`);
  } else {
    console.log('⚠️  No immediate API save detected');
  }

  console.log(`✅ === velgArbeidsgiver completed ===`);
}
```

---

## 📊 Success Metrics

### Before Enhanced Diagnostics
- ❌ Flaky failures with no useful debugging info
- ❌ Can't identify root cause
- ❌ Only know "checkbox timeout" - not why

### After Enhanced Diagnostics
- ✅ Know exact page state when failure occurs
- ✅ Can see if navigation completed
- ✅ Can see available checkboxes vs expected
- ✅ Screenshots for visual confirmation
- ✅ Timing data for each wait stage

---

## 🎓 Key Learnings

### 1. Network Idle ≠ Page Ready

**Lesson:** `waitForLoadState('networkidle')` only means network requests are done. It doesn't mean:
- React has finished rendering
- Complex state updates are complete
- Components are mounted
- Data is displayed to user

### 2. Timeouts Are Not a Solution

**Lesson:** Increasing timeouts helps with slow CI, but doesn't fix:
- Elements that never appear due to errors
- Frontend bugs that prevent rendering
- Backend errors that prevent data loading

### 3. Flaky Tests Need Diagnostics First

**Lesson:** Before adding more waits/timeouts, add diagnostics to understand:
- What state is the page in?
- What elements ARE present?
- Did expected API calls happen?
- Are there hidden errors?

### 4. Page Objects Should Be Defensive

**Lesson:** POMs should:
- Verify assumptions (on right step, data loaded)
- Provide detailed error messages
- Take screenshots on failure
- Log diagnostic information

### 5. Multi-Step Workflows Are Fragile

**Lesson:** Tests with 7+ sequential steps are inherently fragile because:
- Each step depends on previous step completing correctly
- State accumulates across steps
- One small timing issue cascades
- Error handling in early steps affects later steps

---

## 🚀 Next Steps

1. **Implement enhanced diagnostics** (today)
   - Add to `velgArbeidsgiver()` method
   - Run test 10 times to capture failures

2. **Analyze diagnostic output** (today)
   - Review logs from failures
   - Identify patterns
   - Determine root cause

3. **Implement targeted fix** (after diagnosis)
   - Based on what diagnostics reveal
   - Could be: explicit step verification, API monitoring, error handling

4. **Document findings** (ongoing)
   - Update this document with discoveries
   - Share learnings with team

---

## 📚 References

- **Related PRs:**
  - PR #37: Race condition fixes (network idle waits)
  - PR #38: Use correct page object + remove obsolete code

- **Related Docs:**
  - `ARBEIDSGIVER-CHECKBOX-FIX.md` - Initial race condition analysis
  - `EU-EOS-API-WAITS-IMPLEMENTATION.md` - API wait patterns
  - `EU-EOS-WORKFLOW-DEBUG.md` - Workflow debugging guide

- **Playwright Docs:**
  - [Actionability](https://playwright.dev/docs/actionability)
  - [Auto-waiting](https://playwright.dev/docs/actionability#auto-waiting)
  - [Network idle](https://playwright.dev/docs/api/class-page#page-wait-for-load-state)

---

**Last Updated:** 2025-11-22
**Status:** Active Investigation
**Next Review:** After implementing enhanced diagnostics
