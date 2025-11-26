# Deferred Pattern Bug Investigation - Nyvurdering Skattestatus

**Date:** 2025-11-26
**Test:** `skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering`
**File:** `tests/utenfor-avtaleland/workflows/nyvurdering-endring-skattestatus.spec.ts`
**Branch:** `fix/adapt-tests-for-deferred-pattern`

---

## Problem Summary

The test passes **100% locally** but fails **consistently in CI** (3/3 retries failed).

The årsavregning job finds **0 cases** instead of **1** after a nyvurdering that changes from `skattepliktig=true` to `skattepliktig=false`.

---

## Root Cause Analysis

### Evidence from CI Logs (playwright-results-40)

**Kafka messages show different `behandligsresultatType` values:**

| Test | Behandling | Direction | Kafka Type | Result |
|------|------------|-----------|------------|--------|
| Test 1 (pass) | 13 | ikke-skattepliktig → skattepliktig | `MEDLEM_I_FOLKETRYGDEN` | ✅ |
| Test 2 (fail) | 15 | skattepliktig → ikke-skattepliktig | `IKKE_FASTSATT` | ❌ |

**CI Log Timestamps (failure case):**
```
10:48:11.373 | StartProsessinstansEtterCommitListener | Oppretter prosessinstans IVERKSETT_VEDTAK_FTRL
10:48:11.537 | KafkaMelosysHendelseProducer | behandligsresultatType=IKKE_FASTSATT  ← WRONG!
10:48:13.841 | Job starts, finds 0 cases
```

### Local Debug Output (passes)

```
BEFORE vedtak: type=IKKE_FASTSATT, status=UNDER_BEHANDLING
AFTER vedtak:  type=MEDLEM_I_FOLKETRYGDEN, status=AVSLUTTET  ← CORRECT!

Job found: 1, processed: 1  ← CORRECT!
```

---

## Key Findings

### 1. Deferred Pattern IS Being Used
The logs show `StartProsessinstansEtterCommitListener` is called, confirming the deferred pattern is active.

### 2. Database Column Names
- **BEHANDLINGSRESULTAT.RESULTAT_TYPE** (not TYPE)
- **VEDTAK_METADATA** uses `BEHANDLINGSRESULTAT_ID` as FK (no SKATTEPLIKTIG column)
- **MEDLEMSKAPSPERIODE** uses `BEHANDLINGSRESULTAT_ID` as FK

### 3. Local vs CI Behavior
| Environment | RESULTAT_TYPE after vedtak | Job Result |
|-------------|---------------------------|------------|
| Local | `MEDLEM_I_FOLKETRYGDEN` | 1 case |
| CI | `IKKE_FASTSATT` (per Kafka) | 0 cases |

---

## Hypotheses

### Hypothesis 1: oppdaterBehandlingsresultat() not called in CI
The `oppdaterBehandlingsresultat()` method might not be called for nyvurdering in CI due to:
- Different code path
- Different melosys-api version/image

### Hypothesis 2: Database commit timing
The Kafka producer might be reading from a stale database connection before the commit is fully visible.

### Hypothesis 3: Different melosys-api version
CI uses `melosys-api:e2e-def-5` while local might use a different version.

---

## Debug Logging Added

The test now has comprehensive debug logging at these points:

1. **BEFORE changing skattepliktig** - Check initial RESULTAT_TYPE
2. **API response** - Capture trygdeavgift PUT response
3. **AFTER changing skattepliktig** - Check if RESULTAT_TYPE changed
4. **BEFORE vedtak** - Check RESULTAT_TYPE before submission
5. **IMMEDIATELY after vedtak** - Check RESULTAT_TYPE right after API returns
6. **AFTER process completion** - Final RESULTAT_TYPE and full DB state

---

## Next Steps

1. **Push to CI** and examine the debug output
2. **Compare timestamps** in CI logs with debug output
3. **Check if RESULTAT_TYPE changes** at any point in CI
4. **If RESULTAT_TYPE never changes in CI**, investigate `oppdaterBehandlingsresultat()` in melosys-api

---

## Files Changed

- `tests/utenfor-avtaleland/workflows/nyvurdering-endring-skattestatus.spec.ts` - Added debug logging
- `tests/rengjor-database.spec.ts` - Added test to discover column names

---

## Related Documentation

- `/Users/rune/source/nav/melosys-api-claude/docs/DEFERRED-PROSESSINSTANS-PATTERN.md`
- `/Users/rune/source/nav/melosys-e2e-tests/docs/debugging/RACE-CONDITION-REPORT.md`

---

## Command to Run Locally

```bash
npx playwright test "skattepliktig til ikke-skattepliktig" --project=chromium --reporter=list
```

## Command to Check Database State

```bash
npx playwright test "skal lese behandlingsresultat" --project=chromium --reporter=list
```
