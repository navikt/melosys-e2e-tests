# Årsavregning Workflow Tests - Ikke-skattepliktige Saker

**JIRA:** MELOSYS-7560
**Test Script:** `/test-script.md`
**Status:** 🔄 In Progress - Awaiting domain expert clarification on "delvis" scenarios

## Overview

Automated E2E tests for verifying automatic creation of annual settlement (årsavregning) for ikke-skattepliktige (non-tax-liable) cases based on tax liability status changes.

## Test Organization

### Files Created

1. **`aarsavregning-workflow.spec.ts`** - Main test suite (11 test cases)
2. **`helpers/aarsavregning-workflow-helper.ts`** - Reusable workflow functions

### Test Structure

```
├─ Årsavregning - Førstegangsbehandling
│  ├─ ✅ ikke-skattepliktig (3 period variations) - SKAL opprette - PASSING
│  ├─ ✅ skattepliktig (3 period variations) - SKAL IKKE opprette - PASSING
│  └─ ⚠️  delvis skattepliktig - SKAL IKKE opprette - PENDING (needs domain clarification)
│
├─ Årsavregning - Ny vurdering (endre skattstatus)
│  ├─ ✅ skattepliktig → ikke-skattepliktig - SKAL opprette - PASSING
│  ├─ ⏳ ikke-skattepliktig → skattepliktig - SKAL IKKE opprette - NOT TESTED YET
│  ├─ ⚠️  ikke-skattepliktig → delvis - SKAL opprette - PENDING (needs domain clarification)
│  └─ ⚠️  skattepliktig → delvis - SKAL opprette - PENDING (needs domain clarification)
│
└─ Årsavregning - Feature toggle
   └─ ⏳ Toggle AV → Toggle PÅ - SKAL opprette - NOT TESTED YET

Legend:
✅ Working and passing
⏳ Not tested yet
⚠️  Needs domain expert clarification
```

### Period Variations

All førstegangsbehandling tests run with 3 different period types:

| Period Type | From | To | Description |
|------------|------|-----|-------------|
| **kun2024** | 03.01.2024 | 01.04.2024 | Period entirely within 2024 |
| **overlap2023_2024** | 03.11.2023 | 01.04.2024 | Spans year boundary 2023→2024 |
| **overlap2024_2025** | 03.11.2024 | 01.04.2025 | Spans year boundary 2024→2025 |

## Test Implementation Status

### ✅ Completed & Passing (5 tests)

| Test | Status | Result |
|------|--------|--------|
| Førstegangsbehandling: ikke-skattepliktig (kun 2024) | ✅ PASSING | Processes 1 case |
| Førstegangsbehandling: ikke-skattepliktig (overlap 2023-2024) | ✅ PASSING | Processes 1 case |
| Førstegangsbehandling: ikke-skattepliktig (overlap 2024-2025) | ✅ PASSING | Processes 1 case |
| Førstegangsbehandling: skattepliktig (all 3 periods) | ✅ PASSING | Processes 0 cases |
| Ny vurdering: skattepliktig → ikke-skattepliktig | ✅ PASSING | Processes 1 case |

### ⏳ Not Tested Yet (2 tests)

| Test | Status | Expected Result |
|------|--------|-----------------|
| Ny vurdering: ikke-skattepliktig → skattepliktig | ⏳ NOT TESTED | Should process 0 cases |
| Feature toggle: AV → PÅ with script | ⏳ NOT TESTED | Should process 1 case |

### ⚠️ Needs Domain Expert Clarification (4 tests)

**Issue:** Implementation of "delvis skattepliktig" (partially tax-liable) is unclear.

| Test | Question |
|------|----------|
| Førstegangsbehandling: delvis | How to create a case that is "delvis skattepliktig og delvis ikke skattepliktig"? |
| Ny vurdering: ikke-skattepliktig → delvis | How to change existing period to "delvis" status? |
| Ny vurdering: skattepliktig → delvis | Same question - what does "delvis" mean in practice? |

**Current Implementation Attempt:**
```typescript
case 'delvis':
    // First period: skattepliktig
    await trygdeavgift.velgSkattepliktig(true);
    await trygdeavgift.fyllInnBruttoinntekt('50000');

    // Try to add second period via "Legg til periode" button
    const leggTilButton = page.getByRole('button', { name: 'Legg til periode' });
    if (await leggTilButton.isVisible()) {
        await leggTilButton.click();
        // Second period: ikke-skattepliktig
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.fyllInnBruttoinntekt('50000');
    }
```

**Problem:** The "Legg til periode" button may not exist in certain flows, or "delvis" may need to be created differently (e.g., splitting periods earlier in medlemskap/resultat-periode steps).

**Questions for Domain Expert:**
1. What does "delvis skattepliktig og delvis ikke skattepliktig" mean in business terms?
2. How would a saksbehandler manually create such a case in the UI?
3. Should periods be split earlier (medlemskap) or later (trygdeavgift)?
4. Is there a different UI flow for "delvis" cases?

## Test Coverage Matrix

| Step | Scenario | Period Variations | Expected Result | Status |
|------|----------|-------------------|-----------------|--------|
| 1 | Førstegangsbehandling: ikke-skattepliktig | 3 variations | ✅ Oppretter | ✅ PASSING (3 tests) |
| 2 | Førstegangsbehandling: skattepliktig | 3 variations | ❌ Oppretter IKKE | ✅ PASSING (3 tests) |
| 3 | Ny vurdering: skattepliktig → ikke-skattepliktig | kun 2024 | ✅ Oppretter | ✅ PASSING |
| 4 | Ny vurdering: ikke-skattepliktig → skattepliktig | kun 2024 | ❌ Oppretter IKKE | ⏳ NOT TESTED |
| 5 | Ny vurdering: ikke-skattepliktig → delvis | kun 2024 | ✅ Oppretter | ⚠️ PENDING |
| 6 | Ny vurdering: skattepliktig → delvis | kun 2024 | ✅ Oppretter | ⚠️ PENDING |
| 7 | Førstegangsbehandling: delvis skattepliktig | kun 2024 | ❌ Oppretter IKKE | ⚠️ PENDING |
| 8 | Toggle AV → Toggle PÅ med script | kun 2024 | ✅ Oppretter | ⏳ NOT TESTED |
| **TOTAL** | | | | **11 tests planned** |
| **COMPLETED** | | | | **5 passing** |
| **REMAINING** | | | | **6 tests** |

## Business Rules

### ✅ Årsavregning SKAL opprettes når:

1. **Førstegangsbehandling er ikke-skattepliktig**
   - Gjelder alle perioder (kun 2024, overlappende 2023-2024, overlappende 2024-2025)

2. **Ny vurdering endrer til ikke-skattepliktig eller delvis**
   - Fra skattepliktig → ikke-skattepliktig
   - Fra ikke-skattepliktig → delvis
   - Fra skattepliktig → delvis

3. **Feature toggle aktiveres**
   - Sak opprettet før toggle aktivert
   - Script kjøres etter toggle aktivering

### ❌ Årsavregning skal IKKE opprettes når:

1. **Førstegangsbehandling er skattepliktig**
   - Gjelder alle perioder

2. **Førstegangsbehandling er allerede delvis**
   - System har allerede håndtert kompleksiteten

3. **Ny vurdering endrer til skattepliktig**
   - Fra ikke-skattepliktig → skattepliktig

## Helper Functions

### `AarsavregningWorkflowHelper`

```typescript
// Initialize
const workflow = new AarsavregningWorkflowHelper(page, request);

// Setup unleash (disable toggle at start)
await workflow.setupUnleash();

// Complete full workflow
await workflow.opprettOgBehandleSak({
    skattepliktigStatus: 'ikke-skattepliktig', // or 'skattepliktig' or 'delvis'
    periodeFra: '03.01.2024',
    periodeTil: '01.04.2024',
    userId: USER_ID_VALID // optional
});

// Create ny vurdering
await workflow.opprettNyVurdering({
    nySkattepliktigStatus: 'ikke-skattepliktig',
    nyPeriodeFra: '03.01.2024', // optional
    nyPeriodeTil: '01.04.2024'  // optional
});

// Run årsavregning job and verify
await workflow.kjørÅrsavregningJob(1); // Expected number of cases
```

## Running Tests

```bash
# Run all årsavregning tests
npm test aarsavregning-workflow.spec.ts

# Run specific test group
npm test aarsavregning-workflow.spec.ts -g "Førstegangsbehandling"
npm test aarsavregning-workflow.spec.ts -g "Ny vurdering"

# Run specific test
npm test aarsavregning-workflow.spec.ts -g "ikke-skattepliktig til skattepliktig"

# Debug mode
npm run test:debug aarsavregning-workflow.spec.ts

# UI mode (best for development)
npm run test:ui aarsavregning-workflow.spec.ts
```

## Architecture Benefits

### Code Reuse
- **Before:** Each test = ~150 lines, 8 tests = ~1200 lines
- **After:** Helper = ~200 lines, Tests = ~150 lines total
- **Savings:** ~85% reduction in code

### Maintainability
- **Single source of truth:** Update workflow in one place
- **Clear separation:** Business logic (helper) vs test scenarios (spec)
- **Type safety:** Strong typing for options and statuses

### Readability
```typescript
// Before (inline)
await page.goto('...');
await page.getByRole('button', { name: 'Opprett' }).click();
await page.getByLabel('Personnummer').fill('...');
// ... 100+ lines ...

// After (with helper)
await workflow.opprettOgBehandleSak({
    skattepliktigStatus: 'ikke-skattepliktig',
    periodeFra: '03.01.2024',
    periodeTil: '01.04.2024'
});
```

## Test Data

### User
- **User ID:** `USER_ID_VALID` (from `pages/shared/constants.ts`)
- **Name:** TRIVIELL KARAFFEL

### Medlemskap
- **Land:** Afghanistan
- **Trygdedekning:** FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON

### Arbeidsforhold
- **Arbeidsgiver:** Ståles Stål AS

### Lovvalg
- **Bestemmelse:** FTRL_KAP2_2_8_FØRSTE_LEDD_A

### Trygdeavgift
- **Inntektskilde:** INNTEKT_FRA_UTLANDET
- **Bruttoinntekt:** 100,000 kr (ikke-skattepliktig/skattepliktig)
- **Bruttoinntekt:** 50,000 kr per period (delvis)

## Known Issues & Workarounds

### Split Periods (Helse + Pensjon)

When using `FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON`, the system creates 2 periods:
- Period 1: Helsedel
- Period 2: Pensjonsdel

**Workaround:** Call `velgSkattepliktig()` twice:
```typescript
await trygdeavgift.velgSkattepliktig(false);
await trygdeavgift.velgSkattepliktig(false); // Second call ensures selection sticks
```

### Delvis Skattepliktig Implementation

The `delvis` status creates multiple periods with different tax statuses. Implementation may need adjustment based on UI behavior:

```typescript
case 'delvis':
    // First period: skattepliktig
    await trygdeavgift.velgSkattepliktig(true);
    // ... fill fields ...

    // Add second period if button exists
    const leggTilButton = this.page.getByRole('button', { name: 'Legg til periode' });
    if (await leggTilButton.isVisible()) {
        await leggTilButton.click();
        // Second period: ikke-skattepliktig
        await trygdeavgift.velgSkattepliktig(false);
        // ... fill fields ...
    }
```

## Migration from Old Tests

### Old Files (Deprecated)
- ❌ `ikke-skattepliktig-skal-fore-til-aarsavregning.spec.ts`
- ❌ `annual-settlement-non-tax-liable.spec.ts`

These files can be deleted after verifying new tests pass.

### What Changed?
1. **Extracted reusable workflow** → `AarsavregningWorkflowHelper`
2. **Parameterized period variations** → Loop over `PERIODER` object
3. **Organized by scenario** → Logical describe blocks
4. **Added missing test cases** → Now covers all 8 steps from test script

## Future Enhancements

### Potential Additions
- Database verification of created årsavregning records
- Test data cleanup between test runs
- Support for more period variations
- Integration with database assertions

### Example Database Verification
```typescript
// In helper or test
await withDatabase(async (db) => {
    const result = await db.queryOne(
        'SELECT * FROM ARSAVREGNING WHERE sak_id = :sakId',
        { sakId: sakId }
    );
    expect(result).not.toBeNull();
    expect(result.STATUS).toBe('OPPRETTET');
});
```

## Troubleshooting

### Test Fails: "antallProsessert: 0 expected: 1"

**Cause:** Job didn't find eligible cases
**Solutions:**
1. Check unleash toggle is disabled at start: `await workflow.setupUnleash()`
2. Verify case was created successfully (check console logs)
3. Check period is within 2024 (job searches `2024-01-01` to `2024-12-31`)
4. Verify skattepliktig status is correctly set

### Test Fails: "Timeout waiting for process instances"

**Cause:** Background jobs not completing
**Solutions:**
1. Increase timeout: `test.setTimeout(120000)`
2. Check Docker logs: `docker logs melosys-api`
3. Check Kafka is running: `docker ps | grep kafka`

### Test Fails: Form validation errors

**Cause:** Timing issues with API calls
**Solutions:**
1. Helper already includes `waitForTimeout(2000)` after filling trygdeavgift
2. If still failing, increase wait time in helper
3. Check network tab in trace viewer

## Resources

- **Test Script:** `/test-script.md`
- **JIRA:** MELOSYS-7560
- **Helper:** `helpers/aarsavregning-workflow-helper.ts`
- **Tests:** `tests/utenfor-avtaleland/workflows/aarsavregning-workflow.spec.ts`
- **CLAUDE.md:** Project documentation
