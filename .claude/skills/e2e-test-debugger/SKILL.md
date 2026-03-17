---
name: e2e-test-debugger
description: |
  Debug failing E2E Playwright tests in melosys-e2e-tests-claude. Use when:
  (1) E2E tests fail with timeout errors or unexpected behavior,
  (2) Need to check database state (prosessinstans, behandling, vedtak),
  (3) Need to understand why UI buttons are disabled or actions fail,
  (4) Tracing issues from frontend through API to database,
  (5) Process instance timeout errors in cleanup fixture.
---

# E2E Test Debugger

Debug failing Playwright E2E tests by checking database state, analyzing screenshots, and tracing UI to API issues.

## Quick Debugging Workflow

### 1. Run the Failing Test

```bash
npx playwright test "test-name" --project=chromium --reporter=list
```

Key output patterns:
- `TimeoutError: locator.click` + `element is not enabled` → Button disabled, check screenshot
- `Process instances timed out` → Check database for missing/stuck prosessinstans
- `page.waitForResponse: Test ended` → API call never happened

### 2. Check the Screenshot

```bash
# Read screenshot from test-results
test-results/{test-name}-chromium/test-failed-1.png
```

Look for:
- **Disabled buttons** → Missing required fields (dropdowns showing "Velg...")
- **Error messages** → Red validation text
- **Loading spinners** → API still in progress

### 3. Query the Database

```bash
docker exec melosys-oracle bash -c "sqlplus -s MELOSYS/melosyspwd@//localhost:1521/freepdb1 << 'EOF'
SELECT RAWTOHEX(UUID), PROSESS_TYPE, STATUS, SIST_FULLFORT_STEG
FROM PROSESSINSTANS ORDER BY REGISTRERT_DATO DESC FETCH FIRST 5 ROWS ONLY;
EOF"
```

See [references/database-queries.md](references/database-queries.md) for more queries.

## Common Issues

### Step Transition Timeout (Flaky on CI)

**Symptom:** `Step transition timed out after 90s. API responded OK but heading is still "X"`
**Root cause:** Frontend rendering stall — backend processes the step but React doesn't re-render.

**Key facts (confirmed March 2026):**
- Always the same error: API responds OK, heading doesn't change
- Specific to EU/EØS multi-step wizard flows (uses `verifyHeadingChange: true`)
- The "Yrkessituasjon" step is the worst offender — stalls ~60% of the time on CI
- NOT a backend issue — the API always succeeds
- NOT fixable by increasing timeouts alone — when React stalls, it stalls indefinitely
- Likely a melosys-web bug in the step wizard React component

**What NOT to do:**
- **NEVER use page.reload() as fallback** — The step wizard uses client-side React state.
  Reload sends you back to step 1. The heading changes (step 2→step 1), so the code
  incorrectly thinks the step *advanced*. This causes cascading failures.
- Don't retry the click when API already responded — causes double-advance
- Don't add networkidle waits to every step — accumulated 4700s overhead in full suite

**What helps (in priority order):**
1. **ALWAYS pass `waitForContent` to `klikkBekreftOgFortsett`** — this is the single most
   effective fix. Pass a locator for an element on the NEXT step (radio, checkbox, button).
   `clickStepButtonWithRetry` uses it as an alternative success signal via `Promise.race`
   when the heading check fails. Without it, the only detection mechanism is the fragile
   heading visibility check.
   ```typescript
   // GOOD — gives fallback detection
   await behandling.klikkBekreftOgFortsett({
     waitForContent: page.getByRole('checkbox', { name: 'Ståles Stål AS' }),
   });

   // BAD — only heading check, will timeout if React stalls
   await behandling.klikkBekreftOgFortsett();
   ```
2. **Networkidle before clicking** — Radio buttons trigger auto-save API calls
   (POST /api/mottatteopplysninger/). If "Bekreft og fortsett" is clicked before
   those complete, React can get into a stuck state. `clickStepButtonWithRetry`
   now does this automatically in heading-change mode.
3. Extended wait (75s after initial 15s) catches most slow renders
4. POM-level waitFor timeouts of 30-45s (not default 10s) for radio/checkbox elements
5. UI nudge (Tab/Shift+Tab) after stuck heading to trigger React re-render cycle

**Race condition with radio auto-save:**
Radio selections on step wizard pages trigger immediate API saves. If you click
"Bekreft og fortsett" before the auto-save completes, two concurrent API calls
can cause React to batch state updates without flushing a re-render. Tests with
TWO radio selections before clicking (e.g. "direkte til" tests) are less flaky
because the second selection gives the first one's API call time to complete.

**How to investigate CI failures:**
1. Download `error-context.md` from `test-results/` — shows page snapshot at failure
2. Check which step heading is shown — if it's a PREVIOUS step, the page went backwards
3. Check `test-summary.json` `totalAttempts` vs `failedAttempts` for flaky rate
4. Run stability test: `gh workflow run -f test_grep="test name" -f repeat_each=5 -f disable_retries=true`

### Button Disabled (e.g., "Fatt vedtak")

**Symptom:** `element is not enabled` in timeout error
**Cause:** Required dropdown not selected
**Fix:** Add selection step before clicking button

```typescript
// Example fix - select institution before vedtak
await this.institusjonDropdown.selectOption({ index: 1 });
await this.fattVedtakButton.click();
```

### Process Instance Timeout

**Symptom:** `Process instances timed out: Timeout after 30s`

This is usually a **secondary error** — the test already failed (e.g., step transition timeout),
and the cleanup fixture times out because the test left things in an unfinished state.
Check the FIRST error in the annotation, not this one.

| Database State | Meaning | Action |
|----------------|---------|--------|
| No IVERKSETT_VEDTAK_EOS | API never called | Button was disabled - check screenshot |
| Status = KLAR | Step stuck | Check API logs for errors |
| Status = FERDIG | All done | Timing issue - check if button click failed |

### Vedtak Never Created

**Symptom:** BEHANDLING.STATUS = UNDER_BEHANDLING, BEHANDLINGSRESULTAT.RESULTAT_TYPE = IKKE_FASTSATT

This means the vedtak API endpoint was never called. Check:
1. Screenshot for disabled "Fatt vedtak" button
2. Required fields like institution dropdown
3. Validation errors on form

### Radio/Checkbox Not Visible After Step Transition

**Symptom:** `locator.waitFor: Timeout Xms exceeded. waiting for getByRole('radio/checkbox', ...)`
**Cause:** The step transition completed but dependent UI elements haven't rendered yet on slow CI.

**Fix:** Increase waitFor timeout in POM methods to 30-45s (not default 10s):
```typescript
// BAD - default 10s too short for CI
await this.skipRadio.waitFor({ state: 'visible' });

// GOOD - explicit 30s timeout
await this.skipRadio.waitFor({ state: 'visible', timeout: 30000 });
```

## Database State Checklist

Query these tables in order when debugging:

```sql
-- 1. Check process instances
SELECT PROSESS_TYPE, STATUS FROM PROSESSINSTANS;

-- 2. Check behandling status
SELECT ID, STATUS, BEH_TEMA FROM BEHANDLING;

-- 3. Check if vedtak was created
SELECT BEHANDLING_ID, RESULTAT_TYPE FROM BEHANDLINGSRESULTAT;

-- 4. Check vedtak metadata exists
SELECT * FROM VEDTAK_METADATA;
```

## References

- **[Database Queries](references/database-queries.md)** - Complete query reference
