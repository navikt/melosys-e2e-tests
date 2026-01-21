# Iteration Report: e2e-fix-7 (Targeted SQL UPDATE)

**Date:** 2025-11-28 09:00
**Image Tag:** e2e-fix-7
**Branch:** fix/debug-nvvurdering-endring-skattestatus

---

## Summary

The **Targeted SQL UPDATE** fix in `OpprettFakturaserie.kt` **DID NOT resolve** the race condition.

| Metric | Value |
|--------|-------|
| ENDRINGSVEDTAK Success Rate | **50%** |
| IKKE_FASTSATT Count | 17/34 |
| Comparison to e2e-fix-6 | No improvement (was 56%) |

---

## The Fix That Was Tested

Changed `OpprettFakturaserie.kt` from loading/modifying/saving the entire entity:

```kotlin
// BEFORE (races):
behandlingsresultat.fakturaserieReferanse = ref
behandlingsresultatService.lagre(behandlingsresultat)
```

To a targeted SQL UPDATE that only touches one field:

```kotlin
// AFTER (should not race):
behandlingsresultatRepository.updateFakturaserieReferanse(
    behandlingsresultat.hentId(),
    fakturaserieResponse.fakturaserieReferanse
)
```

**Theory:** The async thread loads a stale `Behandlingsresultat` entity (with `type=IKKE_FASTSATT`) and when it saves, it overwrites the correct `type=MEDLEM_I_FOLKETRYGDEN` value.

**Expected:** By not loading the entity at all, we can't get stale data, and we can't overwrite the `type` field.

**Actual:** The race condition still occurs at the same rate.

---

## Test Results

### Run 1: 19756463214 (Nov 28, 06:56 UTC)

| Metric | Value |
|--------|-------|
| Test Passes | 8/10 |
| Test Failures | 2/10 |
| ENDRINGSVEDTAK Total | 17 |
| MEDLEM_I_FOLKETRYGDEN | 8 |
| IKKE_FASTSATT | 9 (53%) |

### Run 2: 19738096028 (Nov 27, 13:36 UTC)

| Metric | Value |
|--------|-------|
| Test Passes | 9/10 |
| Test Failures | 1/10 |
| ENDRINGSVEDTAK Total | 17 |
| MEDLEM_I_FOLKETRYGDEN | 9 |
| IKKE_FASTSATT | 8 (47%) |

### Combined

| Metric | Combined |
|--------|----------|
| Total ENDRINGSVEDTAK | 34 |
| MEDLEM_I_FOLKETRYGDEN | 17 |
| IKKE_FASTSATT | 17 |
| **Success Rate** | **50%** |

---

## Comparison to Previous Fixes

| Iteration | Fix | IKKE_FASTSATT Rate | Trend |
|-----------|-----|-------------------|-------|
| e2e-fix-4 | @Transactional + refresh | 23% | Baseline |
| e2e-fix-5 | + 100ms delay | 29% | ↑ Worse |
| e2e-fix-6 | + entityManager.clear() | 56% | ↑↑ Much Worse |
| **e2e-fix-7** | **Targeted UPDATE** | **50%** | No improvement |

---

## Key Insight

**The race condition is NOT in OpprettFakturaserie.**

The targeted UPDATE fix eliminates the possibility of OpprettFakturaserie overwriting the `type` field, yet the race condition persists at 50%. This proves:

1. **OpprettFakturaserie is not the culprit** - we fixed the wrong location
2. **Another component overwrites behandlingsresultat.type** somewhere else in the prosessinstans chain
3. **OR** the type is never being set to `MEDLEM_I_FOLKETRYGDEN` in the first place before the scheduled job runs

---

## Failure Pattern Analysis

The failures cluster together in runs:
- Run 1: Failures at behandlingIds 10, 12, 14, 16, 24, 26, 28, 36, 38
- Pattern: Runs 4-7 (consecutive), then 9-12 (consecutive)

This clustering suggests:
- Once the race condition triggers, it cascades
- The issue may be related to batch processing or shared state
- OR the scheduled job `finnIkkeSkattepliktigeSaker` sees stale database state

---

## Recommended Next Steps

### 1. Deep Investigation: Find All Entity Saves

Search for ALL places that save `Behandlingsresultat`:
```bash
grep -r "behandlingsresultatRepository.save\|behandlingsresultatService.lagre" --include="*.kt" --include="*.java"
```

### 2. Add Comprehensive Logging

In `BehandlingsresultatService.lagre()`:
```kotlin
fun lagre(behandlingsresultat: Behandlingsresultat) {
    log.info("[ENTITY-SAVE] Saving Behandlingsresultat id=${behandlingsresultat.id}, " +
             "type=${behandlingsresultat.type}, " +
             "stacktrace=${Thread.currentThread().stackTrace.take(10).joinToString("\n")}")
    repository.save(behandlingsresultat)
}
```

### 3. Trace the IVERKSETT_VEDTAK_FTRL Chain

Identify every step in the prosessinstans:
- What is the sequence?
- Which steps touch Behandlingsresultat?
- Are there multiple saves?

### 4. Alternative Theory: Type Never Set

Maybe the issue isn't an overwrite - maybe `type` is never set to `MEDLEM_I_FOLKETRYGDEN` in some code paths. Add logging to where `type` is supposed to be set.

---

## Files to Investigate

Based on the prosessinstans type `IVERKSETT_VEDTAK_FTRL`, likely files in the chain:

1. `saksflyt/src/.../IverksettVedtakFtrl.kt` - Main orchestrator
2. `saksflyt/src/.../OpprettFakturaserie.kt` - Already fixed (not the issue)
3. `saksflyt/src/.../SendMeldingOmVedtak.kt` - Sends Kafka message
4. `saksflyt/src/.../OppdaterBehandlingsresultat.kt` - Might save entity?
5. `service/src/.../BehandlingsresultatService.kt` - Central save point

---

## Conclusion

The targeted SQL UPDATE approach was a good hypothesis but proved incorrect. The race condition source is NOT in `OpprettFakturaserie.kt`.

**Next phase:** Add comprehensive logging to find the actual source of the overwrite before attempting another fix.
