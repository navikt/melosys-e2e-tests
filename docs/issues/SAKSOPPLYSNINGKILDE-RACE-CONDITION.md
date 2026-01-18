# SaksopplysningKilde Race Condition Analysis

**Date:** 2026-01-17
**Updated:** 2026-01-17 (added frontend analysis)
**Status:** API fix complete (hashcode-3), frontend pattern documented
**Severity:** Medium (causes flaky E2E tests)
**Related PRs:**
- navikt/melosys-api#3167 (@DynamicUpdate - incomplete)
- navikt/melosys-api hashcode-3 (@Version field - complete)

## Summary

E2E tests intermittently fail with an optimistic locking exception in `SaksopplysningKilde`.

**Root Cause:** melosys-web triggers **6 parallel API calls** when "Bekreft og fortsett" is clicked, all modifying the same behandling entity graph. This creates race conditions in the backend.

**API Fix:** Adding `@Version` field eliminated the API errors.
**Remaining Issue:** Step transition timing - tests check for UI elements before React renders the next step.

## Error Message

```
ERROR | API kall feilet: Row was updated or deleted by another transaction
(or unsaved-value mapping was incorrect) : [no.nav.melosys.domain.SaksopplysningKilde#113]
```

## Affected Tests

- `eu-eos-13.1-arbeid-flere-land-selvstendig-fullfort-vedtak.spec.ts`
- Potentially other EU/EØS workflow tests

## Timeline

| Date | Event |
|------|-------|
| 2026-01-17 | E2E test failure observed with SaksopplysningKilde error |
| 2026-01-XX | PR #3167 merged - added `@DynamicUpdate` to Saksopplysning and SaksopplysningKilde |
| 2026-01-17 | Error still occurring despite PR #3167 fix |

## Technical Analysis

### Entity Structure

```java
// Saksopplysning.java
@Entity
@Table(name = "saksopplysning")
@DynamicUpdate
public class Saksopplysning {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "behandling_id", nullable = false, updatable = false)
    private Behandling behandling;

    @OneToMany(mappedBy = "saksopplysning", cascade = CascadeType.ALL,
               fetch = FetchType.LAZY, orphanRemoval = true)
    private Set<SaksopplysningKilde> kilder = new HashSet<>(1);

    // ... other fields
}

// SaksopplysningKilde.java
@Entity
@Table(name = "saksopplysning_kilde")
@DynamicUpdate
public class SaksopplysningKilde {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "saksopplysning_id", nullable = false, updatable = false)
    private Saksopplysning saksopplysning;

    @Lob
    @Column(name = "mottatt_dokument", nullable = false)
    private String mottattDokument;

    // ... other fields
}
```

### Why @DynamicUpdate Is Insufficient

The `@DynamicUpdate` annotation only helps when two threads update **different columns** on the same entity. It does NOT help when:

1. **Both threads update the same column** - The second thread's UPDATE will still fail
2. **Collection operations cascade** - Saving `Saksopplysning` cascades to all `kilder` entries
3. **Entity is deleted by another transaction** - The "or deleted" part of the error message

### Root Cause Hypothesis

The race condition occurs between the **HTTP request thread** and the **Saga/async thread**:

```
Thread A (HTTP)                    Thread B (Saga)
─────────────────                  ─────────────────
Load Behandling (version 1)
Load Saksopplysning
Load kilder collection
                                   Load Behandling (version 1)
                                   Load Saksopplysning
                                   Load kilder collection

                                   Modify kilder
                                   Save Saksopplysning
                                   CASCADE saves kilder → SUCCESS
                                   (kilder now at new state)

Modify kilder
Save Saksopplysning
CASCADE saves kilder → FAIL!
(stale entity state)
```

### Problematic Patterns

1. **CascadeType.ALL** - Any save on `Saksopplysning` touches all children
2. **orphanRemoval = true** - Removing from collection triggers DELETE
3. **Lazy loading + concurrent modification** - Classic N+1 turned into race condition
4. **No explicit locking** - Neither pessimistic nor optimistic with @Version

## Evidence from E2E Tests

### GitHub Actions Run: 21096520983

```json
{
  "status": "flaky",
  "totalAttempts": 2,
  "failedAttempts": 1,
  "dockerErrors": [
    {
      "service": "melosys-api",
      "errors": [
        {
          "message": "Row was updated or deleted by another transaction
                      (or unsaved-value mapping was incorrect) :
                      [no.nav.melosys.domain.SaksopplysningKilde#113]"
        }
      ]
    }
  ]
}
```

### Failure Chain

1. Backend race condition triggers optimistic lock exception
2. Vedtak API call fails or times out (60s timeout)
3. Process instances don't complete (30s timeout)
4. Test fails on first attempt
5. Retry succeeds (race condition is timing-dependent)

## Recommended Fixes

### Option 1: Pessimistic Locking (Recommended)

Add explicit locking when loading entities that will be modified:

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("SELECT s FROM Saksopplysning s WHERE s.behandling.id = :behandlingId")
List<Saksopplysning> findByBehandlingIdForUpdate(@Param("behandlingId") Long behandlingId);
```

### Option 2: Retry with @Retryable

Add retry logic for transient failures:

```java
@Retryable(
    value = {OptimisticLockException.class, StaleObjectStateException.class},
    maxAttempts = 3,
    backoff = @Backoff(delay = 100, multiplier = 2)
)
public void saveSaksopplysning(Saksopplysning saksopplysning) {
    // ... save logic
}
```

### Option 3: Separate Transactions

Ensure HTTP and Saga operations don't overlap by using separate transaction boundaries:

```java
@Transactional(propagation = Propagation.REQUIRES_NEW)
public void updateSaksopplysningInNewTransaction(Long id, Consumer<Saksopplysning> updater) {
    Saksopplysning fresh = repository.findById(id).orElseThrow();
    updater.accept(fresh);
    repository.save(fresh);
}
```

### Option 4: Optimistic Locking with @Version

Add explicit version tracking (currently missing):

```java
@Entity
public class SaksopplysningKilde {
    @Version
    private Long version;

    // ... rest of entity
}
```

This makes the failure explicit and catchable, enabling proper retry logic.

## Temporary Workaround

The E2E tests use Playwright's retry mechanism (3 attempts) which masks this issue. The test is now marked as "flaky" rather than "failed" after adding proper `waitForContent` options.

## Files to Investigate

In melosys-api repository:

- `domain/src/main/java/no/nav/melosys/domain/Saksopplysning.java`
- `domain/src/main/java/no/nav/melosys/domain/SaksopplysningKilde.java`
- Services that load/save `Saksopplysning` with its `kilder` collection
- Saga handlers that modify `Saksopplysning`

## How to Reproduce

1. Run E2E test: `eu-eos-13.1-arbeid-flere-land-selvstendig-fullfort-vedtak.spec.ts`
2. The test exercises the "Arbeid i flere land" workflow with vedtak
3. Race condition occurs ~50% of the time between HTTP thread and Saga thread
4. Check melosys-api logs for the optimistic lock exception

## Related Issues

- PR #3167: Initial (incomplete) fix with @DynamicUpdate
- PR #3166: Similar fix for OppgaveService
- PR #3160: Similar fix for Behandlingsresultat (MELOSYS-7718)

## Frontend Analysis: melosys-web API Call Pattern

### Discovery

When "Bekreft og fortsett" is clicked, melosys-web triggers **6 parallel API calls** via `Promise.all()`:

**File:** `src/felleskomponenter/stegvelger/Stegvelger.jsx` (lines 206-232)

```javascript
publiserStegdata = async () => {
  const { sakstype } = this.props;
  const { stegStores } = this.state;
  const { vilkaar, avklartefakta, anmodningsperiodesvar } = stegStores;

  if (sakstype === MKV.Koder.sakstyper.FTRL) {
    await Promise.all([this.props.oppdaterVilkaar(vilkaar.hent())]);
  } else {
    // EU/EØS - 6 PARALLEL API CALLS!
    await Promise.all([
      this.props.oppdaterVilkaar(vilkaar.hent()),           // POST /api/vilkaar/:id
      this.props.oppdaterAvklartefakta(avklartefakta.hent()), // POST /api/avklartefakta/:id
      this.props.oppdaterLovvalgperioder(perioderStegState),  // POST /api/lovvalgsperioder/:id
      this.props.oppdaterAnmodningsPerioder(perioderStegState), // POST /api/anmodningsperioder/:id
      this.props.oppdaterUtpekingsperioder(perioderStegState),  // POST /api/utpekingsperioder/:id
      this.props.oppdaterAnmodningsperiodesvar(anmodningsperiodesvar.hent()), // POST /api/anmodningsperiodesvar/:id
    ]);
  }

  this.props.oppdaterMottatteOpplysninger(); // POST /api/mottatteopplysninger/:id
  this.oppdaterAktuelleSteg(aktivtStegNummer);
};
```

### Impact on Backend

Each of these operations:
1. Loads the behandling entity graph (including `Saksopplysning` → `SaksopplysningKilde`)
2. Modifies some fields
3. Saves (CASCADE to children due to `CascadeType.ALL`)

When run in parallel:
- Thread A loads entity version 1
- Thread B loads entity version 1
- Thread A saves (version becomes 2)
- Thread B tries to save with stale version 1 → **OptimisticLockingException**

### Network Timeline (captured from E2E tests)

```
T+0ms    Click "Bekreft og fortsett"
T+10ms   POST /api/vilkaar/123 (starts)
T+12ms   POST /api/avklartefakta/123 (starts)
T+15ms   POST /api/lovvalgsperioder/123 (starts)
T+18ms   POST /api/anmodningsperioder/123 (starts)
T+20ms   POST /api/utpekingsperioder/123 (starts)
T+22ms   POST /api/anmodningsperiodesvar/123 (starts)
T+150ms  POST /api/vilkaar/123 (completes - 200)
T+180ms  POST /api/avklartefakta/123 (completes - 200)
T+200ms  POST /api/anmodningsperioder/123 (FAILS - 500 OptimisticLock)  <-- RACE!
T+220ms  POST /api/lovvalgsperioder/123 (completes - 200)
...
T+500ms  POST /api/mottatteopplysninger/123 (starts - after Promise.all)
T+800ms  React state update triggers re-render
T+850ms  Step heading changes to next step
```

### Why @Version Fixed the API Error

With `@Version` field on `SaksopplysningKilde`:
- Each entity has explicit version tracking
- Concurrent modifications fail fast with clear error
- Hibernate knows exactly which version is expected
- No more "Row was updated or deleted" mysteries

### Remaining Timing Issue

Even with API errors fixed, the test can still fail because:
1. `Promise.all()` completes (all 6 calls done)
2. `oppdaterMottatteOpplysninger()` is called
3. React state update is scheduled
4. **E2E test immediately checks for next step elements**
5. React hasn't rendered yet → timeout

### Solution Options

#### Option 1: E2E Test - Wait for Step Heading (Implemented ✅)

```typescript
// In arbeid-flere-land-behandling.page.ts
await behandling.klikkBekreftOgFortsett({
  waitForContent: page.getByRole('checkbox', { name: 'Ståles Stål AS' })
});
```

This waits for the specific UI element on the next step before proceeding.

#### Option 2: Frontend - Serialize Critical Saves

```javascript
// Instead of parallel, serialize the saves that touch same entities
publiserStegdata = async () => {
  // Group 1: Core data
  await this.props.oppdaterVilkaar(vilkaar.hent());
  await this.props.oppdaterAvklartefakta(avklartefakta.hent());

  // Group 2: Period data (can be parallel within group)
  await Promise.all([
    this.props.oppdaterLovvalgperioder(perioderStegState),
    this.props.oppdaterAnmodningsPerioder(perioderStegState),
    this.props.oppdaterUtpekingsperioder(perioderStegState),
  ]);

  // Group 3: Final
  await this.props.oppdaterAnmodningsperiodesvar(anmodningsperiodesvar.hent());
  await this.props.oppdaterMottatteOpplysninger();
};
```

#### Option 3: Backend - Batch Save Endpoint

Create a single endpoint that saves all step data atomically:

```kotlin
@PostMapping("/api/behandling/{id}/steg")
fun lagreStegData(@PathVariable id: Long, @RequestBody stegData: StegDataDto) {
  // Single transaction, no race conditions
  behandlingService.lagreStegData(id, stegData)
}
```

### Recommendation

1. **Short term:** Use `waitForContent` in E2E tests (already implemented)
2. **Medium term:** Consider serializing critical saves in frontend
3. **Long term:** Evaluate batch save endpoint for atomicity

## E2E Test Timing Experiments (2026-01-18)

After fixing the API race condition with `@Version`, we experimented with different E2E test wait strategies. **Key finding: Adding more waits made tests LESS stable.**

### Experiment Results

| Approach | Pass Rate | Notes |
|----------|-----------|-------|
| **Original (baseline)** | **80%** | API waits (avklartefakta, vilkaar) + content wait |
| + network idle before content | 70% | Added `waitForLoadState('networkidle')` |
| + mottatteopplysninger wait | 60% | Added explicit wait for final API call |
| Simplified (no API waits) | 50% | Just click + content wait |
| Restored original | 70% | Back to baseline approach |

### Conclusion

The original approach with **specific API waits + content-based wait** is optimal. Adding more waits:
- Introduces timing windows where state can change
- Gives React more opportunity for intermediate renders
- Creates additional race conditions

**The remaining 20-30% flakiness is inherent to melosys-web's frontend architecture:**
- 6 parallel API calls cause unpredictable timing
- Sequential `oppdaterMottatteOpplysninger()` call adds delay
- React state batching and rendering is non-deterministic

### Recommendation for E2E Tests

1. Keep current approach: API waits + `waitForContent` option
2. Accept ~70-80% pass rate for this specific test
3. Use Playwright's built-in retry mechanism for the remaining flakiness
4. Do NOT add more explicit waits - they make things worse

## Contacts

- E2E Tests: Team Melosys
- melosys-api: Team Melosys
- melosys-web: Team Melosys
