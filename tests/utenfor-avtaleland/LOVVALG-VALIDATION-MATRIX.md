# Lovvalg Validation Matrix

## Overview

Complete validation matrix for Lovvalg (Bestemmelse) step in "Utenfor avtaleland" flow. This documents all tested scenarios, their expected behaviors, warning messages, and button states.

**Test files:**
- `lovvalg-validations.spec.ts` - Valid scenarios (1 test)
- `lovvalg-blocking-scenarios.spec.ts` - Blocking scenarios (3 tests)

**Page objects:**
- `pages/behandling/lovvalg.page.ts` - Actions
- `pages/behandling/lovvalg.assertions.ts` - Assertions

## Bestemmelse: § 2-8 første ledd bokstav a (arbeidstaker)

Code: `FTRL_KAP2_2_8_FØRSTE_LEDD_A`

### Conditional Questions Flow

The questions appear conditionally based on previous answers:

1. **Question 1** (always appears):
   - "Har du kommet frem til at søker ikke er omfattet av et annet lands trygdelovgivning, etter en avtale som hindrer frivillig medlemskap?"

2. **Question 2** (only if Q1 = "Ja"):
   - "Har søker vært medlem i minst tre av de fem siste kalenderårene?"

3. **Question 3** (only if Q1 = "Ja" AND Q2 = "Ja"):
   - "Har søker nær tilknytning til det norske samfunnet?"

### Blocking Scenarios

Any "Nei" answer blocks progression with the same warning message.

| Scenario | Q1 | Q2 | Q3 | Result | Warning | Button | Test File |
|----------|----|----|----|----|---------|--------|-----------|
| 1 | Nei | - | - | ❌ BLOCKED | Yes | Disabled | `lovvalg-blocking-scenarios.spec.ts:59` |
| 2 | Ja | Nei | - | ❌ BLOCKED | Yes | Disabled | `lovvalg-blocking-scenarios.spec.ts:84` |
| 3 | Ja | Ja | Nei | ❌ BLOCKED | Yes | Disabled | `lovvalg-blocking-scenarios.spec.ts:113` |

**Warning Message:**
```
Du kan ikke gå videre, men:
- du kan bruke "Send brev"-fanen for å sende brev og vedtak, og "Opprett ny BUC"-fanen for å sende SED
- du må avslutte behandlingen og angi resultatet i behandlingsmenyen
- periode i MEDL og eventuelt avgiftssystemet må registreres manuelt
```

**Warning Type:** Yellow alert box with `img "Advarsel"`

### Valid Scenarios

| Scenario | Q1 | Q2 | Q3 | Result | Warning | Button | Test File |
|----------|----|----|----|----|---------|--------|-----------|
| All Ja | Ja | Ja | Ja | ✅ CAN PROCEED | None | Enabled | `lovvalg-validations.spec.ts:59` |

## Test Results Summary

**Date:** 2025-11-09

### lovvalg-validations.spec.ts
- ✅ Scenario 1: § 2-8 a + All Ja answers - Can proceed **(11.7s)**
- **Total:** 1 passed

### lovvalg-blocking-scenarios.spec.ts
- ✅ BLOCKED: Question 1 = Nei - Blocks progression **(11.8s)**
- ✅ BLOCKED: Question 1 = Ja, Question 2 = Nei - Blocks progression **(11.7s)**
- ✅ BLOCKED: Questions 1 & 2 = Ja, Question 3 = Nei - Blocks progression **(12.0s)**
- **Total:** 3 passed **(36.5s)**

**All tests:** 4 passed

## Key Differences: Lovvalg vs. Trygdeavgift

### Warning vs. Error

**Lovvalg (this implementation):**
- **Yellow warning boxes** - Valid input but blocks normal flow
- User must take alternative path (Send brev, Opprett BUC, etc.)
- Not a mistake by the user, but a logical endpoint in the flow

**Trygdeavgift:**
- **Red error boxes** - Invalid input combinations
- User made a mistake and needs to fix the input
- Validation errors that prevent proceeding

### UI Elements

**Lovvalg:**
- Yellow alert box with img "Advarsel"
- Lists alternative actions
- Disabled "Bekreft og fortsett" button
- Message starts with "Du kan ikke gå videre, men:"

**Trygdeavgift:**
- Red error box
- Error message about invalid combination
- Disabled "Bekreft og fortsett" button
- Messages like "kan ikke velges", "påkrevd", "ugyldig"

## Implementation Details

### Page Object Methods (LovvalgPage)

```typescript
// Actions
await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
await lovvalg.svarJaPaaFørsteSpørsmål();
await lovvalg.svarNeiPaaFørsteSpørsmål(); // NEW - for blocking scenarios
await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
await lovvalg.svarNeiPaaSpørsmålIGruppe('Har søker nær tilknytning til');
await lovvalg.klikkBekreftOgFortsett();
```

### Assertion Methods (LovvalgAssertions)

```typescript
// Assertions
await lovvalg.assertions.verifiserAdvarselsmelding('Du kan ikke gå videre');
await lovvalg.assertions.verifiserAlternativeHandlinger();
await lovvalg.assertions.verifiserBekreftKnappDeaktivert();
await lovvalg.assertions.verifiserBekreftKnappAktiv();
await lovvalg.assertions.verifiserIngenAdvarsler();
await lovvalg.assertions.verifiserSideLastet();
```

### Helper Function

```typescript
async function setupBehandlingToLovvalg(page: Page): Promise<LovvalgPage> {
  // Creates case
  // Fills Medlemskap (Afghanistan, FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON)
  // Fills Arbeidsforhold (Ståles Stål AS)
  // Returns LovvalgPage ready for testing
}
```

## Warning Message Filtering

The `verifiserAdvarselsmelding()` method uses smart filtering to exclude UI noise:

**Excluded patterns:**
- Date picker elements (`/^Gå til/i`, `/^Måned/i`, `/^Åpne datovelger/i`)
- Help text (`/hjelpetekst/i`)
- Common UI labels (`/^Velg/i`, `/^Fra og med/i`, `/^Til og med/i`)

**Included patterns:**
- Warning keywords: `/kan ikke gå videre|må avslutte|Send brev|Opprett ny BUC|periode i MEDL/i`
- Reasonable length: `10 < length < 500`

**Result:**
- Filters out ~0-2 UI noise elements per page
- Captures 8 actual warning messages
- Reports exact matches to expected text

## Future Testing Recommendations

### Other Bestemmelser to Test

The following bestemmelser may have similar conditional logic and blocking scenarios:

1. **§ 2-1** (bosatt i Norge)
2. **§ 2-2** (arbeidstaker i Norge)
3. **§ 2-7 første ledd** (opphold i Norge)
4. **§ 2-8 første ledd bokstav b** (student)
5. **§ 2-8 andre ledd** (særlig grunn)

**Testing strategy:**
1. Use Playwright MCP to discover questions for each bestemmelse
2. Test all combinations of Ja/Nei answers
3. Document which combinations block vs. allow progression
4. Create test scenarios for each bestemmelse
5. Update this validation matrix

### Additional Scenarios

1. **Multiple bestemmelse selections** - Test switching between different bestemmelser
2. **Back button behavior** - Verify state preservation when going back
3. **Alternative actions** - Test "Send brev", "Opprett BUC" tabs when blocked
4. **Error handling** - Test behavior when API calls fail

## Files Created

1. ✅ `pages/behandling/lovvalg.assertions.ts` - Assertion methods
2. ✅ `pages/behandling/lovvalg.page.ts` - Enhanced with assertions + svarNeiPaaFørsteSpørsmål
3. ✅ `tests/utenfor-avtaleland/lovvalg-validations.spec.ts` - Valid scenarios
4. ✅ `tests/utenfor-avtaleland/lovvalg-blocking-scenarios.spec.ts` - Blocking scenarios
5. ✅ `tests/utenfor-avtaleland/LOVVALG-DISCOVERY-RESULTS.md` - Discovery session notes
6. ✅ `tests/utenfor-avtaleland/LOVVALG-VALIDATION-MATRIX.md` - This file

## References

- **Workplan:** `tests/utenfor-avtaleland/BESTEMMELSE-VALIDATION-WORKPLAN.md`
- **Discovery Results:** `tests/utenfor-avtaleland/LOVVALG-DISCOVERY-RESULTS.md`
- **Trygdeavgift Implementation:** `tests/utenfor-avtaleland/trygdeavgift-*.spec.ts`
- **Page Objects:** `pages/behandling/lovvalg.page.ts`, `pages/behandling/lovvalg.assertions.ts`

## Success Criteria

- ✅ LovvalgPage enhanced with new methods
- ✅ LovvalgAssertions created with warning verification
- ✅ All blocking scenarios discovered via Playwright MCP
- ✅ All valid scenarios documented
- ✅ Test files created (validations + blocking scenarios)
- ✅ All tests pass (4/4)
- ✅ Complete validation matrix documented
- ✅ Warning message filtering works (excludes UI noise)

**Status:** ✅ ALL SUCCESS CRITERIA MET
