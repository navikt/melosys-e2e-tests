# SaksopplysningKilde Race Condition - Flaky Test Report

**Date:** 2026-02-23
**Analysis Period:** Feb 16-23, 2026 (34 main branch runs)
**Workflow:** [e2e-tests.yml](https://github.com/navikt/melosys-e2e-tests/actions/workflows/e2e-tests.yml)
**Related:** [Root Cause Analysis (2026-01-21)](saksopplysningkilde-race-condition-2026-01-21.md)

## Executive Summary

The SaksopplysningKilde race condition causes **76.5% of CI runs** to have at least one flaky or failed test. Only 3 tests are affected, and they all share the same root cause: the `HENT_REGISTEROPPLYSNINGER` saga step fails with `OptimisticLockingFailureException`, preventing arbeidsforhold data from loading.

**Key numbers:**
- 26 of 34 runs (76.5%) had at least one flaky/failed "arbeid i flere land" test
- 8 of 34 runs (23.5%) were fully clean
- 3 of 34 runs (8.8%) had hard failures (test failed all 3 retry attempts)

## Affected Tests

| # | Test File | Test Name | Flaky Runs | Hard Fail Runs | Total Affected | Rate |
|---|-----------|-----------|------------|----------------|----------------|------|
| 1 | `eu-eos-arbeid-flere-land.spec.ts` | skal fullføre arbeid i flere land-arbeidsflyt | 13 | 3 | **16/34** | **47.1%** |
| 2 | `eu-eos-13.1-arbeid-flere-land-selvstendig-fullfort-vedtak.spec.ts` | skal fullføre "Arbeid i flere land" med selvstendig... | 7 | 1 | **8/34** | **23.5%** |
| 3 | `eu-eos-13.1-arbeid-flere-land-fullfort-vedtak.spec.ts` | skal fullføre "Arbeid i flere land" arbeidsflyt med vedtak | 6 | 0 | **6/34** | **17.6%** |

**No other tests are affected.** All other ~54 tests pass consistently.

## Failure Symptom

All failures manifest as the same timeout:

```
TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('checkbox', { name: 'Ståles Stål AS' }) to be visible
```

The checkbox doesn't appear because the `HENT_REGISTEROPPLYSNINGER` saga step failed, so arbeidsforhold data was never loaded into the UI.

**Confirmed docker error** (from run [22278328958](https://github.com/navikt/melosys-e2e-tests/actions/runs/22278328958)):
```
ERROR | API kall feilet: Row was updated or deleted by another transaction
  (or unsaved-value mapping was incorrect) : [no.nav.melosys.domain.SaksopplysningKilde#126]
```

## Run-by-Run Detail

| Date | Run ID | Status | arbeid-flere-land | selvstendig | fullfort-vedtak |
|------|--------|--------|-------------------|-------------|-----------------|
| Feb 23 | [22305079200](https://github.com/navikt/melosys-e2e-tests/actions/runs/22305079200) | ✅ | 🔄 flaky (2/3 failed) | 🔄 flaky (1/2 failed) | ✅ |
| Feb 23 | [22304954696](https://github.com/navikt/melosys-e2e-tests/actions/runs/22304954696) | ✅ | ✅ | ✅ | ✅ |
| Feb 22 | [22278426868](https://github.com/navikt/melosys-e2e-tests/actions/runs/22278426868) | ✅ | ✅ | ✅ | 🔄 flaky |
| Feb 22 | [22278328958](https://github.com/navikt/melosys-e2e-tests/actions/runs/22278328958) | ✅ | 🔄 flaky (2/3) + ⚠️ docker error | ✅ | ✅ |
| Feb 22 | [22278283045](https://github.com/navikt/melosys-e2e-tests/actions/runs/22278283045) | ✅ | ✅ | ✅ | ✅ |
| Feb 22 | [22278109840](https://github.com/navikt/melosys-e2e-tests/actions/runs/22278109840) | ✅ | 🔄 flaky | ✅ | ✅ |
| Feb 22 | [22276650021](https://github.com/navikt/melosys-e2e-tests/actions/runs/22276650021) | ✅ | ✅ | ✅ | ✅ |
| Feb 22 | [22273597712](https://github.com/navikt/melosys-e2e-tests/actions/runs/22273597712) | ✅ | 🔄 flaky | ✅ | ✅ |
| Feb 20 | [22225808749](https://github.com/navikt/melosys-e2e-tests/actions/runs/22225808749) | ✅ | ✅ | ✅ | ✅ |
| Feb 20 | [22222851986](https://github.com/navikt/melosys-e2e-tests/actions/runs/22222851986) | ✅ | ✅ | ✅ | 🔄 flaky |
| Feb 20 | [22217830418](https://github.com/navikt/melosys-e2e-tests/actions/runs/22217830418) | ✅ | 🔄 flaky | ✅ | ✅ |
| Feb 20 | [22217758383](https://github.com/navikt/melosys-e2e-tests/actions/runs/22217758383) | ✅ | ✅ | ✅ | 🔄 flaky |
| Feb 20 | [22217235927](https://github.com/navikt/melosys-e2e-tests/actions/runs/22217235927) | ✅ | 🔄 flaky | ✅ | ✅ |
| Feb 19 | [22187684036](https://github.com/navikt/melosys-e2e-tests/actions/runs/22187684036) | ✅ | ✅ | ✅ | ✅ |
| Feb 19 | [22183752229](https://github.com/navikt/melosys-e2e-tests/actions/runs/22183752229) | ✅ | ✅ | 🔄 flaky | ✅ |
| Feb 19 | [22183221785](https://github.com/navikt/melosys-e2e-tests/actions/runs/22183221785) | ✅ | ✅ | ✅ | ✅ |
| Feb 19 | [22179536557](https://github.com/navikt/melosys-e2e-tests/actions/runs/22179536557) | ✅ | 🔄 flaky | ✅ | ✅ |
| Feb 19 | [22177836987](https://github.com/navikt/melosys-e2e-tests/actions/runs/22177836987) | ✅ | 🔄 flaky | ✅ | ✅ |
| Feb 19 | [22175534510](https://github.com/navikt/melosys-e2e-tests/actions/runs/22175534510) | ❌ | ❌ FAILED (3/3) | ✅ | ✅ |
| Feb 18 | [22138476363](https://github.com/navikt/melosys-e2e-tests/actions/runs/22138476363) | ✅ | ✅ | 🔄 flaky | ✅ |
| Feb 18 | [22136652368](https://github.com/navikt/melosys-e2e-tests/actions/runs/22136652368) | ✅ | ✅ | ✅ | ✅ |
| Feb 18 | [22130549825](https://github.com/navikt/melosys-e2e-tests/actions/runs/22130549825) | ❌ | ❌ FAILED (3/3) | ❌ FAILED (3/3) | ✅ |
| Feb 17 | [22099738564](https://github.com/navikt/melosys-e2e-tests/actions/runs/22099738564) | ✅ | ✅ | ✅ | 🔄 flaky |
| Feb 17 | [22098546957](https://github.com/navikt/melosys-e2e-tests/actions/runs/22098546957) | ✅ | 🔄 flaky | ✅ | ✅ |
| Feb 17 | [22097836380](https://github.com/navikt/melosys-e2e-tests/actions/runs/22097836380) | ✅ | ✅ | ✅ | 🔄 flaky |
| Feb 17 | [22096635420](https://github.com/navikt/melosys-e2e-tests/actions/runs/22096635420) | ❌ | ❌ FAILED (3/3) | 🔄 flaky | ✅ |
| Feb 16 | [22065372025](https://github.com/navikt/melosys-e2e-tests/actions/runs/22065372025) | ✅ | 🔄 flaky | ✅ | ✅ |
| Feb 16 | [22062442059](https://github.com/navikt/melosys-e2e-tests/actions/runs/22062442059) | ✅ | 🔄 flaky | 🔄 flaky | ✅ |
| Feb 16 | [22061771824](https://github.com/navikt/melosys-e2e-tests/actions/runs/22061771824) | ✅ | ✅ | 🔄 flaky | 🔄 flaky |
| Feb 16 | [22061671541](https://github.com/navikt/melosys-e2e-tests/actions/runs/22061671541) | ✅ | 🔄 flaky | ✅ | ✅ |
| Feb 16 | [22059638867](https://github.com/navikt/melosys-e2e-tests/actions/runs/22059638867) | ✅ | ✅ | ✅ | ✅ |
| Feb 16 | [22059022872](https://github.com/navikt/melosys-e2e-tests/actions/runs/22059022872) | ✅ | 🔄 flaky | ✅ | ✅ |
| Feb 16 | [22058887426](https://github.com/navikt/melosys-e2e-tests/actions/runs/22058887426) | ✅ | ✅ | 🔄 flaky | ✅ |
| Feb 16 | [22056148960](https://github.com/navikt/melosys-e2e-tests/actions/runs/22056148960) | ✅ | ✅ | ✅ | ✅ |

## Wasted CI Time

Each flaky retry costs ~45-60s per test attempt. With 3 max retries per test:

- **Flaky runs** (saved by retry): ~23 runs x ~90s wasted = **~35 min total wasted**
- **Hard-failed runs** (all 3 retries exhausted): 3 runs x ~180s = **~9 min of failed attempts**
- **Extra CI duration per flaky run**: ~2-3 min longer than clean runs

## Key Observation: Race Condition is Non-Deterministic

The race condition probability appears tied to system load:
- **arbeid-flere-land.spec.ts** has the highest failure rate (47%) - it's the most basic "arbeid i flere land" flow
- **selvstendig** (23.5%) and **fullfort-vedtak** (17.6%) have lower rates - they're variants of the same flow
- Only 1 of 3 tests fails per run in most cases (69% of affected runs)
- 2+ tests fail in the same run only 19% of the time
- All 3 tests failed together: **never** (confirming non-deterministic timing)

## What Triggers the Race

From the root cause analysis, the race occurs when:
1. **Saga step** `HENT_REGISTEROPPLYSNINGER` runs async
2. **Frontend** calls `/saksopplysninger/oppfriskning/{id}` (triggered by `Stegvelger.jsx` navigation)
3. Both modify `SaksopplysningKilde` for the same behandling simultaneously
4. The second transaction fails with `OptimisticLockingFailureException`

The frontend triggers `oppfriskning` during page navigation via `lagreMottatteOpplysningerOgOppfriskSaksopplysninger()` in `fellesHandlers.jsx`.

## Open Questions for Investigation Plan

1. **Is the frontend triggering the race?** The frontend calls oppfriskning on step navigation. If we skip/delay this call, does the race still occur?
2. **Can we reproduce with API-only?** Call the saga and oppfriskning endpoints concurrently without the UI to isolate the backend race.
3. **Is there better logging we can add?** The docker error capture doesn't always detect the SaksopplysningKilde error (only 1 of 26 affected runs showed it in `dockerErrors`).
4. **Does the race happen in production?** Check Kibana/Grafana for the same OptimisticLockingFailureException in prod.

## Appendix: Cost of Inaction

At current rates:
- **Per week**: ~8-10 flaky runs, ~1-2 hard failures on main
- **Developer impact**: Each hard failure requires manual re-trigger or investigation
- **CI confidence**: Only 23.5% of runs are fully clean, reducing trust in the CI pipeline
- **False negatives**: Retries mask the issue - 67.6% of runs have the race condition but still pass
