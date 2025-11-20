# EU/EØS API Endpoint Mapping

**Generated:** 2025-11-20
**Purpose:** Document actual API endpoints called during EU/EØS workflow for implementing explicit waits

---

## 📊 Summary

Total unique API endpoints identified: **11 endpoints**

### Endpoint List

| Endpoint | Method | Status | Usage |
|----------|--------|--------|-------|
| `/api/fagsaker/sok` | POST | 200 | Search for existing cases |
| `/api/fagsaker` | POST | 204 | Create new case |
| `/api/avklartefakta/{id}` | POST | 200 | Save/update clarified facts |
| `/api/vilkaar/{id}` | POST | 200 | Save/update conditions |
| `/api/anmodningsperioder/{id}` | POST | 200 | Save/update request periods |
| `/api/utpekingsperioder/{id}` | POST | 200 | Save/update designation periods |
| `/api/mottatteopplysninger/{id}` | POST | 200 | Save/update received information |
| `/api/lovvalgsperioder/{id}` | POST | 200 | Save/update law selection periods |
| `/api/behandlinger/{id}/tidligere-medlemsperioder` | POST | 200 | Save previous membership periods |
| `/api/saksflyt/vedtak/{id}/fatt` | POST | 204 | **Create vedtak (decision)** |
| `/api/kontroll/ferdigbehandling` | POST | 400 | Complete treatment control |

---

## 🔄 Workflow Step Mapping

### 1. Opprett Sak (Create Case)

#### Step: Fill Bruker ID
**Action:** `opprettSak.fyllInnBrukerID(USER_ID_VALID)`

**API Calls:**
```
POST /api/fagsaker/sok -> 200
```

**Purpose:** Search for existing cases for the person

**Wait Pattern:**
```typescript
const responsePromise = this.page.waitForResponse(
  response => response.url().includes('/api/fagsaker/sok') &&
              response.request().method() === 'POST' &&
              response.status() === 200,
  { timeout: 5000 }
);
```

---

#### Step: Click Opprett Ny Behandling
**Action:** `opprettSak.klikkOpprettNyBehandling()`

**API Calls:**
```
POST /api/fagsaker -> 204
```

**Purpose:** Create new case in database

**Wait Pattern:**
```typescript
const responsePromise = this.page.waitForResponse(
  response => response.url().includes('/api/fagsaker') &&
              response.request().method() === 'POST' &&
              (response.status() === 200 || response.status() === 204),
  { timeout: 10000 }
);
```

---

### 2. Behandling - Bekreft første steg (periode/land)

**Action:** `behandling.klikkBekreftOgFortsett()`

**API Calls (6 endpoints called):**
```
POST /api/avklartefakta/131 -> 200
POST /api/vilkaar/131 -> 200
POST /api/anmodningsperioder/131 -> 200
POST /api/utpekingsperioder/131 -> 200
POST /api/mottatteopplysninger/131 -> 200 (called 2x)
```

**Purpose:** Save all data from first step (period and land selection)

**Wait Pattern (Multiple endpoints):**
```typescript
// Wait for all step transition APIs to complete
const apiPromises = [
  this.page.waitForResponse(
    response => response.url().includes('/api/avklartefakta/') &&
                response.request().method() === 'POST' &&
                response.status() === 200,
    { timeout: 10000 }
  ),
  this.page.waitForResponse(
    response => response.url().includes('/api/vilkaar/') &&
                response.request().method() === 'POST' &&
                response.status() === 200,
    { timeout: 10000 }
  )
];

await this.bekreftOgFortsettButton.click();

// Wait for critical APIs
await Promise.all(apiPromises);
console.log('✅ Step transition saved');
```

---

### 3. Behandling - Velg Yrkesaktiv

**Action:** `behandling.velgYrkesaktivEllerSelvstendigOgFortsett(true)`

**API Calls (6 endpoints):**
```
POST /api/avklartefakta/131 -> 200
POST /api/vilkaar/131 -> 200
POST /api/anmodningsperioder/131 -> 200
POST /api/utpekingsperioder/131 -> 200
POST /api/mottatteopplysninger/131 -> 200
```

**Purpose:** Save yrkesaktiv/selvstendig selection

**Wait Pattern:** Same as step transition above

---

### 4. Behandling - Velg Arbeidsgiver

**Action:** `behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS')`

**API Calls (6 endpoints):**
```
POST /api/mottatteopplysninger/133 -> 200
POST /api/avklartefakta/133 -> 200
POST /api/vilkaar/133 -> 200
POST /api/anmodningsperioder/133 -> 200
POST /api/utpekingsperioder/133 -> 200
POST /api/mottatteopplysninger/133 -> 200
```

**Purpose:** Save arbeidsgiver selection

**⚠️ IMPORTANT:** Checkbox selection itself **might** trigger a debounced PUT before "Bekreft og fortsett"!

**Recommended Pattern:**
```typescript
async velgArbeidsgiver(arbeidsgiverNavn: string): Promise<void> {
  const checkbox = this.page.getByRole('checkbox', { name: arbeidsgiverNavn });
  await checkbox.waitFor({ state: 'visible', timeout: 30000 });

  // Listen for potential debounced save when checkbox is checked
  const responsePromise = this.page.waitForResponse(
    response => (response.url().includes('/api/mottatteopplysninger/') ||
                 response.url().includes('/api/avklartefakta/')) &&
                response.request().method() === 'POST' &&
                response.status() === 200,
    { timeout: 3000 }
  ).catch(() => null); // Don't fail if no immediate save

  await checkbox.check();

  // Wait for potential immediate save
  const response = await responsePromise;
  if (response) {
    console.log('✅ Arbeidsgiver selection auto-saved');
  }

  console.log(`✅ Valgte arbeidsgiver: ${arbeidsgiverNavn}`);
}
```

---

### 5. Behandling - Velg Arbeidstype (Lønnet arbeid)

**Action:** `behandling.velgArbeidstype(true)`

**API Calls (5 endpoints):**
```
POST /api/avklartefakta/133 -> 200
POST /api/vilkaar/133 -> 200
POST /api/anmodningsperioder/133 -> 200
POST /api/utpekingsperioder/133 -> 200
POST /api/mottatteopplysninger/133 -> 200
```

**Purpose:** Save arbeidstype selection

**Wait Pattern:** Same as step transition

---

### 6. Behandling - Svar Ja på første spørsmål

**Action:** `behandling.svarJaOgFortsett()` (first time)

**API Calls (6 endpoints):**
```
POST /api/mottatteopplysninger/133 -> 200
POST /api/avklartefakta/133 -> 200
POST /api/vilkaar/133 -> 200
POST /api/anmodningsperioder/133 -> 200
POST /api/utpekingsperioder/133 -> 200
POST /api/mottatteopplysninger/133 -> 200
```

**Purpose:** Save first question answer

**Wait Pattern:** Same as step transition

---

### 7. Behandling - Svar Ja på andre spørsmål

**Action:** `behandling.svarJaOgFortsett()` (second time)

**API Calls (5 endpoints):**
```
POST /api/avklartefakta/133 -> 200
POST /api/vilkaar/133 -> 200
POST /api/utpekingsperioder/133 -> 200
POST /api/anmodningsperioder/133 -> 200
POST /api/mottatteopplysninger/133 -> 200
```

**Purpose:** Save second question answer

**Wait Pattern:** Same as step transition

---

### 8. Behandling - Innvilg og Fatt Vedtak ⭐ **MOST CRITICAL**

**Action:** `behandling.innvilgeOgFattVedtak()`

**API Calls (15 endpoints! Most complex step):**

**During innvilgeSøknad() + klikkBekreftOgFortsett():**
```
POST /api/lovvalgsperioder/133 -> 200
POST /api/avklartefakta/133 -> 200
POST /api/vilkaar/133 -> 200
POST /api/anmodningsperioder/133 -> 200
POST /api/utpekingsperioder/133 -> 200
POST /api/mottatteopplysninger/133 -> 200 (2x)
POST /api/behandlinger/133/tidligere-medlemsperioder -> 200
POST /api/avklartefakta/133 -> 200
POST /api/vilkaar/133 -> 200
POST /api/anmodningsperioder/133 -> 200
POST /api/utpekingsperioder/133 -> 200
POST /api/lovvalgsperioder/133 -> 200
```

**During fattVedtak() - THE CRITICAL ONE:**
```
POST /api/saksflyt/vedtak/133/fatt -> 204  ⭐⭐⭐
POST /api/kontroll/ferdigbehandling -> 400
```

**Purpose:**
1. Save innvilge/avslå decision
2. Create vedtak document
3. Complete treatment

**⭐ CRITICAL Wait Pattern for fattVedtak():**
```typescript
async fattVedtak(): Promise<void> {
  // Ensure all previous saves are complete
  await this.page.waitForLoadState('networkidle', { timeout: 10000 });
  await this.fattVedtakButton.waitFor({ state: 'visible', timeout: 10000 });

  // CRITICAL: Wait for vedtak creation API
  // This is the MOST IMPORTANT endpoint in the entire workflow!
  const responsePromise = this.page.waitForResponse(
    response => response.url().includes('/api/saksflyt/vedtak/') &&
                response.url().includes('/fatt') &&
                response.request().method() === 'POST' &&
                (response.status() === 200 || response.status() === 204),
    { timeout: 60000 } // LONG timeout - vedtak creation can be slow!
  );

  await this.fattVedtakButton.click();

  // Wait for vedtak to be created
  const response = await responsePromise;
  console.log(`✅ Vedtak fattet - API responded: ${response.url()} -> ${response.status()}`);
}
```

---

## 🎯 Key Patterns Identified

### 1. Step Transition Pattern (klikkBekreftOgFortsett)

**Every "Bekreft og fortsett" triggers 5-6 POST requests:**
- `/api/avklartefakta/{id}` - Facts clarified
- `/api/vilkaar/{id}` - Conditions
- `/api/anmodningsperioder/{id}` - Request periods
- `/api/utpekingsperioder/{id}` - Designation periods
- `/api/mottatteopplysninger/{id}` - Received info (often 2x)

**Recommended Wait:**
```typescript
async klikkBekreftOgFortsett(): Promise<void> {
  console.log('🔄 Klikker "Bekreft og fortsett"...');

  // Wait for multiple step save APIs (at least avklartefakta and vilkaar)
  const apiPromises = [
    this.page.waitForResponse(
      response => response.url().includes('/api/avklartefakta/') &&
                  response.request().method() === 'POST',
      { timeout: 10000 }
    ),
    this.page.waitForResponse(
      response => response.url().includes('/api/vilkaar/') &&
                  response.request().method() === 'POST',
      { timeout: 10000 }
    )
  ];

  await this.bekreftOgFortsettButton.click();

  // Wait for critical APIs
  await Promise.all(apiPromises);

  // Still wait for React state update
  await this.page.waitForTimeout(500);

  console.log(`✅ Klikket Bekreft og fortsett - APIs saved`);
}
```

### 2. Land Selection Pattern

**Finding:** No explicit API call detected immediately after land selection!

This means the current `waitForTimeout(500)` in `velgLand()` is actually correct - the land is saved when "Bekreft og fortsett" is clicked, not immediately.

**Current implementation is OK:**
```typescript
async velgLand(landNavn: string): Promise<void> {
  await this.landDropdown.click();
  await this.page.getByRole('option', { name: landNavn }).click();
  await this.page.waitForTimeout(500); // Wait for UI to update, not API
  console.log(`✅ Valgte land: ${landNavn}`);
}
```

### 3. Vedtak Creation Pattern (MOST CRITICAL)

**The most critical endpoint:**
```
POST /api/saksflyt/vedtak/{id}/fatt -> 204
```

**This endpoint:**
- Creates the vedtak document
- Updates database with decision
- Can take 30-60 seconds on CI
- **MUST be waited for explicitly!**

**Recommended pattern shown in section 8 above.**

---

## 🔍 Comparison with Trygdeavgift

### Trygdeavgift (utenfor-avtaleland)
- Uses **debounced PUT** requests (500ms debounce)
- Endpoint: `PUT /trygdeavgift/beregning`
- Triggers on field blur (bruttoinntekt, skattepliktig)
- Has explicit `waitForResponse()` with debounce handling

### EU/EØS
- Uses **POST** requests (not PUT)
- No debounced saves on individual fields
- Saves happen on "Bekreft og fortsett" clicks
- Multiple endpoints per step (5-6 POST requests!)

**Key Difference:**
- **Trygdeavgift:** Auto-saves individual fields (debounced)
- **EU/EØS:** Batch-saves all fields at step transition

---

## ✅ Recommended Implementation Priority

### Priority 1: CRITICAL
1. **`fattVedtak()`** - Wait for `/api/saksflyt/vedtak/{id}/fatt`
   - Most critical
   - Can take 60 seconds
   - Tests fail if not waited for

### Priority 2: HIGH
2. **`klikkBekreftOgFortsett()`** - Wait for `/api/avklartefakta/` and `/api/vilkaar/`
   - Every step transition
   - Can cause race conditions
   - More reliable than `networkidle`

### Priority 3: MEDIUM
3. **`velgArbeidsgiver()`** - Check for debounced save
   - Might have auto-save on checkbox check
   - Needs investigation

### Priority 4: LOW
4. **`fyllInnBrukerID()`** - Wait for `/api/fagsaker/sok`
   - Already stable with FormHelper
   - Low priority

---

## 📋 Next Steps

1. ✅ **Implement `fattVedtak()` wait** (Priority 1)
2. ✅ **Implement `klikkBekreftOgFortsett()` wait** (Priority 2)
3. ⚠️ **Investigate arbeidsgiver checkbox** - Does it trigger immediate save?
4. ⚠️ **Test on CI** - Ensure timeouts are sufficient
5. ⚠️ **Document in POM** - Update page object comments

---

## 🐛 Known Issues

### Issue: `/api/kontroll/ferdigbehandling -> 400`

This endpoint returns 400 (Bad Request) during vedtak creation:
```
POST /api/kontroll/ferdigbehandling -> 400
```

**Investigation needed:**
- Is this expected? (validation error?)
- Does it affect vedtak creation?
- Should we catch this error?

---

**Last Updated:** 2025-11-20
**Test File:** `tests/eu-eos/network-logging-test.spec.ts` (TEMPORARY - DELETE AFTER USE)
**Log File:** `/tmp/network-analysis.log`
