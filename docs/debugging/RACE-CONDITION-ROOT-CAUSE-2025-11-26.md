# Race Condition Root Cause Analysis

**Date:** 2025-11-26
**CI Run:** playwright-results-42
**melosys-api version:** e2e-def-6
**Status:** Root cause identified

---

## Executive Summary

The `[RACE-DEBUG]` logging has revealed **two distinct bug patterns** causing the race condition where `behandligsresultatType=IKKE_FASTSATT` is published to Kafka instead of `MEDLEM_I_FOLKETRYGDEN`.

**Failure rate:** 3 out of 10 ENDRINGSVEDTAK runs (30%)

---

## Debug Log Analysis

### All ENDRINGSVEDTAK (ny vurdering) Cases

| Behandling | Time | FtrlVedtakService | Listener | SendMelding | Result |
|------------|------|-------------------|----------|-------------|--------|
| 2 | 13:24:01 | ✅ MEDLEM_I_FOLKETRYGDEN | ❌ IKKE_FASTSATT | ❌ IKKE_FASTSATT | **BUG** |
| 4 | 13:24:45 | ✅ MEDLEM_I_FOLKETRYGDEN | ✅ MEDLEM_I_FOLKETRYGDEN | ✅ MEDLEM_I_FOLKETRYGDEN | OK |
| 7 | 13:25:45 | ✅ MEDLEM_I_FOLKETRYGDEN | ✅ MEDLEM_I_FOLKETRYGDEN | ✅ MEDLEM_I_FOLKETRYGDEN | OK |
| 9 | 13:26:35 | ✅ MEDLEM_I_FOLKETRYGDEN | ✅ MEDLEM_I_FOLKETRYGDEN | ✅ MEDLEM_I_FOLKETRYGDEN | OK |
| 12 | 13:27:25 | ✅ MEDLEM_I_FOLKETRYGDEN | ✅ MEDLEM_I_FOLKETRYGDEN | ❌ IKKE_FASTSATT | **BUG** |
| 14 | 13:28:15 | ✅ MEDLEM_I_FOLKETRYGDEN | ✅ MEDLEM_I_FOLKETRYGDEN | ✅ MEDLEM_I_FOLKETRYGDEN | OK |
| 17 | 13:29:06 | ✅ MEDLEM_I_FOLKETRYGDEN | ✅ MEDLEM_I_FOLKETRYGDEN | ✅ MEDLEM_I_FOLKETRYGDEN | OK |
| 19 | 13:29:55 | ✅ MEDLEM_I_FOLKETRYGDEN | ✅ MEDLEM_I_FOLKETRYGDEN | ✅ MEDLEM_I_FOLKETRYGDEN | OK |
| 22 | 13:30:45 | ✅ MEDLEM_I_FOLKETRYGDEN | ❌ IKKE_FASTSATT | ❌ IKKE_FASTSATT | **BUG** |
| 24 | 13:31:35 | ✅ MEDLEM_I_FOLKETRYGDEN | ✅ MEDLEM_I_FOLKETRYGDEN | ✅ MEDLEM_I_FOLKETRYGDEN | OK |

**Key observation:** `FtrlVedtakService.oppdaterBehandlingsresultat()` **always** saves correctly. The bug is in subsequent reads.

---

## Two Distinct Bug Patterns

### Pattern 1: Listener Sees Stale Data (Behandling 2, 22)

The `StartProsessinstansEtterCommitListener` reads `IKKE_FASTSATT` even though the transaction should have committed.

**Log evidence (Behandling 2):**
```
13:24:01.362 | FtrlVedtakService | [RACE-DEBUG] oppdaterBehandlingsresultat: behandlingId=2, oldType=IKKE_FASTSATT, newType=MEDLEM_I_FOLKETRYGDEN
13:24:01.363 | FtrlVedtakService | [RACE-DEBUG] lagret behandlingsresultat, type etter lagre=MEDLEM_I_FOLKETRYGDEN
13:24:01.414 | StartProsessinstansEtterCommitListener | [RACE-DEBUG] behandlingId=2, behandlingsresultat.type=IKKE_FASTSATT ← BUG!
13:24:01.813 | SendMeldingOmVedtak | [RACE-DEBUG] behandlingId=2, behandlingsresultat.type=IKKE_FASTSATT
```

**Diagnosis:** The `@TransactionalEventListener(AFTER_COMMIT)` with `REQUIRES_NEW` transaction is reading before the original transaction's changes are visible to other transactions.

**Time gap:** Only 51ms between save and listener read - transaction isolation issue.

### Pattern 2: Listener OK but SendMelding Sees Stale (Behandling 12)

The listener sees the correct value, but the async `SendMeldingOmVedtak` step sees stale data.

**Log evidence (Behandling 12):**
```
13:27:25.833 | FtrlVedtakService | [RACE-DEBUG] lagret behandlingsresultat, type etter lagre=MEDLEM_I_FOLKETRYGDEN
13:27:25.864 | StartProsessinstansEtterCommitListener | [RACE-DEBUG] behandlingId=12, behandlingsresultat.type=MEDLEM_I_FOLKETRYGDEN ← OK!
13:27:26.008 | SendMeldingOmVedtak | [RACE-DEBUG] behandlingId=12, behandlingsresultat.type=IKKE_FASTSATT ← BUG!
```

**Diagnosis:** JPA/Hibernate entity caching. The `SendMeldingOmVedtak` step is reading from a cached entity that was loaded before the update, not from the database.

**Time gap:** 144ms between listener and SendMelding - long enough for the async step to start with stale cache.

---

## Root Cause

### The Transaction Flow

```
1. VedtaksfattingFasade.fattVedtak() [@Transactional]
   └── FtrlVedtakService.fattVedtak()
       ├── oppdaterBehandlingsresultat() → saves MEDLEM_I_FOLKETRYGDEN
       ├── entityManager.flush() (implicit before event)
       └── publishEvent(StartProsessinstansEtterCommitEvent)

2. Transaction commits → changes should be visible

3. StartProsessinstansEtterCommitListener [@TransactionalEventListener(AFTER_COMMIT), REQUIRES_NEW]
   └── Reads behandlingsresultat.type → Sometimes sees IKKE_FASTSATT (Pattern 1)

4. ProsessinstansBehandler.behandleProsessinstans() [@Async]
   └── SendMeldingOmVedtak
       └── Reads behandlingsresultat.type → Sometimes sees IKKE_FASTSATT (Pattern 2)
```

### Why Pattern 1 Occurs

The `REQUIRES_NEW` transaction in the listener starts a **new database connection**. Due to Oracle's read consistency model, this new connection might not immediately see committed changes from the previous transaction, especially under load.

### Why Pattern 2 Occurs

The async `@Async` method inherits or creates a new persistence context. If the `Behandlingsresultat` entity was loaded earlier (before the update) and is still in the first-level cache, `SendMeldingOmVedtak` reads the cached stale value instead of querying the database.

---

## Recommended Fixes

### Fix for Pattern 1: Ensure Data Visibility Before Event

In `FtrlVedtakService.oppdaterBehandlingsresultat()`:

```kotlin
behandlingsresultatRepository.saveAndFlush(behandlingsresultat)
// Ensure the transaction is fully committed before the event fires
```

Or add a small delay/retry in the listener if the type is still `IKKE_FASTSATT`.

### Fix for Pattern 2: Force Fresh Read in SendMeldingOmVedtak

In `SendMeldingOmVedtak`:

```kotlin
// Clear any cached entity and force database read
entityManager.clear() // or entityManager.refresh(behandlingsresultat)
val behandlingsresultat = behandlingsresultatRepository.findById(behandlingId).get()
```

### Alternative: Pass Type in Prosessinstans Data

Avoid reading from database entirely by passing the type when creating the prosessinstans:

```kotlin
// In FtrlVedtakService when publishing event
prosessinstansData[BEHANDLINGSRESULTAT_TYPE] = BehandlingsresultatType.MEDLEM_I_FOLKETRYGDEN.kode

// In SendMeldingOmVedtak
val type = prosessinstans.getData(BEHANDLINGSRESULTAT_TYPE)
    ?: behandlingsresultat.type // fallback
```

---

## Files Involved

| File | Role |
|------|------|
| `FtrlVedtakService.kt` | Updates and saves `behandlingsresultat.type` |
| `StartProsessinstansEtterCommitListener.kt` | Creates prosessinstans after commit (Pattern 1) |
| `SendMeldingOmVedtak.kt` | Reads type for Kafka message (Pattern 2) |
| `KafkaMelosysHendelseProducer.kt` | Publishes to Kafka |

---

## Test Results

Despite the race condition occurring in 30% of runs, the tests passed because:
- Flaky test runner retries until success
- The successful runs (70%) were enough to pass

**CI Run Summary:**
- Both tests passed on first attempt in main run
- Flaky test runs: 5/5 passed (with retries)
- melosys-api: `e2e-def-6`

---

## Next Steps

1. **Implement fix** for Pattern 2 first (most common, easier to fix with `entityManager.refresh()`)
2. **Consider fix** for Pattern 1 (add retry logic or pass data via prosessinstans)
3. **Deploy** updated melosys-api as `e2e-def-7`
4. **Run tests** to verify fix

---

## Related Documentation

- `docs/debugging/MELOSYS-API-RACE-CONDITION-REPORT.md` - Initial bug report
- `docs/debugging/DEFERRED-PATTERN-BUG-REPORT.md` - Earlier investigation
- `melosys-api/docs/RACE-CONDITION-INVESTIGATION-2025-11-26.md` - Debug logging added
