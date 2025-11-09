# § 2-8 første ledd bokstav b (student) - Discovery Notes

**Date:** 2025-11-09
**Bestemmelse Code:** `FTRL_KAP2_2_8_FØRSTE_LEDD_B`
**Display Name:** § 2-8 første ledd bokstav b (student)

## Discovery Summary

§ 2-8 b follows a **4-question conditional pattern** (different from § 2-8 a which has 3 questions).

## Questions Discovered

### Question 1 (Always appears)
"Har du kommet frem til at søker ikke er omfattet av et annet lands trygdelovgivning, etter en avtale som hindrer frivillig medlemskap?"

### Question 2 (Conditional: appears if Q1 = Ja)
"Er søker student ved universitet eller høgskole?"

### Question 3 (Conditional: appears if Q1 = Ja AND Q2 = Ja)
"Har søker vært medlem i minst tre av de fem siste kalenderårene?"

### Question 4 (Conditional: appears if Q1 = Ja AND Q2 = Ja AND Q3 = Ja)
"Har søker nær tilknytning til det norske samfunnet?"

## Conditional Logic

- **Q1** always appears
- **Q2** appears only if Q1 = "Ja"
- **Q3** appears only if Q1 = "Ja" AND Q2 = "Ja"
- **Q4** appears only if Q1 = "Ja" AND Q2 = "Ja" AND Q3 = "Ja"
- Any "Nei" answer blocks progression and hides subsequent questions

## Scenarios Tested

### Valid Scenario (Can Proceed)
| Q1 | Q2 | Q3 | Q4 | Result | Button State |
|----|----|----|----|---------|----|
| Ja | Ja | Ja | Ja | ✅ CAN PROCEED | "Bekreft og fortsett" enabled |

### Blocking Scenarios
| Q1 | Q2 | Q3 | Q4 | Result | Warning Message |
|----|----|----|----|--------|-----------------|
| Nei | - | - | - | ❌ BLOCKED | "Du kan ikke gå videre, men:" + instructions |
| Ja | Nei | - | - | ❌ BLOCKED | "Du kan ikke gå videre, men:" + instructions |
| Ja | Ja | Nei | - | ❌ BLOCKED | "Du kan ikke gå videre, men:" + instructions |
| Ja | Ja | Ja | Nei | ❌ BLOCKED | "Du kan ikke gå videre, men:" + instructions |

## Warning Message

When blocked, the following warning appears:

```
Du kan ikke gå videre, men:
• du kan bruke "Send brev"-fanen for å sende brev og vedtak, og "Opprett ny BUC"-fanen for å sende SED
• du må avslutte behandlingen og angi resultatet i behandlingsmenyen
• periode i MEDL og eventuelt avgiftssystemet må registreres manuelt
```

**Note:** This is the **same warning message** as § 2-8 a.

## Comparison with § 2-8 a

### Similarities
- Conditional question pattern (questions appear based on previous answers)
- Any "Nei" answer blocks progression
- Same warning message text
- Same "Bekreft og fortsett" button behavior

### Differences
- **Number of questions:** § 2-8 b has **4 questions** vs § 2-8 a has **3 questions**
- **Question content:** Different questions specific to student scenarios
- **Question 2 wording:** § 2-8 b asks about being a student, § 2-8 a asks about work
- **Additional Question 4:** § 2-8 b has an extra question about "nær tilknytning til det norske samfunnet"

## Test Strategy

### Files to Update
- `tests/utenfor-avtaleland/lovvalg-validations.spec.ts` - Add valid scenario test
- `tests/utenfor-avtaleland/lovvalg-blocking-scenarios.spec.ts` - Add 4 blocking scenario tests

### Test Cases to Implement

#### Valid Scenario Test (1 test)
```typescript
test('§ 2-8 b: Valid - All Ja answers - Can proceed', async ({ page }) => {
  // Q1=Ja, Q2=Ja, Q3=Ja, Q4=Ja
  // Verify: Button enabled, no warning
});
```

#### Blocking Scenario Tests (4 tests)
```typescript
test('§ 2-8 b: BLOCKED - Question 1 = Nei', async ({ page }) => {
  // Q1=Nei
  // Verify: Button disabled, warning shown
});

test('§ 2-8 b: BLOCKED - Q1 = Ja, Q2 = Nei', async ({ page }) => {
  // Q1=Ja, Q2=Nei
  // Verify: Button disabled, warning shown
});

test('§ 2-8 b: BLOCKED - Q1 = Ja, Q2 = Ja, Q3 = Nei', async ({ page }) => {
  // Q1=Ja, Q2=Ja, Q3=Nei
  // Verify: Button disabled, warning shown
});

test('§ 2-8 b: BLOCKED - Q1 = Ja, Q2 = Ja, Q3 = Ja, Q4 = Nei', async ({ page }) => {
  // Q1=Ja, Q2=Ja, Q3=Ja, Q4=Nei
  // Verify: Button disabled, warning shown
});
```

## Page Object Methods Needed

### Existing Methods (from § 2-8 a)
- `velgBestemmelse(code)` ✅
- `svarJaPaaFørsteSpørsmål()` ✅
- `svarNeiPaaFørsteSpørsmål()` ✅
- `svarJaPaaSpørsmålIGruppe(text)` ✅
- `svarNeiPaaSpørsmålIGruppe(text)` ✅
- `assertions.verifiserAdvarselsmelding(text)` ✅
- `assertions.verifiserBekreftKnappDeaktivert()` ✅
- `assertions.verifiserBekreftKnappAktiv()` ✅
- `assertions.verifiserIngenAdvarsler()` ✅

All existing methods should work! No new methods needed.

## Implementation Notes

1. **Reuse existing test structure** from § 2-8 a tests
2. **Key differences to handle:**
   - 4 questions instead of 3
   - Different question texts for Q2, Q3, Q4
   - Use `svarJaPaaSpørsmålIGruppe()` and `svarNeiPaaSpørsmålIGruppe()` with exact question text
3. **Expected time:** ~2 hours (faster than § 2-8 a since pattern is established)

## Next Steps

1. ✅ Discovery complete
2. ⏳ Add tests to `lovvalg-validations.spec.ts` (1 test)
3. ⏳ Add tests to `lovvalg-blocking-scenarios.spec.ts` (4 tests)
4. ⏳ Run tests and verify all pass
5. ⏳ Update `LOVVALG-VALIDATION-MATRIX.md`
6. ⏳ Update progress tracker in `BESTEMMELSE-TESTING-CONTINUATION-GUIDE.md`
