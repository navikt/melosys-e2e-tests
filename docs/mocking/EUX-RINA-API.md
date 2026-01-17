# EUX-RINA-API Mocking Guide

This guide documents how to mock the eux-rina-api for E2E testing in Melosys.

## Table of Contents

1. [Overview](#1-overview)
2. [Integration Architecture](#2-integration-architecture)
3. [Institusjoner Endpoint](#3-institusjoner-endpoint)
4. [Data Structures](#4-data-structures)
5. [BucType Reference](#5-buctype-reference)
6. [Institution Role Reference](#6-institution-role-reference)
7. [Mock File Location](#7-mock-file-location)
8. [Adding New Test Institutions](#8-adding-new-test-institutions)
9. [Land Code Mapping](#9-land-code-mapping)
10. [Common Issues and Solutions](#10-common-issues-and-solutions)
11. [Code References](#11-code-references)

---

## 1. Overview

### What is eux-rina-api?

**eux-rina-api** is NAV's facade/proxy API for integrating with RINA (EU's EESSI system for Electronic Exchange of Social Security Information). It provides REST endpoints for:

- Managing BUCs (Business Use Cases) - the case containers for EESSI communication
- Managing SEDs (Structured Electronic Documents) - the actual documents exchanged
- Looking up EU/EEA institutions that can participate in EESSI communication
- Generating PDFs from SEDs

The API bridges NAV's internal systems (melosys-api, melosys-eessi) with the EU RINA CPI (Common Platform Interface).

### Key Repositories

| Repository | Role |
|------------|------|
| `eux-rina-api` | Production API connecting to real RINA |
| `melosys-docker-compose/mock` | Mock implementation for local development and E2E tests |
| `melosys-eessi` | Service that consumes eux-rina-api |
| `melosys-api` | Main backend that orchestrates EESSI communication |

---

## 2. Integration Architecture

The integration flow for institution lookup in Melosys:

```
melosys-web (frontend)
       |
       v
melosys-api (backend)
       |
       v
melosys-eessi (EESSI service)
       |
       v
eux-rina-api (or melosys-mock in local/test)
       |
       v
RINA CPI (EU system)
```

### Local Development Flow

In local development and E2E tests, `melosys-mock` replaces `eux-rina-api`:

```
melosys-eessi
       |
       | EUX_RINA_API_URL=http://melosys-mock:8083/eux
       v
melosys-mock (EuxRinaApi.kt)
       |
       v
Static JSON files (eux/institusjoner.json)
```

---

## 3. Institusjoner Endpoint

### Endpoint Details

| Property | Value |
|----------|-------|
| **URL** | `GET /cpi/institusjoner` or `GET /institusjoner` |
| **Mock URL** | `GET /eux/cpi/institusjoner` or `GET /eux/institusjoner` |
| **Response Type** | `List<Institusjon>` (JSON array) |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `BuCType` | String | Yes (in production) | Filter by Business Use Case type (e.g., `LA_BUC_03`) |
| `LandKode` | String | No | Filter by ISO2 country code (e.g., `SE`, `DK`) |

### Example Request

```bash
# Get all institutions for LA_BUC_03 (Forward Application / Videresend soknad)
curl "http://localhost:8083/eux/cpi/institusjoner?BuCType=LA_BUC_03"

# Get Swedish institutions for LA_BUC_03
curl "http://localhost:8083/eux/cpi/institusjoner?BuCType=LA_BUC_03&LandKode=SE"
```

### Mock Implementation

The mock implementation in `EuxRinaApi.kt`:

```kotlin
@GetMapping("/cpi/institusjoner")
fun hentInstitusjonerCpi(
    @RequestParam("BuCType", required = false) bucType: String?,
    @RequestParam("LandKode", required = false) landkode: String?
): JsonNode {
    log.info("CPI: Henter institusjoner: bucType=$bucType, landkode=$landkode")
    return objectMapper.readTree(FileUtils.hentInstitusjoner())
}
```

**Note:** The mock currently returns all institutions from the JSON file without filtering. Production eux-rina-api filters by `BuCType` and `LandKode`.

---

## 4. Data Structures

### Institusjon

The main institution data structure:

```typescript
interface Institusjon {
  id: string;           // Institution ID, format: "LANDKODE:ID" (e.g., "SE:ACC12600")
  navn: string;         // Full institution name
  akronym?: string;     // Short name/acronym (optional)
  landkode: string;     // ISO2 country code (e.g., "SE", "DK", "NO")
  tilegnetBucs: TilegnetBuc[];  // List of BUCs this institution handles
}
```

**Java/Kotlin class:** `no.nav.eux.rina.domene.Institusjon`

### TilegnetBuc

Defines which BUC types an institution can handle:

```typescript
interface TilegnetBuc {
  bucType: string;           // BUC type (e.g., "LA_BUC_03")
  institusjonsrolle: string; // Role: "CounterParty" or "CaseOwner"
  gyldigStartDato: string;   // ISO date when institution became active
  gyldigSluttDato?: string;  // ISO date when institution becomes inactive (null = no end)
  eessiklar: boolean;        // Whether institution is EESSI-ready
}
```

**Java/Kotlin class:** `no.nav.eux.rina.domene.TilegnetBuc`

### Example JSON

```json
{
  "id": "SE:ACC12600",
  "navn": "The Swedish Social Insurance Agency",
  "akronym": "FK Sverige",
  "landkode": "SE",
  "tilegnetBucs": [
    {
      "bucType": "LA_BUC_03",
      "institusjonsrolle": "CounterParty",
      "gyldigStartDato": "2018-02-28T23:00:00.000+0000",
      "gyldigSluttDato": null,
      "eessiklar": true
    },
    {
      "bucType": "LA_BUC_04",
      "institusjonsrolle": "CaseOwner",
      "gyldigStartDato": "2018-02-28T23:00:00.000+0000",
      "eessiklar": true
    }
  ]
}
```

---

## 5. BucType Reference

### Lovvalg (Legislation Applicable) - Used by Melosys

| BucType | Name | Description |
|---------|------|-------------|
| `LA_BUC_01` | Anmodning om unntak | Request for exception from normal legislation rules |
| `LA_BUC_02` | Beslutning om lovvalg | Decision on applicable legislation (A1 certificate) |
| `LA_BUC_03` | Melding om relevant informasjon | Forward application / Videresend soknad |
| `LA_BUC_04` | Melding om utstasjonering | Notification of posting |
| `LA_BUC_05` | Melding om gjeldende lovgivning | Notification of applicable legislation |
| `LA_BUC_06` | Anmodning om mer informasjon | Request for more information |

### Administrative BUCs

| BucType | Name | Description |
|---------|------|-------------|
| `AD_BUC_01` | Lukk sak | Close case |
| `AD_BUC_02` | Gjenapne sak | Reopen case |
| `AD_BUC_03` | Add Participant | Add participant to case |
| `AD_BUC_04` | Remove Participant | Remove participant from case |
| `AD_BUC_05` | Videresend sak | Forward case |

### Other Common BUCs

| BucType | Name |
|---------|------|
| `H_BUC_01` | Adhoc informasjonsutveksling |
| `FB_BUC_01` | Beslutte kompetent myndighet (Family) |
| `P_BUC_01` | Krav om alderspensjon (Pension) |
| `S_BUC_01` | Entitlement - Residence (Sickness) |

---

## 6. Institution Role Reference

Institutions can have different roles for different BUC types:

### CounterParty

- **Description:** Institution can receive and process SEDs as a counterparty
- **Usage:** Typically the foreign institution receiving documents from NAV
- **Required for:** Selecting mottaker (receiver) institution in UI

### CaseOwner

- **Description:** Primary case owner for this BUC type
- **Usage:** Institution that initiates and owns the case
- **NAV Role:** NAV is typically CaseOwner for outgoing cases

### Filtering Logic

In `melosys-eessi`, institutions are filtered to show only CounterParty institutions:

```kotlin
// From EuxService.kt (commented out, but shows intended logic)
institusjon.tilegnetBucs.orEmpty().any { tilegnetBuc ->
    bucType == tilegnetBuc.bucType &&
    "CounterParty" == tilegnetBuc.institusjonsrolle &&
    tilegnetBuc.erEessiKlar()
}
```

---

## 7. Mock File Location

### File Path

```
melosys-docker-compose/
  mock/
    src/
      main/
        resources/
          eux/
            institusjoner.json    <-- Institution mock data
```

### Current Default Content

The default mock file contains a minimal institution:

```json
[
    {
        "id": "SE:ACC12600",
        "navn": "The Swedish Social Insurance Agency",
        "landkode": "SE"
    }
]
```

**Note:** This minimal structure is missing `tilegnetBucs`, which can cause issues in certain flows.

---

## 8. Adding New Test Institutions

### Step 1: Identify Required BucType

Determine which BucType your test needs. For example:
- Testing "Videresend soknad" (A008 flow) requires `LA_BUC_03`
- Testing A1 certificate requires `LA_BUC_02`

### Step 2: Create Institution Entry

Add a new institution to `institusjoner.json`:

```json
{
  "id": "DK:12345",
  "navn": "Danish Social Security Agency",
  "akronym": "DANSK-SSA",
  "landkode": "DK",
  "tilegnetBucs": [
    {
      "bucType": "LA_BUC_03",
      "institusjonsrolle": "CounterParty",
      "gyldigStartDato": "2020-01-01T00:00:00.000+0000",
      "gyldigSluttDato": null,
      "eessiklar": true
    }
  ]
}
```

### Step 3: Important Fields

| Field | Requirement |
|-------|-------------|
| `id` | Must be unique, format `LANDKODE:ID` |
| `landkode` | Must match first part of ID, use EESSI codes (UK, EL, not GB, GR) |
| `tilegnetBucs` | Must include entry for the BucType you're testing |
| `institusjonsrolle` | Must be `"CounterParty"` for receiving institutions |
| `eessiklar` | Must be `true` for institution to be selectable |
| `gyldigStartDato` | Must be in the past |

### Step 4: Complete Example

For testing LA_BUC_03 with multiple countries:

```json
[
  {
    "id": "SE:ACC12600",
    "navn": "The Swedish Social Insurance Agency",
    "akronym": "FK Sverige",
    "landkode": "SE",
    "tilegnetBucs": [
      {
        "bucType": "LA_BUC_03",
        "institusjonsrolle": "CounterParty",
        "gyldigStartDato": "2018-02-28T23:00:00.000+0000",
        "eessiklar": true
      },
      {
        "bucType": "LA_BUC_02",
        "institusjonsrolle": "CounterParty",
        "gyldigStartDato": "2018-02-28T23:00:00.000+0000",
        "eessiklar": true
      }
    ]
  },
  {
    "id": "DK:STAR",
    "navn": "Denmark Social Security Agency",
    "akronym": "STAR",
    "landkode": "DK",
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
    "id": "UK:HMRC",
    "navn": "HM Revenue and Customs",
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
    "id": "EL:IKA",
    "navn": "Greek Social Security Institute",
    "akronym": "IKA-ETAM",
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

---

## 9. Land Code Mapping

### Special EESSI Land Codes

EESSI uses slightly different ISO2 codes for some countries:

| Country | Standard ISO2 | EESSI Code | Notes |
|---------|---------------|------------|-------|
| United Kingdom | GB | UK | Historical convention in EESSI |
| Greece | GR | EL | Uses "Hellas" abbreviation |

### NAV Land Code Conversion

`melosys-eessi` converts EESSI codes to NAV codes using `LandkodeMapper`:

```kotlin
fun mapTilNavLandkode(landkode: String?): String? =
    when (landkode?.uppercase()) {
        "UK" -> "GB"  // EESSI UK -> NAV GB
        "EL" -> "GR"  // EESSI EL -> NAV GR
        else -> landkode
    }
```

### Usage in Mock Data

- **In `institusjoner.json`:** Use EESSI codes (`UK`, `EL`)
- **In Institution ID:** Use EESSI codes (e.g., `UK:HMRC`, `EL:IKA`)
- **Frontend Display:** NAV codes are used after mapping

### Special Land Codes

| Code | Meaning |
|------|---------|
| `XU` | Unknown country (ISO2) |
| `XUK` | Unknown country (ISO3) |
| `XK` | Kosovo (ISO2) |
| `XXK` | Kosovo (ISO3) |
| `XS` | Stateless (ISO2) |
| `XXX` | Stateless (ISO3) |

---

## 10. Common Issues and Solutions

### Issue 1: Institution Dropdown is Empty

**Symptom:** No institutions appear in the mottaker dropdown when sending SED.

**Cause:** Missing or incomplete `tilegnetBucs` in mock data.

**Solution:**
```json
// Ensure tilegnetBucs includes the correct BucType
{
  "id": "SE:1",
  "navn": "Swedish Institution",
  "landkode": "SE",
  "tilegnetBucs": [
    {
      "bucType": "LA_BUC_03",  // Must match the BUC being created
      "institusjonsrolle": "CounterParty",
      "gyldigStartDato": "2018-01-01T00:00:00.000+0000",
      "eessiklar": true
    }
  ]
}
```

### Issue 2: Institution Not Selectable

**Symptom:** Institution appears but cannot be selected.

**Cause:** `eessiklar` is `false` or `gyldigStartDato` is in the future.

**Solution:**
```json
{
  "eessiklar": true,  // Must be true
  "gyldigStartDato": "2018-01-01T00:00:00.000+0000"  // Must be in the past
}
```

### Issue 3: Wrong Institution Role

**Symptom:** Institution appears but is wrong type for the operation.

**Cause:** `institusjonsrolle` is `"CaseOwner"` instead of `"CounterParty"`.

**Solution:**
```json
{
  "institusjonsrolle": "CounterParty"  // For receiving institutions
}
```

### Issue 4: Land Code Mismatch

**Symptom:** Filtering by country doesn't work as expected.

**Cause:** Using wrong land code format.

**Solution:**
- Use EESSI codes in mock data: `UK`, `EL`
- NAV converts internally: `UK` -> `GB`, `EL` -> `GR`

### Issue 5: Date Format Error

**Symptom:** JSON parsing errors or institution not valid.

**Cause:** Invalid date format in `gyldigStartDato`.

**Solution:**
```json
// Use ISO 8601 format with timezone
"gyldigStartDato": "2018-02-28T23:00:00.000+0000"
```

---

## 11. Code References

### Production Code (eux-rina-api)

| File | Description |
|------|-------------|
| `EuxCpiServiceController.java` | Main REST controller with `/cpi/institusjoner` endpoint |
| `Institusjon.java` | Institution domain model |
| `TilegnetBuc.java` | BUC assignment domain model |
| `RinaCpiService.java` | Service layer for RINA operations |

### Mock Code (melosys-docker-compose/mock)

| File | Description |
|------|-------------|
| `EuxRinaApi.kt` | Mock REST controller |
| `FileUtils.kt` | Utility for loading mock JSON files |
| `eux/institusjoner.json` | Mock institution data |

### Consumer Code (melosys-eessi)

| File | Description |
|------|-------------|
| `EuxConsumer.java` | REST client for eux-rina-api |
| `EuxService.kt` | Service layer with institution filtering |
| `Institusjon.java` | DTO for institution data |
| `TilegnetBuc.java` | DTO with `erEessiKlar()` validation |
| `LandkodeMapper.kt` | Land code conversion utility |

### Key Files in melosys-docker-compose

```
melosys-docker-compose/
  mock/
    src/main/
      kotlin/no/nav/melosys/melosysmock/
        eux/
          EuxRinaApi.kt           # Mock endpoints
          EuxApi.kt               # Deprecated mock (for reference)
        utils/
          FileUtils.kt            # JSON file loading
      resources/
        eux/
          institusjoner.json      # Institution mock data
          buc_default.json        # Default BUC response
          sedA003.json            # A003 SED mock data
          sedA008.json            # A008 SED mock data
```

---

## Related Documentation

- [EESSI Documentation](https://ec.europa.eu/social/main.jsp?catId=1544)
- [BUC/SED Types Reference](https://ec.europa.eu/social/main.jsp?catId=1548)
- [Melosys Docker Compose Guide](../../melosys-docker-compose/README.md)
- [E2E Test Fixtures Guide](../guides/FIXTURES.md)
