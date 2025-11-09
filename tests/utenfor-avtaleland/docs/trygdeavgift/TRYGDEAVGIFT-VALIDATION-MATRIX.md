# Trygdeavgift Validation Matrix

## Overview

This document provides a complete matrix of all tested trygdeavgift (tax) combinations, including both **valid** and **invalid** scenarios.

## Test Coverage

- ✅ **Valid combinations** - Tested in `trygdeavgift-validations.spec.ts`
- ❌ **Invalid combinations** - Tested in `trygdeavgift-validation-errors.spec.ts`

## Validation Rules Discovered

### Rule 1: Pensjon/uføretrygd det betales kildeskatt av

**Invalid Combination:**
- Skattepliktig = **Ja**
- Inntektskilde = **"Pensjon/uføretrygd det betales kildeskatt av"**

**Error Message:**
```
Inntekstypen "Pensjon/uføretrygd det betales kildeskatt av" kan ikke velges for perioder bruker er skattepliktig til Norge.
```

**Translation:**
"The income type 'Pension/disability benefit with withholding tax' cannot be selected for periods where the user is tax liable to Norway."

**Reason:** This income type is only applicable when the person is NOT tax liable to Norway (Skattepliktig = Nei).

## Complete Validation Matrix

### For "Inntekt fra utlandet" (Income from abroad)

This is the most complex income source with multiple tax rate variations:

| Skattepliktig | Betales AGA? | Tax Rate | Tax Amount (per 100,000 NOK) | Status | Test |
|---------------|--------------|----------|------------------------------|--------|------|
| **Nei** | **Nei** | 37.5% (2023), 37% (2024) | 37,500 / 37,000 nkr | ✅ VALID | Scenario 1 |
| **Nei** | **Ja** | 28.3% (2023), 27.8% (2024) | 28,300 / 27,800 nkr | ✅ VALID | Scenario 2 |
| **Ja** | **Nei** | 9.2% | 9,200 nkr | ✅ VALID | Scenario 3 |
| **Ja** | **Ja** | N/A | No tax to NAV | ✅ VALID | Scenario 4 |

**Key Findings:**
- When **Skattepliktig=Ja** + **Betales AGA=Ja**: User pays AGA abroad, so **no trygdeavgift to NAV**
- When **Skattepliktig=Ja** + **Betales AGA=Nei**: Lowest rate (9.2%)
- When **Skattepliktig=Nei**: Higher rates apply (28-37% depending on AGA)

### For Norwegian Income Sources

| Income Source | Skattepliktig | Betales AGA? | Status | Notes | Test |
|---------------|---------------|--------------|--------|-------|------|
| **Arbeidsinntekt fra Norge** | Ja | Disabled (forced Ja) | ✅ VALID | AGA automatically paid | Scenario 5 |
| **Arbeidsinntekt fra Norge** | Nei | Disabled (forced Ja) | ✅ VALID | AGA automatically paid | Scenario 6 |
| **Næringsinntekt fra Norge** | Ja | Disabled (forced Ja) | ✅ VALID | AGA automatically paid | Scenario 7 |

**Key Findings:**
- For **Norwegian income sources**, the "Betales aga?" field is **always disabled**
- AGA is considered **automatically paid** for Norwegian income
- This applies regardless of the Skattepliktig status

### For Special Income Types

| Income Source | Skattepliktig | Status | Error Message | Test |
|---------------|---------------|--------|---------------|------|
| **Pensjon/uføretrygd det betales kildeskatt av** | **Ja** | ❌ ERROR | "Inntekstypen ... kan ikke velges for perioder bruker er skattepliktig til Norge." | validation-errors test |
| **Pensjon/uføretrygd det betales kildeskatt av** | **Nei** | ✅ VALID | (expected to work, not yet tested) | - |

## Tax Calculation Table Structure

When trygdeavgift is successfully calculated, a table appears with the following columns:

1. **Trygdeperiode** - Tax period (split by calendar year)
   - Example: "01.01.2023 - 31.12.2023"
   - Example: "01.01.2024 - 01.07.2024"

2. **Dekning** - Coverage type
   - Example: "Helse- og pensjonsdel (§ 2-9)"

3. **Inntektskilde** - Income source
   - Example: "Inntekt fra utlandet"

4. **Sats** - Tax rate percentage
   - Example: "9.2"

5. **Avgift per md.** - Tax amount per month
   - Example: "9200 nkr"

## Implementation Details

### Assertion Methods

The following assertion methods are available in `TrygdeavgiftAssertions`:

#### 1. `verifiserTrygdeavgiftBeregnet()`
Verifies that the tax calculation table is displayed with the heading "Foreløpig beregnet trygdeavgift".

#### 2. `verifiserTrygdeavgiftSats(expectedRate: string)`
Verifies a specific tax rate appears in the calculation table.

**Example:**
```typescript
await trygdeavgift.assertions.verifiserTrygdeavgiftSats('9.2');
```

#### 3. `verifiserBeregnedeTrygdeavgiftVerdier(expectedValues: Array<{ sats: string; avgiftPerMnd: string }>)`
Verifies the exact calculated values in each row of the table.

**Example:**
```typescript
await trygdeavgift.assertions.verifiserBeregnedeTrygdeavgiftVerdier([
    { sats: '9.2', avgiftPerMnd: '9200 nkr' },  // 2023 period
    { sats: '9.2', avgiftPerMnd: '9200 nkr' }   // 2024 period
]);
```

#### 4. `verifiserValideringsfeil(expectedErrorText: string | RegExp)`
Verifies that a validation error message is displayed.

**Example:**
```typescript
await trygdeavgift.assertions.verifiserValideringsfeil(
    'kan ikke velges for perioder bruker er skattepliktig til Norge'
);
```

#### 5. `verifiserBekreftKnappDeaktivert()`
Verifies that the "Bekreft og fortsett" button is disabled due to validation errors.

#### 6. `verifiserIngenTrygdeavgift()`
Verifies that the "Trygdeavgift skal ikke betales til NAV" message is displayed.

#### 7. `verifiserBruttoinntektIkkeRelevant()`
Verifies that the Bruttoinntekt field shows "Ikke relevant".

#### 8. `verifiserBetalesAgaDisabled()`
Verifies that the "Betales aga?" radio buttons are disabled.

## Test Examples

### Valid Scenario Example

```typescript
test('Scenario 3: Skattepliktig + Inntekt fra utlandet + Betales ikke AGA - Tax rate 9.2%', async ({page}) => {
    const trygdeavgift = await setupBehandlingToTrygdeavgift(page);

    // Select combination
    await trygdeavgift.velgSkattepliktig(true);
    await trygdeavgift.velgInntektskilde('Inntekt fra utlandet');
    await trygdeavgift.velgBetalesAga(false);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');

    // Verify calculation
    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();
    await trygdeavgift.assertions.verifiserTrygdeavgiftSats('9.2');

    // Verify exact values
    await trygdeavgift.assertions.verifiserBeregnedeTrygdeavgiftVerdier([
        { sats: '9.2', avgiftPerMnd: '9200 nkr' },
        { sats: '9.2', avgiftPerMnd: '9200 nkr' }
    ]);
});
```

### Invalid Scenario Example

```typescript
test('ERROR: Skattepliktig=Ja + Pensjon/uføretrygd det betales kildeskatt av', async ({page}) => {
    const trygdeavgift = await setupBehandlingToTrygdeavgift(page);

    // Select invalid combination
    await trygdeavgift.velgSkattepliktig(true);
    await trygdeavgift.velgInntektskilde('Pensjon/uføretrygd det betales kildeskatt av');

    // Verify error is shown
    await trygdeavgift.assertions.verifiserValideringsfeil(
        'kan ikke velges for perioder bruker er skattepliktig til Norge'
    );

    // Verify button is disabled
    await trygdeavgift.assertions.verifiserBekreftKnappDeaktivert();
});
```

## Future Work

### Additional Validation Errors to Discover

The following income sources should be tested with both Skattepliktig=Ja and Skattepliktig=Nei to discover if there are more validation rules:

- [ ] Ansatt i FN med skattefritak
- [ ] Misjonær som skal arbeide i utlandet i minst to år
- [ ] Pensjon/uføretrygd (without kildeskatt)

### Additional Tax Rate Combinations

- [ ] Test Scenario 1 and 2 with actual value verification
- [ ] Document exact tax rates for 2023 vs 2024
- [ ] Test Norwegian income sources with bruttoinntekt values

## References

- **Valid scenarios test**: `tests/utenfor-avtaleland/trygdeavgift-validations.spec.ts`
- **Invalid scenarios test**: `tests/utenfor-avtaleland/trygdeavgift-validation-errors.spec.ts`
- **Page Object**: `pages/trygdeavgift/trygdeavgift.page.ts`
- **Assertions**: `pages/trygdeavgift/trygdeavgift.assertions.ts`
- **Workplan**: `tests/utenfor-avtaleland/VALIDATION-ERRORS-WORKPLAN.md`
