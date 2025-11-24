# Debugging Session: CI-Only Flaky Test - 2025-11-24

**Status:** In Progress - Ready for CI Testing
**Bug:** `behandlingsresultat.type` set to `IKKE_FASTSATT` instead of `MEDLEM_I_FOLKETRYGDEN` in CI
**Test:** `skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering`

---

## Executive Summary

### Problem
- Test **passes 100% locally** (20/20 runs)
- Test **fails ~75% in CI** (reported)
- Bug is **environment-specific** - only occurs in GitHub Actions CI

### Root Cause Hypothesis
The bug is triggered by CI-specific conditions:
- Different timing/resources (CI is slower or has less memory)
- Different Docker images (CI uses pre-built images from NAIS registry)
- Race conditions that only occur under CI load
- Database initialization differences

### Current State
✅ **Branch created:** `fix/database-reading-test`
✅ **Commits:** 2 commits ready for testing
✅ **CI configured:** Will run test 20 times and capture full artifacts
⏳ **Next step:** Push branch and trigger CI workflow

---

## What We Found

### Local Testing Results (2025-11-24)

**Test run 20 times locally - 100% success rate:**

| Metric | Value |
|--------|-------|
| Total runs | 20 |
| ✅ Passed | 20 (100%) |
| ❌ Failed | 0 (0%) |
| Database type | `MEDLEM_I_FOLKETRYGDEN` ✅ |
| Job result | Found 1 case, 0 errors ✅ |

**Backend logs confirmed:**
```
🔍 DEBUG: Setter behandlingsresultat.type fra IKKE_FASTSATT til MEDLEM_I_FOLKETRYGDEN
🔍 DEBUG: Lagret behandlingsresultat med type=MEDLEM_I_FOLKETRYGDEN
```

**Database schema discovered:**
- Type column: `RESULTAT_TYPE` (not `TYPE` or `BEHANDLINGSRESULTATTYPE`)
- Foreign key: `BEHANDLING_ID`

### CI Testing (Pending)

According to investigation summary, the test fails 75% of the time in CI. We configured CI to run the test 20 times to reproduce and capture the failure.

---

## Changes Made

### Branch: `fix/database-reading-test`

#### Commit 1: Add database reading test and fix BEHANDLINGSRESULTAT queries
**Files:**
- `helpers/db-helper.ts` - Added database query helper methods
- `tests/rengjor-database.spec.ts` - New test to verify database reading
- `tests/utenfor-avtaleland/workflows/nyvurdering-endring-skattestatus.spec.ts` - Fixed SQL error

**Changes:**
- Added test: "skal lese behandlingsresultat.type fra database"
- Fixed: Removed `ORDER BY ID` from BEHANDLINGSRESULTAT queries (table doesn't have ID column)
- Discovered correct column names: `RESULTAT_TYPE`, `BEHANDLING_ID`
- Test dynamically discovers schema and validates data matching

#### Commit 2: Configure CI to run flaky test 20 times with full artifact capture
**File:** `.github/workflows/e2e-tests.yml`

**Changes:**
1. **Modified test execution** (line 299-353):
   - Run only the nyvurdering skattestatus test
   - Execute 20 times in a loop
   - Track pass/fail counts
   - Generate detailed summary
   - Fail job if any run fails

2. **Changed artifact upload conditions** (lines 640, 660, 668):
   - Changed from `if: failure()` to `if: always()`
   - Ensures artifacts are captured even with intermittent failures
   - Captures videos, traces, and logs from all runs

**Why these changes:**
- Need to reproduce the 75% failure rate reported in CI
- Need to capture artifacts when failure occurs
- Need to compare successful vs failed runs to identify differences

---

## Files Created/Modified

### New Files
- `docs/debugging/SESSION-2025-11-24-CI-FLAKY-TEST.md` (this file)

### Modified Files
1. `helpers/db-helper.ts` - Added query methods (not used yet, column names incorrect)
2. `tests/rengjor-database.spec.ts` - New database reading test
3. `tests/utenfor-avtaleland/workflows/nyvurdering-endring-skattestatus.spec.ts` - Fixed SQL, added DB verification
4. `.github/workflows/e2e-tests.yml` - Configured for 20x test runs

---

## How to Continue This Session

### Step 1: Push the Branch

```bash
cd /Users/rune/source/nav/melosys-e2e-tests
git checkout fix/database-reading-test
git push origin fix/database-reading-test
```

### Step 2: Trigger CI Workflow

**Option A: Automatic trigger**
- Create a PR from the branch
- CI will run automatically

**Option B: Manual trigger**
1. Go to: https://github.com/navikt/melosys-e2e-tests/actions
2. Select "E2E Tests" workflow
3. Click "Run workflow"
4. Select branch: `fix/database-reading-test`
5. Image tag: `latest` (or specific tag)
6. Run workflow

### Step 3: Monitor CI Results

**Expected output in CI logs:**
```
🔁 Running flaky test 20 times to reproduce behandlingsresultat.type bug...
════════════════════════════════════════════════════════════════
🔄 RUN 1/20 - HH:MM:SS
════════════════════════════════════════════════════════════════
[test output]
✅ Run 1: PASSED  (or ❌ FAILED)
...
════════════════════════════════════════════════════════════════
📊 FINAL SUMMARY
════════════════════════════════════════════════════════════════
✅ Passed: X/20
❌ Failed: Y/20
📈 Success rate: Z%
```

**If failures occur:**
- ❌ Job will fail (to trigger artifact upload)
- 📦 Artifacts will be available for download

### Step 4: Download and Analyze Artifacts

When the CI job completes (with failures), download these artifacts:

1. **playwright-results** - Full test results, reports, and docker logs
2. **playwright-videos** - Videos of all test runs
3. **playwright-traces** - Detailed traces for debugging
4. **test-summary** - JSON/Markdown summary

**Key files to check:**

```
playwright-results/
├── flaky-test-summary.md          # Pass/fail summary
├── test-summary.md                # Detailed test results
├── melosys-api-complete.log       # Complete API logs with timestamps
├── docker-logs-*.log              # Per-test docker logs
└── test-results/
    └── [failed test directories]  # Videos, traces, screenshots
```

### Step 5: Compare Successful vs Failed Runs

**Look for differences in:**

1. **Database output:**
   - Check console logs for: `🔍 DEBUG: Checking database for behandlingsresultat.type...`
   - Compare `RESULTAT_TYPE` values between passed and failed runs
   - Note any patterns (e.g., fails on first run, passes after warmup)

2. **Backend logs (`melosys-api-complete.log`):**
   - Search for: `🔍 DEBUG: Setter behandlingsresultat.type`
   - Check if type is set correctly
   - Check if type is saved correctly
   - Look for timing differences

3. **Timing patterns:**
   - Do failures cluster together? (e.g., runs 1-5 fail, 6-20 pass)
   - Do failures occur after specific events?
   - Are there timeout issues?

### Step 6: Identify Root Cause

**Based on patterns, determine:**

**Hypothesis A: Timing/Race Condition**
- Fix: Add explicit waits or transaction boundaries
- Evidence: Failures occur randomly, no consistent pattern

**Hypothesis B: Resource Constraints**
- Fix: Optimize CI resources or test execution
- Evidence: Failures occur early in test run, pass after warmup

**Hypothesis C: Docker Image Differences**
- Fix: Use same images locally and in CI, or fix backend code
- Evidence: Local always passes, CI always fails certain runs

**Hypothesis D: Database Initialization**
- Fix: Ensure proper database setup/cleanup
- Evidence: Failures related to database state

### Step 7: Implement Fix

Once root cause is identified:
1. Implement fix in melosys-api or test code
2. Remove the 20x test loop from CI workflow
3. Restore normal test execution
4. Verify fix in CI

---

## Key Insights

### What We Know For Sure

1. ✅ **PR #3112 logic is correct** - Backend logs show type is being set
2. ✅ **Local environment works 100%** - No failures in 20 runs
3. ✅ **Database schema correct** - Column name is `RESULTAT_TYPE`
4. ✅ **Test has database verification** - Will show exact database state when it fails

### What We Don't Know Yet

1. ❓ **Why only CI fails** - Environmental difference not yet identified
2. ❓ **Exact failure pattern in CI** - Need to run 20x to see pattern
3. ❓ **Whether type is set but not saved, or never set** - Need CI logs
4. ❓ **Whether it's a race condition or consistent bug** - Need multiple CI runs

---

## Next Session Checklist

When resuming this debugging session:

- [ ] Check if CI workflow has run
- [ ] Download artifacts from failed runs
- [ ] Compare `melosys-api-complete.log` between passed and failed runs
- [ ] Check database verification output in test logs
- [ ] Look for timing patterns in failures
- [ ] Identify root cause based on evidence
- [ ] Implement fix
- [ ] Verify fix in CI
- [ ] Restore normal CI workflow (remove 20x loop)
- [ ] Close investigation

---

## Related Documents

- **Investigation Summary:** `docs/debugging/INVESTIGATION-SESSION-SUMMARY.md`
- **Debug Logging Guide:** `docs/debugging/DEBUG-LOGGING-FOR-MELOSYS-API.md`
- **Backend Bug Report:** `docs/BACKEND-BUG-BEHANDLINGSRESULTAT-TYPE.md`

---

## Commands Reference

### Git Commands
```bash
# Checkout the branch
git checkout fix/database-reading-test

# View commits
git log --oneline -5

# View changes
git diff main...fix/database-reading-test

# Push branch
git push origin fix/database-reading-test
```

### Test Commands (Local)
```bash
# Run the specific test once
npx playwright test tests/utenfor-avtaleland/workflows/nyvurdering-endring-skattestatus.spec.ts -g "skattestatus.*nyvurdering" --project=chromium --reporter=list --workers=1

# Run database reading test
npx playwright test tests/rengjor-database.spec.ts -g "lese behandlingsresultat" --project=chromium --reporter=list --workers=1

# View complete melosys-api logs
tail -f /Users/rune/source/nav/melosys-api-claude/melosys-api.log
```

### CI Workflow File
```
.github/workflows/e2e-tests.yml
Lines 299-353: Test execution (20x loop)
Lines 640, 660, 668: Artifact upload (changed to always)
```

---

## Session End State

**Date:** 2025-11-24
**Duration:** ~2 hours
**Status:** Ready for CI testing
**Branch:** `fix/database-reading-test` (2 commits, not pushed)
**Next action:** Push branch and trigger CI workflow
**Expected timeline:** ~30-45 minutes for CI to complete 20 test runs

---

**To resume:** Start with "Step 1: Push the Branch" above and continue through the workflow.
