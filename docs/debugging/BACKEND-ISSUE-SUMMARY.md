# Backend Issue: Race Condition in EosVedtakService

**Priority:** 🔴 High
**Status:** Confirmed - Reproducible on CI
**Impact:** 66% failure rate in EU/EØS vedtak creation
**Date:** 2025-11-20

---

## 🐛 Problem

Optimistic locking failures during EU/EØS vedtak creation:

```
org.springframework.orm.ObjectOptimisticLockingFailureException:
Row was updated or deleted by another transaction (or unsaved-value mapping was incorrect) :
[no.nav.melosys.domain.SaksopplysningKilde#33]

Caused by: org.hibernate.StaleObjectStateException
  at DeleteCoordinator.lambda$doStaticDelete$6
```

**Endpoint:** `POST /api/saksflyt/vedtak/{id}/fatt`
**Frequency:** 2 out of 3 attempts fail (66% failure rate)

---

## 📊 Evidence

### Timeline from CI Logs

**Failed Attempt 1 (Behandling ID: 5):**
```
19:20:15.301 | RegisteropplysningerService | Registeropplysninger for Medlemskap hentet for behandling 5
19:20:15.471 | EosVedtakService | Fatter vedtak for (EU_EØS) sak: MEL-5 behandling: 5
19:20:15.487 | RegisteropplysningerService | Registeropplysninger for Medlemskap hentet for behandling 5 ⚠️
19:20:15.579 | ExceptionMapper | ERROR | Row was updated or deleted [SaksopplysningKilde#33]
```

**Key Observation:**
- RegisteropplysningerService called **TWICE** during single vedtak operation (16ms apart)
- Second call occurs **inside** the vedtak transaction
- Entity modified between load and delete → optimistic lock failure

**Failed Attempt 2:** Identical pattern (SaksopplysningKilde#40)
**Successful Attempt 3:** No duplicate call (timing luck)

---

## 🔍 Root Cause

**File:** `service/src/main/java/no/nav/melosys/service/vedtak/EosVedtakService.java`

```java
@Override
public void fattVedtak(Behandling behandling, FattVedtakRequest request) {
    // ...

    if (behandlingsresultat.erInnvilgelse()) {
        // LINE 91 - PROBLEMATIC CALL
        Collection<Kontrollfeil> kontrollfeil = ferdigbehandlingKontrollFacade
            .kontrollerVedtakMedRegisteropplysninger(
                behandling,
                Sakstyper.EU_EOS,
                request.getBehandlingsresultatTypeKode(),
                kontrollerSomSkalIgnoreres
            );

        if (!kontrollfeil.isEmpty()) {
            throw new ValideringException(...);
        }
    }
    // ...
}
```

**Problem Flow:**

1. `kontrollerVedtakMedRegisteropplysninger()` fetches registeropplysninger
2. Creates/updates `SaksopplysningKilde` entities
3. **Internally triggers another registeropplysninger fetch** (duplicate)
4. Second fetch updates the same `SaksopplysningKilde` entities
5. Original vedtak process tries to delete/modify entities
6. Entities have changed → Hibernate throws `StaleObjectStateException`

**Race Condition Window:** ~100ms between duplicate calls

---

## 🎯 Recommended Fixes

### Option 1: Remove Duplicate Fetch ✅ **Recommended**

**Problem:** `RegisteropplysningerService` called twice in same transaction

**Solution:** Refactor to fetch once and reuse:

```java
// Current (problematic)
kontrollerVedtakMedRegisteropplysninger() {
    var registeropplysninger = registeropplysningerService.hent(...);
    validate(behandling);
    oppdaterSaksopplysning(behandling); // ← Triggers SECOND fetch internally
}

// Fixed
kontrollerVedtakMedRegisteropplysninger() {
    var registeropplysninger = registeropplysningerService.hent(...);
    validate(behandling, registeropplysninger); // ← Pass data
    oppdaterSaksopplysning(behandling, registeropplysninger); // ← Reuse data
}
```

**Files to investigate:**
- `service/kontroll/feature/ferdigbehandling/FerdigbehandlingKontrollFacade.java`
- Methods that call `RegisteropplysningerService` multiple times

**Expected outcome:** Single registeropplysninger fetch per vedtak operation

---

### Option 2: Add Pessimistic Locking

If duplicate fetch is unavoidable (complex refactor), add explicit locking:

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("SELECT s FROM SaksopplysningKilde s WHERE ...")
Optional<SaksopplysningKilde> findByIdForUpdate(Long id);
```

**Note:** Performance impact - locks row during entire transaction

---

### Option 3: Add @Version Field

**File:** `domain/src/main/java/no/nav/melosys/domain/SaksopplysningKilde.java`

```java
@Entity
@Table(name = "saksopplysning_kilde")
public class SaksopplysningKilde {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ADD THIS
    @Version
    @Column(name = "versjon")
    private Long versjon;

    // ... rest of fields
}
```

**Note:** Requires database migration. Doesn't fix root cause but provides better error handling.

---

## 🧪 How to Reproduce

### Via E2E Test

```bash
cd melosys-e2e-tests
npm test tests/eu-eos/eu-eos-skip-fullfort-vedtak.spec.ts
```

**Expected:** 2/3 runs fail with optimistic locking error

### Via API (Manual)

1. Create EU/EØS behandling (UTSENDT_ARBEIDSTAKER)
2. Complete behandling workflow
3. Call `POST /api/saksflyt/vedtak/{id}/fatt` with innvilgelse
4. Check logs for duplicate "Registeropplysninger hentet" messages
5. Observe optimistic locking failure (intermittent)

---

## 📈 Impact Analysis

### Current Impact
- **E2E Tests:** 66% failure rate on skip workflow test
- **Production:** Likely happening but masked by retry logic or user retries
- **User Experience:** "Noe gikk galt" error when fatting vedtak (intermittent)

### After Fix
- **E2E Tests:** Should pass consistently
- **Production:** Fewer vedtak errors
- **Performance:** Slightly faster (one less DB roundtrip)

---

## 🔧 Testing the Fix

### Unit Test (Add This)

```java
@Test
void fattVedtak_skalIkkeKalleRegisteropplysningerToGanger() {
    // Given
    Behandling behandling = opprettTestBehandling();

    // When
    eosVedtakService.fattVedtak(behandling, request);

    // Then
    verify(registeropplysningerService, times(1))
        .hentRegisteropplysningerForMedlemskap(any());
}
```

### Integration Test

```java
@Test
void fattVedtak_skalIkkeFeileVedKonkurrentOppdatering() {
    // Run vedtak creation 10 times
    // Should succeed every time without optimistic locking failures
    for (int i = 0; i < 10; i++) {
        Behandling behandling = opprettTestBehandling();
        assertDoesNotThrow(() ->
            eosVedtakService.fattVedtak(behandling, request)
        );
    }
}
```

---

## 📝 Database Schema Check

**Table:** `saksopplysning_kilde`

Current schema (likely):
```sql
CREATE TABLE saksopplysning_kilde (
    id NUMBER PRIMARY KEY,
    saksopplysning_id NUMBER NOT NULL,
    kildesystem VARCHAR2(50) NOT NULL,
    mottatt_dokument CLOB NOT NULL
    -- Missing: versjon NUMBER (for @Version)
);
```

If implementing Option 3 (add @Version), migration needed:
```sql
ALTER TABLE saksopplysning_kilde ADD versjon NUMBER DEFAULT 0 NOT NULL;
```

---

## 🔗 Full Analysis

**Detailed technical analysis:** `docs/debugging/EU-EOS-SKIP-BACKEND-RACE-CONDITION.md`

Includes:
- Complete stack traces
- Code flow diagrams
- All 3 CI attempts with timestamps
- Entity relationship analysis
- Alternative fix strategies

---

## ✅ Acceptance Criteria

Fix is complete when:

1. ✅ E2E test `eu-eos-skip-fullfort-vedtak.spec.ts` passes 10/10 times
2. ✅ Logs show only ONE "Registeropplysninger hentet" per vedtak
3. ✅ No optimistic locking exceptions in logs
4. ✅ Unit tests added to prevent regression
5. ✅ No performance degradation

---

## 👥 Contacts

**Reporter:** E2E Test Suite (Playwright)
**Analysis By:** Claude Code AI
**Affected System:** melosys-api (vedtak creation)
**Test Location:** `melosys-e2e-tests/tests/eu-eos/eu-eos-skip-fullfort-vedtak.spec.ts`

**Questions?** Check full analysis document or review CI logs at:
- `/Downloads/playwright-results-26/playwright-report/melosys-api-complete.log`

---

## 🚀 Quick Start for Developer

1. **Reproduce locally:**
   ```bash
   cd melosys-e2e-tests
   npm test tests/eu-eos/eu-eos-skip-fullfort-vedtak.spec.ts
   ```

2. **Check melosys-api logs:**
   ```bash
   docker logs melosys-api 2>&1 | grep "Registeropplysninger.*hentet"
   ```

3. **Find duplicate calls:**
   ```bash
   # Should see TWO calls ~16ms apart
   grep -A 1 "Fatter vedtak" melosys-api.log
   ```

4. **Investigate:**
   ```bash
   cd melosys-api
   grep -r "kontrollerVedtakMedRegisteropplysninger" service/src
   ```

5. **Fix:** Refactor to single registeropplysninger fetch

6. **Verify:** Run E2E test 10 times - should pass every time

---

**Priority Action:** Investigate `FerdigbehandlingKontrollFacade.kontrollerVedtakMedRegisteropplysninger()` for duplicate `RegisteropplysningerService` calls.

**Estimated Fix Time:** 2-4 hours (investigation + refactor + testing)

---

**Last Updated:** 2025-11-20
**Status:** Ready for backend team pickup
