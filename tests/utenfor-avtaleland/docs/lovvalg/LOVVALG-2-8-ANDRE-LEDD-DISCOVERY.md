# § 2-8 andre ledd (særlig grunn) - Discovery Notes

**Date:** 2025-11-09
**Bestemmelse Code:** `FTRL_KAP2_2_8_ANDRE_LEDD`
**Display Name:** § 2-8 andre ledd (særlig grunn)

## Discovery Summary

§ 2-8 andre ledd follows a **3-question + 1 dropdown pattern** - unique compared to § 2-8 a (3 questions) and § 2-8 b (4 questions).

## Questions Discovered

### Question 1 (Always appears)
"Har du kommet frem til at søker ikke er omfattet av et annet lands trygdelovgivning, etter en avtale som hindrer frivillig medlemskap?"

### Question 2 (Conditional: appears if Q1 = Ja)
"Har søker vært medlem i minst tre av de fem siste kalenderårene?"

### Question 3 (Conditional: appears if Q1 = Ja AND Q2 = Ja)
"Har søker nær tilknytning til det norske samfunnet?"

### Dropdown 4 (Conditional: appears if Q1 = Ja AND Q2 = Ja AND Q3 = Ja)
**Label:** "Særlig grunn"

**Options:**
1. "Arbeid i mor- eller søsterselskap i multinasjonalt konsern"
2. "Arbeid i internasjonal org. som Norge er medlem av"
3. "Medfølgende som arbeider på hjemmekontor"
4. "Arbeid for norsk virksomhet på utenlandskregistrert skip"
5. "Humanitært arbeid som finansieres av norske kilder"
6. "Aupair, begrenset periode"
7. "Praktikant, begrenset periode"
8. "Annen grunn (fritekst)"

## Conditional Logic

- **Q1** always appears
- **Q2** appears only if Q1 = "Ja"
- **Q3** appears only if Q1 = "Ja" AND Q2 = "Ja"
- **Dropdown** appears only if Q1 = "Ja" AND Q2 = "Ja" AND Q3 = "Ja"
- Any "Nei" answer blocks progression and hides subsequent questions

## Scenarios Tested

### Valid Scenario (Can Proceed)
| Q1 | Q2 | Q3 | Særlig grunn | Result | Button State |
|----|----|----|--------------|---------|--------------|
| Ja | Ja | Ja | (any option selected) | ✅ CAN PROCEED | "Bekreft og fortsett" enabled |

### Blocking Scenarios
| Q1 | Q2 | Q3 | Særlig grunn | Result | Warning Message |
|----|----|----|--------------|----|-----------------|
| Nei | - | - | - | ❌ BLOCKED | "Du kan ikke gå videre, men:" + instructions |
| Ja | Nei | - | - | ❌ BLOCKED | "Du kan ikke gå videre, men:" + instructions |
| Ja | Ja | Nei | - | ❌ BLOCKED | "Du kan ikke gå videre, men:" + instructions |

**Note:** If Q1=Ja, Q2=Ja, Q3=Ja but no "Særlig grunn" is selected, the button remains disabled (but no warning appears).

## Warning Message

When blocked by a "Nei" answer, the following warning appears:

```
Du kan ikke gå videre, men:
• du kan bruke "Send brev"-fanen for å sende brev og vedtak, og "Opprett ny BUC"-fanen for å sende SED
• du må avslutte behandlingen og angi resultatet i behandlingsmenyen
• periode i MEDL og eventuelt avgiftssystemet må registreres manuelt
```

**Note:** This is the **same warning message** as § 2-8 a and § 2-8 b.

## Comparison with Other § 2-8 Variants

### Similarities
- First 3 questions are the same pattern (conditional based on "Ja" answers)
- Q1 and Q2 are the same text as § 2-8 a
- Q3 is the same text as § 2-8 a and § 2-8 b (Q4)
- Any "Nei" answer blocks progression
- Same warning message text
- Same "Bekreft og fortsett" button behavior

### Differences from § 2-8 a (arbeidstaker)
- § 2-8 andre ledd has **3 yes/no questions + 1 dropdown**
- § 2-8 a has **only 3 yes/no questions**
- § 2-8 andre ledd requires selecting a "Særlig grunn" (special reason)

### Differences from § 2-8 b (student)
- § 2-8 andre ledd has **3 yes/no questions + 1 dropdown**
- § 2-8 b has **4 yes/no questions**
- § 2-8 b's Q2 is student-specific, § 2-8 andre ledd skips that and goes straight to membership question
- § 2-8 andre ledd requires selecting a "Særlig grunn"

## Test Strategy

### Files to Update
- `tests/utenfor-avtaleland/lovvalg-validations.spec.ts` - Add 8 valid scenario tests (one for each "Særlig grunn" option)
- `tests/utenfor-avtaleland/lovvalg-blocking-scenarios.spec.ts` - Add 3 blocking scenario tests

### Test Cases to Implement

#### Valid Scenario Tests (8 tests - one per dropdown option)
```typescript
test('§ 2-8 andre ledd: Valid - All Ja + Multinasjonalt konsern', async ({ page }) => {
  // Q1=Ja, Q2=Ja, Q3=Ja, Dropdown="Arbeid i mor- eller søsterselskap i multinasjonalt konsern"
  // Verify: Button enabled, no warning
});

test('§ 2-8 andre ledd: Valid - All Ja + Internasjonal org', async ({ page }) => {
  // Q1=Ja, Q2=Ja, Q3=Ja, Dropdown="Arbeid i internasjonal org. som Norge er medlem av"
  // Verify: Button enabled, no warning
});

// ... 6 more tests for the other dropdown options
```

#### Blocking Scenario Tests (3 tests)
```typescript
test('§ 2-8 andre ledd: BLOCKED - Question 1 = Nei', async ({ page }) => {
  // Q1=Nei
  // Verify: Button disabled, warning shown
});

test('§ 2-8 andre ledd: BLOCKED - Q1 = Ja, Q2 = Nei', async ({ page }) => {
  // Q1=Ja, Q2=Nei
  // Verify: Button disabled, warning shown
});

test('§ 2-8 andre ledd: BLOCKED - Q1 = Ja, Q2 = Ja, Q3 = Nei', async ({ page }) => {
  // Q1=Ja, Q2=Ja, Q3=Nei
  // Verify: Button disabled, warning shown
});
```

## Page Object Methods Needed

### Existing Methods (from § 2-8 a & b)
- `velgBestemmelse(code)` ✅
- `svarJaPaaFørsteSpørsmål()` ✅
- `svarNeiPaaFørsteSpørsmål()` ✅
- `svarJaPaaSpørsmålIGruppe(text)` ✅
- `svarNeiPaaSpørsmålIGruppe(text)` ✅
- `assertions.verifiserAdvarselsmelding(text)` ✅
- `assertions.verifiserBekreftKnappDeaktivert()` ✅
- `assertions.verifiserBekreftKnappAktiv()` ✅
- `assertions.verifiserIngenAdvarsler()` ✅

### New Methods Needed
```typescript
// In lovvalg.page.ts
async velgSærligGrunn(option: string): Promise<void> {
  await this.page.getByLabel('Særlig grunnSærlig grunn').selectOption([option]);
}
```

## Implementation Notes

1. **Reuse existing test structure** from § 2-8 a and § 2-8 b tests
2. **Add new method** for selecting "Særlig grunn" dropdown
3. **Key difference:** Need to test all 8 dropdown options (or at least 2-3 representative ones)
4. **Consider:** Testing "no dropdown selection" scenario (button should be disabled but no warning)
5. **Expected time:** ~3 hours (slightly longer due to dropdown testing)

## Særlig Grunn Options - Testing Strategy

**Option 1: Test all 8 options** (comprehensive but time-consuming)
- Pros: Complete coverage
- Cons: 8 additional tests

**Option 2: Test 2-3 representative options** (recommended)
- Test first option: "Arbeid i mor- eller søsterselskap i multinasjonalt konsern"
- Test middle option: "Humanitært arbeid som finansieres av norske kilder"
- Test last option: "Annen grunn (fritekst)"
- Pros: Reasonable coverage, faster
- Cons: Doesn't test all options

**Recommendation:** Start with Option 2 (2-3 options), can expand later if needed.

## Next Steps

1. ✅ Discovery complete
2. ⏳ Add `velgSærligGrunn()` method to `lovvalg.page.ts`
3. ⏳ Add tests to `lovvalg-validations.spec.ts` (2-3 valid scenario tests)
4. ⏳ Add tests to `lovvalg-blocking-scenarios.spec.ts` (3 blocking tests)
5. ⏳ Run tests and verify all pass
6. ⏳ Update `LOVVALG-VALIDATION-MATRIX.md`
7. ⏳ Update progress tracker in `BESTEMMELSE-TESTING-CONTINUATION-GUIDE.md`
