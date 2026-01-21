# Race Condition Analysis Report

**Date:** 2025-11-26
**CI Run:** [19716258276](https://github.com/navikt/melosys-e2e-tests/actions/runs/19716258276)
**Branch:** fix/debug-nvvurdering-endring-skattestatus
**Status:** Flaky (1 failure, passed on retry)
**melosys-api image:** `e2e-be-fix-1`

---

## Executive Summary

The flaky test stability check ran 5 times. Run 5 failed with `antallProsessert=0` due to the race condition where `behandlingsresultatType` was `IKKE_FASTSATT` instead of `MEDLEM_I_FOLKETRYGDEN`. The test passed on retry.

**Key Finding:** The root cause is confirmed to be `OpprettFakturaserie` overwriting the correct value with a stale cached value.

---

## Test Results Overview

| Run | ENDRINGSVEDTAK Type | antallProsessert | Result |
|-----|---------------------|------------------|--------|
| 1 | MEDLEM_I_FOLKETRYGDEN | 1 | ✅ Pass |
| 2 | MEDLEM_I_FOLKETRYGDEN | 1 | ✅ Pass |
| 3 | MEDLEM_I_FOLKETRYGDEN | 1 | ✅ Pass |
| 4 | MEDLEM_I_FOLKETRYGDEN | 1 | ✅ Pass |
| 5 | **IKKE_FASTSATT** | **0** | ❌ Fail |
| 5 (retry) | MEDLEM_I_FOLKETRYGDEN | 1 | ✅ Pass |

**Success Rate:** 5/6 attempts (83%), or 5/5 flaky runs with retry

---

## Detailed Timeline of Failed Run (behandlingId=14)

### The Race Condition in Action

```
20:22:20.456 - FtrlVedtakService saves MEDLEM_I_FOLKETRYGDEN ✅
         ↓
    [24ms gap - transaction commits, async listener triggered]
         ↓
20:22:20.480 - ProsessinstansOpprettetListener: IVERKSETT_VEDTAK_FTRL starts
20:22:20.483 - ProsessinstansBehandler: "Reloaded prosessinstans fra DB"
         ↓
    [Entity cache still has stale data from before commit!]
         ↓
20:22:20.497 - LagreMedlemsperiodeMedl sees IKKE_FASTSATT ❌
20:22:20.536 - OpprettFakturaserie sees IKKE_FASTSATT ❌
20:22:20.577 - OpprettFakturaserie SAVES behandlingsresultat → OVERWRITES with IKKE_FASTSATT ❌
20:22:20.597 - AvsluttFagsakOgBehandling sees IKKE_FASTSATT ❌
20:22:20.620 - SendMeldingOmVedtak sees IKKE_FASTSATT ❌
20:22:20.629 - Kafka message sent with IKKE_FASTSATT ❌
         ↓
20:22:22.319 - Job finds 0 cases (correct value overwritten in DB)
```

### Raw Log Evidence

**1. Correct value saved by FtrlVedtakService:**
```
20:22:20.456 | FtrlVedtakService | [RACE-DEBUG] oppdaterBehandlingsresultat:
    behandlingId=14, utledtType=MEDLEM_I_FOLKETRYGDEN, før lagring
20:22:20.456 | BehandlingsresultatService | [RACE-DEBUG] lagre:
    behandlingId=14, type=MEDLEM_I_FOLKETRYGDEN
20:22:20.456 | FtrlVedtakService | [RACE-DEBUG] oppdaterBehandlingsresultat:
    behandlingId=14, lagret type=MEDLEM_I_FOLKETRYGDEN, etter lagring
```

**2. Async listener starts with stale cache:**
```
20:22:20.480 | ProsessinstansOpprettetListener | [RACE-DEBUG]
    prosessinstansId=3afb8218-..., type=IVERKSETT_VEDTAK_FTRL, behandlingId=14
20:22:20.483 | ProsessinstansBehandler | [RACE-DEBUG]
    Reloaded prosessinstans fra DB, behandlingId=14
```

**3. All steps see stale value:**
```
20:22:20.497 | LagreMedlemsperiodeMedl | [RACE-DEBUG] utfør:
    behandlingId=14, behandlingsresultat.type=IKKE_FASTSATT  ← STALE!
20:22:20.536 | OpprettFakturaserie | [RACE-DEBUG] utfør:
    behandlingId=14, behandlingsresultat.type=IKKE_FASTSATT  ← STALE!
```

**4. OpprettFakturaserie overwrites correct value:**
```
20:22:20.577 | BehandlingsresultatService | [RACE-DEBUG] lagre:
    behandlingId=14, type=IKKE_FASTSATT  ← OVERWRITES DATABASE!
```

**5. Kafka message and job result:**
```
20:22:20.629 | KafkaMelosysHendelseProducer | VedtakHendelseMelding(
    behandligsresultatType=IKKE_FASTSATT,
    vedtakstype=ENDRINGSVEDTAK, ...)

20:22:22.319 | "antallProsessert" : 0  ← JOB FINDS NOTHING
```

---

## Root Cause Analysis

### Why This Happens

1. **Transaction Boundary Issue:**
   - `FtrlVedtakService.fattVedtak()` runs in a `@Transactional` context
   - It saves `MEDLEM_I_FOLKETRYGDEN` and publishes `StartProsessinstansEtterCommitEvent`
   - Transaction commits → value is in database ✅

2. **Async Listener Cache Problem:**
   - `@TransactionalEventListener(AFTER_COMMIT)` triggers with `@Transactional(REQUIRES_NEW)`
   - New transaction starts, but Hibernate's first-level cache may have stale entities
   - `behandlingsresultat` is loaded via lazy association and gets cached stale value

3. **OpprettFakturaserie Overwrites:**
   - This step modifies `behandlingsresultat` (likely sets `fakturaserieReferanse`)
   - When Hibernate saves the entity, ALL fields are persisted
   - The stale `type=IKKE_FASTSATT` overwrites the correct `MEDLEM_I_FOLKETRYGDEN`

### Why "Reloaded prosessinstans fra DB" Doesn't Help

The log shows prosessinstans was reloaded, but:
- `behandlingsresultat` is accessed via `behandling.behandlingsresultat`
- This lazy-loaded entity uses cached data from the first-level cache
- The cache was populated before the commit with `IKKE_FASTSATT`

---

## Comparison: Successful vs Failed Runs

### Successful Run (behandlingId=2, 20:18:44)

```
20:18:44.886 | FtrlVedtakService saves MEDLEM_I_FOLKETRYGDEN
20:18:44.934 | ProsessinstansBehandler reloads
20:18:44.957 | LagreMedlemsperiodeMedl sees MEDLEM_I_FOLKETRYGDEN ✅
20:18:45.044 | OpprettFakturaserie sees MEDLEM_I_FOLKETRYGDEN ✅
20:18:45.161 | BehandlingsresultatService saves MEDLEM_I_FOLKETRYGDEN ✅
20:18:45.253 | Kafka: MEDLEM_I_FOLKETRYGDEN ✅
```

### Failed Run (behandlingId=14, 20:22:20)

```
20:22:20.456 | FtrlVedtakService saves MEDLEM_I_FOLKETRYGDEN
20:22:20.483 | ProsessinstansBehandler reloads
20:22:20.497 | LagreMedlemsperiodeMedl sees IKKE_FASTSATT ❌
20:22:20.536 | OpprettFakturaserie sees IKKE_FASTSATT ❌
20:22:20.577 | BehandlingsresultatService saves IKKE_FASTSATT ❌ (OVERWRITE!)
20:22:20.629 | Kafka: IKKE_FASTSATT ❌
```

**The difference is timing/cache state** - in successful runs, the cache happens to have correct data; in failed runs, it has stale data.

---

## Recommended Fix

### Option 1: Clear Entity Cache (Recommended)

In `ProsessinstansBehandler.behandleProsessinstans()`:

```kotlin
@Transactional(propagation = REQUIRES_NEW)
fun behandleProsessinstans(prosessinstansId: UUID) {
    // Clear first-level cache to ensure fresh data
    entityManager.clear()

    val prosessinstans = prosessinstansRepository.findById(prosessinstansId)
    // Now all entities will be freshly loaded from DB
    ...
}
```

### Option 2: Refresh behandlingsresultat in OpprettFakturaserie

```kotlin
fun utfør(prosessinstans: Prosessinstans) {
    val behandling = prosessinstans.behandling

    // Refresh to get latest from DB before any modifications
    entityManager.refresh(behandling.behandlingsresultat)

    // Now proceed with logic
    ...
}
```

### Option 3: Pass type as immutable data

```kotlin
// When creating prosessinstans in FtrlVedtakService:
prosessinstansData[BEHANDLINGSRESULTAT_TYPE_KEY] = behandlingsresultat.type.kode

// In steps that need the type:
val type = prosessinstans.getData(BEHANDLINGSRESULTAT_TYPE_KEY)
```

---

## Verification Criteria

After implementing fix:

- [ ] `BEHANDLINGSRESULTAT.RESULTAT_TYPE` = `MEDLEM_I_FOLKETRYGDEN` in DB after ny vurdering
- [ ] All prosessinstans steps see `MEDLEM_I_FOLKETRYGDEN`
- [ ] No `BehandlingsresultatService.lagre` with `IKKE_FASTSATT` after `FtrlVedtakService` saves correct value
- [ ] Kafka message shows `MEDLEM_I_FOLKETRYGDEN`
- [ ] `finnIkkeSkattepliktigeSaker` job finds 1 case
- [ ] Test passes 10/10 flaky runs

---

## Artifacts

- **CI Run:** https://github.com/navikt/melosys-e2e-tests/actions/runs/19716258276
- **Logs:** `/tmp/gh-artifacts/playwright-results/playwright-report/melosys-api-complete.log`
- **Test:** `tests/utenfor-avtaleland/workflows/nyvurdering-endring-skattestatus.spec.ts`

---

## Related Documents

- [Investigation Report](./INVESTIGATION-BEHANDLINGSRESULTAT-TYPE-ISSUE.md) - Original discovery
- [Fix Plan](./2025-11-26-FIX-PLAN-BEHANDLINGSRESULTAT-RACE-CONDITION.md) - Implementation strategy
