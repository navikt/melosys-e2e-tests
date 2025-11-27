# Fix Plan: behandlingsresultatType Race Condition

**Date:** 2025-11-26
**Status:** Ready for implementation
**Affected Component:** melosys-api
**Priority:** High

---

## Problem Summary

When creating an ENDRINGSVEDTAK via "ny vurdering", the `BEHANDLINGSRESULTAT.RESULTAT_TYPE` in the database ends up as `IKKE_FASTSATT` instead of `MEDLEM_I_FOLKETRYGDEN`.

**This is NOT just a Kafka/logging issue** - the wrong value is actually persisted in the database, causing the `finnIkkeSkattepliktigeSaker` job to find 0 cases instead of 1.

**Failure rate on master:** 61% (8 out of 13 ENDRINGSVEDTAK in test run)

---

## Symptom

The E2E test `skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering`:

1. Creates førstegangsvedtak with `skattepliktig=true`
2. Creates ny vurdering, changes to `skattepliktig=false`
3. Runs `finnIkkeSkattepliktigeSaker` job which queries:
   ```sql
   WHERE RESULTAT_TYPE = 'MEDLEM_I_FOLKETRYGDEN'
     AND behandling.status = 'AVSLUTTET'
   ```
4. **Expected:** Job finds 1 case
5. **Actual:** Job finds 0 cases because `RESULTAT_TYPE = 'IKKE_FASTSATT'`

---

## Root Cause Analysis

### The Transaction Flow

```
1. VedtaksfattingFasade.fattVedtak() [@Transactional]
   └── FtrlVedtakService.fattVedtak()
       ├── oppdaterBehandlingsresultat() → saves MEDLEM_I_FOLKETRYGDEN ✅
       └── publishEvent(StartProsessinstansEtterCommitEvent)

2. Transaction commits → MEDLEM_I_FOLKETRYGDEN written to database ✅

3. StartProsessinstansEtterCommitListener [@TransactionalEventListener(AFTER_COMMIT)]
   └── REQUIRES_NEW transaction starts new DB connection
   └── Loads Behandlingsresultat entity → Gets IKKE_FASTSATT ❌ (race condition)
   └── Creates prosessinstans with stale entity reference

4. ProsessinstansBehandler.behandleProsessinstans() [@Async]
   └── Some step modifies Behandlingsresultat entity
   └── Saves entity back to database → OVERWRITES with IKKE_FASTSATT ❌
```

### The Critical Bug

The problem is **NOT** just reading stale data for Kafka - **something in the async prosessinstans is WRITING the stale value back to the database**, overwriting the correct value.

This could happen if:
1. A prosessinstans step loads the entity with stale cache
2. Modifies some other field on Behandlingsresultat
3. Saves the entity → Hibernate persists ALL fields including stale `type`

---

## Investigation Needed

Before implementing a fix, we need to identify **which prosessinstans step** is writing back the stale value.

### Likely Candidates

| Step | Suspicion Level | Why |
|------|----------------|-----|
| `SendMeldingOmVedtak` | Medium | Reads behandlingsresultat, but should be read-only |
| `OpprettVedtak` | High | May modify and save behandlingsresultat |
| `OppdaterBehandlingStatus` | High | Modifies behandling, may trigger cascade |
| `FullførBehandling` | High | Final step, may save entities |

### Debug Logging to Add

In each prosessinstans step that touches `Behandling` or `Behandlingsresultat`:

```kotlin
logger.info("[RACE-DEBUG] ${this::class.simpleName}: " +
    "behandlingId=${behandling.id}, " +
    "behandlingsresultat.type=${behandlingsresultat.type}, " +
    "isManaged=${entityManager.contains(behandlingsresultat)}")
```

And after any save operation:

```kotlin
logger.info("[RACE-DEBUG] ${this::class.simpleName}: SAVED behandlingsresultat, " +
    "type=${behandlingsresultat.type}")
```

---

## Recommended Fixes

### Fix Option 1: Refresh Entity Before Any Write (Targeted)

In each prosessinstans step that saves `Behandlingsresultat`:

```kotlin
// BEFORE modifying/saving
entityManager.refresh(behandlingsresultat)

// Now make changes and save - will have correct type
```

### Fix Option 2: Pass Type in Prosessinstans Data (Architectural)

Avoid the stale entity entirely by passing the type as immutable data:

```kotlin
// When creating prosessinstans in FtrlVedtakService:
prosessinstansData[BEHANDLINGSRESULTAT_TYPE_KEY] = behandlingsresultat.type.kode

// In any step that needs the type:
val type = prosessinstans.getData(BEHANDLINGSRESULTAT_TYPE_KEY)
    ?.let { BehandlingsresultatType.fraKode(it) }
    ?: entityManager.refresh(behandlingsresultat).type  // Fallback with refresh
```

### Fix Option 3: Load Fresh Entity in Listener (Root Cause)

In `StartProsessinstansEtterCommitListener`:

```kotlin
@TransactionalEventListener(phase = AFTER_COMMIT)
@Transactional(propagation = REQUIRES_NEW)
fun onEvent(event: StartProsessinstansEtterCommitEvent) {
    // Force fresh load from database, bypassing any cache
    entityManager.clear()  // Clear first-level cache

    val behandling = behandlingRepository.findById(event.behandlingId)
        .orElseThrow()

    // Now behandling and behandlingsresultat have correct values
    createProsessinstans(behandling)
}
```

**This is likely the best fix** because it ensures ALL subsequent steps see correct data.

---

## Files to Investigate

| File | Action |
|------|--------|
| `StartProsessinstansEtterCommitListener.kt` | Add `entityManager.clear()` before loading |
| `IVERKSETT_VEDTAK_FTRL` steps | Find which step saves behandlingsresultat |
| `SendMeldingOmVedtak.kt` | Verify it's read-only |
| `OpprettVedtak.kt` | Check for entity modifications |
| `FullførBehandling.kt` / similar | Check for entity saves |

---

## Testing

After implementing the fix:

1. Build new melosys-api image (e.g., `e2e-fix-race-v2`)
2. Run E2E test: `nyvurdering-endring-skattestatus.spec.ts`
3. Run flaky test 10+ times to verify stability

### Verification

```bash
# Check database state in test logs
# Should show RESULTAT_TYPE=MEDLEM_I_FOLKETRYGDEN for ny vurdering

# Check job result
# Should show antallProsessert=1
```

---

## Success Criteria

- [ ] `BEHANDLINGSRESULTAT.RESULTAT_TYPE` = `MEDLEM_I_FOLKETRYGDEN` in database after ny vurdering
- [ ] `finnIkkeSkattepliktigeSaker` job finds 1 case
- [ ] Test passes consistently (10/10 flaky runs)
- [ ] Kafka message also shows correct type (secondary)

---

## Summary

The bug is more serious than initially thought:

| What we thought | What's actually happening |
|-----------------|--------------------------|
| Kafka message has wrong type | ✅ True, but symptom |
| Database has correct type | ❌ FALSE - database gets overwritten |
| Only affects logging | ❌ FALSE - affects business logic |

**Root cause:** The async prosessinstans loads a stale entity and writes it back to the database, overwriting the correct value set by `FtrlVedtakService.oppdaterBehandlingsresultat()`.

**Best fix:** Add `entityManager.clear()` in `StartProsessinstansEtterCommitListener` before loading the behandling, ensuring all prosessinstans steps see fresh data.
