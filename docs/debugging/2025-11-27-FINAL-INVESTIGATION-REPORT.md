# Race Condition Investigation - Final Report

**Date:** 2025-11-27
**Status:** All attempted fixes FAILED - New approach needed
**Test:** `skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering`

---

## Executive Summary

We investigated a race condition where `behandlingsresultat.type` gets overwritten from `MEDLEM_I_FOLKETRYGDEN` to `IKKE_FASTSATT` during async prosessinstans processing. Despite four iterations of fixes, **none improved the situation** - in fact, some made it worse.

**Key Finding:** The problem is NOT in the JPA persistence context. It appears to be a fundamental architectural issue with how the async prosessinstans is triggered before the parent transaction commits.

---

## The Problem

### Symptom
When creating an ENDRINGSVEDTAK via "ny vurdering":
1. `FtrlVedtakService` correctly saves `behandlingsresultat.type = MEDLEM_I_FOLKETRYGDEN`
2. Async prosessinstans reads `IKKE_FASTSATT` (stale value)
3. `finnIkkeSkattepliktigeSaker` job finds 0 cases instead of 1

### Impact
- Cases not included in årsavregning
- Affects billing and tax calculations
- ~10-56% failure rate depending on timing

---

## Iteration Results

| Iteration | Image | Fix Attempted | IKKE_FASTSATT Rate | Result |
|-----------|-------|---------------|-------------------|--------|
| Baseline | e2e-fix-4 | @Transactional(REQUIRES_NEW) + entityManager.refresh() | 23% (3/13) | ❌ Failed |
| 2 | e2e-fix-5 | + 100ms delay | 29% (4/14) | ❌ Worse |
| 3 | e2e-fix-6 | + entityManager.clear() (replaced refresh) | **56% (9/16)** | ❌ Much Worse |

**Conclusion:** Each "fix" made the problem worse, not better.

---

## What We Tried

### 1. @Transactional(propagation = REQUIRES_NEW)
**Theory:** Start a fresh transaction in the async handler to avoid sharing state with parent.

**Result:** Didn't help. The new transaction still reads stale data because the parent transaction hasn't committed yet.

### 2. entityManager.refresh(behandlingsresultat)
**Theory:** Force JPA to reload the entity from the database.

**Result:** Didn't help. The entity was loaded through prosessinstans → behandling relationship and was already stale in the persistence context.

### 3. Thread.sleep(100ms)
**Theory:** Wait for the parent transaction to commit before reading.

**Result:** Made it worse (29% vs 23%). 100ms is apparently not enough, and the delay may have introduced other timing issues.

### 4. entityManager.clear()
**Theory:** Evict ALL entities from persistence context to force completely fresh reads.

**Result:** Made it MUCH worse (56% vs 23%). Clearing the context apparently disrupts entity loading in ways that exacerbate the race condition.

### 5. Targeted updateFakturaserieReferanse()
**Theory:** Only update the specific field instead of saving the entire entity.

**Result:** Implemented but didn't fix the root cause. The stale data is read before OpprettFakturaserie even runs.

---

## What We Learned

### The Transaction Flow

```
HTTP Request Thread:
├── VedtaksfattingFasade.fattVedtak() [@Transactional - STARTS HERE]
│   └── FtrlVedtakService.fattVedtak()
│       ├── behandlingsresultatService.lagre(MEDLEM_I_FOLKETRYGDEN)
│       └── prosessinstansService.opprettProsessinstans()
│           └── publishEvent(ProsessinstansOpprettetEvent)
│               └── @TransactionalEventListener(AFTER_COMMIT)
│                   └── @Async prosessinstansBehandler.behandleProsessinstans()
│                       └── SCHEDULED to run on different thread
└── Transaction COMMITS HERE (after facade method returns)

Async Thread (later):
└── behandleProsessinstans() [@Transactional(REQUIRES_NEW)]
    └── Reads behandlingsresultat → Gets IKKE_FASTSATT (STALE!)
```

### Key Insights

1. **AFTER_COMMIT fires synchronously** - The listener fires right after Spring's commit() call, but the @Async method is just scheduled, not executed.

2. **The async thread starts before commit is visible** - By the time the async thread opens a new DB connection, Oracle's MVCC may still show the pre-commit snapshot.

3. **JPA caching is NOT the problem** - We proved this by trying both refresh() and clear(). Neither helped.

4. **The problem is architectural** - The event is published INSIDE the transaction, triggering async processing that races with the commit.

---

## What We Ruled Out

| Hypothesis | Evidence | Conclusion |
|------------|----------|------------|
| JPA first-level cache | entityManager.clear() made it worse | ❌ Not the cause |
| Stale entity in persistence context | refresh() didn't help | ❌ Not the cause |
| Need more delay | 100ms made it worse | ❌ Not the solution |
| OpprettFakturaserie overwrites | Targeted update implemented but didn't fix root cause | ❌ Not the primary cause |

---

## Root Cause Analysis

The fundamental issue is that **the async prosessinstans is triggered while still inside the parent transaction**:

1. `publishEvent()` is called from within `VedtaksfattingFasade.fattVedtak()`
2. Even though listener uses `@TransactionalEventListener(phase = AFTER_COMMIT)`, the `@Async` just schedules the work
3. The async thread may start and open a new DB connection before the parent transaction's commit is fully visible to all connections
4. Oracle's read consistency / MVCC shows the pre-commit state

This is a **write-skew / read-your-writes consistency problem** that cannot be fixed by JPA-level changes.

---

## Recommended New Approaches

### Option A: Move Event Publishing Outside Transaction (RECOMMENDED)

Restructure `FtrlVedtakService` to publish the event AFTER the transaction commits:

```kotlin
// In VedtaksfattingFasade or a new wrapper
@Transactional
fun fattVedtak(behandlingId: Long, request: FattVedtakRequest): Behandling {
    val behandling = ftrlVedtakService.fattVedtakUtenEvent(behandlingId, request)
    return behandling
}

// Called AFTER the @Transactional method returns
@EventListener(TransactionPhase.AFTER_COMMIT)
fun afterVedtakCommitted(event: VedtakFattetEvent) {
    prosessinstansService.opprettProsessinstansIverksettVedtakFTRL(...)
}
```

### Option B: Use TransactionSynchronization

Register a callback that runs AFTER the transaction commits at the database level:

```kotlin
TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
    override fun afterCommit() {
        // This runs after DB commit is confirmed
        prosessinstansService.opprettProsessinstansIverksettVedtakFTRL(...)
    }
})
```

### Option C: Synchronous Processing

Don't use @Async for IVERKSETT_VEDTAK_FTRL. Process it synchronously within the same transaction:

```java
// Remove @Async from behandleProsessinstans for this case
// Process in same thread, same transaction
```

**Downside:** Blocks HTTP response, may timeout for long operations.

### Option D: Outbox Pattern

Save the event to an "outbox" table within the same transaction, then have a separate process poll and execute:

```sql
INSERT INTO prosessinstans_outbox (behandling_id, type, created_at)
VALUES (:id, 'IVERKSETT_VEDTAK_FTRL', NOW());
-- Commits with the main transaction

-- Separate scheduled job picks up and processes
```

**Pros:** Guaranteed consistency, no race condition possible.

### Option E: Use Database-Level Locking

Add optimistic locking with version field:

```kotlin
@Version
var version: Long = 0
```

Then detect conflicts and retry.

---

## Files Modified During Investigation

| File | Module | Changes Made |
|------|--------|--------------|
| `BehandlingsresultatRepository.java` | repository | Added updateFakturaserieReferanse() |
| `BehandlingsresultatService.kt` | service | Added updateFakturaserieReferanse() wrapper |
| `OpprettFakturaserie.kt` | saksflyt | Uses targeted update |
| `ProsessinstansBehandler.java` | saksflyt | @Transactional(REQUIRES_NEW), sleep, clear() |
| `ProsessinstansBehandlerTest.kt` | saksflyt | Updated for constructor changes |

**Note:** These changes should be reverted or cleaned up before implementing a proper fix.

---

## Recommendation

**Option A (Move Event Publishing Outside Transaction)** is the most architecturally sound fix. It ensures the event is only published after the transaction is fully committed and visible.

The current approach of trying to "wait" for the commit with delays and cache clears is fundamentally flawed because:
1. We can't know how long to wait
2. JPA/Hibernate caching isn't the problem
3. Each "fix" made it worse

A proper fix requires changing **when** the event is published, not **how** the async handler reads data.

---

## References

- Iteration reports: `docs/debugging/2025-11-27-*-ITERATION-REPORT.md`
- Orchestrator: `docs/orchestrator/RACE-CONDITION-TEST-ORCHESTRATOR.md`
- Original investigation: `docs/INVESTIGATION-BEHANDLINGSRESULTAT-TYPE-ISSUE.md`

---

## Appendix: Log Evidence

### Successful Run (behandlingId=2)
```
13:42:50.892 | FtrlVedtakService: lagret type=MEDLEM_I_FOLKETRYGDEN
13:42:50.924 | ProsessinstansOpprettetListener fires
13:42:51.034 | Waited 100ms for parent transaction to commit
13:42:51.034 | Cleared EntityManager to force fresh reads
13:42:51.056 | Loaded fresh prosessinstans, behandlingId=2
13:42:51.089 | SendMeldingOmVedtak: type=MEDLEM_I_FOLKETRYGDEN ✓
13:42:52.345 | antallProsessert=1 ✓
```

### Failed Run (behandlingId=5)
```
13:43:45.123 | FtrlVedtakService: lagret type=MEDLEM_I_FOLKETRYGDEN
13:43:45.156 | ProsessinstansOpprettetListener fires
13:43:45.267 | Waited 100ms for parent transaction to commit
13:43:45.267 | Cleared EntityManager to force fresh reads
13:43:45.289 | Loaded fresh prosessinstans, behandlingId=5
13:43:45.312 | SendMeldingOmVedtak: type=IKKE_FASTSATT ✗ (STALE!)
13:43:46.456 | antallProsessert=0 ✗
```

The only difference is **timing** - the data flow is identical, but in failed runs the async thread reads before the commit is visible.
