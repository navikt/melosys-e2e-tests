# Race Condition Analysis: ObjectOptimisticLockingFailureException

**Date:** 2026-01-24
**Affected Entity:** `SaksopplysningKilde`
**Exception:** `ObjectOptimisticLockingFailureException`
**Flakiness:** ~1/20 runs on GitHub Actions CI

## Executive Summary

API trace recording during E2E tests revealed that the frontend calls `/api/kontroll/ferdigbehandling` **435ms after** the `/api/saksflyt/vedtak/{id}/fatt` endpoint returns. Since `/fatt` triggers an async saga (`HENT_REGISTEROPPLYSNINGER`) that operates on `SaksopplysningKilde`, and `/kontroll/ferdigbehandling` **also calls the same `RegisteropplysningerService.hentOgLagreOpplysninger()` method**, a race condition occurs when both execute concurrently.

## Root Cause Confirmed

**Both endpoints call the same service method:**

1. **Saga (from `/fatt`):** Calls `RegisteropplysningerService.hentOgLagreOpplysninger()`
2. **`/kontroll/ferdigbehandling`:** Also calls `RegisteropplysningerService.hentOgLagreOpplysninger()`

See: `melosys-api/service/src/main/kotlin/no/nav/melosys/service/kontroll/feature/ferdigbehandling/KontrollMedRegisteropplysning.kt` lines 48-63

## Timeline from API Trace

```
[16.0s]  POST /api/saksflyt/vedtak/81/fatt         → 204 (65ms)   ← SAGA STARTS
[16.1s]  GET  /api/saksbehandling/sakstyper/...   → 200 (8ms)
[16.1s]  GET  /api/oppgaver/oversikt              → 200 (6ms)
[16.5s]  POST /api/kontroll/ferdigbehandling      → 400 (8ms)    ← RACE TRIGGER
```

**Key observation:** Only **435ms** between `/fatt` returning and `/kontroll/ferdigbehandling` being called.

## Root Cause Analysis

### The Race Condition Sequence

```
Time     Backend (Saga)                    Frontend
─────────────────────────────────────────────────────────────────
T+0ms    /fatt returns 204
         Saga HENT_REGISTEROPPLYSNINGER
         starts async in thread pool

T+65ms   Saga reads SaksopplysningKilde
         (version N)

T+88ms                                     Receives 204 response
                                           UI updates

T+435ms                                    Calls /kontroll/ferdigbehandling

T+450ms  /kontroll/ferdigbehandling reads
         SaksopplysningKilde (version N)

T+500ms  Saga updates SaksopplysningKilde
         (version becomes N+1)

T+520ms  /kontroll/ferdigbehandling tries
         to update SaksopplysningKilde

         ❌ ObjectOptimisticLockingFailureException
            Expected version N, found N+1
```

### Why This Is Flaky

The race condition only manifests when:
1. The saga takes longer than ~400ms to complete its work on `SaksopplysningKilde`
2. On CI with higher load, saga execution is slower
3. Locally, the saga often completes in <100ms, so the race rarely occurs

## Evidence from API Traces

### Trace File
`playwright-report/api-traces/skal-fullf-re-arbeid-i-flere-land-arbeidsflyt-med-vedtak.json`

### Race Condition Endpoints Identified
```json
{
  "raceConditionEndpoints": [
    "/api/saksflyt/vedtak/81/fatt",
    "/api/kontroll/ferdigbehandling"
  ]
}
```

### Full Request Sequence Around Vedtak
```
[15.9s]  POST /api/mottatteopplysninger/81
[15.9s]  POST /api/vilkaar/81
[15.9s]  POST /api/avklartefakta/81
[15.9s]  POST /api/behandlinger/81/tidligere-medlemsperioder
[15.9s]  POST /api/anmodningsperioder/81
[15.9s]  POST /api/lovvalgsperioder/81
[15.9s]  POST /api/utpekingsperioder/81
[16.0s]  POST /api/saksflyt/vedtak/81/fatt         ← SAGA STARTS HERE
[16.1s]  GET  /api/saksbehandling/sakstyper/...
[16.1s]  GET  /api/oppgaver/oversikt
[16.5s]  POST /api/kontroll/ferdigbehandling       ← RACES WITH SAGA
```

## Why `waitForProcessInstances` Does NOT Fix This

The `waitForProcessInstances` helper waits for the saga to complete, but:

1. **The frontend doesn't wait** - melosys-web immediately calls `/kontroll/ferdigbehandling` after receiving the 204 from `/fatt`
2. **The race is between saga and frontend call** - not between saga and test cleanup
3. **Both run concurrently** - by the time `waitForProcessInstances` would return, the damage is done

```
/fatt returns 204
    ├── Saga starts async (backend)
    └── Frontend receives 204
            └── Frontend calls /kontroll/ferdigbehandling (435ms later)
                    └── RACE CONDITION with saga
```

## Recommended Fixes

### Option 1: Skip Register Update in /kontroll/ferdigbehandling (Easiest - melosys-web)

Since the saga already calls `registeropplysningerService.hentOgLagreOpplysninger()`, the `/kontroll/ferdigbehandling` call doesn't need to do it again.

**In `vurderingArtikkel13_x_vedtak.jsx` (lines 69-75):**

```javascript
// BEFORE (causes race condition)
const request = {
  behandlingID,
  vedtakstype: ...,
  behandlingsresultattype: ...,
  skalRegisteropplysningerOppdateres: oppdaterFørKontroll,  // ← TRUE!
};

// AFTER (avoids race condition)
const request = {
  behandlingID,
  vedtakstype: ...,
  behandlingsresultattype: ...,
  skalRegisteropplysningerOppdateres: false,  // ← Saga handles this
};
```

**Pros:** Simple one-line change
**Cons:** Need to verify saga always runs first; may need similar changes in other vedtak flows

### Option 2: Don't Call /kontroll/ferdigbehandling After Vedtak (melosys-web)

If the kontroll is only needed before vedtak (not after), disable it once vedtak is fattet:

```javascript
useEffect(() => {
  // Don't run kontroll after vedtak is submitted
  if (vedtakFattet) return;

  debouncedKontrollerBehandling({ aktivtSteg, formIsValid, formValues, mottatteOpplysningerStatus });
}, [aktivtSteg, formIsValid, mottatteOpplysningerStatus, vedtakFattet]);
```

### Option 3: Backend Deduplication (melosys-api)

Have `RegisteropplysningerService` detect concurrent calls and skip if already in progress:

```kotlin
@Service
class RegisteropplysningerService {
    private val inProgressBehandlinger = ConcurrentHashMap.newKeySet<Long>()

    fun hentOgLagreOpplysninger(request: RegisteropplysningerRequest) {
        val behandlingId = request.behandlingID

        // Skip if already in progress for this behandling
        if (!inProgressBehandlinger.add(behandlingId)) {
            log.info("Skipping duplicate hentOgLagreOpplysninger for behandling $behandlingId")
            return
        }

        try {
            // ... existing logic ...
        } finally {
            inProgressBehandlinger.remove(behandlingId)
        }
    }
}
```

### Option 4: Add Retry on OptimisticLockingFailure (melosys-api)

```kotlin
@Retryable(
    value = [ObjectOptimisticLockingFailureException::class],
    maxAttempts = 3,
    backoff = Backoff(delay = 100, multiplier = 2.0)
)
fun hentOgLagreOpplysninger(request: RegisteropplysningerRequest) {
    // ... existing logic ...
}
```

### Option 5: Wait for Saga in Frontend (melosys-web)

Add a wait/poll mechanism before calling `/kontroll/ferdigbehandling`:

```javascript
const kontrollerBehandling = async (data) => {
  if (redigerbart && data.mottatteOpplysningerStatus === "OK" && data.aktivtSteg && data.formIsValid) {
    setVedtakPending(true);

    // Wait for any running saga to complete
    await waitForSagaCompletion(behandlingID);

    const request = { ... };
    await kontrollerFerdigbehandling(request);
    setVedtakPending(false);
  }
};
```

## Recommendation

**Start with Option 1** (set `skalRegisteropplysningerOppdateres: false`) - it's the simplest fix with lowest risk.

If the saga is guaranteed to run and update register opplysninger, there's no need for `/kontroll/ferdigbehandling` to do it again. This eliminates the race condition entirely.

## melosys-web Analysis: What Triggers `/kontroll/ferdigbehandling`

### Source File
`melosys-web/src/sider/eu_eøs/stegKomponenter/vurderingArtikkel13_x_vedtak/vurderingArtikkel13_x_vedtak.jsx`

### Trigger Mechanism (lines 84-86)
```javascript
useEffect(() => {
  debouncedKontrollerBehandling({ aktivtSteg, formIsValid, formValues, mottatteOpplysningerStatus });
}, [aktivtSteg, formIsValid, mottatteOpplysningerStatus]);
```

The call is triggered by a **React `useEffect` hook** that fires when these state variables change:
- `aktivtSteg` - whether this step is active
- `formIsValid` - form validation status
- `mottatteOpplysningerStatus` - status of received information

### Debounce (line 80-82)
```javascript
const debouncedKontrollerBehandling = useCallback(Utils._debounce(kontrollerBehandling, 500), [
  kontrollerFerdigbehandling,
]);
```

There's a **500ms debounce**, which explains the ~435ms timing we observed (debounce isn't exact).

### The Request Includes Register Update Flag (lines 69-75)
```javascript
const request = {
  behandlingID,
  vedtakstype: data.formValues.vedtakstype || MKV.Koder.vedtakstyper.FØRSTEGANGSVEDTAK,
  behandlingsresultattype: MKV.Koder.behandlinger.behandlingsresultattyper.FORELOEPIG_FASTSATT_LOVVALGSLAND,
  skalRegisteropplysningerOppdateres: oppdaterFørKontroll,  // ← TRUE first time!
};
oppdaterFørKontroll = false;
```

**Key insight:** `skalRegisteropplysningerOppdateres: true` triggers the backend to call `RegisteropplysningerService.hentOgLagreOpplysninger()` - the same method the saga calls!

### melosys-api Backend (KontrollMedRegisteropplysning.kt lines 48-63)
```kotlin
private fun hentNyeRegisteropplysninger(behandling: Behandling) {
    registeropplysningerService.hentOgLagreOpplysninger(  // ← SAME AS SAGA!
        RegisteropplysningerRequest.builder()
            .behandlingID(behandling.id)
            .fnr(fnr)
            .fom(søknadsperiode.getFom())
            .tom(søknadsperiode.getTom())
            .saksopplysningTyper(...)
            .build()
    )
}
```

### The Race Condition Sequence (Confirmed)
```
/fatt returns 204
    ├── Saga starts async
    │       └── registeropplysningerService.hentOgLagreOpplysninger()
    │               └── Updates SaksopplysningKilde (version N → N+1)
    │
    └── Frontend useEffect triggers (state changed)
            └── 500ms debounce
                    └── /kontroll/ferdigbehandling
                            └── registeropplysningerService.hentOgLagreOpplysninger()
                                    └── ❌ OptimisticLockingFailure (expected N, got N+1)
```

## Questions Answered

1. **What triggers the `/kontroll/ferdigbehandling` call?**
   - **Answer:** A React `useEffect` hook that fires on state changes (`aktivtSteg`, `formIsValid`, `mottatteOpplysningerStatus`) with a 500ms debounce

2. **Can we delay or condition this call?**
   - **Answer:** Yes - the hook could check for saga completion before calling
   - Or: Set `skalRegisteropplysningerOppdateres: false` when saga will handle it

3. **What does `/kontroll/ferdigbehandling` do with `SaksopplysningKilde`?**
   - **Answer:** It calls `registeropplysningerService.hentOgLagreOpplysninger()` which **reads and updates** `SaksopplysningKilde` - **the exact same operation as the saga**

## Reproduction Steps

1. Run the E2E test with API tracing:
   ```bash
   RECORD_API_TRACE=true npm test tests/eu-eos/eu-eos-13.1-arbeid-flere-land-fullfort-vedtak.spec.ts
   ```

2. Check the trace file:
   ```bash
   cat playwright-report/api-traces/*.json | jq '.entries[] | select(.isRaceConditionEndpoint)'
   ```

3. On CI, the race manifests when saga takes >435ms

## Files Created for Debugging

| File | Purpose |
|------|---------|
| `helpers/api-trace-helper.ts` | Records API calls with timestamps |
| `helpers/api-replay-helper.ts` | Replays traces for debugging |
| `fixtures/api-trace.ts` | Auto-attaches tracer to tests |
| `tests/debug/api-replay-race-condition.spec.ts` | Analysis tests |

## Usage

```bash
# Record API trace during any test
RECORD_API_TRACE=true npm test tests/your-test.spec.ts

# Analyze the trace
npm test tests/debug/api-replay-race-condition.spec.ts --grep "analyze"

# Check for missing waitForProcessInstances patterns
npm test tests/debug/api-replay-race-condition.spec.ts --grep "missing"
```

## Conclusion

The race condition is caused by **melosys-web calling `/api/kontroll/ferdigbehandling` before the saga triggered by `/api/saksflyt/vedtak/{id}/fatt` completes**. The fix must be implemented in the frontend to either:

1. Wait for saga completion before calling `/kontroll/ferdigbehandling`
2. Or the backend must handle concurrent access more gracefully

The E2E test framework cannot fix this race condition - it can only detect and report it.

---

**Report generated from API trace analysis**
**Trace ID:** `e2e-ps2qx9-1769250250186`
**Test:** `skal fullføre "Arbeid i flere land" arbeidsflyt med vedtak`
