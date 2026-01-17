# SaksopplysningKilde Race Condition Analysis

**Date:** 2026-01-17
**Status:** Open - Needs fix in melosys-api
**Severity:** Medium (causes flaky E2E tests)
**Related PRs:** navikt/melosys-api#3167 (incomplete fix)

## Summary

E2E tests intermittently fail with an optimistic locking exception in `SaksopplysningKilde`. The fix attempted in PR #3167 (`@DynamicUpdate`) is insufficient to resolve the issue.

## Error Message

```
ERROR | API kall feilet: Row was updated or deleted by another transaction
(or unsaved-value mapping was incorrect) : [no.nav.melosys.domain.SaksopplysningKilde#113]
```

## Affected Tests

- `eu-eos-13.1-arbeid-flere-land-selvstendig-fullfort-vedtak.spec.ts`
- Potentially other EU/EØS workflow tests

## Timeline

| Date | Event |
|------|-------|
| 2026-01-17 | E2E test failure observed with SaksopplysningKilde error |
| 2026-01-XX | PR #3167 merged - added `@DynamicUpdate` to Saksopplysning and SaksopplysningKilde |
| 2026-01-17 | Error still occurring despite PR #3167 fix |

## Technical Analysis

### Entity Structure

```java
// Saksopplysning.java
@Entity
@Table(name = "saksopplysning")
@DynamicUpdate
public class Saksopplysning {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "behandling_id", nullable = false, updatable = false)
    private Behandling behandling;

    @OneToMany(mappedBy = "saksopplysning", cascade = CascadeType.ALL,
               fetch = FetchType.LAZY, orphanRemoval = true)
    private Set<SaksopplysningKilde> kilder = new HashSet<>(1);

    // ... other fields
}

// SaksopplysningKilde.java
@Entity
@Table(name = "saksopplysning_kilde")
@DynamicUpdate
public class SaksopplysningKilde {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "saksopplysning_id", nullable = false, updatable = false)
    private Saksopplysning saksopplysning;

    @Lob
    @Column(name = "mottatt_dokument", nullable = false)
    private String mottattDokument;

    // ... other fields
}
```

### Why @DynamicUpdate Is Insufficient

The `@DynamicUpdate` annotation only helps when two threads update **different columns** on the same entity. It does NOT help when:

1. **Both threads update the same column** - The second thread's UPDATE will still fail
2. **Collection operations cascade** - Saving `Saksopplysning` cascades to all `kilder` entries
3. **Entity is deleted by another transaction** - The "or deleted" part of the error message

### Root Cause Hypothesis

The race condition occurs between the **HTTP request thread** and the **Saga/async thread**:

```
Thread A (HTTP)                    Thread B (Saga)
─────────────────                  ─────────────────
Load Behandling (version 1)
Load Saksopplysning
Load kilder collection
                                   Load Behandling (version 1)
                                   Load Saksopplysning
                                   Load kilder collection

                                   Modify kilder
                                   Save Saksopplysning
                                   CASCADE saves kilder → SUCCESS
                                   (kilder now at new state)

Modify kilder
Save Saksopplysning
CASCADE saves kilder → FAIL!
(stale entity state)
```

### Problematic Patterns

1. **CascadeType.ALL** - Any save on `Saksopplysning` touches all children
2. **orphanRemoval = true** - Removing from collection triggers DELETE
3. **Lazy loading + concurrent modification** - Classic N+1 turned into race condition
4. **No explicit locking** - Neither pessimistic nor optimistic with @Version

## Evidence from E2E Tests

### GitHub Actions Run: 21096520983

```json
{
  "status": "flaky",
  "totalAttempts": 2,
  "failedAttempts": 1,
  "dockerErrors": [
    {
      "service": "melosys-api",
      "errors": [
        {
          "message": "Row was updated or deleted by another transaction
                      (or unsaved-value mapping was incorrect) :
                      [no.nav.melosys.domain.SaksopplysningKilde#113]"
        }
      ]
    }
  ]
}
```

### Failure Chain

1. Backend race condition triggers optimistic lock exception
2. Vedtak API call fails or times out (60s timeout)
3. Process instances don't complete (30s timeout)
4. Test fails on first attempt
5. Retry succeeds (race condition is timing-dependent)

## Recommended Fixes

### Option 1: Pessimistic Locking (Recommended)

Add explicit locking when loading entities that will be modified:

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("SELECT s FROM Saksopplysning s WHERE s.behandling.id = :behandlingId")
List<Saksopplysning> findByBehandlingIdForUpdate(@Param("behandlingId") Long behandlingId);
```

### Option 2: Retry with @Retryable

Add retry logic for transient failures:

```java
@Retryable(
    value = {OptimisticLockException.class, StaleObjectStateException.class},
    maxAttempts = 3,
    backoff = @Backoff(delay = 100, multiplier = 2)
)
public void saveSaksopplysning(Saksopplysning saksopplysning) {
    // ... save logic
}
```

### Option 3: Separate Transactions

Ensure HTTP and Saga operations don't overlap by using separate transaction boundaries:

```java
@Transactional(propagation = Propagation.REQUIRES_NEW)
public void updateSaksopplysningInNewTransaction(Long id, Consumer<Saksopplysning> updater) {
    Saksopplysning fresh = repository.findById(id).orElseThrow();
    updater.accept(fresh);
    repository.save(fresh);
}
```

### Option 4: Optimistic Locking with @Version

Add explicit version tracking (currently missing):

```java
@Entity
public class SaksopplysningKilde {
    @Version
    private Long version;

    // ... rest of entity
}
```

This makes the failure explicit and catchable, enabling proper retry logic.

## Temporary Workaround

The E2E tests use Playwright's retry mechanism (3 attempts) which masks this issue. The test is now marked as "flaky" rather than "failed" after adding proper `waitForContent` options.

## Files to Investigate

In melosys-api repository:

- `domain/src/main/java/no/nav/melosys/domain/Saksopplysning.java`
- `domain/src/main/java/no/nav/melosys/domain/SaksopplysningKilde.java`
- Services that load/save `Saksopplysning` with its `kilder` collection
- Saga handlers that modify `Saksopplysning`

## How to Reproduce

1. Run E2E test: `eu-eos-13.1-arbeid-flere-land-selvstendig-fullfort-vedtak.spec.ts`
2. The test exercises the "Arbeid i flere land" workflow with vedtak
3. Race condition occurs ~50% of the time between HTTP thread and Saga thread
4. Check melosys-api logs for the optimistic lock exception

## Related Issues

- PR #3167: Initial (incomplete) fix with @DynamicUpdate
- PR #3166: Similar fix for OppgaveService
- PR #3160: Similar fix for Behandlingsresultat (MELOSYS-7718)

## Contacts

- E2E Tests: Team Melosys
- melosys-api: Team Melosys
