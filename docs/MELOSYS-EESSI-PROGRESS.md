# Melosys-EESSI Integration Progress

**Last Updated:** 2025-12-13 17:15
**Status:** 🔧 ROOT CAUSE IDENTIFIED - melosys-api Kafka consumer disconnected

## Root Cause Identified (2025-12-13)

### The Problem
melosys-api's EESSI Kafka consumer has **disconnected from the consumer group**, leaving 72 messages unprocessed on the `teammelosys.eessi.v1-local` topic.

### Evidence
```bash
$ docker exec kafka kafka-consumer-groups --bootstrap-server kafka.melosys.docker-internal:9092 \
    --describe --group teammelosys-eessiMelding-consumer-local

GROUP                                   TOPIC                      PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG   CONSUMER-ID
teammelosys-eessiMelding-consumer-local teammelosys.eessi.v1-local 0          44              116             72    -  (EMPTY!)
```

- **LAG: 72** - 72 messages waiting to be processed
- **CONSUMER-ID: -** - No active consumer connected!
- Kafka shows "unhealthy" status, which may have caused the consumer disconnect

### Solution
**Restart melosys-api from your IDE** (it's running as a local Java process, PID 58402):
1. Stop the melosys-api Java process in IntelliJ/IDE
2. Start melosys-api again
3. The Kafka consumer will reconnect and process the backlog

### Verification After Restart
```bash
# Check consumer is connected (CONSUMER-ID should NOT be empty)
docker exec kafka kafka-consumer-groups --bootstrap-server kafka.melosys.docker-internal:9092 \
    --describe --group teammelosys-eessiMelding-consumer-local

# Should show something like:
# LAG: 0, CONSUMER-ID: aiven-melosys-eessi-consumer-0-xxxxx

# Check melosys-api logs for EESSI processing
docker logs melosys-api 2>&1 | grep -E "MOTTAK_SED|eessi|fagsak" | tail -20
```

## Investigation Summary

### What's Working (Verified ✅)

1. **SedHendelse published to Kafka** ✅
   - `/testdata/lagsak` → `eessibasis-sedmottatt-v1-local`

2. **melosys-eessi receives and processes** ✅
   ```
   INFO | Mottatt melding om sed mottatt: SedHendelse(sedType=A003)
   INFO | Søker etter person for SED
   INFO | Resultat fra forsøk på identifisering av person: IDENTIFISERT
   ```

3. **Person identification works** ✅
   - PDL mock returns person for fnr from SED
   - "IDENTIFISERT" logged

4. **Journalpost created** ✅
   ```
   INFO | Oppretter journalpost for SED 1765640803407-dnllcsu
   INFO | Oppretter journalpost av type INNGAAENDE for arkivsakid ukjent
   ```

5. **MelosysEessiMelding published** ✅
   ```
   INFO | Publiserer melding om SED mottatt. SED: 669847581
   INFO | Publiserer eessiMelding melding på aiven
   ```

6. **Messages on topic** ✅
   ```bash
   $ docker exec kafka kafka-console-consumer --topic teammelosys.eessi.v1-local --from-beginning --max-messages 1
   {"sedId":"382484353","rinaSaksnummer":"881312640","journalpostId":"634356487","aktoerId":"1111111111111",...}
   ```

### What's NOT Working (Fixed by restart)

7. **melosys-api consumer disconnected** ❌
   - Consumer was set up at startup (14:22:29)
   - Later disconnected (possibly due to Kafka being unhealthy)
   - No active consumer = no message processing

## Previous Issues (Resolved)

### 1. SED Type Registry (melosys-docker-compose)

**Problem:** Mock always returned A003 SED regardless of sedType requested, causing ClassCastException.

**Fix:** Created `SedTypeRegistry` to track `rinaDokumentId → sedType`:
- `SedTypeRegistry.kt` - In-memory registry
- `LagSedController.kt` - Registers sedType when creating SedHendelse
- `EuxApi.kt` / `EuxRinaApi.kt` - Look up sedType when returning SED
- `FileUtils.kt` - Uses sedType for correct fallback file

**Commit:** `f3bc803` - "Add SED type registry for correct mock responses"

**Test file:** `tests/core/sed-mottak.spec.ts` - test "skal opprette fagsak via full eessi-flow med A003 fra Sverige"

### 2. Fagsak Verification Test (melosys-e2e-tests)

**Change:** Test now properly fails if no fagsak created (was just logging warning).

**File:** `tests/core/sed-mottak.spec.ts`
- Added `expect(fagsak).not.toBeNull()` assertion
- Shows debug info: process instances, helpful messages

## Architecture

```
Test calls /testdata/lagsak (mock)
        ↓
   Kafka: eessibasis-sedmottatt-v1-local          ✅ Working
        ↓
   melosys-eessi consumes                          ✅ Working
        ↓
   Fetches SED from /eux/cpi/buc/{id}/sed/{sedId}  ✅ Working (SedTypeRegistry)
        ↓
   melosys-eessi identifies person via PDL (mock)  ✅ Working (IDENTIFISERT)
        ↓
   Creates journalpost                             ✅ Working
        ↓
   Kafka: teammelosys.eessi.v1-local               ✅ Messages present (72 waiting)
        ↓
   melosys-api consumes                            ❌ Consumer disconnected!
        ↓
   MOTTAK_SED process → fagsak                     ❌ Not triggered (no consumer)
```

## Next Step: Restart melosys-api

**The fix is simple: Restart melosys-api from IntelliJ**

After restart, the consumer will reconnect and process all 72 pending messages.

## Quick Commands

```bash
# Check consumer group status (CONSUMER-ID should NOT be empty)
docker exec kafka kafka-consumer-groups --bootstrap-server kafka.melosys.docker-internal:9092 \
    --describe --group teammelosys-eessiMelding-consumer-local

# Check messages on topic
docker exec kafka kafka-console-consumer --bootstrap-server kafka.melosys.docker-internal:9092 \
    --topic teammelosys.eessi.v1-local --from-beginning --max-messages 3

# Check melosys-eessi logs (should show IDENTIFISERT)
docker logs melosys-eessi 2>&1 | grep -E "IDENTIFISERT|Publiserer|ERROR" | tail -20

# Check melosys-api health
curl http://localhost:8080/internal/health

# Run eessi tests
npx playwright test sed-mottak --grep "@eessi"

# Run specific fagsak test
npx playwright test sed-mottak.spec.ts --grep "fagsak via full eessi"

# Test SedHendelse endpoint manually
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
