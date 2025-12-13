# Melosys-EESSI Integration Progress

**Last Updated:** 2025-12-13
**Status:** IN PROGRESS - Fixing 400 error from /testdata/lagsak

## Current Issue

```
Error: Send SedHendelse failed: Failed to send SedHendelse: 400 -
{"timestamp":"2025-12-13T12:56:06.950+00:00","status":400,"error":"Bad Request","path":"/testdata/lagsak"}
```

The `sendSedViaEessi()` method in `sed-helper.ts` is sending to `/testdata/lagsak` but getting a 400 error.

**Root Cause:** The payload format in `sed-helper.ts` doesn't match what the existing `/testdata/lagsak` endpoint expects.

**Next Step:** Check the actual `LagSedController` in mock to see the correct DTO format.

## What's Working

- ✅ melosys-eessi is running (`curl http://localhost:8081/internal/health` → `{"status":"UP"}`)
- ✅ Mock is running with new EUX endpoints (`http://localhost:8083`)
- ✅ New EUX endpoints respond correctly:
  - `GET /eux/v3/buc/{id}/oversikt` - Returns RinaSakOversiktV3
  - `GET /eux/buc/{id}` - Returns BUC JSON
  - All other `/eux/*` endpoints

## Completed Tasks

### 1. Mock Endpoint Updates (melosys-docker-compose)

**Branch:** `feature/melosys-eessi-mock-support`

**Files Created:**
- `mock/src/main/kotlin/.../eux/EuxRinaApi.kt` - New controller with 20+ endpoints at `/eux/*`
- `mock/src/main/kotlin/.../eux/dto/v3/RinaSakOversiktV3.kt` - V3 DTOs

**Commit:** `5b84a30` - "Add EUX RINA API mock endpoints for melosys-eessi integration"

### 2. Test Helper Updates (melosys-e2e-tests-claude)

**Files Modified:**
- `helpers/sed-helper.ts`:
  - Added `SedHendelseConfig` interface
  - Added `sendSedViaEessi()` method
  - Added `EESSI_SED_SCENARIOS` predefined configs

**Commit:** `20b5f23` - "Add melosys-eessi E2E integration support"

### 3. Test File Updates

**File:** `tests/core/sed-mottak.spec.ts`
- Added new test describe block: `SED Mottak via melosys-eessi @eessi`
- Tests auto-skip if melosys-eessi is not running
- Includes comparison test between direct and eessi flows

## Files to Fix

### sed-helper.ts - sendSedViaEessi() method

Current implementation (line ~268):
```typescript
const response = await this.request.post(
  `${this.mockBaseUrl}/testdata/lagsak`,
  {
    data: {
      sedHendelseDto: {  // <-- This wrapper might be wrong
        bucType: config.bucType,
        sedType: config.sedType,
        avsenderId: config.avsenderId || 'DK:1000',
        // ...
      }
    },
  }
);
```

**Need to check:** What does `LagSedController.kt` in mock actually expect?

Location: `/Users/rune/source/nav/melosys-docker-compose/mock/src/main/kotlin/no/nav/melosys/melosysmock/testdata/LagSedController.kt`

## Architecture Reference

```
Test publishes SedHendelse
        ↓
   /testdata/lagsak (mock)
        ↓
   Kafka: eessibasis-sedmottatt-v1-local
        ↓
   melosys-eessi consumes
        ↓
   Fetches SED from /eux/buc/* (mock)
        ↓
   Identifies person via PDL (mock)
        ↓
   Creates journalpost
        ↓
   Kafka: teammelosys.eessi.v1-local
        ↓
   melosys-api consumes
        ↓
   MOTTAK_SED process
```

## Quick Test Commands

```bash
# Check melosys-eessi health
curl http://localhost:8081/internal/health

# Check mock is running
curl http://localhost:8083/swagger-ui/

# Test EUX V3 endpoint
curl http://localhost:8083/eux/v3/buc/test123/oversikt

# Run eessi tests only
npx playwright test sed-mottak --grep "@eessi"

# Check LagSedController schema
curl http://localhost:8083/v3/api-docs | jq '.paths["/testdata/lagsak"]'
```

## Key File Locations

| File | Location |
|------|----------|
| sed-helper.ts | `/Users/rune/source/nav/melosys-e2e-tests-claude/helpers/sed-helper.ts` |
| sed-mottak.spec.ts | `/Users/rune/source/nav/melosys-e2e-tests-claude/tests/core/sed-mottak.spec.ts` |
| EuxRinaApi.kt (new) | `/Users/rune/source/nav/melosys-docker-compose/mock/src/main/kotlin/.../eux/EuxRinaApi.kt` |
| LagSedController.kt | `/Users/rune/source/nav/melosys-docker-compose/mock/src/main/kotlin/.../testdata/LagSedController.kt` |
| Integration plan | `/Users/rune/source/nav/melosys-e2e-tests-claude/docs/MELOSYS-EESSI-INTEGRATION-PLAN.md` |

## Git Status

**melosys-docker-compose:**
- Branch: `feature/melosys-eessi-mock-support`
- Committed but NOT pushed

**melosys-e2e-tests-claude:**
- Branch: `main`
- Changes committed

## Next Session TODO

1. **Check LagSedController.kt** to see correct DTO format for `/testdata/lagsak`
2. **Fix sed-helper.ts** `sendSedViaEessi()` payload to match
3. **Test the flow** end-to-end
4. **Push branches** when working

## Related Documentation

- [MELOSYS-EESSI-INTEGRATION-PLAN.md](./MELOSYS-EESSI-INTEGRATION-PLAN.md) - Full integration plan
- [SED-KAFKA-TESTING-OPTIONS.md](./SED-KAFKA-TESTING-OPTIONS.md) - Original investigation
- [PRODUCTION-METRICS-COVERAGE.md](./PRODUCTION-METRICS-COVERAGE.md) - Priority process types
