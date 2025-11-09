# Utenfor Avtaleland - Test Suite

End-to-end tests for the "Utenfor avtaleland" (Outside Agreement Countries) workflow in Melosys.

## 📁 Folder Structure

```
tests/utenfor-avtaleland/
├── workflows/              # Complete E2E user journeys
├── lovvalg/               # Lovvalg validation tests
├── trygdeavgift/          # Trygdeavgift validation tests
├── discovery/             # Discovery & exploration tools
├── api/                   # API-only tests
└── docs/                  # Documentation
    ├── lovvalg/
    └── trygdeavgift/
```

## 🔄 Workflows (Complete E2E Tests)

Full user journeys from case creation to vedtak.

**Test Files:**
- `workflows/complete-case-with-2-8a.spec.ts` - Standard case using § 2-8 a (arbeidstaker)
- `workflows/annual-settlement-non-tax-liable.spec.ts` - Creates årsavregning for non-tax-liable users
- `workflows/reassessment-tax-status-change.spec.ts` - Tax status changes via ny vurdering (2 tests)

**Run workflows:**
```bash
npm test tests/utenfor-avtaleland/workflows/
```

## ⚖️ Lovvalg (Law Selection) Tests

Tests for bestemmelse (regulation) selection and conditional validation.

**Test Files:**
- `lovvalg/valid-scenarios.spec.ts` - Valid scenarios (4 tests)
- `lovvalg/blocking-scenarios.spec.ts` - Blocking/warning scenarios (10 tests)

**Documentation:**
- [lovvalg/LOVVALG-VALIDATION-MATRIX.md](./lovvalg/LOVVALG-VALIDATION-MATRIX.md) - Complete validation matrix
- [lovvalg/LOVVALG-DISCOVERY-RESULTS.md](./lovvalg/LOVVALG-DISCOVERY-RESULTS.md) - § 2-8 a discovery
- [lovvalg/LOVVALG-2-8-B-DISCOVERY.md](./lovvalg/LOVVALG-2-8-B-DISCOVERY.md) - § 2-8 b discovery
- [lovvalg/LOVVALG-2-8-ANDRE-LEDD-DISCOVERY.md](./lovvalg/LOVVALG-2-8-ANDRE-LEDD-DISCOVERY.md) - § 2-8 andre ledd discovery

**Page Objects:**
- `pages/behandling/lovvalg.page.ts` - Actions
- `pages/behandling/lovvalg.assertions.ts` - Assertions

**Run lovvalg tests:**
```bash
npm test tests/utenfor-avtaleland/lovvalg/
```

## 💰 Trygdeavgift (Tax Calculation) Tests

Tests for tax calculation validation and error scenarios.

**Test Files:**
- `trygdeavgift/valid-scenarios.spec.ts` - Valid tax calculation scenarios (14 tests)
- `trygdeavgift/validation-errors.spec.ts` - Invalid input combinations (5 tests)

**Documentation:**
- [trygdeavgift/TRYGDEAVGIFT-VALIDATION-MATRIX.md](./trygdeavgift/TRYGDEAVGIFT-VALIDATION-MATRIX.md) - Complete validation rules
- [trygdeavgift/TRYGDEAVGIFT-VALIDATION-README.md](./trygdeavgift/TRYGDEAVGIFT-VALIDATION-README.md) - Quick reference

**Page Objects:**
- `pages/trygdeavgift/trygdeavgift.page.ts` - Actions
- `pages/trygdeavgift/trygdeavgift.assertions.ts` - Assertions

**Run trygdeavgift tests:**
```bash
npm test tests/utenfor-avtaleland/trygdeavgift/
```

## 🔍 Discovery Scripts

Automated tools for discovering questions and validation patterns.

**Scripts:**
- `discovery/list-all-bestemmelser.spec.ts` - Lists all available bestemmelser
- `discovery/automated-discovery.spec.ts` - Tests all Ja/Nei combinations systematically

**Run discovery:**
```bash
npm test tests/utenfor-avtaleland/discovery/
```

## 🔌 API Tests

Direct API tests without UI interaction.

**Test Files:**
- `api/admin-ikke-skattepliktig.spec.ts` - Admin API for non-tax-liable cases

**Run API tests:**
```bash
npm test tests/utenfor-avtaleland/api/
```

## 📊 Test Coverage Summary

### Lovvalg - Tested Bestemmelser

| Bestemmelse | Code | Questions | Tests |
|-------------|------|-----------|-------|
| § 2-8 a (arbeidstaker) | `FTRL_KAP2_2_8_FØRSTE_LEDD_A` | 3 (conditional) | 1 valid + 3 blocking |
| § 2-8 b (student) | `FTRL_KAP2_2_8_FØRSTE_LEDD_B` | 4 (conditional) | 1 valid + 4 blocking |
| § 2-8 andre ledd | `FTRL_KAP2_2_8_ANDRE_LEDD` | 3 + 1 dropdown (8 options) | 2 valid + 3 blocking |

### Test Counts

- **Workflows:** 4 tests (3 files)
- **Lovvalg:** 14 tests (4 valid + 10 blocking)
- **Trygdeavgift:** 19 tests (14 valid + 5 validation errors)
- **Discovery:** 2 scripts
- **API:** 2 tests

**Total:** 39 tests covering Utenfor avtaleland workflow

## 🚀 Running Tests

### Run all tests
```bash
npm test tests/utenfor-avtaleland/
```

### Run by category
```bash
# Workflows
npm test tests/utenfor-avtaleland/workflows/

# Lovvalg
npm test tests/utenfor-avtaleland/lovvalg/

# Trygdeavgift
npm test tests/utenfor-avtaleland/trygdeavgift/
```

### Run specific test
```bash
npx playwright test "§ 2-8 a (arbeidstaker): All Ja answers should allow proceeding" --project=chromium --reporter=list --workers=1
```

## 🔑 Key Testing Patterns

### Conditional Questions (Lovvalg)
Questions appear conditionally based on previous answers. Any "Nei" answer blocks progression and shows warning:

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

## 📝 Future Work

Additional bestemmelser to test:
1. § 2-1 (bosatt i Norge)
2. § 2-2 (arbeidstaker i Norge)
3. § 2-7 første ledd (opphold i Norge)
4. § 2-7a (bosatt i Norge, arbeid på utenlandsk skip)

Use the discovery scripts in `discovery/` to systematically explore questions and validation patterns.
