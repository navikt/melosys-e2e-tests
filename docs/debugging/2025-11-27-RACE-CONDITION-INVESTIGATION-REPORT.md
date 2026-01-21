# Investigation Report: behandlingsresultat.type Race Condition

**Date:** 2025-11-27
**Investigators:** Claude Code (E2E, API, and Frontend agents)
**Status:** Root cause identified, fix recommended
**Severity:** High - Affects business logic and data integrity

---

## Executive Summary

The flaky E2E test `skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering` fails intermittently (~17% failure rate) because `behandlingsresultat.type` gets overwritten from `MEDLEM_I_FOLKETRYGDEN` to `IKKE_FASTSATT` during async prosessinstans processing.

**Root Cause:** The async method `ProsessinstansBehandler.behandleProsessinstans()` runs without a `@Transactional` annotation, causing it to load stale entity data. When `OpprettFakturaserie` modifies and saves the entity, it overwrites the correct `type` value with the stale one.

**Frontend Ruled Out:** The frontend always sends `MEDLEM_I_FOLKETRYGDEN` (hardcoded) - it cannot cause `IKKE_FASTSATT`.

**Recommended Fix:** Add `@Transactional(propagation = REQUIRES_NEW)` to `behandleProsessinstans()`.

---

## Table of Contents

1. [Problem Description](#problem-description)
2. [Evidence from GitHub Actions](#evidence-from-github-actions)
3. [Backend Analysis](#backend-analysis)
4. [Frontend Analysis](#frontend-analysis)
5. [Root Cause Summary](#root-cause-summary)
6. [Recommended Fix](#recommended-fix)
7. [Appendix: Log Evidence](#appendix-log-evidence)

---

## Problem Description

### Affected Test
```
tests/utenfor-avtaleland/workflows/nyvurdering-endring-skattestatus.spec.ts
Test: "skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering"
```

### Test Flow
1. Creates forstegangsvedtak with `skattepliktig=true`
2. Creates "ny vurdering" (nyvurdering)
3. Changes trygdeavgift to `skattepliktig=false`
4. Clicks "Bekreft og fortsett" on trygdeavgift page
5. Navigates to vedtak page
6. Clicks "Fatt vedtak" for ny vurdering (ENDRINGSVEDTAK)
7. Runs `finnIkkeSkattepliktigeSaker` job
8. **Expected:** Job finds 1 case
9. **Actual (intermittent):** Job finds 0 cases

### Impact
- Cases not included in arsavregning when they should be
- Potentially affects billing and tax calculations
- **This is NOT just a logging/Kafka issue** - the wrong value is persisted in the database

---

## Evidence from GitHub Actions

### Workflow Run Analyzed
- **Branch:** `debug-nvvurdering-endring-skattestatus` (also `fix/debug-nvvurdering-endring-skattestatus`)
- **Run ID:** 19716258276
- **melosys-api Image:** `e2e-be-fix-1`

### Test Results Summary

| Run | behandlingId | behandligsresultatType | Job Result (antallProsessert) | Status |
|-----|--------------|------------------------|-------------------------------|--------|
| 1   | 4            | `MEDLEM_I_FOLKETRYGDEN` | 1 | OK |
| 2   | 6            | `MEDLEM_I_FOLKETRYGDEN` | 1 | OK |
| 3   | 8            | `MEDLEM_I_FOLKETRYGDEN` | 1 | OK |
| 4   | 10           | `MEDLEM_I_FOLKETRYGDEN` | 1 | OK |
| **5** | **14**     | **`IKKE_FASTSATT`**    | **0** | **BUG** |
| 6   | 16           | `MEDLEM_I_FOLKETRYGDEN` | 1 | OK |

**Failure Rate:** ~17% (1/6 ENDRINGSVEDTAK)

### Key Log Sequence (Run 5, behandlingId=14)

```
20:22:20.456 | FtrlVedtakService.oppdaterBehandlingsresultat: behandlingId=14,
              utledtType=MEDLEM_I_FOLKETRYGDEN, FOR lagring
20:22:20.456 | BehandlingsresultatService.lagre: behandlingId=14, type=MEDLEM_I_FOLKETRYGDEN
20:22:20.456 | FtrlVedtakService.oppdaterBehandlingsresultat: behandlingId=14,
              lagret type=MEDLEM_I_FOLKETRYGDEN, ETTER lagring

[Transaction T1 commits - async prosessinstans starts in new thread]

20:22:20.483 | ProsessinstansBehandler.behandleProsessinstans: Reloaded prosessinstans fra DB,
              behandlingId=14
20:22:20.497 | LagreMedlemsperiodeMedl.utfor: behandlingId=14,
              behandlingsresultat.type=IKKE_FASTSATT  <-- STALE!
20:22:20.536 | OpprettFakturaserie.utfor: behandlingId=14,
              behandlingsresultat.type=IKKE_FASTSATT  <-- STALE!
20:22:20.577 | BehandlingsresultatService.lagre: behandlingId=14,
              type=IKKE_FASTSATT  <-- OVERWRITES CORRECT VALUE!
20:22:20.597 | AvsluttFagsakOgBehandling.utfor: behandlingId=14,
              behandlingsresultat.type=IKKE_FASTSATT
20:22:20.620 | SendMeldingOmVedtak.utfor: behandlingId=14,
              behandlingsresultat.type=IKKE_FASTSATT, vedtakstype=ENDRINGSVEDTAK

[Job runs and finds 0 cases because type=IKKE_FASTSATT in database]

20:22:22.318 | Totalt fant 0 saker for arsavregning ikke skattepliktig
              "antallProsessert" : 0
```

---

## Backend Analysis

### Transaction Flow

```
1. VedtaksfattingFasade.fattVedtak() [@Transactional - T1]
   +-- FtrlVedtakService.fattVedtak()
       +-- oppdaterBehandlingsresultat() -> saves MEDLEM_I_FOLKETRYGDEN
       +-- prosessinstansService.opprettProsessinstansIverksettVedtakFTRL()
           -> Creates Prosessinstans, publishes ProsessinstansOpprettetEvent

2. T1 commits -> MEDLEM_I_FOLKETRYGDEN written to database

3. ProsessinstansOpprettetListener [@TransactionalEventListener(AFTER_COMMIT)]
   +-- Fires after T1 commits
   +-- Calls prosessinstansBehandler.behandleProsessinstans()

4. ProsessinstansBehandler.behandleProsessinstans() [@Async, NO @Transactional!]
   +-- Runs in new thread from saksflytThreadPoolTaskExecutor
   +-- Reloads Prosessinstans from DB
   +-- Gets STALE entity with IKKE_FASTSATT (race condition!)
   +-- Executes steps: LagreMedlemsperiodeMedl, OpprettFakturaserie, etc.

5. OpprettFakturaserie.utfor()
   +-- Loads behandlingsresultat (sees IKKE_FASTSATT)
   +-- Modifies fakturaserieReferanse field
   +-- Calls behandlingsresultatService.lagre(behandlingsresultat)
   +-- OVERWRITES all fields including stale type!
```

### Why Data is Stale

The `@Async` method runs in a thread from `saksflytThreadPoolTaskExecutor`. There's a timing window where:

1. The Oracle database commit has happened
2. But the async thread's new EntityManager might not immediately see the committed data due to:
   - Connection pool reuse
   - Database read consistency timing
   - Hibernate session cache issues

### Culprit Code

**File:** `saksflyt/src/main/kotlin/no/nav/melosys/saksflyt/steg/fakturering/OpprettFakturaserie.kt`
**Lines:** 128-133

```kotlin
private fun opprettFakturaserieOgLagreReferanse(
    behandlingsresultat: Behandlingsresultat,
    fakturaserieDto: FakturaserieDto,
    saksbehandlerIdent: String
) {
    val fakturaserieResponse = faktureringskomponentenConsumer.lagFakturaserie(...)
    behandlingsresultat.fakturaserieReferanse = fakturaserieResponse.fakturaserieReferanse
    behandlingsresultatService.lagre(behandlingsresultat)  // SAVES ALL FIELDS!
}
```

**Problem:** The `lagre()` call saves the entire entity, including the stale `type` field.

### Relevant Source Files

| File | Location | Description |
|------|----------|-------------|
| `ProsessinstansOpprettetListener.java` | `saksflyt/src/main/java/.../saksflyt/` | AFTER_COMMIT listener |
| `ProsessinstansBehandler.java` | `saksflyt/src/main/java/.../saksflyt/` | Async processor (missing @Transactional) |
| `OpprettFakturaserie.kt` | `saksflyt/src/main/kotlin/.../steg/fakturering/` | Saves stale entity |
| `BehandlingsresultatService.kt` | `service/src/main/kotlin/.../behandling/` | lagre() method |
| `FtrlVedtakService.kt` | `service/src/main/kotlin/.../vedtak/` | Correctly sets type |

---

## Frontend Analysis

### API Calls During Ny Vurdering Flow

| Step | API Endpoint | Sends behandlingsresultat.type? | Value Sent |
|------|--------------|--------------------------------|------------|
| Trygdeavgift beregning | `PUT /behandlinger/{id}/trygdeavgift/beregning` | NO | N/A |
| Kontroller ferdigbehandling | `POST /kontroll/ferdigbehandling` | YES | `MEDLEM_I_FOLKETRYGDEN` |
| Fatt vedtak | `POST /saksflyt/vedtak/{id}/fatt` | YES | **Hardcoded** `MEDLEM_I_FOLKETRYGDEN` |

### Critical Frontend Code

**File:** `melosys-web/src/sider/ftrl/saksbehandling/stegKomponenter/vurderingVedtak/vurderingVedtak.tsx`
**Lines:** 299-313

```typescript
const lagFattVedtakReqDto = (): Api.Saksflyt.Vedtak.FattVedtakFTRLReqDto => {
  return {
    behandlingsresultatTypeKode: erDelvisOpphor ? DELVIS_OPPHORT : MEDLEM_I_FOLKETRYGDEN,
    // ... other fields
  };
};
```

### Frontend Conclusion

**The frontend is definitively ruled out as the cause:**

1. The value is determined by local frontend logic, NOT from Redux state
2. For ny vurdering without delvis opphor: **Always `MEDLEM_I_FOLKETRYGDEN`**
3. The frontend **NEVER** sends `IKKE_FASTSATT`
4. There is no code path in the frontend that could set `IKKE_FASTSATT`

The frontend's debounced API calls may expose the race condition by creating timing variations, but the actual incorrect state is being set in the backend.

---

## Root Cause Summary

| Component | Finding |
|-----------|---------|
| **Frontend** | Ruled out - always sends `MEDLEM_I_FOLKETRYGDEN` |
| **Backend - FtrlVedtakService** | Correctly saves `MEDLEM_I_FOLKETRYGDEN` |
| **Backend - ProsessinstansBehandler** | Missing `@Transactional` causes stale data to be loaded |
| **Backend - OpprettFakturaserie** | Saves entire entity including stale `type`, overwriting correct value |

**The bug is 100% in the backend async processing flow.**

---

## Recommended Fix

### Primary Fix: Add @Transactional to behandleProsessinstans

**File:** `saksflyt/src/main/java/no/nav/melosys/saksflyt/ProsessinstansBehandler.java`

```java
@Async("saksflytThreadPoolTaskExecutor")
@Transactional(propagation = Propagation.REQUIRES_NEW)  // <-- ADD THIS
public void behandleProsessinstans(@NotNull Prosessinstans prosessinstansEvent) {
    // Existing code...
}
```

**Benefits:**
- Ensures fresh transaction with clean EntityManager
- All entity loads will get fresh data from the database
- Simple, one-line change

### Secondary Fix (Defense-in-Depth): Targeted Field Updates

Modify `OpprettFakturaserie` to only update `fakturaserieReferanse` instead of saving entire entity:

**New method in BehandlingsresultatService:**
```kotlin
fun oppdaterFakturaserieReferanse(behandlingId: Long, fakturaserieReferanse: String) {
    behandlingsresultatRepository.findById(behandlingId)
        .orElseThrowIkkeFunnetException(behandlingId)
        .also {
            it.fakturaserieReferanse = fakturaserieReferanse
            behandlingsresultatRepository.save(it)
        }
}
```

### Alternative Fixes Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| entityManager.clear() in listener | Clear cache before loading | Ensures fresh data | Unclear behavior without transaction |
| saveAndFlush() in FtrlVedtakService | Force immediate DB write | Minimal change | Doesn't fix stale session in async thread |
| Pass type as immutable data | Store type in prosessinstans data map | Avoids entity staleness | More invasive change |

---

## Verification Plan

After implementing the fix:

1. Build new melosys-api image (e.g., `e2e-fix-race-v3`)
2. Run E2E test without retries: `npx playwright test nyvurdering-endring-skattestatus --retries=0`
3. Run 10+ times to verify stability
4. Check logs for:
   - `behandlingsresultat.type=MEDLEM_I_FOLKETRYGDEN` in all [RACE-DEBUG] entries
   - `antallProsessert=1` in job results

### Success Criteria

- [ ] `BEHANDLINGSRESULTAT.RESULTAT_TYPE` = `MEDLEM_I_FOLKETRYGDEN` in database after ny vurdering
- [ ] `finnIkkeSkattepliktigeSaker` job finds 1 case
- [ ] Test passes consistently (10/10 runs without retries)
- [ ] Kafka message shows correct type

---

## Appendix: Log Evidence

### Full Race Condition Sequence (Run 5)

```
2025-11-27T20:22:20.456Z | [RACE-DEBUG] FtrlVedtakService.oppdaterBehandlingsresultat:
    behandlingId=14, utledtType=MEDLEM_I_FOLKETRYGDEN, FOR lagring

2025-11-27T20:22:20.456Z | [RACE-DEBUG] BehandlingsresultatService.lagre:
    behandlingId=14, type=MEDLEM_I_FOLKETRYGDEN

2025-11-27T20:22:20.456Z | [RACE-DEBUG] FtrlVedtakService.oppdaterBehandlingsresultat:
    behandlingId=14, lagret type=MEDLEM_I_FOLKETRYGDEN, ETTER lagring

2025-11-27T20:22:20.480Z | ProsessinstansOpprettetListener: onProsessinstansOpprettet fired

2025-11-27T20:22:20.483Z | [RACE-DEBUG] ProsessinstansBehandler.behandleProsessinstans:
    Reloaded prosessinstans fra DB, behandlingId=14

2025-11-27T20:22:20.497Z | [RACE-DEBUG] LagreMedlemsperiodeMedl.utfor:
    behandlingId=14, behandlingsresultat.type=IKKE_FASTSATT

2025-11-27T20:22:20.536Z | [RACE-DEBUG] OpprettFakturaserie.utfor:
    behandlingId=14, behandlingsresultat.type=IKKE_FASTSATT

2025-11-27T20:22:20.577Z | [RACE-DEBUG] BehandlingsresultatService.lagre:
    behandlingId=14, type=IKKE_FASTSATT

2025-11-27T20:22:20.597Z | [RACE-DEBUG] AvsluttFagsakOgBehandling.utfor:
    behandlingId=14, behandlingsresultat.type=IKKE_FASTSATT

2025-11-27T20:22:20.620Z | [RACE-DEBUG] SendMeldingOmVedtak.utfor:
    behandlingId=14, behandlingsresultat.type=IKKE_FASTSATT, vedtakstype=ENDRINGSVEDTAK

2025-11-27T20:22:20.620Z | VedtakHendelseMelding(
    behandligsresultatType=IKKE_FASTSATT,
    vedtakstype=ENDRINGSVEDTAK,
    ...
)

2025-11-27T20:22:22.318Z | Totalt fant 0 saker for arsavregning ikke skattepliktig
    { "antallProsessert": 0 }
```

### Successful Run Sequence (Run 4)

```
2025-11-27T20:21:30.123Z | [RACE-DEBUG] FtrlVedtakService.oppdaterBehandlingsresultat:
    behandlingId=10, lagret type=MEDLEM_I_FOLKETRYGDEN, ETTER lagring

2025-11-27T20:21:30.156Z | [RACE-DEBUG] ProsessinstansBehandler.behandleProsessinstans:
    Reloaded prosessinstans fra DB, behandlingId=10

2025-11-27T20:21:30.178Z | [RACE-DEBUG] LagreMedlemsperiodeMedl.utfor:
    behandlingId=10, behandlingsresultat.type=MEDLEM_I_FOLKETRYGDEN  <-- CORRECT

2025-11-27T20:21:30.210Z | [RACE-DEBUG] OpprettFakturaserie.utfor:
    behandlingId=10, behandlingsresultat.type=MEDLEM_I_FOLKETRYGDEN  <-- CORRECT

2025-11-27T20:21:30.245Z | [RACE-DEBUG] SendMeldingOmVedtak.utfor:
    behandlingId=10, behandlingsresultat.type=MEDLEM_I_FOLKETRYGDEN, vedtakstype=ENDRINGSVEDTAK

2025-11-27T20:21:32.456Z | Totalt fant 1 saker for arsavregning ikke skattepliktig
    { "antallProsessert": 1 }
```

---

## References

- **E2E Test:** `melosys-e2e-tests/tests/utenfor-avtaleland/workflows/nyvurdering-endring-skattestatus.spec.ts`
- **Job Code:** `melosys-api/service/src/main/kotlin/.../aarsavregning/ikkeskattepliktig/ArsavregningIkkeSkattepliktigeFinner.kt`
- **Previous Investigation:** `melosys-e2e-tests/docs/INVESTIGATION-BEHANDLINGSRESULTAT-TYPE-ISSUE.md`
- **Fix Plan:** `melosys-e2e-tests/docs/debugging/2025-11-26-FIX-PLAN-BEHANDLINGSRESULTAT-RACE-CONDITION.md`

---

**Report generated by:** Claude Code
**Date:** 2025-11-27
