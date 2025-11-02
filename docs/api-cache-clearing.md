# API Cache Clearing for E2E Tests

## Problem

When E2E tests clean the database, Spring Boot's JPA/Hibernate caches may still have references to deleted entities. This causes errors like:

```
ORA-02291: integrity constraint violated - parent key not found
```

The application tries to access entities that no longer exist in the database.

## Solutions

### 1. TRUNCATE Instead of DELETE ✅

**Already implemented** - We use `TRUNCATE TABLE` instead of `DELETE` which:
- Resets auto-increment sequences
- Is faster than DELETE
- Might help invalidate some caches

### 2. Add Cache Clearing Endpoint (Recommended)

**Already implemented** in `melosys-api`:

```java
package no.nav.melosys.api.internal.e2e;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.*;

import javax.persistence.EntityManagerFactory;
import javax.persistence.Cache;

@RestController
@RequestMapping("/internal/e2e")
@Profile({"local", "dev"}) // Only in test environments!
public class E2EController {

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    /**
     * Clear all JPA/Hibernate caches
     * Called by E2E tests after database cleanup
     */
    @PostMapping("/caches/clear")
    public void clearCaches() {
        // Clear second-level cache
        Cache cache = entityManagerFactory.getCache();
        if (cache != null) {
            cache.evictAll();
        }

        // Clear query caches
        entityManagerFactory.unwrap(org.hibernate.SessionFactory.class)
            .getCache()
            .evictAllRegions();
    }

    /**
     * Wait for all async process instances to complete
     * Called by E2E tests before database cleanup
     */
    @GetMapping("/process-instances/await")
    public ProcessInstanceStatus waitForProcessInstances() {
        // Implementation details...
    }
}
```

### 3. Enable Actuator (Alternative)

If you have Spring Boot Actuator enabled:

```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: caches
  endpoint:
    caches:
      enabled: true
```

Then you can clear caches via:
```bash
POST http://localhost:8080/actuator/caches/{cacheName}
```

### 4. Restart Container (Last Resort)

The fixture can restart the API container, but this is slow:

```typescript
import { restartApiContainer } from '../helpers/api-helper';

await restartApiContainer(); // Takes ~10-20 seconds
```

## How Our Fixtures Work

The cleanup fixture automatically tries to clear caches after database cleanup:

```typescript
// fixtures/cleanup.ts
async function cleanupTestData(page: any): Promise<void> {
  // 1. Clean database (uses TRUNCATE)
  await db.cleanDatabase();

  // 2. Try to clear API caches (prevents JPA errors)
  await clearApiCaches(page.request);

  // 3. Clean mock data
  await clearMockData(page.request);
}
```

It uses these endpoints:
1. `POST http://localhost:8080/internal/e2e/caches/clear` - Clear all caches
2. `GET http://localhost:8080/internal/e2e/process-instances/await` - Wait for async processes

If endpoints don't exist, it logs a warning but continues.

## Implementation

1. **E2E endpoints added** to melosys-api (see code above)
2. **Limited to test profiles** - Only enabled in `local` and `dev` environments
3. **Test manually**:
   ```bash
   # Clear all caches
   curl -X POST http://localhost:8080/internal/e2e/caches/clear

   # Wait for process instances (30s default timeout)
   curl http://localhost:8080/internal/e2e/process-instances/await
   ```
4. **E2E tests** automatically use these endpoints

## Benefits

✅ Eliminates JPA cache errors
✅ Fast (< 100ms vs 10-20s for container restart)
✅ No need to restart services
✅ Tests can run back-to-back without errors

## Alternative: Session Per Test

Another approach is to ensure each test gets a fresh EntityManager session, but this requires application changes and isn't practical for E2E tests that call the API externally.

## Current Status

- ✅ TRUNCATE implementation (faster than DELETE)
- ✅ Cache clearing helper implemented
- ✅ E2E endpoints added to melosys-api (`/internal/e2e/caches/clear`)
- ✅ Process instance waiting endpoint (`/internal/e2e/process-instances/await`)
- ✅ Fixtures automatically use these endpoints
