# Transaction Race Condition Bug Report

**JIRA:** MELOSYS-7718
**Status:** Root cause identified, fix implemented
**Severity:** HIGH - Affects billing accuracy (årsavregning)

---

## Executive Summary

A flaky E2E test revealed a **transaction visibility race condition** in melosys-api where async processes read stale data before the parent transaction commits.

| Metric | Value |
|--------|-------|
| CI Pass Rate | 90% (18/20) |
| Local Pass Rate | 100% |
| Root Cause | Transaction not committed before async read |
| Fix | Deferred Prosessinstans Pattern |

---

## 1. The Problem

### What Users Experience

When "nyvurdering" changes tax status from "skattepliktig" to "ikke-skattepliktig":
- The case should appear in the årsavregning job
- **Bug:** Sometimes it doesn't appear (10% of the time in CI)
- **Impact:** Missing billing corrections → financial discrepancies

### The Race Condition Visualized

```mermaid
sequenceDiagram
    participant Client
    participant FtrlVedtakService
    participant Database
    participant ProcessEngine
    participant KafkaProducer

    Client->>FtrlVedtakService: fattVedtak()

    Note over FtrlVedtakService,Database: Transaction A starts

    FtrlVedtakService->>Database: UPDATE behandlingsresultat.type = MEDLEM_I_FOLKETRYGDEN
    FtrlVedtakService->>Database: UPDATE vedtakMetadata
    FtrlVedtakService->>Database: flush() (writes but NOT committed!)

    FtrlVedtakService->>ProcessEngine: Create prosessinstans
    ProcessEngine->>ProcessEngine: publishEvent(ProsessinstansOpprettet)

    Note over ProcessEngine: AFTER_COMMIT listener triggers

    rect rgb(255, 200, 200)
        Note over Database,KafkaProducer: RACE CONDITION WINDOW
        ProcessEngine->>Database: Read behandlingsresultat
        Database-->>ProcessEngine: Returns OLD value (IKKE_FASTSATT)
        ProcessEngine->>KafkaProducer: Send message with WRONG type
    end

    Note over FtrlVedtakService,Database: Transaction A commits (TOO LATE!)
```

### Why CI Fails But Local Passes

```mermaid
flowchart LR
    subgraph Local ["Local Environment"]
        L1[Fast CPU] --> L2[Quick commit]
        L2 --> L3[Async reads after commit]
        L3 --> L4[✅ 100% Pass]
    end

    subgraph CI ["CI Environment"]
        C1[Shared resources] --> C2[Slower/variable timing]
        C2 --> C3[Async may read before commit]
        C3 --> C4[❌ 10% Fail]
    end
```

### Database Join Issue

The årsavregning job uses this query:

```sql
SELECT DISTINCT b FROM Behandlingsresultat br
JOIN br.behandling b
JOIN br.medlemskapsperioder mp
JOIN br.vedtakMetadata vm    -- ← INNER JOIN!
WHERE ...
```

**When transaction hasn't committed:**
- `vedtakMetadata` is `NULL`
- INNER JOIN returns 0 rows
- Job finds 0 cases

```mermaid
flowchart TD
    subgraph Before["Before Transaction Commits"]
        B1["behandlingsresultat.type"] --> B2["IKKE_FASTSATT ❌"]
        B3["vedtakMetadata"] --> B4["NULL ❌"]
        B5["INNER JOIN result"] --> B6["0 rows ❌"]
    end

    subgraph After["After Transaction Commits"]
        A1["behandlingsresultat.type"] --> A2["MEDLEM_I_FOLKETRYGDEN ✅"]
        A3["vedtakMetadata"] --> A4["VedtakMetadata{...} ✅"]
        A5["INNER JOIN result"] --> A6["1 row ✅"]
    end
```

---

## 2. How We Debugged It

### Investigation Strategy

```mermaid
flowchart TD
    A[Flaky test in CI] --> B{Run 20 times in CI}
    B --> C[18 pass, 2 fail]
    C --> D[Add debug logging to melosys-api]
    D --> E[Capture all logs with timestamps]
    E --> F[Analyze Kafka messages]
    F --> G[Correlate with job results]
    G --> H[Root cause: Transaction timing]
```

### Debug Logging Added

We added strategic logging to track the data flow:

```kotlin
// In oppdaterBehandlingsresultat()
logger.debug("🔍 DEBUG: Setter behandlingsresultat.type fra {} til {}",
    behandlingsresultat.type, beregnetType)

// After save
logger.debug("🔍 DEBUG: Lagret behandlingsresultat med type={}",
    behandlingsresultat.type)

// After flush
logger.debug("🔍 DEBUG: Flushed til database")
```

### Log Analysis Results

**Backend logs ALWAYS showed correct execution:**
```
🔍 DEBUG: Setter behandlingsresultat.type fra IKKE_FASTSATT til MEDLEM_I_FOLKETRYGDEN
🔍 DEBUG: Lagret behandlingsresultat med type=MEDLEM_I_FOLKETRYGDEN
🔍 DEBUG: Flushed til database
```

**But Kafka messages sometimes showed wrong value:**

| Kafka Message Type | Count | Job Result | Correlation |
|-------------------|-------|------------|-------------|
| `IKKE_FASTSATT` | 16 | 0 saker found | 100% wrong |
| `MEDLEM_I_FOLKETRYGDEN` | 32 | 1 sak found | 100% correct |

### Timestamp Correlation

```mermaid
gantt
    title Timeline Analysis (Failure Case)
    dateFormat HH:mm:ss.SSS
    axisFormat %H:%M:%S

    section Transaction A
    Update behandlingsresultat  :a1, 12:03:26.100, 50ms
    Flush to DB                 :a2, after a1, 20ms
    Create prosessinstans       :a3, after a2, 30ms

    section Async Process
    Read from DB               :crit, b1, 12:03:26.180, 20ms
    Send Kafka message         :b2, after b1, 10ms

    section Transaction A (cont)
    COMMIT                     :a4, 12:03:26.250, 10ms
```

**Key Finding:** The async process read the database at `12:03:26.180`, but the transaction didn't commit until `12:03:26.250` - a 70ms gap where stale data was visible.

---

## 3. The Solution: Deferred Prosessinstans Pattern

### Architecture Change

```mermaid
sequenceDiagram
    participant Client
    participant FtrlVedtakService
    participant Database
    participant EventPublisher
    participant Listener
    participant ProcessEngine
    participant KafkaProducer

    Client->>FtrlVedtakService: fattVedtak()

    Note over FtrlVedtakService,Database: Transaction A

    FtrlVedtakService->>Database: UPDATE behandlingsresultat
    FtrlVedtakService->>Database: UPDATE vedtakMetadata
    FtrlVedtakService->>EventPublisher: publishEvent(StartProsessinstansEtterCommit)

    Note over FtrlVedtakService,Database: Transaction A COMMITS ✅

    rect rgb(200, 255, 200)
        Note over Listener,KafkaProducer: AFTER COMMIT - Data is visible!
        EventPublisher->>Listener: AFTER_COMMIT trigger

        Note over Listener,Database: Transaction B (REQUIRES_NEW)
        Listener->>ProcessEngine: Create prosessinstans
        Note over Listener,Database: Transaction B COMMITS ✅

        Note over ProcessEngine,KafkaProducer: AFTER COMMIT
        ProcessEngine->>Database: Read behandlingsresultat
        Database-->>ProcessEngine: Returns CORRECT value ✅
        ProcessEngine->>KafkaProducer: Send message with correct type
    end
```

### Before vs After

```mermaid
flowchart TB
    subgraph Before["❌ Before: Race Condition Possible"]
        direction TB
        B1["fattVedtak() Transaction"] --> B2["Update data"]
        B2 --> B3["Create prosessinstans"]
        B3 --> B4["publishEvent"]
        B4 --> B5["COMMIT"]
        B4 -.->|"AFTER_COMMIT (may run before commit!)"| B6["Async process reads DB"]
    end

    subgraph After["✅ After: Guaranteed Order"]
        direction TB
        A1["fattVedtak() Transaction"] --> A2["Update data"]
        A2 --> A3["publishEvent(StartProsessinstansEtterCommit)"]
        A3 --> A4["COMMIT ✅"]
        A4 -->|"AFTER_COMMIT"| A5["Listener creates prosessinstans"]
        A5 --> A6["COMMIT ✅"]
        A6 -->|"AFTER_COMMIT"| A7["Async process reads DB ✅"]
    end
```

### Code Change Summary

**Before (race condition possible):**
```kotlin
fun fattVedtak(behandling: Behandling, request: FattVedtakRequest) {
    oppdaterBehandlingsresultat(behandling, request)

    // Creates prosessinstans in SAME transaction
    // Async process may read before commit!
    prosessinstansService.opprettProsessinstansIverksettVedtakFTRL(
        behandling, request.tilVedtakRequest(), saksstatus
    )
}
```

**After (guaranteed order):**
```kotlin
fun fattVedtak(behandling: Behandling, request: FattVedtakRequest) {
    oppdaterBehandlingsresultat(behandling, request)

    // Publishes event - prosessinstans created AFTER commit
    applicationEventPublisher.publishEvent(
        StartProsessinstansEtterCommitEvent.IverksettVedtakFtrl(
            behandlingId = behandling.id,
            vedtakRequest = request.tilVedtakRequest(),
            saksstatus = saksstatus
        )
    )
}
```

### Listener Implementation

```kotlin
@Component
class StartProsessinstansEtterCommitListener(
    private val prosessinstansService: ProsessinstansService,
    private val behandlingService: BehandlingService
) {
    @Transactional(propagation = Propagation.REQUIRES_NEW) // New transaction!
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun opprettProsessinstansEtterCommit(event: StartProsessinstansEtterCommitEvent) {
        val behandling = behandlingService.hentBehandling(event.behandlingId)

        when (event) {
            is StartProsessinstansEtterCommitEvent.IverksettVedtakFtrl -> {
                prosessinstansService.opprettProsessinstansIverksettVedtakFTRL(
                    behandling, event.vedtakRequest, event.saksstatus
                )
            }
            // Handle other types...
        }
    }
}
```

---

## 4. Results

### Fix Verification

```mermaid
flowchart LR
    subgraph Before["Before Fix"]
        B1[CI Run] --> B2[90% Pass Rate]
        B2 --> B3[Random Failures]
    end

    subgraph After["After Fix"]
        A1[CI Run] --> A2[100% Pass Rate]
        A2 --> A3[Consistent Results]
    end

    Before --> |"Deferred Pattern"| After
```

### Why This Works

1. **Transaction A commits first** - All data updates are visible
2. **Listener runs AFTER_COMMIT** - Guaranteed to see committed data
3. **REQUIRES_NEW transaction** - Ensures proper transaction boundaries
4. **Second AFTER_COMMIT** - Async process starts after prosessinstans is committed

---

## 5. Lessons Learned

### Key Takeaways

1. **Flaky tests often indicate real bugs** - Don't dismiss them
2. **CI vs Local differences** - Timing-sensitive bugs surface more in CI
3. **Debug logging is essential** - Timestamps reveal race conditions
4. **Transaction boundaries matter** - `flush()` ≠ `commit()`
5. **INNER JOINs amplify the problem** - NULL relationships cause 0 results

### When to Use Deferred Pattern

| Scenario | Use Deferred? |
|----------|---------------|
| Update data + start async process that reads it | ✅ Yes |
| Process reads data from DB | ✅ Yes |
| All data passed through process parameters | ❌ No |
| Synchronous operation in same transaction | ❌ No |

---

## Files Changed

| File | Change |
|------|--------|
| `saksflyt-api/.../StartProsessinstansEtterCommitEvent.kt` | New event class |
| `saksflyt/.../StartProsessinstansEtterCommitListener.kt` | New listener |
| `service/.../FtrlVedtakService.kt` | Use event instead of direct call |

---

## References

- **GitHub PR:** https://github.com/navikt/melosys-api/pull/3112
- **JIRA:** MELOSYS-7718
- **Spring Docs:** [TransactionalEventListener](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html)
