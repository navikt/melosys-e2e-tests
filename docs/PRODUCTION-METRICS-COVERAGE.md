# Production Metrics Coverage Plan

## Overview

This document tracks progress on achieving e2e test coverage for the most frequently used process types in production.

**Data Source:** Production Prometheus metrics from `melosys-api`
**Date:** 2025-12-11

## Production Usage Summary

| Rank | Process Type | Prod Count | Test Coverage | Priority |
|------|--------------|-----------|---------------|----------|
| 1 | `MOTTAK_SED` | **841** | ❌ Not covered | 🔴 HIGH |
| 2 | `REGISTRERING_UNNTAK_GODKJENN` | **574** | ❌ Not covered | 🔴 HIGH |
| 3 | `ARBEID_FLERE_LAND_NY_SAK` | **501** | ❌ Not covered | 🔴 HIGH |
| 4 | `MOTTAK_SED_JOURNALFØRING` | **243** | ❌ Not covered | 🔴 HIGH |
| 5 | `REGISTRERING_UNNTAK_NY_SAK` | **71** | ❌ Not covered | 🟡 MEDIUM |
| 6 | `OPPRETT_OG_DISTRIBUER_BREV` | 37 | ✅ Covered | ✓ Done |
| 7 | `SEND_BREV` | 14 | ❌ Not covered | 🟡 MEDIUM |
| 8 | `ARBEID_FLERE_LAND_NY_BEHANDLING` | 14 | ❌ Not covered | 🟡 MEDIUM |
| 9 | `JFR_ANDREGANG_REPLIKER_BEHANDLING` | 10 | ❌ Not covered | 🟡 MEDIUM |
| 10 | `IVERKSETT_VEDTAK_EOS` | 10 | ❌ Not covered | 🟡 MEDIUM |
| 11 | `JFR_KNYTT` | 6 | ❌ Not covered | 🟢 LOW |
| 12 | `JFR_NY_SAK_BRUKER` | 5 | ✅ Covered | ✓ Done |
| 13 | `OPPRETT_SAK` | 4 | ✅ Covered | ✓ Done |

**Current Coverage:** 3 of top 13 process types (23%)
**Production Traffic Covered:** ~4% of total process instances

---

## Tier 1: Highest Priority (95%+ of production traffic)

### 1. MOTTAK_SED (841 instances)
**Status:** ✅ Infrastructure Ready
**Description:** Receiving SED documents from EESSI (EU social security exchange)

#### Investigation Findings (2025-12-11):

**RESOLVED:** SED testing infrastructure is now working!

**Previous Issue:** The `sed-helper.ts` used wrong payload format.

**Wrong format (current):**
```json
{
  "bucType": "LA_BUC_04",
  "sedType": "A003",
  "avsenderLand": "SE",
  "mottakerLand": "NO"
}
```

**Correct format (discovered):**
```json
{
  "sedHendelseDto": {
    "bucType": "LA_BUC_04",
    "sedType": "A003",
    "avsenderId": "SE:123",
    "avsenderNavn": "Sweden",
    "mottakerId": "NO:NAV",
    "mottakerNavn": "NAV",
    "rinaDokumentId": "doc-123",
    "rinaDokumentVersjon": "1",
    "sektorKode": "LA"
  }
}
```

#### Verified Working curl Command:
```bash
curl -s -X POST "http://localhost:8083/testdata/lagsak" \
  -H "Content-Type: application/json" \
  -d '{
    "sedHendelseDto": {
      "bucType": "LA_BUC_04",
      "sedType": "A003",
      "avsenderId": "SE:123",
      "avsenderNavn": "Sweden",
      "mottakerId": "NO:NAV",
      "mottakerNavn": "NAV",
      "rinaDokumentId": "doc-'$(date +%s)'",
      "rinaDokumentVersjon": "1",
      "sektorKode": "LA"
    }
  }'
# Returns: Status 200 (empty body = success)
```

#### Mock API Schema (from /v3/api-docs):
- **Endpoint:** `POST http://localhost:8083/testdata/lagsak`
- **Request DTO:** `RequestDto` with required field `sedHendelseDto`
- **SedHendelseDto fields:** bucType, sedType, avsenderId, avsenderNavn, mottakerId, mottakerNavn, rinaDokumentId, rinaDokumentVersjon, sektorKode

#### Code Fix Required in `helpers/sed-helper.ts`:

**Current broken code (lines 63-74):**
```typescript
const response = await this.request.post(`${this.mockBaseUrl}/testdata/lagsak`, {
  data: {
    bucType: config.bucType,
    sedType: config.sedType,
    avsenderLand: config.avsenderLand,  // WRONG field names
    mottakerLand: config.mottakerLand,
    rinaDokumentId: rinaDokumentId,
    rinaSakId: config.rinaSakId || this.generateRinaSakId(),
  },
});
```

**Should be changed to:**
```typescript
const response = await this.request.post(`${this.mockBaseUrl}/testdata/lagsak`, {
  data: {
    sedHendelseDto: {  // Wrapper object required!
      bucType: config.bucType,
      sedType: config.sedType,
      avsenderId: config.avsenderId || `${config.avsenderLand}:123`,
      avsenderNavn: config.avsenderNavn || config.avsenderLand,
      mottakerId: config.mottakerId || 'NO:NAV',
      mottakerNavn: config.mottakerNavn || 'NAV',
      rinaDokumentId: rinaDokumentId,
      rinaDokumentVersjon: '1',
      sektorKode: config.sektorKode || 'LA',
    }
  },
});
```

#### Solution Implemented (2025-12-11):

**New mock endpoint in melosys-docker-compose:**
```
POST http://localhost:8083/testdata/lag-melosys-eessi-melding
```

This endpoint:
1. Creates a mock journalpost in SAF
2. Publishes `MelosysEessiMelding` directly to `teammelosys.eessi.v1-local`
3. Triggers MOTTAK_SED and related processes in melosys-api

**Branch:** `feature/melosys-eessi-melding-producer` in melosys-docker-compose

**Usage:**
```bash
curl -X POST http://localhost:8083/testdata/lag-melosys-eessi-melding \
  -H "Content-Type: application/json" \
  -d '{"sedType": "A003", "bucType": "LA_BUC_02"}'
```

#### Completed Tasks:
- [x] Fixed `sed-helper.ts` payload format (sedHendelseDto wrapper)
- [x] Created new mock endpoint for direct Kafka publishing
- [x] Added mock journalpost creation
- [x] Added `/api/buc/{id}/sed/{id}/grunnlag` endpoint
- [x] Verified MOTTAK_SED triggers successfully

#### Remaining Tasks:
- [ ] Update E2E tests to use new endpoint
- [ ] Add process verification assertions
- [ ] Create comprehensive SED test suite

#### Test approach:
```typescript
// Updated test structure
test('skal motta SED og opprette prosessinstans', async ({ request }) => {
  const sedHelper = new SedHelper(request);

  // Send SED with correct format
  const result = await sedHelper.sendSed({
    sedHendelseDto: {
      bucType: 'LA_BUC_04',
      sedType: 'A003',
      avsenderId: 'SE:123',
      avsenderNavn: 'Sweden',
      mottakerId: 'NO:NAV',
      mottakerNavn: 'NAV',
      sektorKode: 'LA',
    }
  });

  // Wait for process
  await sedHelper.waitForSedProcessed(30000);

  // Verify MOTTAK_SED was triggered via metrics
});
```

---

### 2. REGISTRERING_UNNTAK_GODKJENN (574 instances)
**Status:** 🟡 Investigated
**Description:** Approving exception period registrations from foreign authorities

#### Investigation Findings (2025-12-11):

**API Endpoint:**
```
POST /saksflyt/unntaksperioder/{behandlingID}/godkjenn
```

**Request Body:**
```typescript
{
  varsleUtland: boolean,      // Notify foreign authority?
  fritekst: string,           // Comments
  endretPeriode?: {           // Optional modified period
    fom: string,              // From date
    tom: string               // To date
  },
  lovvalgsbestemmelse: string // Legal regulation code
}
```

**Prerequisites:**
1. **Behandling must have correct tema:**
   - `REGISTRERING_UNNTAK_NORSK_TRYGD_UTSTASJONERING`
   - `REGISTRERING_UNNTAK_NORSK_TRYGD_ØVRIGE`
   - `BESLUTNING_LOVVALG_ANNET_LAND`
2. **Behandling must be active** (not closed)
3. **Valid period** (both fom/tom dates required)

**Process Steps:**
1. `LAGRE_LOVVALGSPERIODE_MEDL` - Save to MEDL registry
2. `SEND_GODKJENNING_REGISTRERING_UNNTAK` - Notify foreign authority (if varsleUtland=true)
3. `AVSLUTT_SAK_OG_BEHANDLING` - Close case and treatment

#### Test approach:
```typescript
test('skal godkjenne unntak registrering', async ({ page, request }) => {
  // 1. Create case with REGISTRERING_UNNTAK behandlingstema
  //    (likely via incoming SED that creates REGISTRERING_UNNTAK_NY_SAK)

  // 2. Navigate to the behandling

  // 3. Fill period dates and click "Godkjenn"

  // 4. Verify REGISTRERING_UNNTAK_GODKJENN was triggered
});
```

#### Challenge:
Need to first trigger `REGISTRERING_UNNTAK_NY_SAK` (71 in prod) to create a case, then approve it.

---

### 3. ARBEID_FLERE_LAND_NY_SAK (501 instances)
**Status:** 🟡 Investigated
**Description:** New case created from receiving A003 SED for "work in multiple countries"

#### Investigation Findings (2025-12-11):

**NOT triggered by journalføring!** This is triggered by:
- Receiving **A003 SED** via Kafka from EESSI
- Same flow as MOTTAK_SED but with A003-specific routing

**Trigger Chain:**
```
Kafka (A003 SED) → EessiMeldingConsumer → MOTTAK_SED → SED_MOTTAK_RUTING
→ ArbeidFlereLandSedRuter → ARBEID_FLERE_LAND_NY_SAK (if new case)
```

**Process Steps:**
1. `SED_MOTTAK_OPPRETT_FAGSAK_OG_BEH` - Create case and behandling
2. `OPPRETT_ARKIVSAK` - Create archive case
3. `OPPDATER_SAKSRELASJON` - Update case relations
4. `SED_MOTTAK_FERDIGSTILL_JOURNALPOST` - Finalize journal post
5. `OPPRETT_SEDDOKUMENT` - Create SED document
6. `OPPRETT_SED_GRUNNLAG` - Create SED basis
7. `HENT_REGISTEROPPLYSNINGER` - Fetch register info
8. `VURDER_INNGANGSVILKÅR` - Evaluate entry conditions
9. `REGISTERKONTROLL` - Register check
10. `BESTEM_BEHANDLINGMÅTE_SED` - Determine handling method

**Key Finding:**
- This is triggered by the same mock endpoint as MOTTAK_SED
- Need to send A003 SED with correct payload format
- Will be covered once MOTTAK_SED tests are fixed

#### Test approach:
```typescript
test('skal opprette ny sak for arbeid i flere land via A003 SED', async ({ request }) => {
  const sedHelper = new SedHelper(request);

  // Send A003 SED - this triggers MOTTAK_SED then ARBEID_FLERE_LAND_NY_SAK
  await sedHelper.sendSed({
    sedHendelseDto: {
      bucType: 'LA_BUC_01',    // Applicable Legislation - Determination
      sedType: 'A003',          // A003 = Reply to application
      avsenderId: 'SE:123',
      mottakerId: 'NO:NAV',
      sektorKode: 'LA',
    }
  });

  // Wait for processes
  await sedHelper.waitForSedProcessed(30000);

  // Verify both MOTTAK_SED and ARBEID_FLERE_LAND_NY_SAK triggered
});
```

**Relationship:** MOTTAK_SED → ARBEID_FLERE_LAND_NY_SAK (for A003 with new case)

---

### 4. MOTTAK_SED_JOURNALFØRING (243 instances)
**Status:** 🔴 Not started
**Description:** Journalføring of received SED documents

#### How to trigger:
- After MOTTAK_SED, there's often a journalføring step
- May require completing journalføring for a received SED

#### Investigation needed:
- [ ] Check if this is automatic after MOTTAK_SED
- [ ] Or requires manual journalføring in UI

---

## Tier 2: Medium Priority

### 5. REGISTRERING_UNNTAK_NY_SAK (71 instances)
**Status:** 🔴 Not started

### 6. SEND_BREV (14 instances)
**Status:** 🔴 Not started

### 7. ARBEID_FLERE_LAND_NY_BEHANDLING (14 instances)
**Status:** 🔴 Not started

### 8. JFR_ANDREGANG_REPLIKER_BEHANDLING (10 instances)
**Status:** 🔴 Not started

### 9. IVERKSETT_VEDTAK_EOS (10 instances)
**Status:** 🔴 Not started

---

## Already Covered ✅

| Process Type | Test File | Test Name |
|--------------|-----------|-----------|
| `JFR_NY_SAK_BRUKER` | `journalforing.spec.ts` | skal kunne opprette ny sak fra journalpost |
| `OPPRETT_SAK` | `opprett-sak.spec.ts` | Standard sak creation tests |
| `OPPRETT_OG_DISTRIBUER_BREV` | `journalforing.spec.ts` | Side effect of journalføring |

---

## Key Findings Summary

### Critical Discovery: SED Helper Broken
The current `sed-helper.ts` uses the **wrong payload format**. This is why SED tests show "Could not send SED".

**Fix Required:**
```typescript
// Current (WRONG):
{ bucType, sedType, avsenderLand, mottakerLand }

// Correct:
{ sedHendelseDto: { bucType, sedType, avsenderId, mottakerId, sektorKode, ... } }
```

### Process Type Dependencies

```
MOTTAK_SED (841)
    ├── → ARBEID_FLERE_LAND_NY_SAK (501) [if A003 + new case]
    └── → MOTTAK_SED_JOURNALFØRING (243) [journalføring step]

REGISTRERING_UNNTAK_NY_SAK (71)
    └── → REGISTRERING_UNNTAK_GODKJENN (574) [user approves]
```

### Recommended Implementation Order

1. **Fix `sed-helper.ts`** - Use correct payload format
2. **Test MOTTAK_SED** - This unlocks ARBEID_FLERE_LAND_NY_SAK too
3. **Test REGISTRERING_UNNTAK flow** - Need to create case first, then approve

### Coverage Impact

Fixing SED helper would cover:
- MOTTAK_SED (841) - 36% of production traffic
- ARBEID_FLERE_LAND_NY_SAK (501) - 22% of production traffic
- **Total: 58% of production traffic with one fix!**

---

## Progress Log

### 2025-12-11
- Created this document
- Analyzed production metrics (from localhost:8080/internal/prometheus)
- Investigated top 3 priorities:
  - **MOTTAK_SED**: Found wrong payload format in sed-helper.ts
  - **REGISTRERING_UNNTAK_GODKJENN**: Requires POST to /saksflyt/unntaksperioder/{id}/godkjenn
  - **ARBEID_FLERE_LAND_NY_SAK**: Triggered by A003 SED via same endpoint as MOTTAK_SED

### 2025-12-09
- Completed JFR_NY_SAK_BRUKER coverage
- Fixed journalføring form submission (country + dates)

---

## How to Update Metrics

```bash
# Fetch current production metrics
curl -s http://localhost:8080/internal/prometheus | \
  grep "melosys_prosessinstanser_opprettet_total" | \
  grep -v "^#" | \
  sed 's/.*type="\([^"]*\)".*} \(.*\)/\2 \1/' | \
  sort -rn | head -20
```

---

## Related Documentation

- `docs/JOURNALFORING-TEST-STATUS.md` - Journalføring test details
- `helpers/sed-helper.ts` - SED sending utilities
- `helpers/mock-helper.ts` - Mock service helpers
