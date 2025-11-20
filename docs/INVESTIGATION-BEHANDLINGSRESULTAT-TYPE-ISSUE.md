# Investigation Report: Potential behandlingsresultat.type Data Integrity Issue

**Date:** 2025-11-20
**Reporter:** E2E Test Analysis
**Severity:** Medium (Potential Production Impact)
**Status:** Requires Investigation

## Executive Summary

During E2E test debugging, we discovered a timing issue where ny vurdering vedtak sometimes creates a `behandlingsresultat` with type `IKKE_FASTSATT` instead of `MEDLEM_I_FOLKETRYGDEN`. This causes the årsavregning job `FinnSakerForÅrsavregningIkkeSkattepliktige` to fail to find cases that should be processed.

**Impact:** Cases may not be included in årsavregning when they should be, potentially affecting billing and tax calculations.

**Question:** Could this also happen in production if users navigate quickly through the workflow?

## Technical Details

### The Problem

The job query in `ÅrsavregningIkkeSkattepliktigeFinner.kt` (lines 118-130) requires:

```sql
AND EXISTS (
    SELECT 1 FROM Behandling b
    JOIN Behandlingsresultat br ON b.id = br.behandling.id
    JOIN br.medlemskapsperioder mp
    JOIN mp.trygdeavgiftsperioder tap
    JOIN tap.grunnlagSkatteforholdTilNorge stn
    WHERE b.fagsak = f
        AND b.status = 'AVSLUTTET'
        AND br.type = 'MEDLEM_I_FOLKETRYGDEN'  <-- CRITICAL!
        AND stn.skatteplikttype = 'IKKE_SKATTEPLIKTIG'
        AND tap.periodeFra <= :tomDato
        AND tap.periodeTil >= :fomDato
)
```

When `behandlingsresultat.type` is `IKKE_FASTSATT` instead of `MEDLEM_I_FOLKETRYGDEN`, the case is not found by the query.

### Evidence from E2E Tests

Test: `skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering`

**Failed Runs (2 out of 3):**
```
2025-11-20T13:22:42 - VedtakHendelseMelding(
  behandligsresultatType=IKKE_FASTSATT,  // ❌ WRONG!
  vedtakstype=ENDRINGSVEDTAK,
  sak=MEL-8
)
→ Job found 0 cases (expected 1)

2025-11-20T13:23:33 - VedtakHendelseMelding(
  behandligsresultatType=IKKE_FASTSATT,  // ❌ WRONG!
  vedtakstype=ENDRINGSVEDTAK,
  sak=MEL-9
)
→ Job found 0 cases (expected 1)
```

**Successful Run (1 out of 3):**
```
2025-11-20T13:24:32 - VedtakHendelseMelding(
  behandligsresultatType=MEDLEM_I_FOLKETRYGDEN,  // ✅ CORRECT!
  vedtakstype=ENDRINGSVEDTAK,
  sak=MEL-10
)
→ Job found 1 case
```

### Root Cause in E2E Test

The test navigates too quickly from trygdeavgift page to vedtak page:

```typescript
// User fills out trygdeavgift form
await trygdeavgift.klikkBekreftOgFortsett();

// ❌ NO WAIT - test immediately submits vedtak
await vedtak.fattVedtakForNyVurdering('FEIL_I_BEHANDLING');
```

This causes the behandlingsresultat to not be properly initialized before the vedtak is submitted.

**Fix Applied:** Added `page.waitForLoadState('networkidle')` to ensure all API calls complete.

## Could This Happen in Production?

### Scenarios Where Users Might Trigger This

1. **Fast Navigation**
   - Power users who know the workflow intimately
   - Using keyboard shortcuts/tab navigation
   - Clicking "Bekreft og fortsett" and immediately clicking "Fatt vedtak"

2. **Slow Network Conditions**
   - Page renders before background API calls complete
   - User sees "Fatt vedtak" button and clicks it before data is ready
   - More likely on slow connections or high server load

3. **Browser Back/Forward**
   - User navigates with browser buttons
   - May bypass normal flow controls

4. **Mobile/Tablet Users**
   - Touch gestures can be very fast
   - Screen transitions might not match data loading

### Indicators This Might NOT Be a Production Issue

1. **Human Speed**: Humans are ~1000x slower than automated tests
2. **UI Safeguards**: Loading indicators, disabled buttons
3. **React State Management**: Might prevent premature submission

## How to Investigate

### Step 1: Check Production Logs

Search for ny vurdering vedtak with incorrect behandlingsresultat type:

```bash
# Search Kibana/Splunk for:
"VedtakHendelseMelding" AND "vedtakstype=ENDRINGSVEDTAK" AND "behandligsresultatType=IKKE_FASTSATT"
```

**What to look for:**
- How many occurrences?
- Are they all from the same user/time period?
- Do they correlate with slow response times?

**Query for cases that might have been missed:**
```sql
-- Cases with ny vurdering where behandlingsresultat.type is wrong
SELECT
    f.saksnummer,
    b.id as behandling_id,
    b.type as behandling_type,
    b.status,
    br.type as behandlingsresultat_type,
    br.registrert_dato
FROM Fagsak f
JOIN Behandling b ON b.fagsak_id = f.id
JOIN Behandlingsresultat br ON br.behandling_id = b.id
WHERE b.type IN ('NY_VURDERING', 'ENDRING')
  AND b.status = 'AVSLUTTET'
  AND br.type = 'IKKE_FASTSATT'
  AND br.registrert_dato > CURRENT_DATE - INTERVAL '6 months'
ORDER BY br.registrert_dato DESC;
```

### Step 2: Review Frontend Code

Check `melosys-web` for safeguards:

**Files to investigate:**
- `src/pages/trygdeavgift/TrygdeavgiftPage.tsx` (or similar)
- `src/pages/vedtak/VedtakPage.tsx` (or similar)

**Questions to answer:**
1. Is the "Fatt vedtak" button disabled until data loads?
   ```typescript
   <Button disabled={isLoading || !behandlingsresultat}>
     Fatt vedtak
   </Button>
   ```

2. Are there loading indicators?
   ```typescript
   {isLoading && <Spinner />}
   ```

3. Does the vedtak page fetch/validate data on mount?
   ```typescript
   useEffect(() => {
     fetchBehandlingsresultat();
   }, []);
   ```

### Step 3: Check Backend Logic

Review how `behandlingsresultat.type` is set:

**Files to investigate:**
- `FtrlVedtakService.kt` - Where vedtak is created
- `BehandlingsresultatService.kt` - How type is determined
- Any service that handles "ny vurdering" creation

**Questions:**
1. Is `behandlingsresultat.type` copied from the previous behandling?
2. Is it computed based on the resultat periode?
3. Is there validation before allowing vedtak submission?

### Step 4: Test Manually

**Reproduce the issue:**

1. **Setup:** Create a sak with first vedtak (skattepliktig=true)
2. **Create ny vurdering:** Via UI
3. **Navigate to trygdeavgift:** Change to skattepliktig=false
4. **Try to click fast:**
   - Click "Bekreft og fortsett"
   - Immediately try to click "Fatt vedtak"
   - Does the button work? Is it disabled?

5. **Check the result:**
   ```sql
   SELECT br.type, b.id
   FROM Behandlingsresultat br
   JOIN Behandling b ON br.behandling_id = b.id
   WHERE b.id = <ny_vurdering_behandling_id>;
   ```

6. **Verify with job:**
   - Run `finnIkkeSkattepliktigeSaker()` job manually
   - Does it find the case?

**Test variations:**
- Try on slow network (Chrome DevTools → Network → Slow 3G)
- Try with keyboard navigation (Tab + Enter)
- Try on mobile device

## Recommended Actions

### Immediate (If Issue Confirmed)

1. **Backend Fix:** Add validation in `FtrlVedtakService`
   ```kotlin
   fun fattVedtak(behandlingId: Long) {
       val behandling = behandlingRepository.findById(behandlingId)
       val behandlingsresultat = behandling.behandlingsresultat

       // Validate behandlingsresultat is properly initialized
       require(behandlingsresultat.type != null) {
           "Behandlingsresultat type must be set before vedtak can be submitted"
       }

       // ... rest of logic
   }
   ```

2. **Frontend Fix:** Disable vedtak button until data is ready
   ```typescript
   const [isReady, setIsReady] = useState(false);

   useEffect(() => {
       // Wait for all data to load
       Promise.all([
           fetchBehandlingsresultat(),
           fetchTrygdeavgift(),
       ]).then(() => setIsReady(true));
   }, []);

   return (
       <Button disabled={!isReady} onClick={handleFattVedtak}>
           Fatt vedtak
       </Button>
   );
   ```

### Short-term

1. **Add monitoring:** Alert when behandlingsresultat.type is IKKE_FASTSATT for ENDRINGSVEDTAK
2. **Document the issue:** Add to known issues / technical debt backlog
3. **User communication:** If issue is confirmed, notify saksbehandlers to double-check cases

### Long-term

1. **Architectural review:** Should behandlingsresultat.type be immutable once set?
2. **State machine:** Implement proper state transitions for behandling workflow
3. **Integration tests:** Add more E2E scenarios that test rapid navigation

## Supporting Evidence

### Log Excerpts

**Failed run showing wrong type:**
```
2025-11-20T13:22:42.236Z | VedtakHendelseMelding(
  folkeregisterIdent=30056928150,
  sakstype=FTRL,
  sakstema=MEDLEMSKAP_LOVVALG,
  behandligsresultatType=IKKE_FASTSATT,  // ❌
  vedtakstype=ENDRINGSVEDTAK,
  medlemskapsperioder=[Periode(fom=2024-01-01, tom=2024-07-01, innvilgelsesResultat=INNVILGET)],
  lovvalgsperioder=[]
)

2025-11-20T13:22:44.327Z | Totalt fant 0 saker for årsavregning ikke skattepliktig
```

**Successful run showing correct type:**
```
2025-11-20T13:24:32.380Z | VedtakHendelseMelding(
  folkeregisterIdent=30056928150,
  sakstype=FTRL,
  sakstema=MEDLEMSKAP_LOVVALG,
  behandligsresultatType=MEDLEM_I_FOLKETRYGDEN,  // ✅
  vedtakstype=ENDRINGSVEDTAK,
  medlemskapsperioder=[Periode(fom=2024-01-01, tom=2024-07-01, innvilgelsesResultat=INNVILGET)],
  lovvalgsperioder=[]
)

2025-11-20T13:24:34.505Z | Totalt fant 1 saker for årsavregning ikke skattepliktig
```

## References

- **E2E Test:** `tests/utenfor-avtaleland/workflows/nyvurdering-endring-skattestatus.spec.ts`
- **Job Code:** `service/src/main/kotlin/no/nav/melosys/service/avgift/aarsavregning/ikkeskattepliktig/ÅrsavregningIkkeSkattepliktigeFinner.kt`
- **Test Logs:** `/Users/rune/Downloads/playwright-results-23/`
- **GitHub PR:** #29 - Fix race condition and remove @known-error tags

## Contact

For questions or to report findings, contact:
- E2E Test Team
- Melosys Development Team
- Product Owner (for priority/impact assessment)

---

**Next Steps:**
1. [ ] Investigate production logs (Step 1)
2. [ ] Review frontend code (Step 2)
3. [ ] Review backend logic (Step 3)
4. [ ] Manual reproduction test (Step 4)
5. [ ] Create JIRA ticket if issue confirmed
6. [ ] Implement fix and monitor
