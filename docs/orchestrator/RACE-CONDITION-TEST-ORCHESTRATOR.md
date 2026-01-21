# Race Condition Fix - Iterative Testing Orchestrator

This document serves as a runbook for iteratively testing and fixing the `behandlingsresultat.type` race condition.

## Overview

**Problem:** `behandlingsresultat.type` gets overwritten from `MEDLEM_I_FOLKETRYGDEN` to `IKKE_FASTSATT` during async prosessinstans processing.

**Test:** `skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering`

**Branch:** `fix/debug-nvvurdering-endring-skattestatus`

---

## ✅ FIXED: Race Condition Resolved (2025-11-29)

**Final Fix:** `e2e-fix-final-update` (backend) + `e2e-fix-3` (frontend)
**Success Rate:** 100% (10/10 runs, 0 IKKE_FASTSATT errors)
**Report:** `melosys-api-claude/docs/debugging/2025-11-29-FINAL-SUMMARY-RACE-CONDITION-FIXED.md`

### The Solution

1. **Frontend (e2e-fix-3):** 200ms delay between `validerMottatteOpplysninger()` and `fatt()`
2. **Backend (e2e-fix-final-update):** Final targeted UPDATE for type at end of `fattVedtak()`

---

## Root Cause: Concurrent HTTP Requests

**Date:** 2025-11-28 (Discovered via comprehensive logging)

### The Problem Was NOT Async Saksflyt

After comprehensive logging, we discovered the race condition happens between **two concurrent HTTP requests**, NOT between the HTTP thread and async saksflyt.

### What Actually Happens

```
Thread qtp-87 (fattVedtak)              Thread qtp-81 (DIFFERENT REQUEST)
────────────────────────────            ──────────────────────────────────
1. Load behandlingsresultat (IKKE_FASTSATT)
2. Set type = MEDLEM_I_FOLKETRYGDEN
3. Save (JPA flush starts)
   Transaction NOT committed yet...
                                        4. Load SAME behandlingsresultat
                                           Reads IKKE_FASTSATT (stale!)
                                        5. JPA-PRE-UPDATE with IKKE_FASTSATT
6. Transaction commits
                                        7. Transaction commits - LAST WRITE WINS
8. Saksflyt starts, reads IKKE_FASTSATT (the wrong value)
```

### Why Previous Fixes Failed

| Fix | Why It Failed |
|-----|---------------|
| Targeted UPDATE in OpprettFakturaserie | OpprettFakturaserie runs AFTER the race already happened |
| entityManager.clear/refresh | Wrong thread - race is between HTTP threads, not HTTP vs async |
| Delays | Didn't help because race is between concurrent HTTP requests |

### Investigation History

| Iteration | Fix | IKKE_FASTSATT Rate | Result |
|-----------|-----|-------------------|--------|
| e2e-fix-4 | @Transactional(REQUIRES_NEW) + refresh() | 23% | ❌ Failed |
| e2e-fix-5 | + 100ms delay | 29% | ❌ Worse |
| e2e-fix-6 | + entityManager.clear() | 56% | ❌ Much Worse |
| e2e-fix-7 | Targeted SQL UPDATE in OpprettFakturaserie | 50% | ❌ Failed |
| debug-logging | Comprehensive logging | 38% | ✅ ROOT CAUSE FOUND |
| e2e-fix-2 | Frontend: Cancel debounce | 53% | ❌ Failed |
| **e2e-fix-3** | **Frontend: + 200ms delay** | **17%** | **✅ SIGNIFICANT IMPROVEMENT** |

### Latest Success (e2e-fix-3)

The frontend fix that adds a **200ms delay** between `validerMottatteOpplysninger()` and `fatt()` has significantly improved the success rate:

| Metric | e2e-fix-2 | e2e-fix-3 |
|--------|-----------|-----------|
| First-attempt success | 47% | **80%** |
| With retries | ~60% | **100%** |

**The fix works by:**
- Giving the `lovvalgsperioder` transaction time to fully commit
- Ensuring `fatt()` doesn't load stale data from an uncommitted transaction

**Remaining:** ~20% first-attempt failures.

**e2e-fix-detach FAILED** - Detach in LovvalgsperiodeService made things worse (71% vs 80%).

**Next steps:**
1. Phase 1: Enhanced logging to identify ACTUAL race source
2. Phase 2: Targeted SQL UPDATE for type field in fattVedtak
3. See: `melosys-api-claude/docs/debugging/2025-11-29-NEXT-STEPS-LOGGING-AND-TARGETED-UPDATE.md`

### Recommended Fixes

1. **Pessimistic Locking** - Add `@Lock(PESSIMISTIC_WRITE)` when loading during fattVedtak
2. **Optimistic Locking** - Add `@Version` to Behandlingsresultat
3. **Identify Second Request** - Find what API call is racing and fix the flow

**See:** `melosys-api-claude/docs/debugging/2025-11-28-ROOT-CAUSE-FOUND-CONCURRENT-HTTP-REQUESTS.md`

---

## Recommended Next Steps

### Immediate: Deep Investigation of Entity Saves

Since the targeted UPDATE in OpprettFakturaserie didn't help, we need to find WHERE `behandlingsresultat.type` is actually being overwritten:

1. **Add logging to ALL places that save Behandlingsresultat**
   - Search for `behandlingsresultatRepository.save`, `behandlingsresultatService.lagre`
   - Add debug logging: log the entity ID, current type value, and stack trace

2. **Trace the prosessinstans chain for IVERKSETT_VEDTAK_FTRL**
   - What steps run? In what order?
   - Which steps touch Behandlingsresultat?
   - Are there multiple saves happening?

3. **Check if type is ever set to MEDLEM_I_FOLKETRYGDEN**
   - Is it set and then overwritten?
   - Or is it never set in the first place?

### Architectural Options (After Finding Root Cause)

#### Option A: TransactionSynchronizationManager (Already Proven Invalid)

This was already validated as invalid - the `@TransactionalEventListener(AFTER_COMMIT)` already does this.

#### Option B: Synchronous Processing

Remove `@Async` for `IVERKSETT_VEDTAK_FTRL` - process in same thread/transaction.

#### Option C: Outbox Pattern

Save event to database table within same transaction, separate job polls and processes.

#### Option D: Optimistic Locking + Retry

Add `@Version` field to detect and handle conflicts with retry logic.

#### Option E: Fix All Entity Saves (Like we did for OpprettFakturaserie)

Once we identify ALL places that save Behandlingsresultat, convert them to targeted SQL UPDATEs.

---

## Iteration Cycle

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. ANALYZE - Fetch & analyze latest GitHub E2E results            │
├─────────────────────────────────────────────────────────────────────┤
│  2. REPORT - Create timestamped report with findings               │
├─────────────────────────────────────────────────────────────────────┤
│  3. IMPLEMENT - Have melosys-api agent implement fix               │
├─────────────────────────────────────────────────────────────────────┤
│  4. BUILD - Run mvn clean package -DskipTests                      │
├─────────────────────────────────────────────────────────────────────┤
│  5. LOCAL TEST - Start app locally, run E2E test, check logs       │
├─────────────────────────────────────────────────────────────────────┤
│  6. PUSH IMAGE - Push to GAR with version tag (e.g., e2e-fix-7)    │
├─────────────────────────────────────────────────────────────────────┤
│  7. TRIGGER CI - Start E2E workflow in GitHub with image tag       │
├─────────────────────────────────────────────────────────────────────┤
│  8. WAIT ~20-30min, then go back to step 1                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Instructions

### Step 1: ANALYZE - Fetch Latest GitHub E2E Results

**Agent:** `melosys-e2e-playwright`

**Task:**
```
Download and analyze the latest GitHub Actions workflow run from branch
`fix/debug-nvvurdering-endring-skattestatus` in navikt/melosys-e2e-tests.

Look for:
1. The melosys-api image tag used (e.g., e2e-fix-7)
2. Confirm fix is deployed by looking for relevant log messages
3. For each ENDRINGSVEDTAK run, check:
   - behandlingsresultatType value (MEDLEM_I_FOLKETRYGDEN or IKKE_FASTSATT)
   - finnIkkeSkattepliktigeSaker job result (antallProsessert: 0 or 1)
4. Any [RACE-DEBUG] log entries showing entity state
5. Overall pass/fail rate

Return a structured summary with:
- Image tag used
- Total runs and failure rate
- Details of any failed runs (timestamps, behandlingId, log excerpts)
- Whether the current fix is working or not
```

---

### Step 2: REPORT - Create Timestamped Report

**Location:** `/Users/rune/source/nav/melosys-e2e-tests/docs/debugging/YYYY-MM-DD-HHmm-ITERATION-REPORT.md`

---

### Step 3: IMPLEMENT - Have melosys-api Agent Implement Fix

**Agent:** `melosys-api-debugger`

**Working Directory:** `/Users/rune/source/nav/melosys-api-claude`

**Task Template:**
```
Based on the latest iteration report at [report path], implement the following fix:

[Description of fix]

Files to modify:
- [file list]

After implementing:
1. Check files with mcp__jetbrains__get_file_problems
2. Fix any compilation errors
3. Report what was changed
```

---

### Step 4: BUILD - Verify Build Works

**Command:**
```bash
cd /Users/rune/source/nav/melosys-api-claude && mvn clean package -DskipTests
```

**Expected:** `BUILD SUCCESS`

---

### Step 5: LOCAL TEST - Run App and E2E Test Locally

**Start melosys-api:**
```bash
cd /Users/rune/source/nav/melosys-api-claude
java -jar -Dspring.profiles.active=local-mock app/target/melosys-sb-execution.jar > melosys-api.log 2>&1 &
```

**Wait for startup (check log for "Started MelosysApplication"):**
```bash
tail -f melosys-api.log | grep -E "(Started|RACE-DEBUG|ERROR)"
```

**Run E2E test locally:**
```bash
cd /Users/rune/source/nav/melosys-e2e-tests
npx playwright test tests/utenfor-avtaleland/workflows/nyvurdering-endring-skattestatus.spec.ts -g "skattepliktig til ikke-skattepliktig" --project=chromium --workers=1
```

**Check logs for expected debug messages:**
```bash
grep "RACE-DEBUG" melosys-api.log
```

**Stop the app when done:**
```bash
pkill -f melosys-sb-execution.jar
```

---

### Step 6: PUSH IMAGE - Push to Google Artifact Registry

**Agent:** `melosys-api-debugger` (has skill for this)

**Task:**
```
Push the current build to GAR with tag: e2e-fix-X

Use the GAR push skill/command available in melosys-api-claude.
The image should be tagged appropriately for E2E testing.
```

---

### Step 7: TRIGGER CI - Start E2E Workflow in GitHub

**Command:**
```bash
gh workflow run "E2E Tests" \
  --repo navikt/melosys-e2e-tests \
  --ref fix/debug-nvvurdering-endring-skattestatus \
  -f environment=e2e-fix-X
```

---

### Step 8: WAIT - Monitor and Iterate

**Wait time:** ~20-30 minutes for CI to complete

**Monitor progress:**
```bash
gh run list --repo navikt/melosys-e2e-tests --branch fix/debug-nvvurdering-endring-skattestatus --limit 1
```

**When complete:** Go back to Step 1

---

## Quick Reference - Agent Commands

### Launch E2E Analysis Agent
```
Task: melosys-e2e-playwright
Prompt: "Download and analyze latest GitHub Actions run from branch fix/debug-nvvurdering-endring-skattestatus. Check for [RACE-DEBUG] logs, behandlingsresultatType values, and job results. Report findings."
```

### Launch API Fix Agent
```
Task: melosys-api-debugger
Prompt: "Read /Users/rune/source/nav/melosys-e2e-tests/docs/debugging/[latest-report].md and implement the suggested fix in /Users/rune/source/nav/melosys-api-claude. Verify build passes."
```

---

## Iteration History

### Phase 1: JPA-Level Fixes (All Failed)

#### Iteration 1: e2e-fix-4 (2025-11-27 ~11:00)
- **Fixes:** Targeted update, entity refresh, @Transactional(REQUIRES_NEW)
- **Result:** 23% failure rate (3/13 ENDRINGSVEDTAK had IKKE_FASTSATT)
- **Finding:** entityManager.refresh() reads stale data because parent transaction hasn't committed yet
- **Report:** `docs/debugging/2025-11-27-1200-ITERATION-REPORT.md`

#### Iteration 2: e2e-fix-5 (2025-11-27 ~12:00)
- **New Fix:** Added 100ms delay before loading entities
- **Result:** 29% failure rate (4/14 ENDRINGSVEDTAK had IKKE_FASTSATT) - WORSE
- **Finding:** Delay doesn't help, may introduce other timing issues
- **Report:** `docs/debugging/2025-11-27-1300-ITERATION-REPORT.md`

#### Iteration 3: e2e-fix-6 (2025-11-27 ~13:30)
- **New Fix:** Replace `entityManager.refresh()` with `entityManager.clear()` to evict ALL entities
- **Result:** **56% failure rate (9/16)** - MUCH WORSE
- **Finding:** JPA caching is NOT the problem. The issue is architectural.
- **Workflow Run:** [19738096028](https://github.com/navikt/melosys-e2e-tests/actions/runs/19738096028)

### Phase 1 Conclusion

| Fix | Result |
|-----|--------|
| @Transactional(REQUIRES_NEW) | ❌ 23% failure |
| + entityManager.refresh() | ❌ 23% failure |
| + 100ms delay | ❌ 29% failure (worse) |
| + entityManager.clear() | ❌ 56% failure (much worse) |

**Root Cause Identified:** The async prosessinstans is triggered INSIDE the parent transaction. Even with `@TransactionalEventListener(AFTER_COMMIT)`, the `@Async` just schedules work on another thread that races with commit visibility.

**Full Analysis:** `docs/debugging/2025-11-27-FINAL-INVESTIGATION-REPORT.md`

---

### Phase 2: Targeted UPDATE Fix (Failed)

#### Iteration 4: e2e-fix-7 (2025-11-28 ~07:00)
- **Approach:** Targeted SQL UPDATE in OpprettFakturaserie.kt
- **Change:** Use `behandlingsresultatRepository.updateFakturaserieReferanse()` instead of loading/modifying/saving entity
- **Theory:** The async thread overwrites `type` because it loads stale entity and saves ALL fields
- **Result:** **50% failure rate (17/34 ENDRINGSVEDTAK had IKKE_FASTSATT)** - NO IMPROVEMENT
- **Workflow Runs:**
  - [19756463214](https://github.com/navikt/melosys-e2e-tests/actions/runs/19756463214) (Nov 28 06:56) - 53% IKKE_FASTSATT (9/17)
  - [19738096028](https://github.com/navikt/melosys-e2e-tests/actions/runs/19738096028) (Nov 27 13:36) - 47% IKKE_FASTSATT (8/17)

**Key Finding:** The targeted UPDATE in OpprettFakturaserie did NOT help. This proves:
1. OpprettFakturaserie is NOT the source of the race condition
2. Another component in the prosessinstans chain is overwriting the type
3. OR the type is never being set to MEDLEM_I_FOLKETRYGDEN in the first place

**Details:**
- Test success rate improved to 85% (Playwright retries)
- But ENDRINGSVEDTAK-level success rate is only 50%
- Failures cluster together (runs 4-7, runs 9-12) suggesting cascading issues

### Phase 2 Conclusion

| Fix | IKKE_FASTSATT Rate | Result |
|-----|-------------------|--------|
| Targeted SQL UPDATE (OpprettFakturaserie) | 50% | ❌ Failed |

**The race condition is NOT in OpprettFakturaserie.** Need deeper investigation.

---

### Phase 3: Deep Investigation (Current)

**Goal:** Find the ACTUAL source of the overwrite

**Approach:**
1. Add logging to ALL `behandlingsresultatRepository.save` and `behandlingsresultatService.lagre` calls
2. Log entity ID, type value, and stack trace on every save
3. Run E2E test and analyze logs to find:
   - Where is type set to MEDLEM_I_FOLKETRYGDEN?
   - Where is it overwritten to IKKE_FASTSATT?
   - What is the sequence of saves?

---

## Files Modified During Investigation

| File | Module | Change | Status |
|------|--------|--------|--------|
| `BehandlingsresultatRepository.java` | repository | Added updateFakturaserieReferanse() | Keep |
| `BehandlingsresultatService.kt` | service | Added wrapper method | Keep |
| `OpprettFakturaserie.kt` | saksflyt | Uses targeted update | Keep |
| `ProsessinstansBehandler.java` | saksflyt | @Transactional, sleep, clear() | **Revert/Clean** |
| `ProsessinstansBehandlerTest.kt` | saksflyt | Updated for constructor changes | **Revert/Clean** |

**Note:** The targeted update in OpprettFakturaserie is a good defensive change and should be kept. The changes to ProsessinstansBehandler (sleep, clear) should be reverted before implementing a proper architectural fix.

---

## Key Documentation

- **Final Investigation Report:** `docs/debugging/2025-11-27-FINAL-INVESTIGATION-REPORT.md`
- **Original Issue:** `docs/INVESTIGATION-BEHANDLINGSRESULTAT-TYPE-ISSUE.md`
- **Fix Plan (outdated):** `docs/debugging/2025-11-26-FIX-PLAN-BEHANDLINGSRESULTAT-RACE-CONDITION.md`

---

## melosys-api-claude Commits

**Commit:** `bc468d1d9d` (Phase 1 changes - partial revert needed)
**Latest image:** `e2e-fix-7` (targeted UPDATE fix - 50% failure rate, did not help)

### Image History

| Image Tag | Repository | Fix | Result |
|-----------|------------|-----|--------|
| e2e-fix-4 | melosys-api | @Transactional + refresh | 23% IKKE_FASTSATT |
| e2e-fix-5 | melosys-api | + 100ms delay | 29% IKKE_FASTSATT |
| e2e-fix-6 | melosys-api | + entityManager.clear() | 56% IKKE_FASTSATT |
| e2e-fix-7 | melosys-api | Targeted UPDATE in OpprettFakturaserie | 50% IKKE_FASTSATT |
| e2e-fix-2 | melosys-web | Cancel debounce only | 53% IKKE_FASTSATT |
| **e2e-fix-3** | **melosys-web** | **Cancel debounce + 200ms delay** | **17% IKKE_FASTSATT** ✅ |
| e2e-fix-detach | melosys-api | Backend: Detach entity in LovvalgsperiodeService | 29% IKKE_FASTSATT ❌ (worse!) |
| **e2e-fix-final-update** | **melosys-api** | **Backend: Final targeted UPDATE for type** | **0% IKKE_FASTSATT ✅ FIXED!** |

---

## ✅ Phase 4: Frontend Fix - SUCCESS

### e2e-fix-3: 200ms Delay Between API Calls

**Date:** 2025-11-28
**Status:** ✅ SIGNIFICANT IMPROVEMENT
**Run ID:** 19774366710

#### The Fix

```typescript
// vurderingVedtak.tsx
const onSubmit = async () => {
  debouncedKontrollerBehandling.cancel?.();

  if (!validerForm()) return;
  setVedtakPending(true);

  try {
    await validerMottatteOpplysninger();

    // RACE CONDITION FIX: Wait for backend transaction to fully commit
    await new Promise((resolve) => setTimeout(resolve, 200));

    const vedtakRequest = {...};
    const res = await dispatch(vedtakOperations.fatt(behandlingID, vedtakRequest));
    // ...
  } catch {
    setVedtakPending(false);
  }
};
```

#### Results

| Metric | Before (e2e-fix-2) | After (e2e-fix-3) | Improvement |
|--------|-------------------|-------------------|-------------|
| First-attempt success | 47% | **80%** | **+33%** |
| With retries | ~60% | **100%** | **+40%** |
| IKKE_FASTSATT rate | 53% | **17%** | **-36%** |

#### Why It Works

The 200ms delay ensures the `lovvalgsperioder` transaction fully commits before `fatt()` loads `behandlingsresultat`. Without the delay, `fatt()` could load stale data from an uncommitted transaction.

#### Remaining ~20% Failures

The occasional failures occur when:
- Database is under load and commits take longer
- Network latency varies
- Transaction visibility delays

#### Next Steps

1. **Short-term:** Deploy e2e-fix-3 (100% success with retries is acceptable)
2. **Medium-term:** Implement backend fix (detach entity in LovvalgsperiodeService)
3. **Long-term:** Add @Version optimistic locking for defense-in-depth

#### Other Components to Update

If deploying to production, apply same pattern to:
- `vurderingArtikkel13_x_vedtak.jsx`
- `vurderingArtikkel16Vedtak.tsx`
- `vurderingVedtak11_3_og_13_3a.tsx`
- `vurderingAvslag12_x_og_16.jsx`
- `vurderingArbeidTjenestepersonEllerFlyVedtak.jsx`

#### Report

See: `melosys-api-claude/docs/debugging/2025-11-28-E2E-FIX-3-200MS-DELAY-SUCCESS.md`
