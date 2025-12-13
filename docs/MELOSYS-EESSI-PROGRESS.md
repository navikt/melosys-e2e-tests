# Melosys-EESSI Integration Progress

**Last Updated:** 2025-12-13
**Status:** 🔄 IN PROGRESS - Fagsak not being created via EESSI flow

## Current Issue

The EESSI flow works (SedHendelse → melosys-eessi → EUX mock), but **no fagsak is being created** in melosys-api.

**Symptoms:**
```
❌ No fagsak found - gathering debug info...
Process instances:
No process instances found - Kafka message may not have reached melosys-api
Check: Is melosys-api consuming from teammelosys.eessi.v1-local?
```

**Possible causes:**
1. melosys-eessi isn't publishing to `teammelosys.eessi.v1-local`
2. melosys-api isn't consuming from that topic
3. Message format from melosys-eessi doesn't match what melosys-api expects
4. Business logic: A003 from foreign country may not create fagsak (it's a "reply")

**Test file:** `tests/core/sed-mottak.spec.ts` - test "skal opprette fagsak via full eessi-flow med A003 fra Sverige"

## What's Working

- ✅ melosys-eessi health check passes (`curl http://localhost:8081/internal/health`)
- ✅ Mock returns correct SED type (A003, A009, etc.) via SedTypeRegistry
- ✅ `/testdata/lagsak` endpoint publishes SedHendelse to Kafka
- ✅ melosys-eessi fetches SED from `/eux/cpi/buc/{id}/sed/{sedId}`
- ✅ 4 of 5 eessi tests pass (the fagsak verification test fails)

## Recent Fixes (This Session)

### 1. SED Type Registry (melosys-docker-compose)

**Problem:** Mock always returned A003 SED regardless of sedType requested, causing ClassCastException.

**Fix:** Created `SedTypeRegistry` to track `rinaDokumentId → sedType`:
- `SedTypeRegistry.kt` - In-memory registry
- `LagSedController.kt` - Registers sedType when creating SedHendelse
- `EuxApi.kt` / `EuxRinaApi.kt` - Look up sedType when returning SED
- `FileUtils.kt` - Uses sedType for correct fallback file

**Commit:** `f3bc803` - "Add SED type registry for correct mock responses"

### 2. Fagsak Verification Test (melosys-e2e-tests)

**Change:** Test now properly fails if no fagsak created (was just logging warning).

**File:** `tests/core/sed-mottak.spec.ts`
- Added `expect(fagsak).not.toBeNull()` assertion
- Shows debug info: process instances, helpful messages

## Architecture

```
Test calls /testdata/lagsak (mock)
        ↓
   Kafka: eessibasis-sedmottatt-v1-local
        ↓
   melosys-eessi consumes
        ↓
   Fetches SED from /eux/cpi/buc/{id}/sed/{sedId} (mock)
        ↓
   SedTypeRegistry returns correct SED type (A003, A009, etc.)
        ↓
   melosys-eessi identifies person via PDL (mock)
        ↓
   Creates journalpost
        ↓
   Kafka: teammelosys.eessi.v1-local  ← IS THIS WORKING?
        ↓
   melosys-api consumes               ← IS THIS WORKING?
        ↓
   MOTTAK_SED process → fagsak        ← NOT HAPPENING
```

## Next Steps to Investigate

1. **Check Kafka topics:**
   ```bash
   # List topics
   docker exec -it kafka kafka-topics --list --bootstrap-server localhost:9092

   # Check messages on teammelosys.eessi.v1-local
   docker exec -it kafka kafka-console-consumer --bootstrap-server localhost:9092 \
     --topic teammelosys.eessi.v1-local --from-beginning --max-messages 5
   ```

2. **Check melosys-api Kafka consumer config:**
   - Is it configured to consume from `teammelosys.eessi.v1-local`?
   - Check application.yml or environment variables

3. **Check melosys-eessi logs:**
   - Is it successfully publishing to `teammelosys.eessi.v1-local`?
   - Any errors after processing SED?

4. **Consider business logic:**
   - Does A003 from foreign country create a fagsak?
   - Maybe only A001 (application) creates fagsak?

## Quick Commands

```bash
# Run eessi tests
npx playwright test sed-mottak --grep "@eessi"

# Run specific fagsak test
npx playwright test sed-mottak.spec.ts --grep "fagsak via full eessi"

# Check melosys-eessi health
curl http://localhost:8081/internal/health

# Test SedHendelse endpoint
curl -X POST http://localhost:8083/testdata/lagsak \
  -H "Content-Type: application/json" \
  -d '{"sedHendelseDto":{"bucType":"LA_BUC_02","sedType":"A003"}}'
```

## Git Status

**melosys-docker-compose:**
- Branch: `feature/melosys-eessi-mock-support`
- Latest commit: `f3bc803` - "Add SED type registry for correct mock responses"
- NOT pushed

**melosys-e2e-tests-claude:**
- Branch: `main`
- Uncommitted changes in `tests/core/sed-mottak.spec.ts` (fagsak verification)

## Key Files

| File | Purpose |
|------|---------|
| `tests/core/sed-mottak.spec.ts` | EESSI tests including fagsak verification |
| `helpers/sed-helper.ts` | `sendSedViaEessi()` method |
| `mock/.../SedTypeRegistry.kt` | Tracks sedType for each document |
| `mock/.../LagSedController.kt` | Creates SedHendelse, registers sedType |
| `mock/.../EuxApi.kt` | Returns SED with correct type |
