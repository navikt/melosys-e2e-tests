# Journalføring Test Status and Next Steps

## Overview

This document tracks the work done on journalføring e2e tests and what's needed to complete them.

## Current Status (2025-12-09) - UPDATED

### Branch
`feature/tier1-core-tests-with-metrics`

### Tests Created and Passing

| Test File | Tests | Status |
|-----------|-------|--------|
| `tests/core/journalforing.spec.ts` | 5 | ✅ All pass |
| `tests/core/oppgaver.spec.ts` | 5 | ✅ All pass |
| `tests/core/sok-og-navigasjon.spec.ts` | 5 | ✅ All pass |
| `tests/core/sed-mottak.spec.ts` | 6 | ✅ All pass |

### Process Types Now Triggered

| Process Type | Status | Triggered By |
|--------------|--------|--------------|
| `JFR_NY_SAK_BRUKER` | ✅ **NOW WORKING** | `skal kunne opprette ny sak fra journalpost` test |
| `JFR_MOTTATT_SED` | ❌ Not yet | Process received SED from EESSI |
| `JFR_UTGAAENDE_SED` | ❌ Not yet | Send SED to EESSI |

### Key Infrastructure Added

1. **`helpers/mock-helper.ts`** - Added `createJournalforingOppgaver()` function
   ```typescript
   // Creates journalføring oppgaver via mock service
   await createJournalforingOppgaver(request, { antall: 1 });
   ```
   - Uses endpoint: `POST http://localhost:8083/testdata/jfr-oppgave`
   - Options: `antall`, `forVirksomhet`, `medVedlegg`, `medLogiskVedlegg`, `tilordnetRessurs`

2. **`pages/journalforing/journalforing.page.ts`** - Page Object for journalføring
   - `fyllSakstype()` - Fill sakstype dropdown (values: "EU/EØS-land", "Avtaleland", "Utenfor avtaleland")
   - `fyllSakstema()` - Fill sakstema dropdown
   - `fyllBehandlingstema()` - Fill behandlingstema dropdown
   - `fyllBehandlingstype()` - Fill behandlingstype dropdown
   - `velgLand()` - Select country from combobox (required for "Utsendt arbeidstaker")
   - `fyllSoknadsperiode()` - Fill søknadsperiode dates (required)
   - `journalførDokument()` - Click journalfør button
   - `opprettNySakOgJournalfør()` - Complete OPPRETT workflow

3. **`pages/journalforing/journalforing.assertions.ts`** - Assertions for journalføring

## JFR_NY_SAK_BRUKER - COMPLETED ✅

The test "skal kunne opprette ny sak fra journalpost" now successfully triggers `JFR_NY_SAK_BRUKER`.

## What Was Fixed (2025-12-09)

### Problem: Form Not Submitting

The original test filled the form but didn't actually submit successfully because:
1. **Wrong sakstype values** - Used code "FTRL" instead of label "EU/EØS-land"
2. **Missing country selection** - "Velg minst ett land" validation error
3. **Missing søknadsperiode** - "Må fylles ut" validation error on Fra/Til dates

### Solution

Updated `pages/journalforing/journalforing.page.ts` to:
1. Use correct dropdown labels (discovered via debug test)
2. Add `velgLand()` method to select country from combobox
3. Add `fyllSoknadsperiode()` method to fill required dates
4. Auto-fill these fields in `opprettNySakOgJournalfør()` when visible

### Form Structure Discovered

```
Journalføring form:
├── Sakstype dropdown: "EU/EØS-land" | "Avtaleland" | "Utenfor avtaleland"
├── Sakstema dropdown: "Medlemskap og lovvalg" | "Unntak" | "Trygdeavgift"
├── Behandlingstema dropdown: (multiple options based on sakstema)
├── Behandlingstype dropdown: "Førstegangsbehandling" | "Ny vurdering" | etc.
├── Land combobox (when behandlingstema is "Utsendt arbeidstaker...")
│   └── Type to filter, click to select (e.g., "Belgia")
├── Søknadsperiode fieldset
│   ├── Fra date input (REQUIRED)
│   └── Til date input
└── Journalfør button
```

## Next Steps

### 1. Test SED Journalføring (JFR_MOTTATT_SED)

For incoming SED journalføring, we need:
1. Send a SED via mock service that creates a journalpost
2. Navigate to the journalføring for that SED
3. Complete the journalføring flow

Current `sed-helper.ts` sends SEDs but may not create journalposter in the expected format.

## Files Modified

| File | Status |
|------|--------|
| `tests/core/journalforing.spec.ts` | ✅ Updated - test now completes full flow |
| `pages/journalforing/journalforing.page.ts` | ✅ Updated - country & date methods added |
| `helpers/sed-helper.ts` | ⏳ Investigate SED -> journalpost flow for JFR_MOTTATT_SED |

## How to Test Locally

```bash
# Run journalforing tests
npx playwright test tests/core/journalforing.spec.ts --reporter=list

# Run single test with traces
npx playwright test -g "opprette ny sak" --trace on

# View trace
npx playwright show-trace test-results/.../trace.zip

# Run in UI mode for debugging
npx playwright test tests/core/journalforing.spec.ts --ui
```

## Metrics Endpoint

Check process types after tests:
```bash
curl http://localhost:8080/actuator/prometheus | grep melosys_prosessinstanser_opprettet_total
```

Expected to see after completing journalføring flow:
```
melosys_prosessinstanser_opprettet_total{type="JFR_NY_SAK_BRUKER"} 1
```

## Related Documentation

- `CLAUDE.md` - Project overview and commands
- `docs/pom/MIGRATION-PLAN.md` - Page Object Model patterns
- `docs/guides/FIXTURES.md` - Test fixtures and cleanup
