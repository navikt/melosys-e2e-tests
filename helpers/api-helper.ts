import { APIRequestContext } from '@playwright/test';

/**
 * Helper for managing melosys-api application state
 *
 * When we clean the database, the Spring Boot application's JPA/Hibernate
 * caches may still have references to deleted entities. This can cause
 * errors like "ORA-02291: parent key not found".
 *
 * Solutions:
 * 1. Clear JPA caches via API endpoint (if available)
 * 2. Restart the API container
 * 3. Use TRUNCATE instead of DELETE (already implemented)
 */

/**
 * Attempt to clear JPA/Hibernate caches in melosys-api
 *
 * This tries common Spring Boot Actuator endpoints to clear caches.
 * If your API doesn't have these endpoints, you'll need to add them.
 *
 * Example Spring Boot endpoint:
 * ```java
 * @RestController
 * @RequestMapping("/api/test")
 * public class TestController {
 *   @Autowired
 *   private EntityManagerFactory entityManagerFactory;
 *
 *   @PostMapping("/clear-caches")
 *   public void clearCaches() {
 *     entityManagerFactory.getCache().evictAll();
 *   }
 * }
 * ```
 */
export async function clearApiCaches(request: APIRequestContext): Promise<boolean> {
  const endpoints = [
    'http://localhost:8080/api/test/clear-caches',
    'http://localhost:8080/actuator/caches',
    'http://localhost:8080/internal/caches/clear'
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await request.post(endpoint, {
        failOnStatusCode: false,
        timeout: 5000
      });

      if (response.ok()) {
        console.log(`   ✅ API caches cleared via ${endpoint}`);
        return true;
      }
    } catch (error) {
      // Endpoint doesn't exist, try next one
      continue;
    }
  }

  console.log(`   ⚠️  No cache clearing endpoint found - API may have stale JPA caches`);
  console.log(`   💡 Consider adding a /api/test/clear-caches endpoint to melosys-api`);
  return false;
}

/**
 * Restart melosys-api container to force cache clearing
 * This is a heavy-handed approach but guaranteed to work
 */
export async function restartApiContainer(): Promise<void> {
  const { execSync } = require('child_process');

  try {
    console.log('   🔄 Restarting melosys-api container...');
    execSync('docker restart melosys-api', { encoding: 'utf-8' });

    // Wait for API to be healthy
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        execSync('curl -s http://localhost:8080/actuator/health > /dev/null 2>&1');
        console.log('   ✅ API restarted and healthy');
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('   ⚠️  API restarted but health check timed out');
  } catch (error) {
    console.log(`   ⚠️  Failed to restart API: ${error.message || error}`);
  }
}
