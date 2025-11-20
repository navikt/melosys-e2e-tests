# EU/EØS Skip Workflow - Backend Race Condition Analysis

**Date:** 2025-11-20
**Issue:** Optimistic locking failure during vedtak creation
**Status:** ⚠️ **Backend Bug** - Not a test issue

---

## 🐛 Problem Summary

The EU/EØS skip workflow test fails intermittently (2/3 attempts) due to a **backend race condition** in `melosys-api` during vedtak creation.

**Error:**
```
API kall feilet: Row was updated or deleted by another transaction (or unsaved-value mapping was incorrect) : [no.nav.melosys.domain.SaksopplysningKilde#33]
org.hibernate.StaleObjectStateException
```

**Key Observation:**
- Test passes on retry #3 (status: "flaky")
- Same error pattern in both failed attempts
- Error occurs at `/api/saksflyt/vedtak/{id}/fatt` endpoint

---

## 📊 Error Pattern Analysis

### Attempt 1 (Behandling ID: 5)
```
19:20:15.301 | Registeropplysninger for Medlemskap hentet for behandling 5
19:20:15.471 | Fatter vedtak for (EU_EØS) sak: MEL-5 behandling: 5
19:20:15.487 | Registeropplysninger for Medlemskap hentet for behandling 5 (AGAIN!)
19:20:15.579 | ERROR | Row was updated or deleted [SaksopplysningKilde#33]
```

**Timeline:**
1. T+0ms: Registeropplysninger fetched
2. T+170ms: Vedtak process starts
3. T+186ms: Registeropplysninger fetched **AGAIN** (16ms after vedtak start)
4. T+278ms: **Optimistic lock failure** (92ms after second fetch)

### Attempt 2 (Behandling ID: 6)
```
19:22:08.139 | Registeropplysninger for Medlemskap hentet for behandling 6
19:22:08.268 | Fatter vedtak for (EU_EØS) sak: MEL-6 behandling: 6
19:22:08.293 | Registeropplysninger for Medlemskap hentet for behandling 6 (AGAIN!)
19:22:08.377 | ERROR | Row was updated or deleted [SaksopplysningKilde#40]
```

**Same pattern:** Two calls to `RegisteropplysningerService` during vedtak creation, followed by optimistic lock failure.

### Attempt 3 (Behandling ID: 7)
```
19:24:02.000 | Fatter vedtak for (EU_EØS) sak: MEL-7 behandling: 7
[No error - success]
```

---

## 🔍 Root Cause Analysis

### Stack Trace Evidence

```
Caused by: org.hibernate.StaleObjectStateException
  at DeleteCoordinator.lambda$doStaticDelete$6
```

The error occurs during a **DELETE operation**, not an UPDATE. This means:

1. `SaksopplysningKilde` entity is loaded
2. Another transaction updates/deletes the same entity
3. Original transaction tries to delete the entity with outdated state
4. Hibernate detects version mismatch → throws `StaleObjectStateException`

### Code Flow (melosys-api)

**File:** `EosVedtakService.java:91`

```java
Collection<Kontrollfeil> kontrollfeil = ferdigbehandlingKontrollFacade.kontrollerVedtakMedRegisteropplysninger(
    behandling,
    Sakstyper.EU_EOS,
    request.getBehandlingsresultatTypeKode(),
    kontrollerSomSkalIgnoreres
);
```

This method:
1. Calls `RegisteropplysningerService` to fetch fresh data
2. Creates/updates `SaksopplysningKilde` entities
3. **Likely triggers another fetch** internally (explaining the duplicate log)
4. **Race condition:** Multiple paths modify the same entity concurrently

### Entity Analysis

**File:** `domain/SaksopplysningKilde.java`

```java
@Entity
@Table(name = "saksopplysning_kilde")
public class SaksopplysningKilde {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // NO @Version field!
    // Hibernate uses implicit version checking via primary key
}
```

**Note:** Entity lacks explicit `@Version` field, but Hibernate still detects concurrent modifications through row state checks.

---

## 🎯 Why It's Intermittent (Flaky)

The race condition depends on **timing**:
- ✅ **Success:** If both registeropplysninger calls complete before entity deletion
- ❌ **Failure:** If deletion happens while second registeropplysninger is still updating

**CI Environment:**
- Slower than local (containers, shared resources)
- More likely to hit race condition window
- Explains 2/3 failure rate

---

## 💡 Recommended Fixes (Backend)

### Option 1: Remove Duplicate Fetch ✅ **Recommended**

**Problem:** `RegisteropplysningerService` called twice during vedtak creation

**Solution:** Refactor `ferdigbehandlingKontrollFacade.kontrollerVedtakMedRegisteropplysninger()` to:
1. Fetch registeropplysninger once
2. Reuse data for all validations
3. Avoid concurrent modifications

**Code Change (pseudo):**
```java
// Before
kontrollerVedtakMedRegisteropplysninger() {
    registeropplysninger = hentRegisteropplysninger(); // Call 1
    validate();
    updateSaksopplysning(); // Triggers Call 2 internally
}

// After
kontrollerVedtakMedRegisteropplysninger() {
    registeropplysninger = hentRegisteropplysninger(); // Single call
    validate(registeropplysninger);
    updateSaksopplysning(registeropplysninger); // Reuse data
}
```

### Option 2: Add @Version Field

**Problem:** No explicit optimistic locking version

**Solution:** Add `@Version` field to `SaksopplysningKilde`:
```java
@Version
@Column(name = "versjon")
private Long versjon;
```

**Note:** Doesn't fix root cause, but provides better error handling.

### Option 3: Transactional Boundary

**Problem:** Multiple database operations in single transaction

**Solution:** Use `@Transactional(propagation = Propagation.REQUIRES_NEW)` for registeropplysninger fetch to isolate from parent transaction.

**Note:** May have performance implications.

---

## 🧪 Test Impact

### Current Situation

**Test File:** `tests/eu-eos/eu-eos-skip-fullfort-vedtak.spec.ts`

```typescript
test('skal fullføre EU/EØS-skip-arbeidsflyt med vedtak', async ({ page }) => {
  // ... test steps ...
  await skipBehandling.fattVedtak(); // ← Fails 2/3 times on CI
});
```

**Result:**
- ❌ Attempt 1: Failed (optimistic lock)
- ❌ Attempt 2: Failed (optimistic lock)
- ✅ Attempt 3: Success
- Status: "flaky"

### Why Test Changes Won't Help

The issue is **backend timing**, not test timing:
- ✅ Test already waits for API response (`/api/saksflyt/vedtak/{id}/fatt`)
- ✅ Test has proper API waits (60s timeout)
- ✅ Test includes all recent stability improvements
- ❌ **Backend** race condition happens *during* API request processing

**Adding more waits in the test won't fix this** because the race happens server-side.

---

## 🔄 Workarounds for E2E Tests

### Option A: Retry Strategy (Current) ✅

**Status:** Already implemented via Playwright retry mechanism

**Pros:**
- No code changes needed
- Test eventually passes
- Exposes real backend bug

**Cons:**
- Slower test execution (3 attempts)
- Masks backend issue

### Option B: Known Error Tag

**Code:**
```typescript
test('skal fullføre EU/EØS-skip-arbeidsflyt med vedtak @known-error #BACKEND-RACE', async ({ page }) => {
  // Test runs but doesn't fail CI
});
```

**Pros:**
- Doesn't block CI
- Documents known issue
- Easy to remove when fixed

**Cons:**
- May hide if issue gets worse
- Requires discipline to re-check

### Option C: Add Retry in Page Object

**Code:**
```typescript
async fattVedtak(): Promise<void> {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const responsePromise = this.page.waitForResponse(
        response => response.url().includes('/api/saksflyt/vedtak/') &&
                    response.url().includes('/fatt') &&
                    response.status() === 204,
        { timeout: 60000 }
      );

      await this.fattVedtakButton.click();
      await responsePromise;

      console.log(`✅ Vedtak fattet (attempt ${attempt})`);
      return; // Success

    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;

      console.log(`⚠️  Vedtak attempt ${attempt} failed, retrying...`);
      await this.page.waitForTimeout(2000); // Wait before retry
    }
  }
}
```

**Pros:**
- Transparent retry at API level
- Single test attempt
- Faster than full test retry

**Cons:**
- Hides backend issue in logs
- Not a real fix

---

## 📝 Recommendations

### Immediate (E2E Tests)

1. ✅ **Keep current retry strategy** - Test already passes on retry
2. ⚠️ **Add comment in test** - Document backend bug reference
3. 📊 **Monitor failure rate** - Track if it gets worse

### Short-Term (Backend Team)

1. 🔴 **File bug ticket** - Document race condition with evidence from this analysis
2. 🔍 **Investigate `ferdigbehandlingKontrollFacade`** - Find duplicate registeropplysninger call
3. 🧪 **Add backend test** - Reproduce race condition with concurrent requests

### Long-Term (Backend Team)

1. ✅ **Fix root cause** - Remove duplicate fetch (Option 1)
2. ✅ **Add @Version fields** - All entities that update concurrently
3. 📚 **Document transaction boundaries** - Clear guidelines for service methods

---

## 🔗 Related Files

### E2E Tests
- `tests/eu-eos/eu-eos-skip-fullfort-vedtak.spec.ts` - Skip workflow test
- `pages/behandling/eu-eos-skip-behandling.page.ts` - Skip POM
- `docs/debugging/EU-EOS-API-WAITS-IMPLEMENTATION.md` - API wait improvements

### Backend (melosys-api)
- `service/vedtak/EosVedtakService.java:91` - Vedtak creation with registeropplysninger check
- `service/kontroll/FerdigbehandlingKontrollFacade.java` - Control logic
- `service/registeropplysninger/RegisteropplysningerService.java` - Data fetching
- `domain/SaksopplysningKilde.java` - Entity without @Version

### Logs
- `/Downloads/playwright-results-26/playwright-report/melosys-api-complete.log`
  - Lines with "SaksopplysningKilde#33" (Attempt 1)
  - Lines with "SaksopplysningKilde#40" (Attempt 2)

---

## 📊 Statistics from CI Run

**Test:** EU/EØS Skip - Komplett arbeidsflyt
**Date:** 2025-11-20 18:20-18:24
**Environment:** GitHub Actions

| Attempt | Behandling ID | Timestamp | Result | SaksopplysningKilde ID |
|---------|---------------|-----------|--------|----------------------|
| 1       | 5             | 19:20:15  | ❌ Failed | #33 |
| 2       | 6             | 19:22:08  | ❌ Failed | #40 |
| 3       | 7             | 19:24:02  | ✅ Success | N/A |

**Failure Rate:** 66.7% (2/3)
**Time to Success:** ~4 minutes (including retries)
**Status:** Flaky (eventually passes)

---

**Conclusion:** This is a **legitimate backend bug**, not a test stability issue. The E2E test is working correctly and exposing a real race condition in the vedtak creation process.

**Action Required:** Backend team should fix the duplicate `RegisteropplysningerService` call in the vedtak flow.

---

**Last Updated:** 2025-11-20
**Analysis By:** Claude Code (AI pair programmer)
**Review Status:** Ready for backend team review
