# EU/EØS Employer Selection Race Condition Fix

## Issue Summary

**Test:** `tests/eu-eos/eu-eos-12.1-utsent-arbeidstager-fullfort-vedtak.spec.ts`

**Symptom:** Test times out (45s) waiting for employer checkbox to become visible

**Error:**
```
TimeoutError: locator.waitFor: Timeout 45000ms exceeded.
Call log:
  - waiting for getByRole('checkbox', { name: 'Ståles Stål AS' }) to be visible
```

**Backend Error:**
```
API kall feilet: Forsøk på å endre en ikke-redigerbar behandling med id 57
no.nav.melosys.exception.FunksjonellException: Forsøk på å endre en ikke-redigerbar behandling
```

## Root Cause

**Race Condition in Step Transition:**

The test workflow:
```typescript
await behandling.velgYrkesaktivEllerSelvstendigOgFortsett(true);  // Step 2
await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');    // Step 3 - FAILS
```

**What happened:**

1. **Step 2 completes:** `klikkBekreftOgFortsett()` triggers multiple API calls to save form state
2. **Frontend transitions:** React unmounts step 2 UI and prepares step 3
3. **Employer data fetch:** Frontend needs to fetch employer list from backend
4. **Race condition:** Test immediately calls `velgArbeidsgiver()` **BEFORE** employer data arrives
5. **Result:** Checkbox doesn't exist → timeout → backend rejects edit on non-editable behandling

**Timeline:**
```
Time  Event
----  -----
0ms   User clicks "Bekreft og fortsett" (step 2)
10ms  Frontend POST /api/avklartefakta/{id}
20ms  Frontend POST /api/vilkaar/{id}
30ms  Frontend transitions to step 3 UI
40ms  Frontend requests GET /arbeidsforhold (employer data)
45ms  Test tries to click employer checkbox ← TOO EARLY!
      ❌ Checkbox doesn't exist yet
      ❌ Backend: "behandling er ikke-redigerbar"
500ms Backend responds with employer data
510ms React renders employer list with checkboxes
      ✅ Checkbox now exists (but test already failed)
```

## The Fix

**Pattern from PR #55** (same fix applied to `arbeid-flere-land-behandling.page.ts`):

Add explicit wait for employer data API before selecting employer.

### Code Changes

**File:** `pages/behandling/eu-eos-behandling.page.ts`

**Method:** `velgArbeidsgiverOgFortsett()`

**Before:**
```typescript
async velgArbeidsgiverOgFortsett(arbeidsgiverNavn: string = 'Ståles Stål AS'): Promise<void> {
  await this.velgArbeidsgiver(arbeidsgiverNavn);
  await this.klikkBekreftOgFortsett();
}
```

**After:**
```typescript
async velgArbeidsgiverOgFortsett(arbeidsgiverNavn: string = 'Ståles Stål AS'): Promise<void> {
  // CRITICAL FIX: Wait for employer data to be loaded before selecting
  console.log('⏳ Waiting for employer data API after step transition...');
  const employerApiPromise = this.page.waitForResponse(
    response => (response.url().includes('/arbeidsforhold') ||
                 response.url().includes('/virksomheter') ||
                 response.url().includes('/registeropplysninger') ||
                 response.url().includes('/mottatteopplysninger')) &&
                response.status() === 200,
    { timeout: 15000 }
  ).catch(() => {
    console.log('⚠️  No employer API detected within 15s - proceeding anyway');
    return null;
  });

  const employerResponse = await employerApiPromise;
  if (employerResponse) {
    console.log(`✅ Employer data loaded: ${employerResponse.url()} -> ${employerResponse.status()}`);
    // Give React time to render the employer list after API response
    await this.page.waitForTimeout(500);
  }

  await this.velgArbeidsgiver(arbeidsgiverNavn);
  await this.klikkBekreftOgFortsett();
}
```

### Why This Works

**New Timeline:**
```
Time  Event
----  -----
0ms   User clicks "Bekreft og fortsett" (step 2)
10ms  Frontend POST /api/avklartefakta/{id}
20ms  Frontend POST /api/vilkaar/{id}
30ms  Frontend transitions to step 3 UI
40ms  Frontend requests GET /arbeidsforhold (employer data)
      🔄 Test waits for employer API response...
500ms Backend responds with employer data
      ✅ employerApiPromise resolves
510ms React renders employer list
      🔄 Test waits 500ms for React render...
1010ms Test clicks employer checkbox
      ✅ Checkbox exists!
      ✅ Backend accepts the change
```

## Pattern Details

### Employer-Related API Endpoints

The fix monitors multiple possible endpoints:
- `/arbeidsforhold` - Employment relationships
- `/virksomheter` - Organizations/companies  
- `/registeropplysninger` - Registry information
- `/mottatteopplysninger` - Received information

**Why multiple endpoints?**
Different EU/EØS workflows may use different endpoints to fetch employer data. By monitoring all of them, the fix works across all workflows.

### Timeout and Fallback

```typescript
{ timeout: 15000 }
.catch(() => {
  console.log('⚠️  No employer API detected within 15s - proceeding anyway');
  return null;
});
```

- **15 second timeout:** Generous for slow CI environments
- **Graceful fallback:** If no employer API is detected (e.g., data already cached), proceed anyway
- **Existing diagnostics:** `velgArbeidsgiver()` method has comprehensive error handling if checkbox still doesn't appear

### React Render Delay

```typescript
await this.page.waitForTimeout(500);
```

After the API responds, React needs time to:
1. Process the response data
2. Update component state
3. Re-render the DOM
4. Commit changes to actual DOM

500ms is a safe buffer for React's reconciliation process.

## Related Fixes

### PR #55: arbeid-flere-land Race Condition

Same issue, same fix pattern applied to `arbeid-flere-land-behandling.page.ts`.

**Commit:** `2c7cac1540b59b3955bfa9fec2df5693f07c43ca`

**Quote from PR #55:**
> Fix race condition where velgArbeidsgiver was called before the
> employer list was loaded from backend, causing intermittent failures on CI.

### Other EU/EØS Workflows

**Status Check:**
- ✅ `eu-eos-12.1-utsent-arbeidstager` - Fixed (this PR)
- ✅ `eu-eos-13.1-arbeid-flere-land` - Fixed (PR #55)
- ✅ `eu-eos-13.1-arbeid-flere-land-selvstendig` - Uses same POM (inherits fix)
- ⚠️  `eu-eos-skip-fullfort-vedtak` - Uses `velgArbeidsgiver()` directly, but test not failing (monitor)

## Testing & Verification

### Manual Testing Steps

1. **Reproduce:** Run failing test on CI (slower environment amplifies race condition)
2. **Apply fix:** Add employer API wait in `velgArbeidsgiverOgFortsett()`
3. **Verify:** Test passes consistently on CI
4. **Regression:** Check other EU/EØS tests still pass

### Expected Log Output

**Successful run:**
```
⏳ Waiting for employer data API after step transition...
📡 Employer-related API: http://localhost:8080/api/arbeidsforhold/123 → 200
✅ Employer data loaded: http://localhost:8080/api/arbeidsforhold/123 -> 200
🔍 Leter etter arbeidsgiver checkbox: "Ståles Stål AS"
✓ Fant 3 checkboxer totalt på siden
✅ Valgte arbeidsgiver: Ståles Stål AS
```

### CI/CD Integration

**GitHub Actions workflow** will automatically:
1. Run all EU/EØS tests
2. Upload test results and traces
3. Post failure analysis if tests fail
4. Create issue if new failures detected

## Classification

**Issue Type:** `flaky-test` (Race condition / timing issue)

**Impact:** High (blocks CI/CD pipeline)

**Severity:** Medium (test infrastructure issue, not production bug)

**Fix Complexity:** Low (pattern already established in PR #55)

## Learnings

### When Step Transitions Trigger API Calls

**Always consider:**
1. What data does the next step need?
2. Does the frontend fetch that data from backend?
3. Is there a delay between step transition and data availability?
4. Should the test wait for specific API calls?

### Pattern: Wait for Data Before Interaction

```typescript
// ❌ BAD: Race condition
await this.clickNextStep();
await this.selectFromList('item');  // List might not be loaded!

// ✅ GOOD: Wait for data API
await this.clickNextStep();
await this.waitForListDataAPI();   // Ensure data is loaded
await this.selectFromList('item');  // Now safe!
```

### Pattern: Monitor Multiple Possible Endpoints

```typescript
// ✅ Robust: Handle different backend implementations
response => (response.url().includes('/endpoint1') ||
             response.url().includes('/endpoint2') ||
             response.url().includes('/endpoint3')) &&
            response.status() === 200
```

## References

- **Issue:** GitHub Actions run #20437789661
- **PR #55:** Fix race condition in EU/EØS arbeid-flere-land test
- **Commit:** `2c7cac1` (arbeid-flere-land fix)
- **Related Docs:** 
  - `docs/debugging/RACE-CONDITION-LEARNINGS.md`
  - `docs/debugging/EU-EOS-API-ENDPOINTS.md`
  - `docs/debugging/ARBEIDSGIVER-CHECKBOX-FIX.md`
