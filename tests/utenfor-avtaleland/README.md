# Utenfor Avtaleland - Test Suite

End-to-end tests for the "Utenfor avtaleland" (Outside Agreement Countries) workflow in Melosys.

## Test Structure

### Trygdeavgift (Tax Calculation)

Tests for tax calculation validation and error scenarios.

**Test Files:**
- `trygdeavgift-validations.spec.ts` - Valid tax calculation scenarios (14 tests)
- `trygdeavgift-validation-errors.spec.ts` - Invalid input combinations (5 tests)

**Documentation:**
- [TRYGDEAVGIFT-VALIDATION-MATRIX.md](./TRYGDEAVGIFT-VALIDATION-MATRIX.md) - Complete validation rules and tax calculations
- [TRYGDEAVGIFT-VALIDATION-README.md](./TRYGDEAVGIFT-VALIDATION-README.md) - Quick reference and how to run tests

**Page Objects:**
- `pages/behandling/trygdeavgift.page.ts` - Actions
- `pages/behandling/trygdeavgift.assertions.ts` - Assertions

### Lovvalg (Law Selection)

Tests for bestemmelse (regulation) selection and conditional validation.

**Test Files:**
- `lovvalg-validations.spec.ts` - Valid scenarios (4 tests)
- `lovvalg-blocking-scenarios.spec.ts` - Blocking/warning scenarios (10 tests)

**Documentation:**
- [LOVVALG-VALIDATION-MATRIX.md](./LOVVALG-VALIDATION-MATRIX.md) - Complete validation matrix for all tested bestemmelser

**Discovery Notes:**
- [LOVVALG-DISCOVERY-RESULTS.md](./LOVVALG-DISCOVERY-RESULTS.md) - § 2-8 a (arbeidstaker)
- [LOVVALG-2-8-B-DISCOVERY.md](./LOVVALG-2-8-B-DISCOVERY.md) - § 2-8 b (student)
- [LOVVALG-2-8-ANDRE-LEDD-DISCOVERY.md](./LOVVALG-2-8-ANDRE-LEDD-DISCOVERY.md) - § 2-8 andre ledd (særlig grunn)

**Page Objects:**
- `pages/behandling/lovvalg.page.ts` - Actions
- `pages/behandling/lovvalg.assertions.ts` - Assertions

### Discovery Scripts

Automated tools for discovering questions and validation patterns.

**Scripts:**
- `discover-all-bestemmelser.spec.ts` - Lists all available bestemmelser
- `automated-bestemmelse-discovery.spec.ts` - Tests all Ja/Nei combinations systematically

## Tested Bestemmelser

### § 2-8 første ledd bokstav a (arbeidstaker)
- **Code:** `FTRL_KAP2_2_8_FØRSTE_LEDD_A`
- **Questions:** 3 (conditional)
- **Tests:** 1 valid + 3 blocking = 4 tests

### § 2-8 første ledd bokstav b (student)
- **Code:** `FTRL_KAP2_2_8_FØRSTE_LEDD_B`
- **Questions:** 4 (conditional)
- **Tests:** 1 valid + 4 blocking = 5 tests

### § 2-8 andre ledd (særlig grunn)
- **Code:** `FTRL_KAP2_2_8_ANDRE_LEDD`
- **Questions:** 3 (conditional) + 1 dropdown (8 options)
- **Tests:** 2 valid + 3 blocking = 5 tests

## Running Tests

### Run all tests
```bash
npm test tests/utenfor-avtaleland/
```

### Run specific feature
```bash
# Trygdeavgift tests
npm test tests/utenfor-avtaleland/trygdeavgift-validations.spec.ts
npm test tests/utenfor-avtaleland/trygdeavgift-validation-errors.spec.ts

# Lovvalg tests
npm test tests/utenfor-avtaleland/lovvalg-validations.spec.ts
npm test tests/utenfor-avtaleland/lovvalg-blocking-scenarios.spec.ts
```

### Run specific test
```bash
npx playwright test "Scenario 1: § 2-8 a + All Ja answers" --project=chromium --reporter=list --workers=1
```

## Test Results Summary

**Trygdeavgift:** 19 tests
- ✅ 14 valid scenarios
- ❌ 5 validation error scenarios

**Lovvalg:** 14 tests
- ✅ 4 valid scenarios (allow proceeding)
- ⚠️ 10 blocking scenarios (show warnings)

**Total:** 33 tests covering Utenfor avtaleland workflow

## Key Patterns

### Conditional Questions (Lovvalg)
Questions appear conditionally based on previous answers. Any "Nei" answer blocks progression and shows warning message:
```
Du kan ikke gå videre, men:
- du kan bruke "Send brev"-fanen for å sende brev og vedtak...
- du må avslutte behandlingen og angi resultatet i behandlingsmenyen
- periode i MEDL og eventuelt avgiftssystemet må registreres manuelt
```

### Validation Errors (Trygdeavgift)
Invalid input combinations show red error messages and disable the "Bekreft og fortsett" button.

### Valid Scenarios
All valid scenarios:
- Show no warnings or errors
- Enable "Bekreft og fortsett" button
- Allow progression to next step

## Future Work

Additional bestemmelser to test:
1. § 2-1 (bosatt i Norge)
2. § 2-2 (arbeidstaker i Norge)
3. § 2-7 første ledd (opphold i Norge)
4. § 2-7a (bosatt i Norge, arbeid på utenlandsk skip)

Use the discovery scripts to systematically explore questions and validation patterns.
