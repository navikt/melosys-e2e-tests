# Comprehensive Fix Plan: "Arbeid i flere land" Checkbox Timeout

**Date:** 2025-11-22
**Status:** 🔴 CRITICAL - Test fails 100% on CI
**Issue:** Checkbox 'Ståles Stål AS' not appearing within 45 seconds

---

## 🎯 Executive Summary

After extensive attempts (network idle waits, increased timeouts, API waits), the test still fails intermittently. **The root problem: We don't know WHY the checkbox isn't appearing** because we lack diagnostic data when failures occur.

**Strategy:** Implement comprehensive diagnostics first, THEN fix based on evidence.

---

## 📊 What We Know

### ✅ What's Been Tried (All Implemented)
1. Network idle wait (15s) before looking for checkbox
2. React render wait (1000ms) after network idle
3. Increased checkbox timeout (45s)
4. Test timeout increase (120s)
5. API waits for step transitions (avklartefakta, vilkaar)
6. Correct page object usage (ArbeidFlereLandBehandlingPage)
7. API wait for checkbox save (POST /api/mottatteopplysninger/)

### ❌ What We DON'T Know (Missing Data)
1. **Is the page on the employer selection step when timeout occurs?**
2. **Are there ANY checkboxes on the page?**
3. **Did the employer list API call happen?**
4. **Are there browser console errors?**
5. **What does the page actually look like when it fails?**

---

## 🔍 Root Cause Hypotheses (Ordered by Likelihood)

### Hypothesis 1: Navigation Race Condition ⚠️ **MOST LIKELY**

**Theory:** The previous step's "Bekreft og fortsett" completes network idle, but the NEXT step hasn't fully initialized yet.

**Evidence:**
- Network idle only means "no pending requests"
- Doesn't guarantee React has mounted new components
- URL might not have changed yet
- Frontend might be processing complex state updates

**Test This:**
```typescript
// After klikkBekreftOgFortsett(), check if URL actually changed
const urlBefore = this.page.url();
await this.klikkBekreftOgFortsett();
const urlAfter = this.page.url();
console.log(`URL changed: ${urlBefore} → ${urlAfter}`);
console.log(`URL actually different: ${urlBefore !== urlAfter}`);
```

### Hypothesis 2: Employer List API Not Called ⚠️ **LIKELY**

**Theory:** The employer data hasn't been fetched from backend yet.

**Missing Knowledge:**
- **What API endpoint provides employer list?** (Not documented in EU-EOS-API-ENDPOINTS.md)
- Could be:
  - `GET /api/arbeidsforhold/{behandlingId}`
  - `GET /api/virksomheter/{behandlingId}`
  - `GET /api/registeropplysninger/arbeidsforhold`
  - Embedded in page load

**Test This:**
```typescript
// Monitor ALL GET requests after step transition
page.on('response', response => {
  if (response.request().method() === 'GET') {
    console.log(`GET: ${response.url()} → ${response.status()}`);
  }
});
```

### Hypothesis 3: Frontend Error Prevents Rendering ⚠️ **POSSIBLE**

**Theory:** JavaScript error in React component prevents employer list from rendering.

**Evidence:**
- Intermittent nature suggests race in frontend code
- React error boundaries might swallow errors silently
- No error logs captured yet

**Test This:**
```typescript
// Monitor browser console
page.on('console', msg => {
  if (msg.type() === 'error') {
    console.error(`🔴 Browser error: ${msg.text()}`);
  }
});

page.on('pageerror', err => {
  console.error(`🔴 Page error: ${err.message}`);
});
```

### Hypothesis 4: Wrong Step/Page State ⚠️ **LESS LIKELY**

**Theory:** Page is not on the employer selection step at all.

**Test This:**
```typescript
// Check URL pattern and page content
const url = this.page.url();
const pageText = await this.page.textContent('body');
console.log(`Current URL: ${url}`);
console.log(`Page contains "arbeidsgiver": ${pageText?.includes('arbeidsgiver')}`);
```

---

## 🛠️ Implementation Plan

## Phase 1: Add Comprehensive Diagnostics (TODAY)

**Goal:** Capture actual page state when failure occurs

### Step 1.1: Enhanced velgArbeidsgiver() Method

Add detailed logging and diagnostics:

```typescript
async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
  console.log(`\n🔍 === DIAGNOSTICS: velgArbeidsgiver("${arbeidsgiverNavn}") ===`);

  // DIAGNOSTIC 1: Current page state
  const url = this.page.url();
  const pageTitle = await this.page.title().catch(() => 'unknown');
  console.log(`📍 URL: ${url}`);
  console.log(`📄 Title: ${pageTitle}`);

  // DIAGNOSTIC 2: Verify we're on behandling page
  if (!url.includes('/behandling/')) {
    throw new Error(`NOT on behandling page! URL: ${url}`);
  }

  // DIAGNOSTIC 3: Check for any checkboxes BEFORE waits
  const checkboxCountBefore = await this.page.getByRole('checkbox').count();
  console.log(`✓ Checkboxes before waits: ${checkboxCountBefore}`);

  // Existing network idle wait
  console.log(`⏳ Waiting for network idle (15s timeout)...`);
  const networkStart = Date.now();
  await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
    console.log('⚠️  Network idle timeout (15s exceeded)');
  });
  console.log(`✅ Network idle completed (${Date.now() - networkStart}ms)`);

  // Existing React render wait
  console.log(`⏳ Waiting for React render (1000ms)...`);
  await this.page.waitForTimeout(1000);

  // DIAGNOSTIC 4: Check checkboxes AFTER waits
  const checkboxCountAfter = await this.page.getByRole('checkbox').count();
  console.log(`✓ Checkboxes after waits: ${checkboxCountAfter}`);

  // DIAGNOSTIC 5: List ALL checkboxes if count changed
  if (checkboxCountAfter !== checkboxCountBefore) {
    console.log(`📊 Checkbox count changed: ${checkboxCountBefore} → ${checkboxCountAfter}`);
  }

  // DIAGNOSTIC 6: Try to find target checkbox
  const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });
  const isVisible = await checkbox.isVisible().catch(() => false);

  if (!isVisible) {
    console.error(`\n❌ === FAILURE DIAGNOSTICS ===`);
    console.error(`Target checkbox "${arbeidsgiverNavn}" NOT visible!`);

    // List all available checkboxes
    console.error(`\n📋 Available checkboxes on page:`);
    const allCheckboxes = await this.page.getByRole('checkbox').all();

    if (allCheckboxes.length === 0) {
      console.error(`   ⚠️  NO CHECKBOXES FOUND!`);
      console.error(`   This means the employer list component hasn't rendered.`);
    } else {
      for (let i = 0; i < allCheckboxes.length; i++) {
        const box = allCheckboxes[i];
        const label = await box.getAttribute('aria-label') ||
                      await box.getAttribute('name') ||
                      await box.textContent() ||
                      'unknown';
        const isChecked = await box.isChecked().catch(() => false);
        console.error(`   ${i + 1}. "${label}" ${isChecked ? '[checked]' : ''}`);
      }
    }

    // Take screenshot
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = `playwright-report/debug-arbeidsgiver-${timestamp}.png`;
    await this.page.screenshot({
      path: screenshotPath,
      fullPage: true
    });
    console.error(`\n📸 Screenshot saved: ${screenshotPath}`);

    // Get page content snippet
    const bodyText = await this.page.textContent('body').catch(() => '');
    const snippet = bodyText?.substring(0, 500) || '';
    console.error(`\n📄 Page content (first 500 chars):`);
    console.error(snippet);

    console.error(`\n=== END FAILURE DIAGNOSTICS ===\n`);
  }

  // Existing wait for visibility (will fail with better error info now)
  console.log(`⏳ Waiting for checkbox "${arbeidsgiverNavn}" (45s timeout)...`);
  const visibilityStart = Date.now();

  try {
    await checkbox.waitFor({ state: 'visible', timeout: 45000 });
    console.log(`✅ Checkbox visible (${Date.now() - visibilityStart}ms)`);
  } catch (error) {
    console.error(`❌ TIMEOUT after 45s waiting for checkbox`);
    throw error;
  }

  // ... rest of existing method (API wait, check) ...

  console.log(`✅ === velgArbeidsgiver completed ===\n`);
}
```

### Step 1.2: Add URL Change Verification

Enhance `klikkBekreftOgFortsett()` to verify navigation:

```typescript
async klikkBekreftOgFortsett(): Promise<void> {
  console.log('🔄 Klikker "Bekreft og fortsett"...');
  const urlBefore = this.page.url();

  // ... existing API waits and click ...

  // NEW: Verify URL actually changed (or at least page re-rendered)
  const urlAfter = this.page.url();
  console.log(`  URL før:  ${urlBefore}`);
  console.log(`  URL etter: ${urlAfter}`);
  console.log(`  URL endret: ${urlBefore !== urlAfter}`);

  // NEW: If URL didn't change, wait for SOME navigation signal
  if (urlBefore === urlAfter) {
    console.log('⚠️  URL unchanged - waiting for page state update...');
    await this.page.waitForTimeout(1000); // Extra wait if no URL change
  }
}
```

### Step 1.3: Monitor Employer List API

Add API monitoring in `velgArbeidsgiver()`:

```typescript
async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
  // ... diagnostic logging ...

  // NEW: Monitor for employer-related API calls
  let employerApiCalled = false;
  const employerApis: string[] = [];

  const apiListener = (response: Response) => {
    const url = response.url();
    // Check for various possible employer endpoints
    if (url.includes('/arbeidsforhold') ||
        url.includes('/virksomheter') ||
        url.includes('/registeropplysninger')) {
      employerApiCalled = true;
      employerApis.push(`${url} → ${response.status()}`);
      console.log(`✅ Employer-related API: ${url} → ${response.status()}`);
    }
  };

  this.page.on('response', apiListener);

  try {
    await this.page.waitForLoadState('networkidle', { timeout: 15000 });

    if (!employerApiCalled) {
      console.warn('⚠️  WARNING: No employer API call detected!');
      console.warn('   Monitored for: /arbeidsforhold, /virksomheter, /registeropplysninger');
    } else {
      console.log(`✅ Employer APIs called: ${employerApis.length}`);
      employerApis.forEach(api => console.log(`   - ${api}`));
    }

    // ... rest of method ...

  } finally {
    this.page.off('response', apiListener);
  }
}
```

### Step 1.4: Monitor Browser Console Errors

Add in `BasePage` constructor or test setup:

```typescript
// In BasePage constructor
constructor(page: Page) {
  this.page = page;
  this.formHelper = new FormHelper(page);

  // Monitor browser console errors
  this.page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error(`🔴 Browser console error: ${msg.text()}`);
    }
  });

  this.page.on('pageerror', err => {
    console.error(`🔴 Page error: ${err.message}`);
    console.error(`   Stack: ${err.stack}`);
  });
}
```

---

## Phase 2: Analyze Diagnostic Output (AFTER TEST RUN)

### What to Look For in Logs

**If "NO CHECKBOXES FOUND":**
- Page hasn't loaded employer component yet
- **Fix:** Wait for specific element that appears when step loads
- **Fix:** Wait for employer API call before proceeding

**If checkboxes exist but not the right one:**
- Backend returned different employer data
- **Fix:** Check test data setup
- **Fix:** Verify mock data includes expected employer

**If URL didn't change:**
- Navigation race condition
- **Fix:** Wait for URL change explicitly
- **Fix:** Add retry logic for step transition

**If browser console errors:**
- Frontend bug preventing render
- **Fix:** Report to frontend team
- **Workaround:** Add retry or skip test with @known-error

**If employer API never called:**
- Component not mounting
- **Fix:** Wait for component mount signal
- **Fix:** Check if step is actually active

---

## Phase 3: Implement Targeted Fix (BASED ON EVIDENCE)

### Fix Option A: Wait for Employer API (If API found)

```typescript
async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
  console.log(`🔍 Leter etter arbeidsgiver: "${arbeidsgiverNavn}"`);

  // Wait for employer list API to complete
  const employerApiPromise = this.page.waitForResponse(
    response => (response.url().includes('/arbeidsforhold') ||
                 response.url().includes('/virksomheter')) &&
                response.request().method() === 'GET' &&
                response.status() === 200,
    { timeout: 30000 }
  ).catch(() => {
    console.warn('⚠️  Employer API not detected, continuing anyway');
    return null;
  });

  const response = await employerApiPromise;
  if (response) {
    console.log(`✅ Employer list loaded: ${response.url()}`);
  }

  // Extra wait for React to render the list
  await this.page.waitForTimeout(1000);

  const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });
  await checkbox.waitFor({ state: 'visible', timeout: 45000 });

  // ... rest of method ...
}
```

### Fix Option B: Wait for Step-Specific Element

```typescript
async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
  console.log(`🔍 Venter på arbeidsgiver-steg...`);

  // Wait for a specific element that ONLY appears on employer selection step
  // (Need to identify this from page inspection)
  await this.page.getByText('Velg arbeidsgiver').waitFor({
    state: 'visible',
    timeout: 30000
  });

  console.log(`✅ Arbeidsgiver-steg er lastet`);

  // Now wait for the specific checkbox
  const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });
  await checkbox.waitFor({ state: 'visible', timeout: 45000 });

  // ... rest of method ...
}
```

### Fix Option C: Wait for URL Change (If navigation confirmed)

```typescript
async klikkBekreftOgFortsett(): Promise<void> {
  const urlBefore = this.page.url();

  // ... existing click and API waits ...

  // Explicitly wait for URL to change
  try {
    await this.page.waitForURL(
      url => url !== urlBefore,
      { timeout: 10000 }
    );
    console.log(`✅ URL changed: ${urlBefore} → ${this.page.url()}`);
  } catch {
    console.log('⚠️  URL did not change (might be same-page navigation)');
  }

  // Existing waits...
}
```

### Fix Option D: Add Step Verification Helper

```typescript
// In BasePage or ArbeidFlereLandBehandlingPage
async waitForStepToLoad(stepName: string, timeout: number = 30000): Promise<void> {
  console.log(`⏳ Venter på steg: "${stepName}"...`);

  const start = Date.now();

  // Wait for network idle
  await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  // Wait for React render
  await this.page.waitForTimeout(1000);

  // Check if we're on the expected step (could check URL pattern, heading, etc.)
  const elapsed = Date.now() - start;
  console.log(`✅ Steg "${stepName}" lastet (${elapsed}ms)`);
}

// Then use it:
async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
  await this.waitForStepToLoad('Arbeidsgiver-valg');

  const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });
  await checkbox.waitFor({ state: 'visible', timeout: 45000 });

  // ... rest of method ...
}
```

### Fix Option E: Retry Logic (Last Resort)

```typescript
async velgArbeidsgiver(arbeidsgiverNavn: string, maxRetries: number = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔍 Attempt ${attempt}/${maxRetries}: Leter etter arbeidsgiver "${arbeidsgiverNavn}"`);

      // Wait for network idle
      await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await this.page.waitForTimeout(1000);

      const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });
      await checkbox.waitFor({ state: 'visible', timeout: 15000 }); // Shorter timeout per attempt

      // Success! Continue with the rest
      await checkbox.check();
      console.log(`✅ Valgte arbeidsgiver: ${arbeidsgiverNavn} (attempt ${attempt})`);
      return;

    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`❌ Failed after ${maxRetries} attempts`);
        throw error;
      }

      console.warn(`⚠️  Attempt ${attempt} failed, retrying in 2s...`);
      await this.page.waitForTimeout(2000);
    }
  }
}
```

---

## Phase 4: Testing Strategy

### Local Testing
```bash
# Run test 10 times to verify consistency
for i in {1..10}; do
  echo "=== Run $i ==="
  npm test tests/eu-eos/eu-eos-arbeid-flere-land.spec.ts
  if [ $? -ne 0 ]; then
    echo "FAILED on run $i"
    break
  fi
done
```

### CI Testing
1. Push diagnostic version to branch
2. Run on CI 5 times
3. Collect ALL logs (even from successful runs)
4. Analyze timing patterns
5. Implement targeted fix based on evidence
6. Run on CI 10 times to verify 100% success rate

---

## 🎯 Success Criteria

### Phase 1 (Diagnostics) - Complete When:
- [x] Enhanced diagnostics in `velgArbeidsgiver()`
- [x] URL change verification in `klikkBekreftOgFortsett()`
- [x] Employer API monitoring implemented
- [x] Browser console monitoring implemented
- [x] Test run produces detailed diagnostic output

### Phase 2 (Analysis) - Complete When:
- [ ] Root cause identified from diagnostic logs
- [ ] Hypothesis validated with evidence
- [ ] Specific fix approach selected

### Phase 3 (Fix) - Complete When:
- [ ] Targeted fix implemented based on evidence
- [ ] Test passes 10/10 times locally
- [ ] Test passes 10/10 times on CI
- [ ] No performance regression (test time < 120s)

### Phase 4 (Documentation) - Complete When:
- [ ] Findings documented in debugging docs
- [ ] Root cause explained
- [ ] Fix approach documented
- [ ] Learnings captured for future issues

---

## 📋 Immediate Action Items

1. ✅ **Create this comprehensive plan document**
2. **Implement Phase 1 diagnostics** (Priority: 🔴 HIGHEST)
   - Enhance `velgArbeidsgiver()` with all diagnostics
   - Add URL change verification
   - Add employer API monitoring
   - Add browser console monitoring
3. **Run test on CI with diagnostics** (Priority: 🔴 HIGH)
   - Commit diagnostic version
   - Trigger CI run
   - Collect full logs
4. **Analyze diagnostic output** (Priority: 🔴 HIGH)
   - Review all diagnostic data
   - Identify root cause
   - Select fix approach
5. **Implement targeted fix** (Priority: 🟡 MEDIUM - wait for analysis)
6. **Verify fix stability** (Priority: 🟡 MEDIUM - after fix)
7. **Document learnings** (Priority: 🟢 LOW - after verification)

---

## 📚 References

- **RACE-CONDITION-LEARNINGS.md** - Comprehensive race condition analysis
- **ARBEIDSGIVER-CHECKBOX-FIX.md** - Previous checkbox fix attempts
- **EU-EOS-API-ENDPOINTS.md** - Known API endpoints
- **EU-EOS-API-WAITS-IMPLEMENTATION.md** - API wait patterns

---

## 🎓 Key Principles

1. **Diagnose First, Fix Second** - We can't fix what we don't understand
2. **Evidence-Based Solutions** - No more guessing, use actual data
3. **Comprehensive Logging** - If we don't log it, we can't debug it
4. **Visual Confirmation** - Screenshots show what logs can't
5. **Reproducibility** - Must work 10/10 times, not just eventually

---

**Created:** 2025-11-22
**Status:** Phase 1 - Implement Diagnostics
**Next Review:** After first CI run with diagnostics
**Expected Resolution:** 2-3 iterations (diagnose → fix → verify)
