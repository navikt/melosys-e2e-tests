# Lovvalg Validation - Discovery Results

## Discovery Session: 09.11.2025

### Bestemmelse Tested: § 2-8 første ledd bokstav a (arbeidstaker)

Code: `FTRL_KAP2_2_8_FØRSTE_LEDD_A`

### Questions Presented

When this bestemmelse is selected, three conditional questions appear:

1. **Question 1**: "Har du kommet frem til at søker ikke er omfattet av et annet lands trygdelovgivning, etter en avtale som hindrer frivillig medlemskap?"
   - Options: Ja / Nei
   - Conditional: Always appears first

2. **Question 2**: "Har søker vært medlem i minst tre av de fem siste kalenderårene?"
   - Options: Ja / Nei
   - Conditional: Only appears if Question 1 = "Ja"

3. **Question 3**: "Har søker nær tilknytning til det norske samfunnet?"
   - Options: Ja / Nei
   - Conditional: Only appears if Questions 1 & 2 = "Ja"

### Blocking Scenarios

Any "Nei" answer blocks progression with the same warning message:

#### Scenario 1: Question 1 = "Nei"
- **Result**: ❌ BLOCKED
- **Warning**: "Du kan ikke gå videre, men:"
  - du kan bruke "Send brev"-fanen for å sende brev og vedtak, og "Opprett ny BUC"-fanen for å sende SED
  - du må avslutte behandlingen og angi resultatet i behandlingsmenyen
  - periode i MEDL og eventuelt avgiftssystemet må registreres manuelt
- **Button State**: Disabled
- **Questions 2 & 3**: Do not appear (conditional logic)

#### Scenario 2: Question 1 = "Ja", Question 2 = "Nei"
- **Result**: ❌ BLOCKED
- **Warning**: Same as Scenario 1
- **Button State**: Disabled
- **Question 3**: Does not appear (conditional logic)

#### Scenario 3: Question 1 = "Ja", Question 2 = "Ja", Question 3 = "Nei"
- **Result**: ❌ BLOCKED
- **Warning**: Same as Scenario 1
- **Button State**: Disabled

### Valid Scenario

#### All Questions = "Ja"
- **Question 1**: Ja
- **Question 2**: Ja
- **Question 3**: Ja
- **Result**: ✅ CAN PROCEED
- **Warning**: None
- **Button State**: Enabled

### Key Observations

1. **Warning Message is Consistent**: All blocking scenarios show the exact same warning message
2. **Warning Type**: Yellow alert box with img "Advarsel"
3. **Conditional Questions**: Questions 2 and 3 only appear based on previous answers
4. **Button Behavior**: "Bekreft og fortsett" button is disabled when blocked, enabled when valid
5. **No Red Errors**: These are not validation errors (like Trygdeavgift), but workflow blockages
6. **Alternative Actions**: The warning suggests alternative paths (Send brev, Opprett BUC, Avslutt behandling)

### Implementation Notes

1. **Page Object Methods Needed**:
   - `svarNeiPaaFørsteSpørsmål()` - Answer "Nei" to first question
   - Existing methods are sufficient for other operations

2. **Assertion Methods Needed**:
   - `verifiserAdvarselsmelding(expectedText)` - Verify warning message
   - `verifiserBekreftKnappDeaktivert()` - Verify button disabled
   - `verifiserBekreftKnappAktiv()` - Verify button enabled
   - `verifiserIngenAdvarsler()` - Verify no warnings present

3. **Test Organization**:
   - `lovvalg-validations.spec.ts` - Test the valid scenario (all Ja)
   - `lovvalg-blocking-scenarios.spec.ts` - Test all three blocking scenarios

### Warning Message Pattern

```html
<generic>
  <img "Advarsel" />
  <generic>
    "Du kan ikke gå videre, men:"
    <list>
      <listitem>du kan bruke "Send brev"-fanen for å sende brev og vedtak...</listitem>
      <listitem>du må avslutte behandlingen og angi resultatet...</listitem>
      <listitem>periode i MEDL og eventuelt avgiftssystemet må registreres manuelt</listitem>
    </list>
  </generic>
</generic>
```

### Next Steps

1. ✅ Discovery completed
2. Create LovvalgAssertions file
3. Enhance LovvalgPage (add svarNeiPaaFørsteSpørsmål method)
4. Create test files for valid and blocking scenarios
5. Run tests
6. Create validation matrix documentation
