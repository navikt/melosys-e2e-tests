# EU/EØS Workflow Debugging Guide

Arbeidslogg for feilsøking av EU/EØS "fullført vedtak" tester.

## 📁 Test Files

### Standard EU/EØS Workflow
- **Test:** `tests/eu-eos/eu-eos-fullfort-vedtak.spec.ts`
- **POM:** `pages/behandling/eu-eos-behandling.page.ts`
- **Assertions:** `pages/behandling/eu-eos-behandling.assertions.ts`

### Ship (Skip) Workflow
- **Test:** `tests/eu-eos/eu-eos-skip-fullfort-vedtak.spec.ts`
- **POM:** `pages/behandling/eu-eos-skip-behandling.page.ts`
- **Assertions:** `pages/behandling/eu-eos-skip-behandling.assertions.ts`

## 🔍 Common Issues & Solutions

### Issue #1: Checkbox Not Checked (Virksomhet Step)

**Symptom:**
```
Checkbox "Ståles Stål AS" er ikke sjekket
"Bekreft og fortsett" knapp er disabled
```

**Cause:** Race condition - test runs faster than DOM updates

**Solution:** Added explicit wait in `velgArbeidsgiver()`:
```typescript
await checkbox.waitFor({ state: 'visible' });
await checkbox.check();
```

**Debug URL:**
```
http://localhost:3000/melosys/EU_EOS/saksbehandling/MEL-{ID}/?behandlingID={ID}
```
Navigate to "Virksomhet" step and manually check if checkbox works.

---

### Issue #2: Wrong Field Order (Skip Workflow)

**Symptom:**
```
Error: locator.check: Clicking the checkbox did not change its state
Radio button "På skip registrert i ett land" is disabled
```

**Cause:** Fields are conditionally enabled based on previous selections

**Correct Order:**
1. ✅ `velgSkip()` - Enables other fields
2. ✅ `velgFlagglandSomArbeidsland('Frankrike')`
3. ✅ `velgSkipRegistrertIEttLand()`

**Wrong Order:**
```typescript
// ❌ WRONG - this fails!
await skipBehandling.velgNorskSokkel(); // Disabled!
await skipBehandling.velgSkipRegistrertIEttLand(); // Also disabled!
```

**Debug URL:**
```
http://localhost:3000/melosys/EU_EOS/saksbehandling/MEL-{ID}/?behandlingID={ID}
```
Navigate to "Sokkel / skip" step. Observe which fields are enabled/disabled.

---

### Issue #3: Multiple Radio Buttons Selected

**Symptom:**
```
Test tries to check both:
- "Arbeider på norsk skip"
- "Arbeider på utenlandsk skip"
```

**Cause:** These are in the same radio group - can only select ONE

**Solution:** Only select the applicable option:
```typescript
// ✅ CORRECT - only one selection
await skipBehandling.velgArbeiderPaUtenlandskSkip();
```

**Debug URL:**
```
http://localhost:3000/melosys/EU_EOS/saksbehandling/MEL-{ID}/?behandlingID={ID}
```
Navigate to "Vurdering skip" step. Check which radio options are enabled.

---

### Issue #4: Date Input Problems

**Symptom:**
```
Date fields not filled correctly
Test uses mix of datepicker and text input
```

**Solution:** Use consistent `fyllInnFraTilDato()` method:
```typescript
// ✅ CORRECT - both dates with text input
await behandling.fyllInnFraTilDato('01.01.2024', '01.01.2026');

// ❌ OLD WAY - inconsistent
await behandling.velgPeriodeMedDatepicker('2024', 'fredag 1');
await behandling.fyllInnSluttdato('01.01.2026');
```

---

## 🛠️ Debugging Steps

### 1. Find Failed Case URL

When test fails, look for the case number in error logs or check main page:
```
http://localhost:3000/melosys/
```

Look for "TRIVIELL KARAFFEL" cases in "Mine oppgaver".

### 2. Navigate to Failed Step

Use Playwright MCP or browser to navigate to specific step. Case URL format:
```
http://localhost:3000/melosys/EU_EOS/saksbehandling/MEL-{ID}/?behandlingID={ID}
```

Click on step icons to jump to specific step:
- Inngang
- Yrkessituasjon
- Sokkel / skip (skip workflow only)
- Virksomhet
- Bosted
- Vurdering skip (skip workflow only)
- Vedtak

### 3. Manual Testing

Try to manually complete the action that failed:
- Click checkboxes
- Select radio buttons
- Fill text fields
- Click "Bekreft og fortsett"

**Observe:**
- Is the element disabled?
- Does it require a previous action first?
- Is there a timing/animation issue?

### 4. Check Element State

Use Playwright snapshot to inspect element properties:
```yaml
checkbox "Ståles Stål AS" [ref=e411] [cursor=pointer]  # ✅ Enabled
checkbox "Ståles Stål AS" [ref=e411]                    # ❌ Disabled (no cursor-pointer)

radio "Skip" [checked] [ref=e468]                       # ✅ Checked
radio "Skip" [ref=e468]                                 # ❌ Not checked
```

### 5. Add Waits if Needed

If manual testing works but automated test fails, add explicit waits:
```typescript
// Wait for element to be visible
await element.waitFor({ state: 'visible' });

// Wait for element to be enabled
await element.waitFor({ state: 'attached' });

// Wait for specific time (last resort)
await page.waitForTimeout(1000);
```

---

## 📊 Test Workflow Steps

### Standard EU/EØS Workflow

1. **Opprett sak** (OpprettNySakPage)
   - Bruker ID: `USER_ID_VALID` (30056928150)
   - Sakstype: EU_EOS
   - Sakstema: MEDLEMSKAP_LOVVALG
   - Behandlingstema: UTSENDT_ARBEIDSTAKER
   - Periode: `fyllInnFraTilDato('01.01.2024', '01.01.2026')`
   - Land: Danmark
   - Årsak: SØKNAD

2. **Inngang** (auto - click "Bekreft og fortsett")

3. **Yrkessituasjon**
   - Select: "Yrkesaktiv"
   - Click "Bekreft og fortsett"

4. **Virksomhet** ⚠️ COMMON FAILURE POINT
   - Checkbox: "Ståles Stål AS"
   - **Fix:** Wait for checkbox visibility
   - Click "Bekreft og fortsett"

5. **Remaining steps** (continue with POM methods)

### Skip Workflow

Additional complexity:
- **Sokkel / skip step** - Field order matters!
- **Vurdering skip step** - Only one radio selection

---

## 🐛 Playwright Debugging Commands

### Run Single Test
```bash
npx playwright test "skal fullføre EU/EØS-arbeidsflyt med vedtak" --project=chromium --reporter=list --workers=1
```

### Run with Debug Mode
```bash
npm run test:debug tests/eu-eos/eu-eos-fullfort-vedtak.spec.ts
```

### Run with UI Mode
```bash
npm run test:ui
```

### View Last Trace
```bash
npm run show-trace test-results/...path-to-trace.../trace.zip
```

### Check Docker Logs
```bash
# View complete logs for all services
ls playwright-report/*-complete.log

# View specific service
cat playwright-report/melosys-api-complete.log

# View per-test logs (only created when errors detected)
cat playwright-report/docker-logs-*.log
```

---

## 📝 Common Patterns

### Conditional Element Availability

Some elements become enabled only after other actions:

```typescript
// ❌ WRONG - field might be disabled
await element.check();

// ✅ CORRECT - wait for it to be ready
await element.waitFor({ state: 'visible' });
await element.check();
```

### Radio Button Groups

Radio buttons in same group are mutually exclusive:

```typescript
// ❌ WRONG - can't select both
await radio1.check();
await radio2.check(); // This will uncheck radio1!

// ✅ CORRECT - select only the appropriate one
await radio2.check();
```

### Dynamic Form Fields

Some fields trigger API calls or enable other fields:

```typescript
// Use FormHelper for fields that trigger API calls
await formHelper.fillAndWaitForApi(field, value, '/api/endpoint');

// For fields that enable others, check order dependency
await selectFirst.click();  // This enables selectSecond
await selectSecond.click();
```

---

## 🎯 Quick Checklist

When debugging a failing test:

- [ ] Check case exists at main page (`http://localhost:3000/melosys/`)
- [ ] Navigate to exact URL where test failed
- [ ] Click through to failed step using navigation
- [ ] Try manual interaction - does it work?
- [ ] Check element state in snapshot (disabled? not visible?)
- [ ] Identify if it's a timing issue (works manually but not in test)
- [ ] Check if field depends on previous action (conditional enabling)
- [ ] Add explicit wait if needed (`waitFor({ state: 'visible' })`)
- [ ] Check if multiple radio buttons are being selected (only one allowed!)
- [ ] Review field order for dependencies

---

## 🔗 Useful URLs

### Local Development
```
Main page:        http://localhost:3000/melosys/
Case URL pattern: http://localhost:3000/melosys/EU_EOS/saksbehandling/MEL-{ID}/?behandlingID={ID}
Unleash UI:       http://localhost:4242 (admin/unleash4all)
```

### Recent Test Cases
Track recent MEL-IDs from test runs - increment for each new test.

---

## 📚 Related Documentation

- **POM Guide:** `docs/pom/QUICK-START.md`
- **Helpers Guide:** `docs/guides/HELPERS.md`
- **Troubleshooting:** `docs/guides/TROUBLESHOOTING.md`
- **Fixtures:** `docs/guides/FIXTURES.md`

---

## ✅ Fixed Issues Log

### 2025-11-19 - Branch: `test/improve-vedtak-workflows`

1. ✅ **Date handling** - Added `fyllInnFraTilDato()` helper
2. ✅ **Skip field order** - Fixed velgSkip() → velgFlaggland → velgSkipRegistrert
3. ✅ **Multiple radio selection** - Only select one radio button in skip vurdering
4. ✅ **Checkbox race condition** - Added `waitFor({ state: 'visible' })` in velgArbeidsgiver()
5. ✅ **Radio button race conditions** - Added `waitFor({ state: 'visible' })` to ALL radio button methods:
   - `eu-eos-behandling.page.ts`: velgYrkesaktiv, velgSelvstendig, velgLønnetArbeid, velgUlønnetArbeid, svarJa, svarNei, innvilgeSøknad, avslåSøknad
   - `eu-eos-skip-behandling.page.ts`: velgYrkesaktivPaSokkel, velgNorskSokkel, velgSkipRegistrertIEttLand, velgFlagglandSomArbeidsland, velgSkip, velgArbeiderPaNorskSkip, velgArbeiderPaUtenlandskSkip
   - `eu-eos-arbeid-flere-land.page.ts`: velgHjemland, velgHjemlandOgFortsett (else branch), bekreftArbeidIFlereLand, velgLønnetArbeidIToEllerFlere, velgProsentandel
6. ✅ **Page load timing** - Added waits for page navigation:
   - After case link click: `await page.waitForLoadState('networkidle')` in test files (eu-eos-fullfort-vedtak, eu-eos-skip-fullfort-vedtak, eu-eos-arbeid-flere-land-eksempel)
   - After "Bekreft og fortsett": `await page.waitForTimeout(500)` in eu-eos-behandling.page.ts
   - After "Bekreft og fortsett": `await page.waitForTimeout(1000)` in eu-eos-arbeid-flere-land.page.ts (longer wait needed)
7. ✅ **Multi-select land dropdown** - Fixed `velgAndreLand()` method:
   - Changed from looking for second dropdown `.nth(1)` to clicking same dropdown again
   - It's a multi-select dropdown, not two separate dropdowns
   - After selecting first land, click same dropdown to add more countries
8. ✅ **Arbeid i flere land timing** - Increased timeouts for slower-loading elements:
   - `arbeidIFlereLandCheckbox`: 15 second timeout (takes longer to appear)
   - Added 1000ms wait after `velgAarsak()` before `velgAndreLand()`
   - Added 500ms wait after `velgLand()` to allow second dropdown to appear

**Patterns Applied:**

**Radio/Checkbox Pattern:**
```typescript
async velgElement(): Promise<void> {
  // Vent på at element er synlig og stabil før sjekking (unngår race condition)
  await this.element.waitFor({ state: 'visible' });
  await this.element.check();
  console.log('✅ ...');
}
```

**Multi-Select Dropdown Pattern:**
```typescript
// First country
await this.landDropdown.click();
await this.page.getByRole('option', { name: 'Estland' }).click();

// Wait for UI to update
await this.page.waitForTimeout(500);

// Second country - same dropdown!
await this.landDropdown.click(); // ← Click SAME dropdown again
await this.page.getByRole('option', { name: 'Norge' }).click();
```

**Navigation Pattern:**
```typescript
// Test file - after clicking case link
await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
await page.waitForLoadState('networkidle'); // ← Add this!
await behandling.klikkBekreftOgFortsett();
```

**Button Click Pattern (Standard workflows):**
```typescript
async klikkBekreftOgFortsett(): Promise<void> {
  await this.bekreftOgFortsettButton.click();
  await this.page.waitForTimeout(500); // React state update
  console.log('✅ Klikket Bekreft og fortsett');
}
```

**Button Click Pattern (Arbeid i flere land - needs longer wait):**
```typescript
async klikkBekreftOgFortsett(): Promise<void> {
  await this.bekreftOgFortsettButton.click();
  await this.page.waitForTimeout(1000); // Longer wait for complex UI
  console.log('✅ Klikket Bekreft og fortsett');
}
```

This ensures:
1. DOM elements are visible before interaction (prevents race conditions)
2. Pages fully load after navigation (prevents clicking disabled elements)
3. React state updates complete after button clicks (prevents stale UI state)
4. Multi-select dropdowns work correctly (click same element multiple times)
5. Complex workflows get extra time to load (arbeid i flere land)

**Test Coverage:**
- ✅ Standard workflow: `eu-eos-fullfort-vedtak.spec.ts`
- ✅ Skip workflow: `eu-eos-skip-fullfort-vedtak.spec.ts`
- ✅ Arbeid i flere land (POM): `eu-eos-arbeid-flere-land-eksempel.spec.ts` (test 1)
- ✅ Arbeid i flere land (step-by-step): `eu-eos-arbeid-flere-land-eksempel.spec.ts` (test 2)

---

## ⚡ Recent Stability Improvements

### 2025-11-19 - Increased Timeouts & Network Idle Waits

**Issue:** Tests occasionally timing out on checkbox interactions and navigation after "Fatt vedtak"

**Changes:**
1. ✅ **Checkbox timeout increased** - `velgArbeidsgiver()` now waits up to 30 seconds (was 10s)
2. ✅ **Network idle wait** - `klikkBekreftOgFortsett()` now waits for `networkidle` state (15s timeout)
3. ✅ **Navigation timeout increased** - `verifiserVedtakFattet()` now waits up to 60 seconds for redirect (was 10s)
4. ✅ **Pre-vedtak network check** - `fattVedtak()` now waits for network idle before clicking button

**Improved Patterns:**

```typescript
// Checkbox with longer timeout (handles slow step loading)
async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
  const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });
  await checkbox.waitFor({ state: 'visible', timeout: 30000 }); // ← 30s timeout
  await checkbox.check();
}

// Step transition with network idle wait
async klikkBekreftOgFortsett(): Promise<void> {
  await this.bekreftOgFortsettButton.click();
  await this.page.waitForTimeout(500); // React state update
  await this.page.waitForLoadState('networkidle', { timeout: 15000 }); // ← Network idle!
  console.log('✅ Klikket Bekreft og fortsett');
}

// Fatt vedtak with pre-click checks
async fattVedtak(): Promise<void> {
  await this.page.waitForLoadState('networkidle', { timeout: 10000 }); // ← Check network first!
  await this.fattVedtakButton.waitFor({ state: 'visible', timeout: 10000 }); // ← Check button ready
  await this.fattVedtakButton.click();
  console.log('✅ Fattet vedtak');
}

// Navigation assertion with longer timeout
async verifiserVedtakFattet(): Promise<void> {
  // 60 seconds for vedtak processing (document generation, DB updates)
  await this.page.waitForURL(/\/melosys\/?$/, { timeout: 60000 }); // ← 60s for CI!
  console.log('✅ Vedtak fattet - navigert tilbake til hovedside');
}
```

**Why These Changes:**
- **CI is slower**: GitHub Actions needs more time than local development
- **Step transitions**: Complex React state updates need network idle confirmation
- **Vedtak processing**: Document generation + database updates can take 30-60 seconds
- **Arbeidsgiver loading**: External API calls to fetch company data can be slow

---

**Last Updated:** 2025-11-19
**Maintainer:** Claude Code debugging session
