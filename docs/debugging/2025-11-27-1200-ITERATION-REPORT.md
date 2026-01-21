# Race Condition Fix - Iteration Report

**Date/Time:** 2025-11-27 12:00
**Image Tag Tested:** e2e-be-fix-4
**Branch:** debug-nvvurdering-endring-skattestatus
**Workflow Run ID:** 19734464469

---

## Results Summary

| Metric | Value |
|--------|-------|
| Total ENDRINGSVEDTAK Runs | 13 |
| Correct (MEDLEM_I_FOLKETRYGDEN) | 10 |
| Race Condition (IKKE_FASTSATT) | 3 |
| **Failure Rate** | **23%** (3/13) |

**Tests passed due to retry mechanism, but race condition still occurs.**

---

## Fix Deployment Verified

| Debug Message | Status |
|--------------|--------|
| `RACE-DEBUG added @Transactional(propagation = REQUIRES_NEW)` | ✅ Found |
| `[RACE-DEBUG] ProsessinstansBehandler: Refreshed behandlingsresultat from DB` | ✅ Found |
| `[RACE-DEBUG] OpprettFakturaserie: Using targeted updateFakturaserieReferanse` | ✅ Found |
| `[RACE-DEBUG] BehandlingsresultatService.updateFakturaserieReferanse` | ✅ Found |

---

## Run Details

| Run | behandlingId | behandlingsresultatType | After Refresh | antallProsessert | Status |
|-----|--------------|------------------------|---------------|------------------|--------|
| 1 | 2 | MEDLEM_I_FOLKETRYGDEN | MEDLEM_I_FOLKETRYGDEN | 1 | ✅ OK |
| 2 | 5 | MEDLEM_I_FOLKETRYGDEN | MEDLEM_I_FOLKETRYGDEN | 1 | ✅ OK |
| 3 | 8 | MEDLEM_I_FOLKETRYGDEN | MEDLEM_I_FOLKETRYGDEN | 1 | ✅ OK |
| 4 | 11 | MEDLEM_I_FOLKETRYGDEN | MEDLEM_I_FOLKETRYGDEN | 1 | ✅ OK |
| 5 | 14 | MEDLEM_I_FOLKETRYGDEN | MEDLEM_I_FOLKETRYGDEN | 1 | ✅ OK |
| **6** | **17** | **IKKE_FASTSATT** | **IKKE_FASTSATT** | **0** | ❌ RACE |
| 7 | 19 | MEDLEM_I_FOLKETRYGDEN | MEDLEM_I_FOLKETRYGDEN | 1 | ✅ OK |
| 8 | 22 | MEDLEM_I_FOLKETRYGDEN | MEDLEM_I_FOLKETRYGDEN | 1 | ✅ OK |
| **9** | **25** | **IKKE_FASTSATT** | **IKKE_FASTSATT** | **0** | ❌ RACE |
| 10 | 27 | MEDLEM_I_FOLKETRYGDEN | MEDLEM_I_FOLKETRYGDEN | 1 | ✅ OK |
| **11** | **30** | **IKKE_FASTSATT** | **IKKE_FASTSATT** | **0** | ❌ RACE |
| 12 | 32 | MEDLEM_I_FOLKETRYGDEN | MEDLEM_I_FOLKETRYGDEN | 1 | ✅ OK |
| 13 | 35 | MEDLEM_I_FOLKETRYGDEN | MEDLEM_I_FOLKETRYGDEN | 1 | ✅ OK |

---

## Failed Run Analysis - BehandlingId=17

**Timeline:**
```
11:27:03.321 | FtrlVedtakService saves MEDLEM_I_FOLKETRYGDEN
11:27:03.321 | BehandlingsresultatService.lagre: type=MEDLEM_I_FOLKETRYGDEN
11:27:03.321 | FtrlVedtakService: lagret type=MEDLEM_I_FOLKETRYGDEN, ETTER lagring
11:27:03.344 | ProsessinstansOpprettetListener fires (23ms later)
11:27:03.344 | @Transactional(REQUIRES_NEW) starts
11:27:03.348 | Reloaded prosessinstans fra DB
11:27:03.364 | entityManager.refresh() → type=IKKE_FASTSATT  ← STILL STALE (43ms after save)
11:27:03.399 | OpprettFakturaserie sees IKKE_FASTSATT
11:27:03.435 | Using targeted updateFakturaserieReferanse (doesn't overwrite type)
11:27:03.466 | Kafka message: behandlingsresultatType=IKKE_FASTSATT
```

**Key Finding:** `entityManager.refresh()` at 11:27:03.364 reads `IKKE_FASTSATT` even though `FtrlVedtakService` saved `MEDLEM_I_FOLKETRYGDEN` at 11:27:03.321 (43ms earlier).

---

## Why Current Fix Doesn't Work

1. **`@Transactional(REQUIRES_NEW)`** - Creates new transaction but can only see committed data
2. **`entityManager.refresh()`** - Reads from DB but parent transaction hasn't committed yet
3. **Targeted update** - Prevents overwrite but entity is already loaded with wrong value

**The problem:** The parent transaction (from `FtrlVedtakService`) hasn't committed when the async listener starts processing.

---

## Conclusions

| What Works | What Doesn't |
|------------|--------------|
| ✅ Targeted update prevents OpprettFakturaserie from overwriting type | ❌ entityManager.refresh() reads stale data |
| ✅ Debug logging shows the flow clearly | ❌ REQUIRES_NEW doesn't wait for parent commit |
| ✅ Tests pass due to retry | ❌ Race condition still occurs in ~23% of runs |

---

## Next Fix to Try

### Option A: Ensure Flush Before Event Publishing

In `FtrlVedtakService`, add explicit flush before publishing event:

```kotlin
// After saving behandlingsresultat
behandlingsresultatRepository.saveAndFlush(behandlingsresultat)
// OR
entityManager.flush()
```

### Option B: Add Delay in ProsessinstansBehandler

Wait for parent transaction to commit:

```java
// At start of behandleProsessinstans()
Thread.sleep(100);  // Wait 100ms for commit to propagate
```

### Option C: Retry Logic with Delay

If type is IKKE_FASTSATT for ENDRINGSVEDTAK, retry the read:

```java
Behandlingsresultat br = behandlingsresultatRepository.findById(behandlingId).get();
if (br.getType() == IKKE_FASTSATT && isEndringsvedtak) {
    Thread.sleep(100);
    entityManager.refresh(br);
    log.info("[RACE-DEBUG] Retried refresh, type={}", br.getType());
}
```

### Option D: Verify @TransactionalEventListener Phase

Ensure the listener is configured with `phase = AFTER_COMMIT`:

```java
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void onProsessinstansOpprettet(ProsessinstansOpprettetEvent event) {
    // This should only fire after parent transaction commits
}
```

---

## Recommended Next Step

**Try Option D first** - Verify that `ProsessinstansOpprettetListener` uses `AFTER_COMMIT` phase. If it does, the issue might be that `AFTER_COMMIT` fires after Spring's commit() call but before Oracle's commit is visible to other connections.

**If D doesn't work, try Option B** - A simple 100ms delay is the most reliable fix for database visibility timing issues.

---

## Files to Investigate/Modify

| File | Action |
|------|--------|
| `ProsessinstansOpprettetListener.java` | Check/add `phase = AFTER_COMMIT` |
| `ProsessinstansBehandler.java` | Add delay or retry logic |
| `FtrlVedtakService.kt` | Consider using `saveAndFlush()` |
