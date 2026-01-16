---
name: melosys-eessi-debugger
description: |
  Debug EUX/EESSI mock issues in melosys E2E tests. Use when:
  - E2E tests fail with 404 errors from /eux/... endpoints
  - melosys-api logs show "Kall mot eessi feilet" errors
  - melosys-eessi logs show NotFoundException for eux endpoints
  - Adding new EESSI/EUX functionality that requires mock support
  - Tracing data flow: melosys-api → melosys-eessi → melosys-mock
---

# Melosys EESSI Debugger

Debug and fix mock endpoint issues for EUX/EESSI integration in E2E tests.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  melosys-api    │────▶│  melosys-eessi  │────▶│  melosys-mock   │
│  (port 8080)    │     │  (port 8081)    │     │  (port 8083)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  EuxRinaApi.kt  │
                                               │  /eux/...       │
                                               └─────────────────┘
```

**Key insight**: melosys-eessi adds `/cpi/` prefix to most EUX calls, so endpoints need BOTH versions:
- `/eux/buc/{id}` - direct calls
- `/eux/cpi/buc/{id}` - calls via melosys-eessi

## Repo Locations

| Repo | Path | Purpose |
|------|------|---------|
| melosys-e2e-tests | Current project | E2E tests with Playwright |
| melosys-api | `~/source/nav/melosys-api` | Main backend |
| melosys-web | `~/source/nav/melosys-web` | Frontend |
| melosys-eessi | `~/source/nav/melosys-eessi` | EESSI integration |
| melosys-mock | `~/source/nav/melosys-docker-compose/mock` | Mock service |
| eux-rina-api | `~/source/nav/eux-rina-api` | Reference only |

## Debugging Workflow

### 1. Identify the Missing Endpoint

Look for 404 errors in logs:
```
# melosys-api error pattern:
"Kall mot eessi feilet 404 NOT_FOUND"

# melosys-eessi error pattern:
"404 fra eux: {...\"path\":\"/eux/cpi/...\"}"
```

Extract the path from the error, e.g., `/eux/cpi/buc/{id}/sed/{sedId}/handlinger`

### 2. Check eux-rina-api for Reference

Find the endpoint in eux-rina-api to understand expected behavior:
```bash
# Search for endpoint pattern
grep -r "handlinger" ~/source/nav/eux-rina-api/src --include="*.kt"
```

### 3. Add Endpoint to melosys-mock

Edit `melosys-docker-compose/mock/src/main/kotlin/no/nav/melosys/melosysmock/eux/EuxRinaApi.kt`

**Pattern for CPI endpoints:**
```kotlin
@GetMapping("/cpi/buc/{rinaSaksnummer}/sed/{dokumentId}/handlinger")
fun hentSedHandlingerCpi(
    @PathVariable rinaSaksnummer: String,
    @PathVariable dokumentId: String
): List<String> {
    log.info("CPI: Henter handlinger for SED $dokumentId på BUC $rinaSaksnummer")
    return listOf("Read", "Update", "Send", "Cancel")
}
```

### 4. Restart Mock and Test

```bash
cd ~/source/nav/melosys-docker-compose
docker compose restart melosys-mock
```

## Common Endpoint Patterns

See [references/cpi-endpoints.md](references/cpi-endpoints.md) for complete list of CPI endpoints.

### BUC Operations
| Endpoint | Method | Returns |
|----------|--------|---------|
| `/cpi/buc` | POST | BUC ID string |
| `/cpi/buc/{id}` | GET | BUC JSON |
| `/cpi/buc/{id}/mottakere` | PUT | void |
| `/cpi/buc/{id}/muligeaksjoner` | GET | List<String> |

### SED Operations
| Endpoint | Method | Returns |
|----------|--------|---------|
| `/cpi/buc/{id}/sed` | POST | SED ID string |
| `/cpi/buc/{id}/sed/{sedId}` | GET | SED JSON |
| `/cpi/buc/{id}/sed/{sedId}/handlinger` | GET | List<String> |
| `/cpi/buc/{id}/sed/{sedId}/send` | POST | void |
| `/cpi/buc/{id}/sed/{sedId}/vedlegg` | POST (multipart) | vedlegg ID |

### Utility
| Endpoint | Method | Returns |
|----------|--------|---------|
| `/cpi/url/buc/{id}` | GET | RINA URL string |
| `/cpi/institusjoner` | GET | Institutions JSON |
| `/cpi/sed/pdf` | POST | PDF bytes |

## Tracing Request Flow

### In melosys-api
Look for calls to `EessiService` or `BucService`:
```bash
grep -r "eessiService\|bucService" ~/source/nav/melosys-api/app/src --include="*.kt" --include="*.java"
```

### In melosys-eessi
The `EuxConsumer.java` makes actual HTTP calls:
```bash
grep -r "exchange\|getForObject\|postForObject" ~/source/nav/melosys-eessi/src --include="*.java"
```

Key file: `EuxConsumer.java` - contains all REST client methods

### In melosys-mock
All EUX endpoints: `EuxRinaApi.kt`
```bash
grep -r "@.*Mapping" ~/source/nav/melosys-docker-compose/mock/src/main/kotlin/no/nav/melosys/melosysmock/eux/
```

## Quick Fixes

### Missing CPI endpoint
Most CPI endpoints mirror non-CPI endpoints. Copy the existing endpoint and:
1. Add `/cpi` to the path
2. Add `Cpi` suffix to method name
3. Add "CPI:" prefix to log message

### Wrong response type
Check eux-rina-api for expected return type. Common issues:
- Returning `void` when String expected
- Returning object when List expected

### Multipart upload issues
Vedlegg endpoints require:
```kotlin
@PostMapping("...", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
fun method(@RequestParam("file") file: MultipartFile?)
```
