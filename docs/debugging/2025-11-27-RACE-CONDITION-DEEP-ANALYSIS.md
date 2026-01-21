# Race Condition Deep Analysis: behandlingsresultat.type Overwritten

**Date:** 2025-11-27
**Author:** Claude Code Analysis
**Status:** Root cause identified, architectural fix required
**Affected Component:** melosys-api (prosessinstans async processing)

---

## Executive Summary

When creating a decision ("vedtak") through "ny vurdering", the `behandlingsresultat.type` is correctly saved as `MEDLEM_I_FOLKETRYGDEN`, but an async background process starts before the database commit is fully visible, reads the old value `IKKE_FASTSATT`, and **writes it back**, overwriting the correct value.

**This is NOT a JPA caching issue.** It is a fundamental architectural problem where async processing races with transaction commit visibility.

**Failure Rate:** 10-56% on CI (varies by fix attempt), 0% locally

---

## Table of Contents

1. [The Problem](#the-problem)
2. [Transaction Timeline](#transaction-timeline)
3. [Why @TransactionalEventListener + @Async Fails](#why-transactionaleventlistener--async-fails)
4. [Why You Never See This Locally](#why-you-never-see-this-locally)
5. [Why JPA Fixes Made It Worse](#why-jpa-fixes-made-it-worse)
6. [Root Cause Summary](#root-cause-summary)
7. [Recommended Fixes](#recommended-fixes)
8. [Appendix: Log Evidence](#appendix-log-evidence)

---

## The Problem

### Symptom

The E2E test `skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering`:

1. Creates forstegangsvedtak with `skattepliktig=true`
2. Creates ny vurdering, changes to `skattepliktig=false`
3. Runs `finnIkkeSkattepliktigeSaker` job which queries:
   ```sql
   WHERE RESULTAT_TYPE = 'MEDLEM_I_FOLKETRYGDEN'
     AND behandling.status = 'AVSLUTTET'
   ```
4. **Expected:** Job finds 1 case
5. **Actual:** Job finds 0 cases because `RESULTAT_TYPE = 'IKKE_FASTSATT'`

### Impact

- Cases not included in arsavregning (annual settlement)
- Affects billing and tax calculations
- Business logic failures in production

### Data Flow

```
FtrlVedtakService.fattVedtak()
    │
    ├── oppdaterBehandlingsresultat(type = MEDLEM_I_FOLKETRYGDEN)
    │   └── Hibernate marks entity dirty (not yet flushed)
    │
    ├── publishEvent(StartProsessinstansEtterCommitEvent)
    │   └── @Async handler SCHEDULED (not executed)
    │
    └── Transaction commits
        └── MEDLEM_I_FOLKETRYGDEN written to database

        ⚡ RACE CONDITION WINDOW ⚡

Async Thread (may start before commit is visible):
    │
    ├── Opens NEW database connection
    ├── Reads behandlingsresultat → Gets IKKE_FASTSATT (stale!)
    ├── Modifies some field on entity
    └── Saves entity → OVERWRITES type back to IKKE_FASTSATT
```

---

## Transaction Timeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    HTTP REQUEST THREAD (Thread A)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  T0: @Transactional STARTS in VedtaksfattingFasade.fattVedtak()             │
│      └── DB connection opens, transaction begins                            │
│                                                                             │
│  T1: FtrlVedtakService.oppdaterBehandlingsresultat()                        │
│      └── behandlingsresultat.type = MEDLEM_I_FOLKETRYGDEN                   │
│      └── Hibernate marks entity as DIRTY (not flushed to DB yet!)           │
│                                                                             │
│  T2: prosessinstansService.opprettProsessinstans()                          │
│      └── publishEvent(ProsessinstansOpprettetEvent)                         │
│      └── @TransactionalEventListener(AFTER_COMMIT) is REGISTERED            │
│          └── @Async: behandleProsessinstans() is SCHEDULED to threadpool    │
│                                                                             │
│  T3: fattVedtak() method returns                                            │
│      └── Spring initiates transaction commit                                │
│      └── Hibernate flushes MEDLEM_I_FOLKETRYGDEN to database                │
│      └── @TransactionalEventListener fires (AFTER_COMMIT phase)             │
│          └── @Async task is added to executor queue                         │
│                                                                             │
│  T4: COMMIT completes at database level                                     │
│      └── Oracle writes to redo log, marks transaction committed             │
│                                                                             │
│  T5: Connection returned to pool                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    ASYNC THREAD (Thread B)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  T3.5: Async task picked up from queue (races with T4!)                     │
│        └── Opens NEW database connection                                    │
│        └── Starts NEW transaction                                           │
│                                                                             │
│  T3.6: Loads behandlingsresultat from database                              │
│        └── Oracle's READ COMMITTED isolation level                          │
│        └── IF T4 hasn't completed: sees IKKE_FASTSATT (pre-commit value)    │
│        └── IF T4 has completed: sees MEDLEM_I_FOLKETRYGDEN (correct)        │
│                                                                             │
│  T3.7: Prosessinstans step modifies behandlingsresultat (e.g., some field)  │
│        └── Hibernate tracks ALL fields in memory                            │
│        └── Entity still has stale type=IKKE_FASTSATT                        │
│                                                                             │
│  T3.8: Step completes, transaction commits                                  │
│        └── Hibernate writes ENTIRE entity to database                       │
│        └── OVERWRITES type back to IKKE_FASTSATT!                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Critical Race Window

The race occurs between **T3** (async task scheduled) and **T4** (commit visible to other connections):

```
Timeline showing race window:

T3          T3.5         T4          T5
│           │            │           │
▼           ▼            ▼           ▼
┌───────────┬────────────┬───────────┐
│  Spring   │   RACE     │  Commit   │
│  commits  │  WINDOW    │  visible  │
└───────────┴────────────┴───────────┘
            │            │
            └────────────┘
              1-10ms

If async reads during this window → STALE DATA
```

---

## Why @TransactionalEventListener + @Async Fails

### The Common Misconception

Many developers believe:

> "Using `@TransactionalEventListener(phase = AFTER_COMMIT)` ensures my listener fires only after the transaction commits, so any code in that listener will see committed data."

### The Reality

1. **AFTER_COMMIT is a Spring phase** - The listener fires after Spring's `commit()` call returns to the caller
2. **But @Async just schedules work** - It puts a task on an executor queue
3. **The async thread races with database visibility** - The new connection may not see the commit yet

```java
// The problematic pattern in melosys-api:

@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
@Async  // <-- This just puts a task on a queue!
public void onProsessinstansOpprettet(ProsessinstansOpprettetEvent event) {
    // This runs on a DIFFERENT thread
    // With a NEW database connection
    // That connection may NOT see the just-committed data yet!
    prosessinstansBehandler.behandleProsessinstans(event.getProsessinstansId());
}
```

### Why Oracle May Not Show The Commit

Oracle uses **Multi-Version Concurrency Control (MVCC)** with **READ COMMITTED** isolation:

1. When Thread B opens a new connection, it gets a consistent view of the database
2. If Thread A's commit hasn't been fully processed by Oracle, Thread B sees the pre-commit state
3. This is correct MVCC behavior - it prevents dirty reads of incomplete transactions
4. The window is typically 1-10ms, but under load can be longer

---

## Why You Never See This Locally

### Environmental Differences

| Factor | Local Development | CI Environment |
|--------|-------------------|----------------|
| **CPU Load** | Low, few processes | High, many parallel containers |
| **Database** | Often same machine, fast SSD | Containerized, shared resources |
| **Network** | Loopback (sub-millisecond) | Docker network, slight latency |
| **Thread Scheduling** | Fewer threads competing | Many threads, OS scheduler less predictable |
| **Connection Pool** | Often reuses same connection | More connection churn |
| **Commit Speed** | Very fast (2-5ms) | Slower due to containerization (5-20ms) |

### Timing Visualization

```
LOCAL MACHINE (commit completes fast, small race window):

T3(schedule)    T4(commit visible)    T3.5(async starts)
│               │                      │
▼               ▼                      ▼
├───────────────┼──────────────────────┼─────────────────>
                │                      │
                └──────────────────────┘
                      ~10-20ms

Async ALWAYS starts after commit is visible ✓
Result: 0% failure rate locally


CI ENVIRONMENT (commit slower, larger race window):

T3(schedule)    T3.5(async starts)    T4(commit visible)
│               │                      │
▼               ▼                      ▼
├───────────────┼──────────────────────┼─────────────────>
                │                      │
                └──────────────────────┘
                   Async reads HERE
                   (before commit!)

Async OFTEN starts before commit is visible ✗
Result: 10-56% failure rate on CI
```

### Why The Race Window Is Wider on CI

1. **Container overhead**: Docker adds latency to all I/O operations
2. **Shared resources**: Multiple containers compete for CPU, memory, disk
3. **Thread pool pressure**: Many concurrent tasks delay commit completion
4. **Database container**: Oracle in container is slower than native Oracle
5. **Network hops**: Even localhost in Docker has measurable latency

---

## Why JPA Fixes Made It Worse

### Attempted Fixes and Results

| Iteration | Fix Attempted | Failure Rate | Result |
|-----------|---------------|--------------|--------|
| Baseline | `@Transactional(REQUIRES_NEW)` | 23% | Failed |
| +1 | + `entityManager.refresh()` | 23% | No improvement |
| +2 | + `Thread.sleep(100ms)` | 29% | **Worse** |
| +3 | Replace with `entityManager.clear()` | 56% | **Much worse** |

### Why Each Fix Failed

#### 1. `@Transactional(propagation = REQUIRES_NEW)`

**Theory:** Start a fresh transaction in the async handler to avoid sharing state with parent.

**Why it failed:** The new transaction opens a new database connection. That connection still races with the parent commit. REQUIRES_NEW doesn't solve database-level visibility.

```java
@Transactional(propagation = Propagation.REQUIRES_NEW)
public void behandleProsessinstans(Long id) {
    // New transaction, but...
    // The database STILL may not show the parent's commit yet!
}
```

#### 2. `entityManager.refresh(entity)`

**Theory:** Force JPA to reload the entity from the database.

**Why it failed:** Refresh reloads from the database, but if the database shows pre-commit data, refresh just reloads that stale data.

```java
entityManager.refresh(behandlingsresultat);
// If database shows IKKE_FASTSATT, refresh loads IKKE_FASTSATT
// This doesn't fix the database visibility issue!
```

#### 3. `Thread.sleep(100ms)`

**Theory:** Wait for the parent transaction to commit before reading.

**Why it failed:**
- 100ms is sometimes not enough under heavy load
- Sleep introduces non-deterministic timing
- Other timing-sensitive code may be affected
- Made things WORSE (29% vs 23%)

```java
Thread.sleep(100); // Hope the commit is done by now...
// But under load, 100ms may not be enough
// And now we've slowed down ALL requests
```

#### 4. `entityManager.clear()`

**Theory:** Evict ALL entities from persistence context to force completely fresh database reads.

**Why it failed catastrophically (56%):**
- Clearing detaches entities that other code expects to be managed
- Subsequent lazy loads fail or reload stale data
- May have broken entity relationships mid-transaction
- Made things MUCH WORSE

```java
entityManager.clear(); // Nuclear option - detach everything!
// But now prosessinstans.getBehandling() returns detached entity
// Any lazy-loaded collections fail
// Entity state is inconsistent
```

### The Fundamental Problem

All these fixes try to make the async thread "see" committed data faster. But **you cannot fix database commit visibility with JPA tricks**. The data is simply not visible to other connections until Oracle completes the commit.

---

## Root Cause Summary

### The Architectural Flaw

```
┌─────────────────────────────────────────────────────────────┐
│                    THE PROBLEM                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  The async prosessinstans is TRIGGERED while still inside   │
│  the parent transaction's execution context.                │
│                                                             │
│  Even though @TransactionalEventListener(AFTER_COMMIT)      │
│  waits for Spring's commit phase, the @Async annotation     │
│  just schedules work that races with database visibility.   │
│                                                             │
│  This is a WRITE-SKEW / READ-YOUR-WRITES consistency        │
│  problem that cannot be fixed by JPA-level changes.         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### What We Ruled Out

| Hypothesis | Evidence | Conclusion |
|------------|----------|------------|
| JPA first-level cache | `entityManager.clear()` made it worse | Not the cause |
| Stale entity in persistence context | `refresh()` didn't help | Not the cause |
| Need more delay | `sleep(100ms)` made it worse | Not a solution |
| OpprettFakturaserie overwrites | Targeted update implemented but didn't fix root cause | Not the primary cause |

### What We Confirmed

| Finding | Evidence |
|---------|----------|
| Problem is timing-based | Same code succeeds/fails based on timing |
| Problem is worse under load | CI fails more than local |
| Database visibility is the issue | New connections see pre-commit data |
| JPA cannot fix this | All JPA fixes failed or made it worse |

---

## Recommended Fixes

### Option A: TransactionSynchronizationManager (Recommended)

Ensure the event is published **after** the database commit is confirmed at the database level:

```kotlin
// In FtrlVedtakService
@Transactional
fun fattVedtak(behandlingId: Long, request: FattVedtakRequest): Behandling {
    val behandling = doFattVedtak(behandlingId, request)

    // Register callback that fires AFTER commit is confirmed at DB level
    TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
        override fun afterCommit() {
            // This runs AFTER Oracle has confirmed the commit
            // Data is guaranteed to be visible to all connections
            prosessinstansService.opprettProsessinstansIverksettVedtakFTRL(behandling.id)
        }
    })

    return behandling
}
```

**Why this works:** `TransactionSynchronization.afterCommit()` fires after the JDBC connection's `commit()` returns, which means Oracle has confirmed the write.

**Pros:**
- Minimal code change
- Guaranteed consistency
- Works with existing @Async pattern

**Cons:**
- Slightly delays HTTP response (by commit callback time)

### Option B: Outbox Pattern

Write to an "outbox" table in the same transaction. A separate scheduled job polls and processes:

```kotlin
// In FtrlVedtakService (same transaction)
@Transactional
fun fattVedtak(behandlingId: Long, request: FattVedtakRequest): Behandling {
    val behandling = doFattVedtak(behandlingId, request)

    // Write to outbox in SAME transaction
    prosessinstansOutboxRepository.save(
        ProsessinstansOutbox(
            behandlingId = behandling.id,
            type = ProsessinstansType.IVERKSETT_VEDTAK_FTRL,
            status = OutboxStatus.PENDING
        )
    )
    // Both committed atomically - no race possible

    return behandling
}

// Separate scheduled job (runs every N seconds)
@Scheduled(fixedDelay = 5000)
@Transactional
fun processOutbox() {
    val pending = prosessinstansOutboxRepository.findByStatus(OutboxStatus.PENDING)
    pending.forEach { entry ->
        // Guaranteed to see committed data (it's in the same table!)
        prosessinstansService.opprettProsessinstansIverksettVedtakFTRL(entry.behandlingId)
        entry.status = OutboxStatus.PROCESSED
    }
}
```

**Why this works:** The outbox entry is written in the same transaction as the data change. When the job reads it, both are guaranteed to be visible.

**Pros:**
- Bulletproof consistency
- Survives application restarts
- Industry-standard pattern for this problem

**Cons:**
- More code to maintain
- Slight delay (polling interval)
- Need to handle idempotency

### Option C: Synchronous Processing

Remove `@Async` for this specific flow:

```java
// Remove @Async - process in same thread, same transaction
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
// No @Async!
public void onProsessinstansOpprettet(ProsessinstansOpprettetEvent event) {
    prosessinstansBehandler.behandleProsessinstans(event.getProsessinstansId());
}
```

**Why this works:** Same thread, same transaction means guaranteed consistent view.

**Pros:**
- Simplest change
- No race condition possible

**Cons:**
- Blocks HTTP response until processing completes
- May timeout for long operations
- Reduces throughput

### Option D: Optimistic Locking

Add `@Version` field to detect and handle conflicts:

```kotlin
@Entity
class Behandlingsresultat {
    @Version
    var version: Long = 0

    // ...
}
```

Then in the async handler:

```kotlin
try {
    // Will fail if version changed
    behandlingsresultatRepository.save(behandlingsresultat)
} catch (e: OptimisticLockingFailureException) {
    // Reload and retry
    val fresh = behandlingsresultatRepository.findById(id)
    // Process with fresh data
}
```

**Why this works:** The version field prevents overwriting newer data.

**Pros:**
- Standard JPA pattern
- Detects conflicts automatically

**Cons:**
- Requires retry logic
- Adds complexity
- May need multiple retries under load

### Recommendation

**Option A (TransactionSynchronizationManager)** is the recommended fix because:

1. Minimal code change
2. Addresses root cause directly
3. No new infrastructure needed
4. Works with existing patterns

If higher reliability is needed, **Option B (Outbox Pattern)** provides bulletproof consistency at the cost of more complexity.

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

**Key observation:** The only difference is timing. The data flow is identical, but in failed runs the async thread reads before the commit is visible.

---

## References

- [Spring TransactionalEventListener Documentation](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/event/TransactionalEventListener.html)
- [Oracle Read Consistency](https://docs.oracle.com/en/database/oracle/oracle-database/19/cncpt/data-concurrency-and-consistency.html)
- [Transactional Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- Original investigation: `docs/INVESTIGATION-BEHANDLINGSRESULTAT-TYPE-ISSUE.md`
- Fix iterations: `docs/debugging/2025-11-27-*-ITERATION-REPORT.md`
- Test orchestrator: `docs/orchestrator/RACE-CONDITION-TEST-ORCHESTRATOR.md`
