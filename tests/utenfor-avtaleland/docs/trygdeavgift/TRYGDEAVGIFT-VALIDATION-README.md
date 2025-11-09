# Trygdeavgift Validation Test Suite

This test suite comprehensively tests all validation scenarios on the Trygdeavgift page.

## Test File
`trygdeavgift-validations.spec.ts`

## What's Tested

### 8 Core Scenarios

| # | Skattepliktig | Inntektskilde | Betales AGA | Expected Result |
|---|--------------|---------------|-------------|-----------------|
| 1 | ❌ Nei | Utlandet | ❌ Nei | ✅ **Success** - Creates årsavregning |
| 2 | ❌ Nei | Utlandet | ✅ Ja | ⚠️ **Validation Error** |
| 3 | ❌ Nei | Norge | ❌ Nei | ⚠️ **Validation Error** |
| 4 | ❌ Nei | Norge | ✅ Ja | ⚠️ **Validation Error** |
| 5 | ✅ Ja | Utlandet | ❌ Nei | ❓ **Check behavior** |
| 6 | ✅ Ja | Utlandet | ✅ Ja | ✅ **Success** |
| 7 | ✅ Ja | Norge | ❌ Nei | ✅ **Success** (standard) |
| 8 | ✅ Ja | Norge | ✅ Ja | ✅ **Success** (standard) |

### Business Logic Rules

**Rule 1: Ikke Skattepliktig Requirements**
- ✅ **Valid**: `Ikke skattepliktig` + `Inntekt fra utlandet` + `Betales ikke AGA`
- ❌ **Invalid**: Any other combination with `Ikke skattepliktig`

**Rule 2: Skattepliktig Combinations**
- Most combinations are valid when `Skattepliktig = Ja`
- Standard flow: Norway income with or without AGA payment

## How to Run

### Run all validation tests
```bash
npm test tests/utenfor-avtaleland/trygdeavgift-validations.spec.ts
```

### Run specific scenario
```bash
# Scenario 1: Success case
npx playwright test "Scenario 1: Ikke skattepliktig + Inntekt fra utlandet + Betales ikke AGA" --project=chromium

# Scenario 2: Validation error case
npx playwright test "Scenario 2: Ikke skattepliktig + Inntekt fra utlandet + Betales AGA" --project=chromium

# Run validation summary test
npx playwright test "Validation Matrix Summary" --project=chromium
```

### Debug specific scenario
```bash
npx playwright test "Scenario 2" --debug
```

### Run in UI mode (best for development)
```bash
npm run test:ui tests/utenfor-avtaleland/trygdeavgift-validations.spec.ts
```

## Test Structure

### Common Setup Function
All tests use `setupBehandlingToTrygdeavgift()` which:
1. Logs in
2. Creates a new case
3. Fills Medlemskap page
4. Fills Arbeidsforhold page
5. Fills Lovvalg page
6. Fills Resultat Periode page
7. Returns ready at Trygdeavgift page

This ensures consistent starting state for all validation tests.

### Individual Test Structure
Each test:
1. Sets up to Trygdeavgift page
2. Selects specific combination of:
   - Skattepliktig (Ja/Nei)
   - Inntektskilde (Norge/Utlandet)
   - Betales AGA (Ja/Nei)
3. Fills bruttoinntekt
4. Clicks "Bekreft og fortsett"
5. Verifies expected result:
   - ✅ Success: Proceeds to Vedtak page
   - ⚠️ Error: Shows validation message

## Validation Error Detection

Tests check for validation errors using multiple selectors:
```typescript
const validationError = page.locator('.navds-error-message, .navds-alert--error, [role="alert"]');
await expect(validationError).toBeVisible({timeout: 5000});
```

## Special Test: Validation Matrix Summary

The final test runs multiple scenarios in sequence and collects all error messages:
- Reloads page between scenarios
- Captures exact error text for each invalid combination
- Outputs summary of all validation messages

Perfect for:
- Verifying error message text
- Documenting all validation rules
- Regression testing error messages

## Comparing to Original Test

Original test (`lag-aaeavregning-ved-ikke-skattepliktig.spec.ts`):
- ✅ Tests **one** successful scenario
- ✅ Verifies årsavregning creation
- ❌ Doesn't test validation cases

New test suite (`trygdeavgift-validations.spec.ts`):
- ✅ Tests **all 8** scenarios
- ✅ Verifies validation errors appear
- ✅ Captures exact error messages
- ✅ Tests business logic rules comprehensively

## Example Output

```
📝 Setting up case...
📝 Opening behandling...
📝 Filling medlemskap...
📝 Filling arbeidsforhold...
📝 Filling lovvalg...
📝 Filling resultat periode...
📝 Ready at Trygdeavgift page
📝 Testing: Ikke skattepliktig + Inntekt fra utlandet + Betales AGA
⚠️ Validation error shown: [Error message text here]
✅ Scenario 2 succeeded - Validation error correctly shown
```

## Page Object Methods Used

From `TrygdeavgiftPage`:
- `ventPåSideLastet()` - Wait for page to load
- `velgSkattepliktig(boolean)` - Select yes/no for tax liability
- `velgInntektskilde(string)` - Select income source
- `velgBetalesAga(boolean)` - Select yes/no for AGA payment
- `fyllInnBruttoinntektMedApiVent(string)` - Fill income with API wait
- `klikkBekreftOgFortsett()` - Submit form

## Tips for Maintenance

1. **Add new validation scenario**: Add new test following existing pattern
2. **Update validation logic**: Modify expected results in scenario table
3. **Capture error messages**: Run "Validation Matrix Summary" test
4. **Debug failing test**: Use `npm run test:ui` to see visual feedback

## Integration with CI/CD

These tests run in GitHub Actions along with other E2E tests:
- Each test is independent (creates own case)
- Automatic cleanup via fixtures
- Traces/screenshots captured on failure
- Test results in HTML report
