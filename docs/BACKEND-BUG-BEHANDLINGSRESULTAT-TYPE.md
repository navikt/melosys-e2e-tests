# Backend Bug Report: Non-deterministic behandlingsresultat.type in Ny Vurdering

**Date:** 2025-11-20
**Severity:** HIGH
**Status:** Requires Backend Investigation
**Affected Component:** melosys-api (FtrlVedtakService / BehandlingsresultatService)

## Executive Summary

When creating a ny vurdering vedtak with reason `FEIL_I_BEHANDLING`, the backend **non-deterministically** sets `behandlingsresultat.type` to either:
- `IKKE_FASTSATT` (wrong) - causes årsavregning job to skip the case
- `MEDLEM_I_FOLKETRYGDEN` (correct) - job processes the case normally

This is a **backend race condition or logic error**, not a test timing issue. The behavior is random across test runs with identical input.

**Impact:** Cases may not be included in årsavregning when they should be, affecting billing accuracy.

## Evidence from E2E Tests

### Test: `skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering`

**Run 1 - FAILED (MEL-11):**
```
2025-11-20T15:03:53.502 - First vedtak (behandling 13)
VedtakHendelseMelding(
  behandligsresultatType=MEDLEM_I_FOLKETRYGDEN,  // ✅ Correct
  vedtakstype=FØRSTEGANGSVEDTAK,
  sak=MEL-11
)

2025-11-20T15:04:00.836 - Ny vurdering (behandling 14)
VedtakHendelseMelding(
  behandligsresultatType=IKKE_FASTSATT,  // ❌ WRONG!
  vedtakstype=ENDRINGSVEDTAK,
  sak=MEL-11
)
→ Job found 0 cases (expected 1)
```

**Run 2 - SUCCESS (MEL-12, same test, retry):**
```
2025-11-20T15:04:43.702 - First vedtak (behandling 15)
VedtakHendelseMelding(
  behandligsresultatType=MEDLEM_I_FOLKETRYGDEN,  // ✅ Correct
  vedtakstype=FØRSTEGANGSVEDTAK,
  sak=MEL-12
)

2025-11-20T15:04:50.911 - Ny vurdering (behandling 16)
VedtakHendelseMelding(
  behandligsresultatType=MEDLEM_I_FOLKETRYGDEN,  // ✅ Correct!
  vedtakstype=ENDRINGSVEDTAK,
  sak=MEL-12
)
→ Job found 1 case
```

**Observation:** Same test inputs, different `behandlingsresultat.type` → Backend bug.

### Pattern Across Multiple Test Runs

| Test Run | First Vedtak Type | Ny Vurdering Type | Job Result |
|----------|-------------------|-------------------|------------|
| results-23 MEL-8 | MEDLEM_I_FOLKETRYGDEN | IKKE_FASTSATT | 0 found ❌ |
| results-23 MEL-9 | MEDLEM_I_FOLKETRYGDEN | IKKE_FASTSATT | 0 found ❌ |
| results-23 MEL-10 | MEDLEM_I_FOLKETRYGDEN | MEDLEM_I_FOLKETRYGDEN | 1 found ✅ |
| results-25 MEL-11 | MEDLEM_I_FOLKETRYGDEN | IKKE_FASTSATT | 0 found ❌ |
| results-25 MEL-12 | MEDLEM_I_FOLKETRYGDEN | MEDLEM_I_FOLKETRYGDEN | 1 found ✅ |

**Success Rate:** ~40% (2 of 5 runs)

## Technical Analysis

### The Problem

The job query `ÅrsavregningIkkeSkattepliktigeFinner.kt` (line 126) requires:

```sql
AND br.type = 'MEDLEM_I_FOLKETRYGDEN'
```

When `behandlingsresultat.type` is `IKKE_FASTSATT`, the query **excludes the case entirely**, even though it meets all other criteria:
- Has `skatteplikttype = 'IKKE_SKATTEPLIKTIG'` ✅
- Has `behandling.status = 'AVSLUTTET'` ✅
- Within date range ✅
- But `br.type = 'IKKE_FASTSATT'` ❌

### Expected Behavior

When creating ny vurdering via replication:
1. Copy previous behandling's data (ReplikerBehandling service)
2. Create new behandlingsresultat
3. **Copy `behandlingsresultat.type` from previous behandling**
4. User modifies trygdeavgift data
5. Submit vedtak with reason `FEIL_I_BEHANDLING`
6. **behandlingsresultat.type should remain `MEDLEM_I_FOLKETRYGDEN`**

### Actual Behavior

Sometimes the type gets set to `IKKE_FASTSATT` instead of preserving the original type.

### Why Test Timing Fixes Didn't Work

We tried:
1. ✅ `waitForProcessInstances()` - Ensures process commits before job
2. ✅ `page.waitForLoadState('networkidle')` - Ensures frontend is ready

**But:** The bug happens **server-side during vedtak submission**, so frontend timing doesn't matter.

## Investigation Guide for melosys-api

### Step 1: Locate the Vedtak Submission Code

**Files to investigate:**

1. **FtrlVedtakService.kt**
   ```
   service/src/main/kotlin/no/nav/melosys/service/vedtak/FtrlVedtakService.kt
   ```
   Look for:
   - Method that handles vedtak submission
   - How it creates/updates `Behandlingsresultat`
   - How `behandlingsresultat.type` is set

2. **BehandlingsresultatService.kt**
   ```
   service/src/main/kotlin/no/nav/melosys/service/behandling/BehandlingsresultatService.kt
   ```
   Look for:
   - `opprettBehandlingsresultat()` or similar
   - How `type` field is determined
   - Any logic related to ny vurdering

3. **ReplikerBehandling.kt**
   ```
   service/src/main/kotlin/no/nav/melosys/service/steg/behandling/ReplikerBehandling.kt
   ```
   Look for:
   - How behandlingsresultat is copied during replication
   - Is `type` field explicitly copied?

### Step 2: Search for "IKKE_FASTSATT"

```bash
cd melosys-api
grep -r "IKKE_FASTSATT" --include="*.kt" --include="*.java"
```

**Questions:**
- Where is this enum value used?
- Under what conditions is it set?
- Is it a default value?

### Step 3: Trace the Code Path

**Scenario:** User submits ny vurdering vedtak with reason `FEIL_I_BEHANDLING`

**Expected call stack:**
1. `POST /api/vedtak` (or similar endpoint)
2. `FtrlVedtakController.fattVedtak()`
3. `FtrlVedtakService.fattVedtak(behandlingId, grunnNyttVedtak)`
4. Service retrieves `Behandlingsresultat`
5. **CRITICAL:** Where does it set/update `behandlingsresultat.type`?

**Questions to answer:**
- Is `type` recalculated on each vedtak?
- Does `grunnNyttVedtak = "FEIL_I_BEHANDLING"` affect the type?
- Is there conditional logic based on the reason?

### Step 4: Check for Race Conditions

**Look for:**

1. **Async operations without proper synchronization**
   ```kotlin
   // Potential race condition
   launch {
       updateBehandlingsresultat()  // Might run before previous update commits
   }
   ```

2. **Missing @Transactional annotations**
   ```kotlin
   fun fattVedtak() {
       // If not transactional, reads might see inconsistent state
   }
   ```

3. **Caching issues**
   ```kotlin
   @Cacheable
   fun getBehandlingsresultat() {
       // Might return stale data
   }
   ```

4. **Parallel process instances**
   - Check if multiple process instances modify the same behandlingsresultat
   - Look in `ProsessinstansBehandler.kt`

### Step 5: Review Behandlingsresultat Type Logic

**Find the code that determines type:**

Likely in domain model or service:
```kotlin
enum class BehandlingsresultatType {
    MEDLEM_I_FOLKETRYGDEN,
    IKKE_FASTSATT,
    OPPHØRT,
    // etc.
}
```

**Look for:**
```kotlin
// Where is this calculated?
fun calculateBehandlingsresultatType(): BehandlingsresultatType {
    // Logic here - what determines the type?
}
```

**Questions:**
- Is type based on resultat periode?
- Is type based on medlemskapsperioder?
- Is type based on vedtak reason?
- Should type be immutable after first vedtak?

### Step 6: Check Ny Vurdering Specific Logic

Search for "ny vurdering" or "FEIL_I_BEHANDLING":

```bash
grep -ri "ny.vurdering\|nyVurdering\|FEIL_I_BEHANDLING" --include="*.kt"
```

**Look for:**
- Special handling for ny vurdering vedtak
- Does it reset behandlingsresultat?
- Does it recalculate the type?

### Step 7: Analyze the Log Timeline

From failed run (behandling 14):

```
15:03:56.542 - Behandling 13 replikert → behandling 14 opprettet
15:03:57.170 - GET /api/behandlinger/14 (test accesses ny vurdering)
[missing: any PUT/POST to update trygdeavgift data]
15:04:00.672 - Fatter vedtak for behandling 14
15:04:00.836 - VedtakHendelseMelding: type=IKKE_FASTSATT ❌
```

**Suspicious:** No API calls to update trygdeavgift between 15:03:57 and 15:04:00!

**Questions:**
- Should there be PUT calls to update trygdeavgift?
- Is behandlingsresultat.type set during replication or during vedtak?
- Is the type being calculated from stale data?

## Potential Root Causes

### Hypothesis 1: Default Value Issue

**Code might look like:**
```kotlin
fun opprettBehandlingsresultat(): Behandlingsresultat {
    return Behandlingsresultat(
        type = BehandlingsresultatType.IKKE_FASTSATT,  // Default!
        // Other fields...
    )
}
```

**Then later:**
```kotlin
// Sometimes this doesn't run or runs too late
fun updateType(resultat: Behandlingsresultat) {
    resultat.type = calculateType()  // Should set to MEDLEM_I_FOLKETRYGDEN
}
```

**Fix:**
```kotlin
fun opprettBehandlingsresultat(previousType: BehandlingsresultatType): Behandlingsresultat {
    return Behandlingsresultat(
        type = previousType,  // Copy from previous!
        // Other fields...
    )
}
```

### Hypothesis 2: Conditional Logic Based on Reason

**Code might look like:**
```kotlin
fun fattVedtak(behandlingId: Long, grunn: String) {
    val behandling = behandlingRepository.findById(behandlingId)
    val resultat = behandling.behandlingsresultat

    // Bug: resets type for certain reasons
    if (grunn == "FEIL_I_BEHANDLING") {
        resultat.type = BehandlingsresultatType.IKKE_FASTSATT  // ❌ WRONG!
    }

    // Should preserve previous type
}
```

**Fix:**
```kotlin
fun fattVedtak(behandlingId: Long, grunn: String) {
    val behandling = behandlingRepository.findById(behandlingId)
    val resultat = behandling.behandlingsresultat

    // Don't change type based on reason!
    // Type should be determined by resultat periode, not vedtak reason
}
```

### Hypothesis 3: Race Condition in Process Instances

**Process instances that might run concurrently:**
1. `IVERKSETT_VEDTAK_FTRL` - Main vedtak process
2. `OPPRETT_OG_DISTRIBUER_BREV` - Document generation

**Both might try to:**
- Read behandlingsresultat
- Calculate type
- Update behandlingsresultat

**If not properly synchronized:**
```kotlin
// Thread 1: IVERKSETT_VEDTAK_FTRL
val resultat = repository.findById(id)  // Reads: type = null
resultat.type = calculateType()  // Sets: type = MEDLEM_I_FOLKETRYGDEN
repository.save(resultat)  // Saves

// Thread 2: OPPRETT_OG_DISTRIBUER_BREV (runs at same time)
val resultat = repository.findById(id)  // Reads: type = null (cache?)
resultat.type = BehandlingsresultatType.IKKE_FASTSATT  // Default
repository.save(resultat)  // Overwrites! ❌
```

**Fix:**
```kotlin
@Transactional
@Lock(LockModeType.PESSIMISTIC_WRITE)
fun updateBehandlingsresultat(id: Long) {
    // Ensures only one process modifies at a time
}
```

### Hypothesis 4: Replication Doesn't Copy Type

**In ReplikerBehandling.kt:**
```kotlin
fun replikerBehandling(sourceId: Long): Behandling {
    val source = behandlingRepository.findById(sourceId)
    val target = Behandling()

    // Copies most fields...
    target.behandlingsresultat = Behandlingsresultat(
        // Bug: doesn't copy type!
        // type = source.behandlingsresultat.type,  ← Missing!
        medlemskapsperioder = source.behandlingsresultat.medlemskapsperioder,
        // Other fields...
    )
}
```

**Fix:**
```kotlin
target.behandlingsresultat = Behandlingsresultat(
    type = source.behandlingsresultat.type,  // ✅ Copy it!
    // Other fields...
)
```

## How to Debug

### Add Logging

Add debug logs in the suspected code:

```kotlin
fun fattVedtak(behandlingId: Long, grunn: String) {
    log.info("fattVedtak START: behandlingId=$behandlingId, grunn=$grunn")

    val behandling = behandlingRepository.findById(behandlingId)
    val resultat = behandling.behandlingsresultat

    log.info("Current behandlingsresultat.type: ${resultat.type}")

    // Vedtak logic...

    log.info("Final behandlingsresultat.type: ${resultat.type}")
    repository.save(resultat)
}
```

### Add Validation

Add assertion to detect the bug:

```kotlin
fun fattVedtak(behandlingId: Long, grunn: String) {
    val behandling = behandlingRepository.findById(behandlingId)

    if (behandling.type == BehandlingType.NY_VURDERING) {
        val previousBehandling = findPreviousBehandling(behandling)
        val expectedType = previousBehandling.behandlingsresultat.type

        require(behandling.behandlingsresultat.type == expectedType) {
            "BUG DETECTED: Ny vurdering type changed from $expectedType to ${behandling.behandlingsresultat.type}"
        }
    }
}
```

### Unit Test to Reproduce

```kotlin
@Test
fun `ny vurdering should preserve behandlingsresultat type`() {
    // Arrange: Create first behandling with MEDLEM_I_FOLKETRYGDEN
    val firstBehandling = createBehandling()
    vedtakService.fattVedtak(firstBehandling.id)

    val firstResultat = behandlingRepository.findById(firstBehandling.id).behandlingsresultat
    assertEquals(BehandlingsresultatType.MEDLEM_I_FOLKETRYGDEN, firstResultat.type)

    // Act: Create ny vurdering
    val nyVurdering = replikerBehandling(firstBehandling.id)
    vedtakService.fattVedtak(nyVurdering.id, grunn = "FEIL_I_BEHANDLING")

    // Assert: Type should be preserved
    val nyVurderingResultat = behandlingRepository.findById(nyVurdering.id).behandlingsresultat
    assertEquals(
        BehandlingsresultatType.MEDLEM_I_FOLKETRYGDEN,  // Expected
        nyVurderingResultat.type,  // Actual
        "Ny vurdering should preserve behandlingsresultat.type from previous behandling"
    )
}
```

## Recommended Fix Strategy

1. **Immediate:** Add logging to identify exact code path
2. **Short-term:** Add validation/assertion to detect the bug in production
3. **Long-term:** Fix the root cause based on findings

### Proposed Fix Pattern

```kotlin
// In FtrlVedtakService or similar
fun fattVedtak(behandlingId: Long, grunn: String) {
    val behandling = behandlingRepository.findById(behandlingId)
    val resultat = behandling.behandlingsresultat

    // ✅ Preserve type from previous behandling if ny vurdering
    if (behandling.type == BehandlingType.NY_VURDERING) {
        val previousBehandling = findPreviousBehandling(behandling)
        val previousType = previousBehandling.behandlingsresultat.type

        // Ensure type is not reset
        if (resultat.type != previousType) {
            log.warn("Correcting behandlingsresultat.type from ${resultat.type} to $previousType")
            resultat.type = previousType
        }
    }

    // Continue with vedtak logic...
}
```

## Testing the Fix

### Verify Fix Works

1. **Run E2E test 10 times:**
   ```bash
   for i in {1..10}; do
     npx playwright test "skal endre skattestatus fra skattepliktig til ikke-skattepliktig"
   done
   ```
   All runs should pass ✅

2. **Check production logs** for the bug signature:
   ```sql
   SELECT COUNT(*)
   FROM Behandling b
   JOIN Behandlingsresultat br ON b.id = br.behandling_id
   WHERE b.type = 'NY_VURDERING'
     AND b.status = 'AVSLUTTET'
     AND br.type = 'IKKE_FASTSATT'
     AND EXISTS (
         SELECT 1 FROM Behandling prev
         JOIN Behandlingsresultat prev_br ON prev.id = prev_br.behandling_id
         WHERE prev.fagsak_id = b.fagsak_id
           AND prev.id < b.id
           AND prev_br.type = 'MEDLEM_I_FOLKETRYGDEN'
     );
   ```
   Should return 0 after fix.

## Impact Assessment

### Cases Potentially Affected

```sql
-- Cases that should have been in årsavregning but weren't
SELECT
    f.saksnummer,
    b.id as behandling_id,
    br.type as behandlingsresultat_type,
    br.registrert_dato,
    COUNT(*) OVER() as total_affected
FROM Fagsak f
JOIN Behandling b ON b.fagsak_id = f.id
JOIN Behandlingsresultat br ON br.behandling_id = b.id
JOIN Behandlingsresultat_medlemskapsperioder mp ON mp.behandlingsresultat_id = br.id
JOIN Medlemskapsperiode_trygdeavgiftsperiode tap ON tap.medlemskapsperiode_id = mp.id
JOIN Trygdeavgiftsperiode_skatteforhold stn ON stn.trygdeavgiftsperiode_id = tap.id
WHERE b.type = 'NY_VURDERING'
  AND b.status = 'AVSLUTTET'
  AND br.type = 'IKKE_FASTSATT'
  AND stn.skatteplikttype = 'IKKE_SKATTEPLIKTIG'
  AND br.registrert_dato >= '2024-01-01'
ORDER BY br.registrert_dato DESC;
```

### Remediation for Affected Cases

Once fixed, re-run årsavregning job for affected cases:
```bash
curl -X POST "http://melosys-api/admin/aarsavregninger/saker/ikke-skattepliktige/finn" \
  -H "X-MELOSYS-ADMIN-APIKEY: ${API_KEY}" \
  -d "fomDato=2024-01-01&tomDato=2024-12-31&lagProsessinstanser=true"
```

## Files to Provide to Agent

When using an AI agent to investigate melosys-api:

1. **This report** - Full context and hypotheses
2. **Log excerpts** - `/Users/rune/Downloads/playwright-results-25/playwright-report/melosys-api-complete.log`
3. **Test file** - `tests/utenfor-avtaleland/workflows/nyvurdering-endring-skattestatus.spec.ts`
4. **Job query code** - `ÅrsavregningIkkeSkattepliktigeFinner.kt`

## References

- **E2E Test:** `tests/utenfor-avtaleland/workflows/nyvurdering-endring-skattestatus.spec.ts`
- **Job Code:** `service/src/main/kotlin/no/nav/melosys/service/avgift/aarsavregning/ikkeskattepliktig/ÅrsavregningIkkeSkattepliktigeFinner.kt`
- **Test Logs:** `/Users/rune/Downloads/playwright-results-25/`
- **GitHub PR:** #29
- **Previous Investigation:** `docs/INVESTIGATION-BEHANDLINGSRESULTAT-TYPE-ISSUE.md`

## Contact

For questions or to report findings:
- E2E Test Team
- Melosys Backend Team
- Escalate to: Tech Lead / Product Owner

---

**Next Steps:**
1. [ ] Clone/access melosys-api repository
2. [ ] Follow investigation steps above
3. [ ] Identify root cause (which hypothesis?)
4. [ ] Implement fix
5. [ ] Add unit test to prevent regression
6. [ ] Verify E2E test passes consistently
7. [ ] Deploy and monitor
