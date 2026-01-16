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
