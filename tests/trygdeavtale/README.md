# Trygdeavtale Tests

This directory contains E2E tests for **Trygdeavtale** (Agreement Country) workflows.

## What is Trygdeavtale?

Trygdeavtale handles cases where Norway has bilateral social security agreements with other countries. The workflow differs from FTRL (Norwegian social security regulation) cases.

## Test Files

### `trygdeavtale-fullfort-vedtak.spec.ts`

**Complete workflow test** covering:
1. Create new Trygdeavtale case
2. Fill in period (fra og med / til og med)
3. Select arbeidsland (e.g., Australia)
4. Select arbeidsgiver (employer)
5. Approve søknad and select bestemmelse (regulation)
6. Add arbeidssted (workplace)
7. Submit vedtak directly from behandling page (no separate vedtak page)

**Two test approaches:**
- **Detailed test**: Step-by-step actions showing each individual method
- **Convenience methods test**: Using high-level convenience methods for faster test writing

## Page Objects Used

### `TrygdeavtaleBehandlingPage`
Location: `pages/behandling/trygdeavtale-behandling.page.ts`

Handles the main treatment workflow:
- Period dates (fra og med / til og med)
- Arbeidsland selection (work country)
- Arbeidsgiver selection (employer)
- Søknad result (innvilge/avslå)
- Bestemmelse selection (regulation)

**Key Methods:**
- `fyllInnPeriode(fraOgMed, tilOgMed)` - Fill period dates
- `velgArbeidsland(landkode)` - Select work country (e.g., 'AU')
- `velgArbeidsgiver(navn)` - Select employer
- `innvilgeSøknad()` - Approve application
- `velgBestemmelse(bestemmelse)` - Select regulation
- `fyllUtTrygdeavtaleBehandling()` - **Convenience method** for standard workflow

### `TrygdeavtaleArbeidsstedPage`
Location: `pages/behandling/trygdeavtale-arbeidssted.page.ts`

Handles workplace/ship/platform section and vedtak submission:
- Add arbeidssted (workplace)
- Submit vedtak directly

**Key Methods:**
- `åpneArbeidsstedSeksjon()` - Open arbeidssted accordion
- `leggTilArbeidssted(navn)` - Add a workplace
- `klikkBekreftOgFortsettHvisVises()` - Handle warning confirmation (e.g., family members)
- `fattVedtak()` - Submit vedtak (no separate vedtak page)
- `fyllUtArbeidsstedOgFattVedtak(navn)` - **Convenience method** for complete workflow

### `TrygdeavtaleBehandlingAssertions`
Location: `pages/behandling/trygdeavtale-behandling.assertions.ts`

Verification methods for database and UI:
- `verifiserIngenFeil()` - No errors on page
- `verifiserBestemmelseIDatabase(fnr, bestemmelse)` - Verify regulation in DB
- `verifiserArbeidslandIDatabase(fnr, landkode)` - Verify country in DB
- `verifiserPeriodeIDatabase(fnr, fraOgMed, tilOgMed)` - Verify period in DB

## Constants

### Arbeidsland (Work Countries)
```typescript
import { ARBEIDSLAND } from '../../pages/shared/constants';

ARBEIDSLAND.AUSTRALIA  // 'AU'
ARBEIDSLAND.SWEDEN     // 'SE'
ARBEIDSLAND.DENMARK    // 'DK'
ARBEIDSLAND.FINLAND    // 'FI'
ARBEIDSLAND.ICELAND    // 'IS'
```

### Bestemmelser (Regulations)
```typescript
import { BESTEMMELSER } from '../../pages/shared/constants';

BESTEMMELSER.AUS_ART9_3   // Australia Article 9.3
BESTEMMELSER.SWE_ART10_1  // Sweden Article 10.1
```

### Sakstype
```typescript
import { SAKSTYPER } from '../../pages/shared/constants';

SAKSTYPER.TRYGDEAVTALE  // 'TRYGDEAVTALE'
```

## Example Usage

### Using Detailed Methods
```typescript
import { ARBEIDSLAND, BESTEMMELSER } from '../../pages/shared/constants';

const behandling = new TrygdeavtaleBehandlingPage(page);

// Step-by-step control
await behandling.fyllInnPeriode('01.01.2024', '01.01.2026');
await behandling.velgArbeidsland(ARBEIDSLAND.AUSTRALIA);
await behandling.klikkBekreftOgFortsett();

await behandling.velgArbeidsgiver('Ståles Stål AS');
await behandling.klikkBekreftOgFortsett();

await behandling.innvilgeSøknad();
await behandling.velgBestemmelse(BESTEMMELSER.AUS_ART9_3);
await behandling.klikkBekreftOgFortsett();
```

### Using Convenience Methods
```typescript
const behandling = new TrygdeavtaleBehandlingPage(page);

// High-level convenience methods
await behandling.fyllUtPeriodeOgLand('01.01.2024', '01.01.2026', 'AU');
await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
await behandling.innvilgeOgVelgBestemmelse('AUS_ART9_3');

// Or even simpler - use all defaults
await behandling.fyllUtTrygdeavtaleBehandling();
```

## Key Differences from FTRL

1. **No Lovvalg questions** - Trygdeavtale uses bestemmelse selection instead
2. **Arbeidsland required** - Must select the agreement country
3. **Arbeidssted section** - Workplace/ship/platform details
4. **No separate vedtak page** - Vedtak is submitted directly from behandling page
5. **Simpler vedtak** - No text fields required (just click "Fatt vedtak")
6. **Family member warning** - May show info message about family members (can be acknowledged)

## Migrating from Old Test

The original test `tests/avtaleland/opprett-behandle-vedtak.spec.ts` has been refactored to use POMs.

**Before (35 lines of inline selectors):**
```typescript
await page.goto('http://localhost:3000/melosys/');
await page.getByRole('button', { name: 'Opprett ny sak/behandling' }).click();
await page.getByRole('textbox', { name: 'Brukers f.nr. eller d-nr.:' }).fill('30056928150');
await page.getByLabel('Sakstype').selectOption('TRYGDEAVTALE');
// ... 30+ more lines of selectors
```

**After (readable, maintainable POMs):**
```typescript
const opprettSak = new OpprettNySakPage(page);
await opprettSak.fyllInnBrukerID(USER_ID_VALID);
await opprettSak.velgSakstype('TRYGDEAVTALE');

const behandling = new TrygdeavtaleBehandlingPage(page);
await behandling.fyllUtTrygdeavtaleBehandling();
```

## Database Verification

All tests automatically clean up data via the cleanup fixture. You can verify database state:

```typescript
await behandling.assertions.verifiserBestemmelseIDatabase(USER_ID_VALID, 'AUS_ART9_3');
await behandling.assertions.verifiserArbeidslandIDatabase(USER_ID_VALID, 'AU');
```

## Running Tests

```bash
# Run all trygdeavtale tests
npm test tests/trygdeavtale

# Run specific test
npm test tests/trygdeavtale/trygdeavtale-fullfort-vedtak.spec.ts

# Run in UI mode
npm run test:ui tests/trygdeavtale
```

## Related Documentation

- [POM Migration Plan](../../docs/pom/MIGRATION-PLAN.md)
- [POM Quick Start](../../docs/pom/QUICK-START.md)
- [Main CLAUDE.md](../../CLAUDE.md)
