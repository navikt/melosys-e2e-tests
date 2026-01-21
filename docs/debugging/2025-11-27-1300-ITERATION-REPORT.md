# Race Condition Fix - Iteration Report

**Date/Time:** 2025-11-27 13:00
**Image Tag Tested:** e2e-fix-5
**Branch:** fix/debug-nvvurdering-endring-skattestatus
**Workflow Run ID:** 19735775803

---

## Results Summary

| Metric | e2e-fix-4 | e2e-fix-5 |
|--------|-----------|-----------|
| **100ms delay** | ❌ No | ✅ Yes |
| Total ENDRINGSVEDTAK | 13 | 14 |
| IKKE_FASTSATT | 3 (23%) | 4 (29%) |
| MEDLEM_I_FOLKETRYGDEN | 10 (77%) | 10 (71%) |
| Tests Passed | 10/10 | 10/10 (with retries) |

**Conclusion:** The 100ms delay did NOT fix the race condition. Failure rate actually increased slightly.

---

## Fix Deployment Verified

| Debug Message | Status |
|--------------|--------|
| `RACE-DEBUG added @Transactional(propagation = REQUIRES_NEW)` | ✅ Found |
| `[RACE-DEBUG] ProsessinstansBehandler: Waited 100ms for parent transaction to commit` | ✅ Found (NEW) |
| `[RACE-DEBUG] ProsessinstansBehandler: Refreshed behandlingsresultat from DB` | ✅ Found |
| `[RACE-DEBUG] OpprettFakturaserie: Using targeted updateFakturaserieReferanse` | ✅ Found |

---

## Deep Analysis: Why 100ms Delay Doesn't Work

### Transaction Flow Discovered

```
VedtaksfattingFasade.fattVedtak() ← @Transactional STARTS here
    └── FtrlVedtakService.fattVedtak() ← NO @Transactional (participates in outer)
        ├── behandlingsresultatService.lagre(MEDLEM_I_FOLKETRYGDEN)
        └── prosessinstansService.opprettProsessinstansIverksettVedtakFTRL()
            └── publishEvent(ProsessinstansOpprettetEvent)
                └── @TransactionalEventListener(AFTER_COMMIT) fires
                    └── @Async prosessinstansBehandler.behandleProsessinstans()
                        └── Runs in NEW thread with REQUIRES_NEW transaction
← Transaction COMMITS here (after fattVedtak returns)
```

### The Real Problem

Even though `@TransactionalEventListener(phase = AFTER_COMMIT)` is correctly configured:

1. `AFTER_COMMIT` fires synchronously after Spring's commit() call
2. The `@Async` method is **scheduled** but runs on a different thread
3. By the time the async thread opens a new DB connection, there's a race with Oracle's read consistency
4. The new connection may see pre-commit data due to MVCC

### Why entityManager.refresh() Doesn't Help

The current code:
```java
Thread.sleep(100);
behandlingsresultatRepository.findById(behandlingId).ifPresent(br -> {
    entityManager.refresh(br);
});
```

**Problem:** The entity loaded through prosessinstans → behandling relationship is already in the persistence context with stale data. `refresh()` on a different entity instance doesn't help.

---

## Proposed Fix: entityManager.clear()

**Replace refresh() with clear() to evict ALL entities and force fresh reads:**

```java
@Async("saksflytThreadPoolTaskExecutor")
@Transactional(propagation = REQUIRES_NEW)
public void behandleProsessinstans(@NotNull Prosessinstans prosessinstansEvent) {
    Thread.sleep(100);  // Keep delay

    entityManager.clear();  // ← ADD THIS: Evict ALL entities

    // Now load completely fresh
    Prosessinstans prosessinstans = prosessinstansRepository.findById(prosessinstansEvent.getId())
        .orElseThrow();

    // Rest of processing...
}
```

### Why This Should Work

1. `clear()` evicts ALL entities from the persistence context
2. The subsequent `findById()` MUST go to the database
3. Combined with 100ms delay, the parent transaction should have committed
4. Fresh data will be loaded

---

## Evaluated Fix: @Transactional on FattVedtakInterface

**Question:** Would adding `@Transactional` to `FattVedtakInterface.fattVedtak()` help?

**Answer: NO** - Here's why:

1. `VedtaksfattingFasade.fattVedtak()` already has `@Transactional`
2. Adding `@Transactional` to interface creates a **nested transaction**
3. Spring's default propagation (`REQUIRED`) means nested transaction **participates in outer**
4. The actual commit still happens at `VedtaksfattingFasade` level
5. No change to when commit becomes visible to other connections

---

## Next Fix to Implement

**Primary:** Add `entityManager.clear()` before loading prosessinstans

**Secondary:** Verify `OpprettFakturaserie` is using `updateFakturaserieReferanse()` correctly (targeted update, not full entity save)

---

## Files to Modify

| File | Change |
|------|--------|
| `ProsessinstansBehandler.java` | Add `entityManager.clear()` before findById() |
