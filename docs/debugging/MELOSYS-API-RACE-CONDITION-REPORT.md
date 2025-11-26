# Race Condition Bug Report: RESULTAT_TYPE Not Updated Before Kafka Publish

**Date:** 2025-11-26
**Severity:** Medium (causes intermittent test failures, potential production impact)
**Affected Component:** melosys-api - Deferred Prosessinstans Pattern
**Test:** `skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering`

---

## Executive Summary

When performing a "nyvurdering" (re-evaluation) that changes `skattepliktig` from `true` to `false`, there is a **race condition** where the Kafka message is published with `behandligsresultatType=IKKE_FASTSATT` instead of `MEDLEM_I_FOLKETRYGDEN`.

This causes the `FinnSakerForÅrsavregningIkkeSkattepliktige` job to find **0 cases** instead of **1**, because the job queries for `RESULTAT_TYPE = 'MEDLEM_I_FOLKETRYGDEN'`.

**The bug is intermittent** - it fails ~60-80% of the time in CI, but eventually passes with retries.

---

## Evidence from CI Logs

### Kafka Messages Analysis (10 test runs)

| Behandling ID | Test Direction | Kafka `behandligsresultatType` | Result |
|---------------|----------------|-------------------------------|--------|
| 2 | skattepliktig → ikke | `IKKE_FASTSATT` | ❌ |
| 4 | ikke → skattepliktig | `MEDLEM_I_FOLKETRYGDEN` | ✅ |
| 7 | skattepliktig → ikke | `IKKE_FASTSATT` | ❌ |
| 9 | ikke → skattepliktig | `MEDLEM_I_FOLKETRYGDEN` | ✅ |
| 12 | skattepliktig → ikke | `IKKE_FASTSATT` | ❌ |
| 14 | ikke → skattepliktig | `MEDLEM_I_FOLKETRYGDEN` | ✅ |
| 17 | ikke → skattepliktig | `MEDLEM_I_FOLKETRYGDEN` | ✅ |
| 19 | skattepliktig → ikke | `IKKE_FASTSATT` | ❌ |
| 21 | ikke → skattepliktig | `MEDLEM_I_FOLKETRYGDEN` | ✅ |
| 24 | skattepliktig → ikke | `IKKE_FASTSATT` | ❌ |
| 26 | skattepliktig → ikke | `IKKE_FASTSATT` | ❌ |
| 27 | ikke → skattepliktig | `MEDLEM_I_FOLKETRYGDEN` | ✅ |
| 28 | skattepliktig → ikke | `MEDLEM_I_FOLKETRYGDEN` | ✅ (finally!) |

**Pattern:**
- `ikke-skattepliktig → skattepliktig`: **100% success** (always `MEDLEM_I_FOLKETRYGDEN`)
- `skattepliktig → ikke-skattepliktig`: **~15% success** (usually `IKKE_FASTSATT`)

### Årsavregning Job Results

```
11:48:20 | ÅrsavregningIkkeSkattepliktigeFinner | Totalt fant 0 saker  ← WRONG
11:51:40 | ÅrsavregningIkkeSkattepliktigeFinner | Totalt fant 1 saker  ← CORRECT (after retry)
```

### Timeline of a Failed Case (Behandling 24)

```
11:49:58.514 | AvsluttFagsakOgBehandling | Avslutter behandling 24
11:49:58.544 | KafkaMelosysHendelseProducer | behandligsresultatType=IKKE_FASTSATT  ← BUG!
11:50:50.329 | ÅrsavregningIkkeSkattepliktigeFinner | Totalt fant 0 saker
```

### Timeline of a Successful Case (Behandling 28)

```
11:51:38.197 | AvsluttFagsakOgBehandling | Avslutter behandling 28
11:51:38.218 | KafkaMelosysHendelseProducer | behandligsresultatType=MEDLEM_I_FOLKETRYGDEN  ← CORRECT!
11:51:40.437 | ÅrsavregningIkkeSkattepliktigeFinner | Totalt fant 1 saker
```

---

## Root Cause Hypothesis

### The Deferred Pattern Flow

```
1. User submits vedtak via API
2. Transaction commits
3. StartProsessinstansEtterCommitListener fires (after commit)
4. Creates IVERKSETT_VEDTAK_FTRL prosessinstans
5. Prosessinstans runs:
   a. oppdaterBehandlingsresultat() - should set RESULTAT_TYPE = MEDLEM_I_FOLKETRYGDEN
   b. AvsluttFagsakOgBehandling - sets behandling.status = AVSLUTTET
   c. KafkaMelosysHendelseProducer - publishes VedtakHendelseMelding
```

### The Race Condition

**Hypothesis:** The `behandligsresultatType` in the Kafka message is read from the database **before** `oppdaterBehandlingsresultat()` has committed its changes.

Possible scenarios:
1. **Different transactions:** Kafka producer reads from a different transaction/connection that doesn't see uncommitted changes
2. **Read-before-write:** The value is read at the start of the prosessinstans, before `oppdaterBehandlingsresultat()` runs
3. **Caching:** JPA/Hibernate cache returns stale value
4. **Async execution:** Some step runs asynchronously and the Kafka publish doesn't wait for it

### Why Does Test 1 Always Work?

When changing from `ikke-skattepliktig → skattepliktig`:
- The initial `RESULTAT_TYPE` might already be `MEDLEM_I_FOLKETRYGDEN` from the first vedtak
- Or the code path for this direction is different

When changing from `skattepliktig → ikke-skattepliktig`:
- The `RESULTAT_TYPE` needs to be explicitly updated
- The race condition is more likely to manifest

---

## Code Areas to Investigate

### 1. KafkaMelosysHendelseProducer

Where does it get `behandligsresultatType` from?
- Does it query the database directly?
- Does it use a cached entity?
- Is it passed as a parameter from an earlier step?

### 2. oppdaterBehandlingsresultat()

- When is this called in the IVERKSETT_VEDTAK_FTRL flow?
- Does it commit immediately or wait for the transaction?
- Is it in the same transaction as the Kafka publish?

### 3. VedtakHendelseBuilder or similar

Look for where `VedtakHendelseMelding` is constructed:
```java
VedtakHendelseMelding(
    folkeregisterIdent=...,
    sakstype=...,
    sakstema=...,
    behandligsresultatType=???  // WHERE DOES THIS COME FROM?
    ...
)
```

### 4. IVERKSETT_VEDTAK_FTRL Prosessinstans Steps

Check the order of steps:
1. Which step updates `BEHANDLINGSRESULTAT.RESULTAT_TYPE`?
2. Which step publishes to Kafka?
3. Are they in the correct order?
4. Are they in the same transaction?

---

## Database Schema Reference

```sql
-- BEHANDLINGSRESULTAT table
BEHANDLINGSRESULTAT.BEHANDLING_ID  -- FK to BEHANDLING.ID
BEHANDLINGSRESULTAT.RESULTAT_TYPE  -- Should be 'MEDLEM_I_FOLKETRYGDEN' or 'IKKE_FASTSATT'

-- BEHANDLING table
BEHANDLING.ID
BEHANDLING.STATUS  -- 'UNDER_BEHANDLING' → 'AVSLUTTET'

-- VEDTAK_METADATA table
VEDTAK_METADATA.BEHANDLINGSRESULTAT_ID  -- FK to BEHANDLINGSRESULTAT.BEHANDLING_ID
VEDTAK_METADATA.VEDTAK_TYPE
```

---

## Suggested Debugging Steps

### 1. Add Logging in melosys-api

```java
// In KafkaMelosysHendelseProducer or VedtakHendelseBuilder
log.info("Building VedtakHendelseMelding: behandlingId={}, resultatType={}, source={}",
    behandling.getId(),
    behandlingsresultat.getResultatType(),
    "direkteFraEntity" // or "fraDatabase" etc.
);
```

### 2. Add Logging in oppdaterBehandlingsresultat()

```java
log.info("oppdaterBehandlingsresultat: behandlingId={}, oldType={}, newType={}",
    behandling.getId(),
    behandlingsresultat.getResultatType(), // before
    newResultatType // after
);
```

### 3. Check Transaction Boundaries

```java
// Log the transaction state
log.info("Transaction active: {}, readOnly: {}",
    TransactionSynchronizationManager.isActualTransactionActive(),
    TransactionSynchronizationManager.isCurrentTransactionReadOnly()
);
```

---

## Test Environment Details

- **melosys-api image:** `e2e-def-5`
- **Environment:** GitHub Actions CI (Linux containers)
- **Database:** Oracle XE in Docker
- **The same test passes 100% locally** on macOS

---

## Reproduction Steps

1. Create a new sak with `skattepliktig = true` and complete vedtak
2. Create a "nyvurdering" on the same sak
3. Change `skattepliktig` from `true` to `false`
4. Submit vedtak for the nyvurdering
5. Check Kafka message for `behandligsresultatType`

Expected: `MEDLEM_I_FOLKETRYGDEN`
Actual (intermittent): `IKKE_FASTSATT`

---

## Local Reproduction

### Running the Test Normally

```bash
# Run the failing test
npx playwright test "skattepliktig til ikke-skattepliktig" --project=chromium --reporter=list
```

### Simulating CI Timing to Reproduce the Bug

Set environment variables to add delays that stress the race condition:

```bash
# Enable CI delay simulation (500ms default)
SIMULATE_CI_DELAY=true npx playwright test "skattepliktig til ikke-skattepliktig" --project=chromium --reporter=list

# With custom delay (try longer delays to increase chance of reproducing)
SIMULATE_CI_DELAY=true CI_DELAY_MS=1000 npx playwright test "skattepliktig til ikke-skattepliktig" --project=chromium --reporter=list
```

### Interpreting Debug Output

The test now produces detailed debug output at these critical points:

1. **BEFORE changing skattepliktig** - Shows initial RESULTAT_TYPE
2. **AFTER changing skattepliktig** - Should still be same (change happens at vedtak)
3. **BEFORE submitting vedtak** - RESULTAT_TYPE should still be initial value
4. **IMMEDIATELY after vedtak** - 🚨 CRITICAL: Deferred process is starting here
5. **AFTER process completion** - Final RESULTAT_TYPE (should be MEDLEM_I_FOLKETRYGDEN)

Look for these markers in the output:
- `🚨 CRITICAL TIMING POINT` - The moment after vedtak submission
- `❌ BUG CONFIRMED` - If RESULTAT_TYPE is IKKE_FASTSATT
- `✅ CORRECT` - If RESULTAT_TYPE is MEDLEM_I_FOLKETRYGDEN
- `❌ JOB FOUND 0 CASES` - The årsavregning job manifestation of the bug

See: `tests/utenfor-avtaleland/workflows/nyvurdering-endring-skattestatus.spec.ts`

---

## Files for Reference

- **E2E Test:** `melosys-e2e-tests/tests/utenfor-avtaleland/workflows/nyvurdering-endring-skattestatus.spec.ts`
- **Previous Report:** `melosys-e2e-tests/docs/debugging/DEFERRED-PATTERN-BUG-REPORT.md`
- **Deferred Pattern Doc:** `melosys-api/docs/DEFERRED-PROSESSINSTANS-PATTERN.md`

---

## Questions for melosys-api Team

1. Where exactly is `behandligsresultatType` read when building the Kafka message?
2. Is `oppdaterBehandlingsresultat()` in the same transaction as the Kafka publish?
3. Are there any differences in the code path between:
   - `ikke-skattepliktig → skattepliktig` (always works)
   - `skattepliktig → ikke-skattepliktig` (intermittently fails)
4. Is there any async processing that could cause the Kafka publish to happen before the database update?

---

## Potential Fix Approaches

### Option 1: Ensure Transaction Ordering
Make sure `oppdaterBehandlingsresultat()` is called and committed **before** the Kafka message is built/sent.

### Option 2: Read Fresh Data for Kafka
When building `VedtakHendelseMelding`, explicitly query the database for the latest `RESULTAT_TYPE` rather than using a potentially stale cached value.

### Option 3: Include in Same Transaction
If the Kafka publish is happening in a separate transaction, consider including it in the same transaction as the database update.

### Option 4: Add Explicit Flush/Sync
If using JPA/Hibernate, ensure `entityManager.flush()` is called before the Kafka publish step.

---

## CI Run Data

This bug was observed in CI run `playwright-results-41` on 2025-11-26.

The test `skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering`:
- Failed on first attempt
- Passed on second attempt (retry)
- Flaky test runner showed 5/5 passes (but with retries)

melosys-api image tag: `e2e-def-5`
