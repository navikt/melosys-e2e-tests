# Implementation Plan: SED A008 Videresend Søknad Mock Support

## Executive Summary

The EU/EØS SED A008 - Videresend søknad (Forward Application) test is currently tagged as `@known-error` because the mock infrastructure doesn't properly support institution selection. This plan outlines the required changes across multiple repositories to fix this.

## Current State Analysis

### The Problem

The test fails because the foreign institution dropdown doesn't work correctly. The root cause is:

1. **melosys-mock** has minimal institution data missing the `tilegnetBucs` field
2. **melosys-eessi** has filtering logic **commented out** as a workaround
3. The mock doesn't return proper institution data for `LA_BUC_03` (used for videresend søknad)

### Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   melosys-web   │────▶│   melosys-api    │────▶│  melosys-eessi   │────▶│  melosys-mock    │
│   (Frontend)    │     │   (Backend)      │     │  (EESSI Service) │     │ (eux-rina mock)  │
└─────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘
                              │                         │                         │
                              │ GET /mottaker-          │ GET /institusjoner      │
                              │ institusjoner/LA_BUC_03 │ ?BuCType=LA_BUC_03      │
                              │                         │                         │
                              ▼                         ▼                         ▼
                        Returns institutions      Filters by landkode      Returns ALL
                        for dropdown              (tilegnetBucs filter     institutions
                                                  DISABLED!)               (minimal data)
```

### Current Mock Data (BROKEN)

**File:** `/melosys-docker-compose/mock/src/main/resources/eux/institusjoner.json`

```json
[
    {
        "id": "SE:ACC12600",
        "navn": "The Swedish Social Insurance Agency",
        "landkode": "SE"
    }
]
```

**Problem:** Missing `tilegnetBucs` field entirely!

### Expected Data Structure

```json
{
    "id": "SE:1",
    "navn": "The Swedish Social Insurance Agency",
    "akronym": "FK Sverige-TS70",
    "landkode": "SE",
    "tilegnetBucs": [
        {
            "bucType": "LA_BUC_03",
            "institusjonsrolle": "CounterParty",
            "gyldigStartDato": "2018-02-28T23:00:00.000+0000",
            "eessiklar": true
        }
    ]
}
```

### melosys-eessi Workaround (TEMPORARY)

**File:** `/melosys-eessi/melosys-eessi-app/src/main/java/no/nav/melosys/eessi/service/eux/EuxService.kt` (lines 67-77)

```kotlin
fun hentMottakerinstitusjoner(bucType: String, landkoder: Collection<String>): List<Institusjon> =
    euxConsumer.hentInstitusjoner(bucType, null)
        .onEach { it.landkode = LandkodeMapper.mapTilNavLandkode(it.landkode) }
        .filter { filtrerPåLandkoder(it, landkoder) }
//            .filter { institusjon ->
//                println("institusjon:$institusjon")
//                institusjon.tilegnetBucs.orEmpty().any { tilegnetBuc ->
//                    bucType == tilegnetBuc.bucType && COUNTERPARTY == tilegnetBuc.institusjonsrolle && tilegnetBuc.erEessiKlar()
//                }
//            }
        .also { log.info("Hentet mottakerinstitusjoner for bucType $bucType: $it") }
```

The `tilegnetBucs` filtering is **commented out** because the mock doesn't return proper data!

---

## BucType Reference

For the **Videresend søknad** (Forward Application) functionality with **Arbeid flere land** treatment:

| BucType | Description | Usage |
|---------|-------------|-------|
| **LA_BUC_03** | Forward Application | Used when forwarding søknad to another country |
| LA_BUC_01 | A1 Certificate Request | Standard lovvalg |
| LA_BUC_04 | Request for Information | Used for additional info |

**Required for E2E test:** Institutions with `LA_BUC_03` as `CounterParty` role with `eessiklar: true`

---

## Implementation Plan

### Phase 1: Update melosys-mock Institution Data

**Repository:** `melosys-docker-compose`
**File:** `mock/src/main/resources/eux/institusjoner.json`

**Action:** Replace minimal data with comprehensive institution data including `tilegnetBucs`.

**New Data:**
```json
[
    {
        "id": "SE:ACC12600",
        "navn": "The Swedish Social Insurance Agency",
        "akronym": "FK Sverige-ACC",
        "landkode": "SE",
        "tilegnetBucs": [
            {
                "bucType": "LA_BUC_03",
                "institusjonsrolle": "CounterParty",
                "gyldigStartDato": "2018-02-28T23:00:00.000+0000",
                "eessiklar": true
            },
            {
                "bucType": "LA_BUC_01",
                "institusjonsrolle": "CounterParty",
                "gyldigStartDato": "2018-02-28T23:00:00.000+0000",
                "eessiklar": true
            },
            {
                "bucType": "LA_BUC_04",
                "institusjonsrolle": "CounterParty",
                "gyldigStartDato": "2018-02-28T23:00:00.000+0000",
                "eessiklar": true
            }
        ]
    },
    {
        "id": "SE:1",
        "navn": "The Swedish Social Insurance Agency",
        "akronym": "FK Sverige-TS70",
        "landkode": "SE",
        "tilegnetBucs": [
            {
                "bucType": "LA_BUC_03",
                "institusjonsrolle": "CounterParty",
                "gyldigStartDato": "2018-02-28T23:00:00.000+0000",
                "eessiklar": true
            },
            {
                "bucType": "LA_BUC_04",
                "institusjonsrolle": "CounterParty",
                "gyldigStartDato": "2018-02-28T23:00:00.000+0000",
                "eessiklar": true
            }
        ]
    },
    {
        "id": "DK:1",
        "navn": "Danish Social Insurance Agency",
        "akronym": "Udbetaling Danmark",
        "landkode": "DK",
        "tilegnetBucs": [
            {
                "bucType": "LA_BUC_03",
                "institusjonsrolle": "CounterParty",
                "gyldigStartDato": "2018-02-28T23:00:00.000+0000",
                "eessiklar": true
            },
            {
                "bucType": "LA_BUC_01",
                "institusjonsrolle": "CounterParty",
                "gyldigStartDato": "2018-02-28T23:00:00.000+0000",
                "eessiklar": true
            }
        ]
    },
    {
        "id": "DE:1",
        "navn": "Deutsche Rentenversicherung",
        "akronym": "DRV Bund",
        "landkode": "DE",
        "tilegnetBucs": [
            {
                "bucType": "LA_BUC_03",
                "institusjonsrolle": "CounterParty",
                "gyldigStartDato": "2018-02-28T23:00:00.000+0000",
                "eessiklar": true
            }
        ]
    },
    {
        "id": "UK:1",
        "navn": "The UK Social Insurance Agency",
        "akronym": "HMRC",
        "landkode": "UK",
        "tilegnetBucs": [
            {
                "bucType": "LA_BUC_03",
                "institusjonsrolle": "CounterParty",
                "gyldigStartDato": "2018-02-28T23:00:00.000+0000",
                "eessiklar": true
            }
        ]
    },
    {
        "id": "EL:1",
        "navn": "The Hellas Social Insurance Agency",
        "akronym": "EFKA",
        "landkode": "EL",
        "tilegnetBucs": [
            {
                "bucType": "LA_BUC_03",
                "institusjonsrolle": "CounterParty",
                "gyldigStartDato": "2018-02-28T23:00:00.000+0000",
                "eessiklar": true
            }
        ]
    }
]
```

**Estimated effort:** Small - JSON file update

---

### Phase 2: Evaluate melosys-eessi Filtering (OPTIONAL)

**Repository:** `melosys-eessi`
**File:** `melosys-eessi-app/src/main/java/no/nav/melosys/eessi/service/eux/EuxService.kt`

**Decision Required:**
- **Option A:** Re-enable `tilegnetBucs` filtering (more correct)
- **Option B:** Keep it disabled (simpler, but less accurate)

**If Option A:**
```kotlin
fun hentMottakerinstitusjoner(bucType: String, landkoder: Collection<String>): List<Institusjon> =
    euxConsumer.hentInstitusjoner(bucType, null)
        .onEach { it.landkode = LandkodeMapper.mapTilNavLandkode(it.landkode) }
        .filter { filtrerPåLandkoder(it, landkoder) }
        .filter { institusjon ->
            institusjon.tilegnetBucs.orEmpty().any { tilegnetBuc ->
                bucType == tilegnetBuc.bucType &&
                COUNTERPARTY == tilegnetBuc.institusjonsrolle &&
                tilegnetBuc.erEessiKlar()
            }
        }
        .also { log.info("Hentet mottakerinstitusjoner for bucType $bucType: $it") }
```

**Recommendation:** Start with Phase 1 only. Once mock data is correct, test if filtering needs to be re-enabled.

---

### Phase 3: Update E2E Test

**Repository:** `melosys-e2e-tests-claude`
**File:** `tests/eu-eos/eu-eos-sed-a008-videresend-soknad.spec.ts`

**Actions:**
1. Remove `@known-error` tag when the fix is verified
2. Update institution ID if needed (test currently uses `SE:ACC12600`)
3. Add assertion to verify institution dropdown is populated

---

### Phase 4: Documentation

**Create eux-rina-api mock documentation:**

**File:** `docs/mocking/EUX-RINA-API.md`

Document:
- Institution endpoint structure
- Required fields for mock data
- BucType reference table
- How to add new institutions

---

## Verification Steps

### Manual Testing Flow

1. Start melosys-docker-compose with updated mock
2. Login to melosys-web
3. Create new case: EU/EØS → Medlemskap/Lovvalg → Arbeid flere land
4. Select countries: Norge + Sverige
5. Confirm first step
6. Select "Annet" for competent land
7. Fill in "Sverige (SE)"
8. Check required checkboxes
9. Confirm step
10. **Verify:** Institution dropdown shows Swedish institutions
11. Select institution
12. Click "Videresend søknad"

### E2E Test Verification

```bash
# Run the specific test
npm test tests/eu-eos/eu-eos-sed-a008-videresend-soknad.spec.ts

# Check logs for institution data
cat playwright-report/melosys-api-complete.log | grep -i institusjon
cat playwright-report/melosys-eessi-complete.log | grep -i institusjon
```

---

## Agent-Based Implementation Approach

Since changes span multiple repositories, consider using specialized agents:

### 1. melosys-mock Agent
```
Repository: melosys-docker-compose
Task: Update eux/institusjoner.json with comprehensive data
Test: Verify mock endpoint returns correct data
```

### 2. melosys-eessi Agent (if needed)
```
Repository: melosys-eessi
Task: Evaluate and potentially re-enable tilegnetBucs filtering
Test: Run unit tests (EuxServiceTest)
```

### 3. E2E Test Agent
```
Repository: melosys-e2e-tests-claude
Task: Update test after fix is verified
Test: Run full E2E test
```

---

## Log Analysis Setup

For debugging across services:

```bash
# Configure .env.local for IntelliJ development
SKIP_DOCKER_LOG_SERVICES=melosys-api,melosys-eessi

# Or use LOG_FILES_DIR for log file analysis
LOG_FILES_DIR=/tmp/melosys-logs
```

**Key log patterns to search:**
- `Hentet mottakerinstitusjoner` - Shows what institutions were returned
- `hentInstitusjoner` - Shows API call to eux-rina mock
- `tilegnetBucs` - Shows if filtering is active

---

## Success Criteria

1. Institution dropdown populates with Swedish institutions when SE is selected as kompetent land
2. E2E test `eu-eos-sed-a008-videresend-soknad.spec.ts` passes
3. `@known-error` tag can be removed from test
4. No regression in other LA_BUC tests

---

## Files Reference

| Repository | File | Purpose |
|------------|------|---------|
| melosys-docker-compose | `mock/src/main/resources/eux/institusjoner.json` | Mock institution data |
| melosys-eessi | `melosys-eessi-app/.../service/eux/EuxService.kt` | Institution filtering |
| melosys-eessi | `melosys-eessi-app/.../integration/eux/rina_api/EuxConsumer.java` | API client |
| melosys-api | `integrasjon/.../eessi/EessiConsumerImpl.kt` | EESSI consumer |
| melosys-e2e-tests | `tests/eu-eos/eu-eos-sed-a008-videresend-soknad.spec.ts` | E2E test |
| eux-rina-api | `src/.../service/cpi/RinaCpiService.kt` | Real API reference |
