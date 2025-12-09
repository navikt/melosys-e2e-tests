# Journalføring Test Status and Next Steps

## Overview

This document tracks the work done on journalføring e2e tests and what's needed to complete them.

## Current Status (2025-12-09)

### Branch
`feature/tier1-core-tests-with-metrics`

### Tests Created and Passing

| Test File | Tests | Status |
|-----------|-------|--------|
| `tests/core/journalforing.spec.ts` | 5 | ✅ All pass |
| `tests/core/oppgaver.spec.ts` | 5 | ✅ All pass |
| `tests/core/sok-og-navigasjon.spec.ts` | 5 | ✅ All pass |
| `tests/core/sed-mottak.spec.ts` | 6 | ✅ All pass |

### Key Infrastructure Added

1. **`helpers/mock-helper.ts`** - Added `createJournalforingOppgaver()` function
   ```typescript
   // Creates journalføring oppgaver via mock service
   await createJournalforingOppgaver(request, { antall: 1 });
   ```
   - Uses endpoint: `POST http://localhost:8083/testdata/jfr-oppgave`
   - Options: `antall`, `forVirksomhet`, `medVedlegg`, `medLogiskVedlegg`, `tilordnetRessurs`

2. **`pages/journalforing/journalforing.page.ts`** - Page Object for journalføring
   - `velgOpprettNySak()` - Select "Opprett ny sak" radio
   - `velgKnyttTilEksisterende()` - Select "Knytt til sak" radio
   - `fyllSakstype()` - Fill sakstype dropdown
   - `journalførDokument()` - Click journalfør button
   - `opprettNySakOgJournalfør()` - Complete OPPRETT workflow

3. **`pages/journalforing/journalforing.assertions.ts`** - Assertions for journalføring

## Missing: JFR Process Types Not Being Triggered

The metrics show these process types are **NOT** being triggered:

| Process Type | Description | What triggers it |
|--------------|-------------|------------------|
| `JFR_NY_SAK_BRUKER` | Journalføring creates new case | Complete "Opprett ny sak" flow in UI |
| `JFR_MOTTATT_SED` | Incoming SED document journalføring | Process received SED from EESSI |
| `JFR_UTGAAENDE_SED` | Outgoing SED document journalføring | Send SED to EESSI |

### Why They're Not Triggered

The current tests:
1. Create journalføring oppgaver via mock service ✅
2. Navigate to journalføring page ✅
3. View the journalføring form ✅
4. **BUT**: Don't complete the full submission flow ❌

The mock service creates oppgaver directly in the mock database, bypassing melosys-api's process instance flow.

## Next Steps to Complete

### 1. Complete JFR_NY_SAK_BRUKER Flow

Update `tests/core/journalforing.spec.ts` test "skal kunne opprette ny sak fra journalpost":

```typescript
test('skal kunne opprette ny sak fra journalpost', async ({ page, request }) => {
  // Step 1: Create journalføring oppgave
  await createJournalforingOppgaver(request, { antall: 1 });

  // Step 2: Navigate to forside and open journalføring
  await hovedside.goto();
  await oppgaver.ventPåOppgaverLastet();
  await oppgaver.klikkJournalforingOppgaveIndex(0);
  await journalforing.ventPåSkjemaLastet();

  // Step 3: Select "Opprett ny sak" option
  await journalforing.velgOpprettNySak();

  // Step 4: Fill required fields
  await journalforing.fyllSakstype('FTRL');
  // May need: sakstema, behandlingstema, behandlingstype

  // Step 5: Submit journalføring - THIS IS THE MISSING PART
  await journalforing.journalførDokument();

  // Step 6: Wait for process to complete
  await waitForProcessInstances(request, 30);

  // Step 7: Verify JFR_NY_SAK_BRUKER was triggered
  // Check metrics or verify case was created
});
```

### 2. Investigate JFR Form Requirements

The journalføring form may require different fields based on:
- The journalpost type (søknad, brev, etc.)
- The selected action (OPPRETT, KNYTT, NY_VURDERING)
- The sakstype (FTRL, EU_EOS, TRYGDEAVTALE)

Need to:
1. Use Playwright UI mode to inspect the actual form
2. Identify all required fields
3. Update page object methods accordingly

Run in UI mode:
```bash
npx playwright test tests/core/journalforing.spec.ts -g "opprette ny sak" --ui
```

### 3. Fix Dropdown Selection

Current issue: Some dropdowns may not populate immediately. The `waitForDropdownToPopulate` method exists but may need adjustment:

```typescript
// In journalforing.page.ts
async fyllSakstype(sakstype: string): Promise<void> {
  await this.sakstypeDropdown.waitFor({ state: 'visible', timeout: 5000 });
  // Wait for dropdown to have values
  await this.waitForDropdownToPopulate(this.sakstypeDropdown);
  await this.sakstypeDropdown.selectOption(sakstype);
}
```

### 4. Test SED Journalføring (JFR_MOTTATT_SED)

For incoming SED journalføring, we need:
1. Send a SED via mock service that creates a journalpost
2. Navigate to the journalføring for that SED
3. Complete the journalføring flow

Current `sed-helper.ts` sends SEDs but may not create journalposter in the expected format.

## Files to Modify

| File | Changes Needed |
|------|----------------|
| `tests/core/journalforing.spec.ts` | Complete the submission flow in tests |
| `pages/journalforing/journalforing.page.ts` | May need more field methods |
| `helpers/sed-helper.ts` | Investigate SED -> journalpost flow |

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
