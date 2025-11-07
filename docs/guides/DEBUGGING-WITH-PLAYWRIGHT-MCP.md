# Debugging E2E Tests with Playwright MCP

This guide documents debugging techniques using Playwright MCP (Model Context Protocol) to investigate test failures and understand application behavior.

## Case Study: The Debounced Save Mystery

### Problem Statement
Test `lag-ikke-skattepliktig-nyvurdering-skattepliktig.spec.ts` required clicking the "Skattepliktig" radio button **twice** for the value to be saved to the database:

```typescript
await page.getByRole('group', { name: 'Skattepliktig' }).getByLabel('Ja').check();
await page.getByRole('group', { name: 'Skattepliktig' }).getByLabel('Ja').check(); // Why twice?
```

During POM conversion, we initially removed the double-click, thinking it was a bug. Tests passed (radio button showed as checked) but the value wasn't actually being saved to the database.

### TL;DR - The Root Cause

**The form uses a 500ms debounced `useEffect` to save changes.** The test was continuing before the debounced PUT request fired, so the value was never saved to the database.

**Solution:** Set up a `waitForResponse` listener **before** clicking to catch the debounced PUT request when it fires 500ms later.

**Key Lesson:** `waitForLoadState('networkidle')` doesn't work for debounced requests because it only waits for *currently pending* requests, not *future debounced* requests!

### The Investigation Process

#### Step 1: Run Test Without Cleanup
```bash
npx playwright test tests/utenfor-avtaleland/lag-ikke-skattepliktig-nyvurdering-skattepliktig.spec.ts --reporter=list
```

**Key Insight:** Tests are cleaned up BEFORE running (not after), so database state persists after test completion for inspection.

#### Step 2: Navigate to Application with Playwright MCP

Use the MCP browser tools to investigate the actual state:

```typescript
// Navigate to the application
await page.goto('http://localhost:3000/melosys/');

// Search for the case
await page.getByPlaceholder('F.nr./d-nr./saksnr.').fill('30056928150');
await page.getByPlaceholder('F.nr./d-nr./saksnr.').press('Enter');

// Take a snapshot to see what's on the page
await page.snapshot();
```

#### Step 3: Inspect the Behandling State

Navigate to the specific behandling and check the Trygdeavgift page:

```typescript
// Click on the "Ny vurdering" behandling
await page.getByRole('link', { name: 'Yrkesaktiv - Ny vurdering' }).getByRole('button').click();

// Navigate to Trygdeavgift section
await page.locator('button').filter({ hasText: 'Trygdeavgift' }).click();

// Check the page state
await page.snapshot();
```

**Discovery:** The snapshot showed:
```yaml
- radio "Ja" [ref=e559]
- radio "Nei" [checked] [ref=e564]  # ❌ "Nei" is still checked!
```

Even though the test logs said "✅ Selected Skattepliktig = Ja", the actual saved value was still "Nei".

#### Step 4: Understand the Root Cause

Initial findings from investigation suggested a timing issue with the workflow, but deeper analysis revealed the **real root cause**:

**The form uses a 500ms debounced `useEffect` to save changes!**

Looking at `melosys-web/src/sider/ftrl/saksbehandling/stegKomponenter/vurderingTrygdeavgift/vurderingTrygdeavgift.tsx`:

```typescript
const debounceBeregnTrygdeavgiftsperioder = useCallback(
  Utils._debounce(
    (formVerdier: FormValuesProps, isValid: boolean) =>
      isValid && beregnTrygdeavgiftsperioder(formVerdier),
    500, // 👈 500ms debounce!
  ),
  [],
);

useEffect(() => {
  if (redigerbart && aktivtSteg && !isValidating && !erÅpenSluttDato) {
    debounceBeregnTrygdeavgiftsperioder(formValues, formIsValid);
  }
}, [formIsValid, formValues?.skatteforholdsperioder?.length]);
```

**Timing breakdown:**
```
t=0ms:    Click radio button → form values change
t=50ms:   useEffect triggers → starts 500ms debounce timer
t=100ms:  Test continues (value not saved yet!) ❌
t=500ms:  Debounce fires → PUT /trygdeavgift/beregning starts
t=700ms:  PUT completes → value saved to database ✅
```

The test was moving forward before the debounced save completed!

### The Solution

#### Wait for the Debounced PUT Request

The key is to wait for the debounced PUT request to complete. Updated `velgSkattepliktig` in `pages/trygdeavgift/trygdeavgift.page.ts`:

```typescript
async velgSkattepliktig(erSkattepliktig: boolean): Promise<void> {
  // Wait for the group to be visible
  await this.skattepliktigGroup.waitFor({ state: 'visible', timeout: 5000 });

  // Get the radio button
  const radio = erSkattepliktig
    ? this.skattepliktigGroup.getByLabel('Ja')
    : this.skattepliktigGroup.getByLabel('Nei');

  // Wait for radio button to be enabled
  await radio.waitFor({ state: 'visible', timeout: 5000 });

  // CRITICAL: Set up response listener BEFORE clicking
  // This catches the debounced PUT that happens 500ms later
  const responsePromise = this.page.waitForResponse(
    response => response.url().includes('/trygdeavgift/beregning') &&
                response.request().method() === 'PUT' &&
                response.status() === 200,
    { timeout: 3000 } // 500ms debounce + 2500ms for API
  ).catch(() => null); // Don't fail if no PUT (form might prevent it)

  // Check the radio button (triggers change event → useEffect → debounce)
  await radio.check();

  // Verify it was checked
  await expect(radio).toBeChecked({ timeout: 5000 });

  // Wait for the debounced PUT request to complete
  const response = await responsePromise;

  if (response) {
    console.log('✅ Debounced PUT completed - value saved');
  } else {
    // Fallback: wait for debounce period if no PUT detected
    console.log('⚠️  No PUT detected, waiting for debounce period...');
    await this.page.waitForTimeout(1500);
  }
}
```

**Why this works:**
1. **Set up listener BEFORE clicking** - Ensures we catch the PUT when it fires
2. **3 second timeout** - Accounts for 500ms debounce + API time
3. **Fallback timeout** - Handles cases where form validation prevents PUT
4. **No double-click needed!** - Single click + proper wait

**Why `networkidle` doesn't work:**
```
t=0ms:    Click radio button
t=50ms:   useEffect triggers debounce (no network request yet!)
t=100ms:  waitForLoadState('networkidle') resolves immediately ❌
t=500ms:  Debounce fires → PUT starts (but test already moved on!)
```

`networkidle` only waits for **currently pending** requests, not **future debounced** requests!

#### Verify the Result
After running the test, use MCP to verify the saved state:

```yaml
- radio "Ja" [checked] [ref=e684]  # ✅ Success!
- radio "Nei" [ref=e689]
```

And the trygdeavgift calculation changed from:
- Before (Nei): **37500 nkr** and **37000 nkr**
- After (Ja): **9200 nkr** and **9200 nkr**

### Debugging Commands Reference

#### Navigate and Search
```typescript
// Go to main page
mcp__playwright__browser_navigate({ url: 'http://localhost:3000/melosys/' });

// Type in search field and submit
mcp__playwright__browser_type({
  element: 'Search field',
  ref: 'e49',
  text: '30056928150',
  submit: true
});
```

#### Click Elements
```typescript
// Click using text filter
mcp__playwright__browser_click({
  element: 'Trygdeavgift button',
  ref: 'e208'
});

// Execute custom Playwright code
await page.locator('button').filter({ hasText: 'Trygdeavgift' }).click();
```

#### Take Snapshots
```typescript
// Get accessibility snapshot of current page
mcp__playwright__browser_snapshot();

// The snapshot shows the DOM structure with:
// - Element roles (button, radio, textbox, etc.)
// - Element states ([checked], [disabled], [selected])
// - Element references (ref=e123) for clicking
// - Text content and labels
```

#### Wait and Observe
```typescript
// Wait for a specific time
mcp__playwright__browser_wait_for({ time: 2 });

// Check console messages after navigation
// These appear automatically in the MCP output
```

## Debugging Workflow

### 1. Initial Test Failure
```bash
# Run test with list reporter for clear output
npx playwright test path/to/test.spec.ts --reporter=list

# Check if test passes but behavior is wrong
# Look for "✅" messages that might be lying!
```

### 2. Inspect Application State
Use Playwright MCP to navigate to the application and check actual state:

```typescript
// 1. Navigate to main page
browser_navigate({ url: 'http://localhost:3000/melosys/' })

// 2. Search for the case
browser_type({ element: 'search', text: 'identifier', submit: true })

// 3. Take snapshot to see available elements
browser_snapshot()

// 4. Click on relevant elements using ref from snapshot
browser_click({ element: 'description', ref: 'eXXX' })

// 5. Navigate to specific sections
browser_click({ element: 'Trygdeavgift', ref: 'eXXX' })

// 6. Take another snapshot to see final state
browser_snapshot()
```

### 3. Analyze the Snapshot

Look for:
- **Element states**: `[checked]`, `[disabled]`, `[selected]`, `[active]`
- **Read-only indicators**: "Skrivebeskyttet", "Innsynsmodus"
- **Status banners**: "Behandlingen er avsluttet"
- **Form values**: Check if radio buttons, dropdowns, text fields have expected values

### 4. Compare Expected vs Actual

```yaml
# Expected (what test logs say)
✅ Selected Skattepliktig = Ja

# Actual (what MCP snapshot shows)
- radio "Ja" [ref=e559]           # Not checked!
- radio "Nei" [checked] [ref=e564]  # Still checked!
```

### 5. Identify the Problem

Common issues discovered through MCP debugging:
- **Debounced saves**: Form uses debounced `useEffect` that delays PUT requests (500ms typical)
- **Timing issues**: Test continues before debounced save completes
- **Read-only mode**: Behandling already closed/completed
- **Missing waits**: Not waiting for API requests triggered by form changes
- **Multiple elements**: Clicking wrong element when multiple exist
- **Race conditions**: Setting up response listeners AFTER triggering the action

### 6. Fix and Verify

After fixing:
1. Run test again: `npx playwright test ... --reporter=list`
2. Use MCP to verify the fix actually worked
3. Check calculated values (like trygdeavgift amounts) to confirm

## Key Learnings

### Debounced Form Saves in Melosys

1. **Many forms use debounced saves**: The Trygdeavgift form uses a **500ms debounce** before making PUT requests to save changes. This is common in React forms for performance.

2. **`waitForLoadState('networkidle')` doesn't work for debounced requests**:
   - `networkidle` only waits for **currently pending** requests
   - Debounced requests haven't started yet, so `networkidle` resolves immediately
   - You must wait for the **future** request that the debounce will trigger

3. **Always set up response listeners BEFORE triggering actions**:
   ```typescript
   // ✅ CORRECT: Set up listener first
   const responsePromise = page.waitForResponse(...);
   await radio.check(); // Triggers debounced save
   await responsePromise; // Waits for it to complete

   // ❌ WRONG: Race condition!
   await radio.check(); // Triggers debounced save
   const response = await page.waitForResponse(...); // Might miss it!
   ```

4. **Behandling lifecycle matters**:
   - Behandlinger auto-complete their workflow steps
   - Once completed, they enter "Innsynsmodus" (read-only)
   - Must interact with forms BEFORE they complete

5. **"Ny vurdering" inherits data**:
   - Ny vurdering copies data from previous behandling
   - Must change values before workflow auto-processes them
   - Short timeout (2s) after creation, not `waitForProcessInstances()`

### POM Verification Isn't Enough

```typescript
// This passes but doesn't mean the value is SAVED
await trygdeavgift.velgSkattepliktig(true);
await expect(radio).toBeChecked({ timeout: 5000 }); // ✅ Passes

// Must verify persistence by checking actual database/UI after test
// Use MCP to navigate to the page and verify the saved state
```

### Debug Early and Often

When converting tests to POM:
1. Run test: Does it pass?
2. Use MCP: Check if behavior is actually correct
3. Look for calculated values that should change
4. Verify database state through UI

## Tools and Commands

### Essential Test Commands
```bash
# Run single test with list reporter (clearest output)
npx playwright test tests/path/to/test.spec.ts --reporter=list

# Run test in headed mode (see browser)
npx playwright test tests/path/to/test.spec.ts --headed

# Run test with debug mode (step through)
npx playwright test tests/path/to/test.spec.ts --debug

# Run test and keep browser open (for manual inspection)
npx playwright test tests/path/to/test.spec.ts --headed --debug
```

### MCP Playwright Tools

Available in Claude Code when Playwright MCP is active:

- `browser_navigate` - Navigate to URL
- `browser_snapshot` - Get accessibility tree of page
- `browser_click` - Click element by ref
- `browser_type` - Type into element
- `browser_wait_for` - Wait for time/element
- `browser_evaluate` - Run JavaScript on page

### Debugging Checklist

- [ ] Test passes with `--reporter=list`
- [ ] Navigate to application with MCP after test
- [ ] Search for and open the case
- [ ] Navigate to relevant section (Trygdeavgift, Vedtak, etc.)
- [ ] Take snapshot and verify element states
- [ ] Check calculated values (trygdeavgift amounts, etc.)
- [ ] Compare with expected behavior
- [ ] Verify status banners (Innsynsmodus, Behandlingen er avsluttet)
- [ ] Check timing: Is form editable when test interacts with it?

## Example Debugging Session

```
User: "We have a test that needs to click twice and it's not correct. Can you investigate?"

1. Read test file to understand what it does
2. Run test to see if it passes:
   npx playwright test ... --reporter=list
   ✅ Test passes (but is the value SAVED?)

3. Use MCP to navigate to application:
   browser_navigate({ url: 'http://localhost:3000/melosys/' })

4. Search for the case:
   browser_type({ text: '30056928150', submit: true })

5. Open the behandling:
   browser_snapshot() # Get refs
   browser_click({ ref: 'e129' }) # Click "Vis behandling"

6. Navigate to Trygdeavgift:
   browser_click({ ref: 'e208' }) # Click "Trygdeavgift"

7. Take snapshot and analyze:
   browser_snapshot()

   Result shows:
   - radio "Ja" [ref=e684]
   - radio "Nei" [checked] [ref=e689]  # ❌ Problem found!
   - Trygdeavgift: 37500 nkr (should be 9200 nkr for "Ja")

8. Investigate the root cause:
   - Check melosys-web frontend code
   - Find vurderingTrygdeavgift.tsx
   - Discover: 500ms debounced useEffect for saves!
   - The test continues before the debounced PUT fires

9. Fix: Wait for the debounced PUT request to complete
   - Set up waitForResponse BEFORE clicking
   - Click the radio button
   - Wait for PUT /trygdeavgift/beregning to complete

10. Verify the fix:
    - Run test again
    - Use MCP to verify: "Ja" is now checked ✅
    - Check trygdeavgift: 9200 nkr ✅
```

## Debugging Debounced Forms

### How to Detect Debounced Saves

If a form seems to work in tests but values aren't saved:

1. **Search the frontend code** for the form component (e.g., `vurderingTrygdeavgift.tsx`)
2. **Look for debounced functions**: `_debounce(...)`, `Utils._debounce(...)`, `useDebouncedCallback()`
3. **Check useEffect dependencies**: Look for effects that trigger on form value changes
4. **Find the API call**: Look for PUT/POST requests in the debounced function

Example search in `melosys-web`:
```bash
cd ../melosys-web
grep -r "debounce" src/sider/ftrl/saksbehandling/stegKomponenter/vurderingTrygdeavgift/
```

### How to Fix Debounced Save Issues

**Pattern to follow:**
```typescript
async performAction(value: any): Promise<void> {
  // 1. Set up response listener BEFORE action
  const responsePromise = this.page.waitForResponse(
    response => response.url().includes('/api/endpoint') &&
                response.request().method() === 'PUT' &&
                response.status() === 200,
    { timeout: 3000 } // Debounce time + API time
  ).catch(() => null); // Fallback if no PUT

  // 2. Perform the action
  await this.element.fill(value);

  // 3. Wait for debounced save to complete
  const response = await responsePromise;

  if (!response) {
    // Fallback: wait for debounce period
    await this.page.waitForTimeout(1500);
  }
}
```

### Common Debounce Patterns in Melosys

- **Trygdeavgift form**: 500ms debounce on skatteforhold/inntekt changes
- **Text inputs**: Often have 300-500ms debounce to reduce API calls
- **Dropdown changes**: May trigger immediate or debounced saves depending on form

**When in doubt**, add a `waitForResponse` with a reasonable timeout (2-3 seconds) to catch debounced requests.

## Conclusion

Playwright MCP is an invaluable tool for debugging E2E tests because it allows you to:
- **Inspect actual application state** after test completion
- **Verify that test assertions match reality**
- **Understand timing issues** like debounced saves
- **Debug complex workflows** by stepping through the UI manually

The key insights:
1. **Just because a test passes doesn't mean it's doing what you think it's doing.** Always verify the actual persisted state.
2. **`waitForLoadState('networkidle')` doesn't work for debounced requests.** You must explicitly wait for the debounced API call.
3. **Set up response listeners BEFORE triggering actions** to avoid race conditions.
