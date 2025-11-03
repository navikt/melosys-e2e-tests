# Troubleshooting Guide

Common issues and solutions when working with Melosys E2E tests.

---

## Quick Diagnosis

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| Tests timeout | Services not running | `cd ../melosys-docker-compose && make start-all` |
| "Connection refused" | Database not ready | Wait 30s, check `docker ps` |
| Flaky tests | No API wait | Use `FormHelper.fillAndWaitForApi()` |
| "Element not found" | Selector changed | Update locator in POM or test |
| Database errors | JPA cache issue | Fixtures auto-clear, check logs |
| Docker errors | See logs | `docker logs melosys-api` |

---

## Services & Infrastructure

### Services not available

**Symptom:**
```
Error: connect ECONNREFUSED localhost:3000
```

**Diagnosis:**
```bash
# Check if services are running
cd ../melosys-docker-compose
docker ps

# Should show 17 running containers
```

**Solution:**
```bash
# Start all services
cd ../melosys-docker-compose
make start-all

# Verify services are accessible
curl http://localhost:3000/melosys/
curl http://localhost:8080/internal/health
```

**Wait time:** Services need ~2-3 minutes to fully start (especially Oracle database).

### Docker container not healthy

**Symptom:**
```
Service 'kafka' is not healthy
```

**Diagnosis:**
```bash
# Check container status
docker ps | grep kafka

# Check container logs
docker logs kafka

# Check health status
docker inspect --format='{{.State.Health.Status}}' kafka
```

**Solution:**
```bash
# Restart specific service
docker restart kafka

# Or restart all services
cd ../melosys-docker-compose
docker compose down
make start-all
```

**Common culprits:**
- **Kafka**: Needs Zookeeper to be ready first
- **Oracle**: Takes longest to start (~60-90 seconds)
- **melosys-api**: Needs Oracle + Kafka ready

### Database connection fails

**Symptom:**
```
Error: ORA-12514: TNS:listener does not currently know of service requested
```

**Diagnosis:**
```bash
# Check Oracle logs
docker logs melosys-oracle

# Check credentials in .env
cat .env
```

**Solution:**

**Mac ARM (M1/M2/M3):**
```bash
# .env file should have:
DB_USER=MELOSYS
DB_PASSWORD=melosys
DB_CONNECT_STRING=localhost:1521/freepdb1
```

**Intel/GitHub Actions:**
```bash
# .env file should have:
DB_USER=MELOSYS
DB_PASSWORD=melosys
DB_CONNECT_STRING=localhost:1521/XEPDB1
```

**Create `.env` if missing:**
```bash
cp .env.example .env
# Edit with correct values
```

---

## Test Execution

### Tests timeout

**Symptom:**
```
Timeout 30000ms exceeded
```

**Diagnosis:**
- Element taking too long to appear
- API call not completing
- Network activity ongoing

**Solutions:**

**1. Increase timeout in config:**
```typescript
// playwright.config.ts
use: {
  actionTimeout: 60000,  // Increase from 30s to 60s
}
```

**2. Increase timeout for specific action:**
```typescript
await page.getByRole('button', { name: 'Submit' }).click({ timeout: 60000 });
```

**3. Wait for specific condition:**
```typescript
await page.waitForLoadState('networkidle', { timeout: 30000 });
```

### Flaky tests (pass sometimes, fail sometimes)

**Symptom:**
Test passes locally but fails in CI, or fails randomly.

**Common Causes:**

**1. Not waiting for API responses**

❌ **Problem:**
```typescript
await page.getByRole('textbox', { name: 'Bruttoinntekt' }).fill('100000');
await page.getByRole('button', { name: 'Neste' }).click();  // Button not enabled yet!
```

✅ **Solution:**
```typescript
const formHelper = new FormHelper(page);
await formHelper.fillAndWaitForApi(
  page.getByRole('textbox', { name: 'Bruttoinntekt' }),
  '100000',
  '/trygdeavgift/beregning'
);
await page.getByRole('button', { name: 'Neste' }).click();  // Now button is enabled
```

**2. Race conditions**

❌ **Problem:**
```typescript
// Start listening AFTER action
await field.fill('value');
await page.waitForResponse(...);  // Too late!
```

✅ **Solution:**
```typescript
// Create promise BEFORE action
const responsePromise = page.waitForResponse(
  response => response.url().includes('/api/endpoint')
);
await field.fill('value');  // Triggers API
await responsePromise;  // Wait for it
```

**3. Elements not ready**

❌ **Problem:**
```typescript
await page.getByRole('button', { name: 'Submit' }).click();  // Might not exist yet
```

✅ **Solution:**
```typescript
const submitButton = page.getByRole('button', { name: 'Submit' });
await submitButton.waitFor({ state: 'visible', timeout: 5000 });
await submitButton.click();
```

### Element not found

**Symptom:**
```
Error: Locator.click: Error: element not found
```

**Diagnosis:**
1. Check if selector is correct (use Playwright Inspector)
2. Check if element is hidden/not rendered
3. Check if page has loaded

**Solutions:**

**1. Use Playwright Inspector:**
```bash
npx playwright test --debug tests/my-test.spec.ts
```

Click "Pick Locator" to find correct selector.

**2. Wait for element:**
```typescript
await page.getByRole('button', { name: 'Submit' }).waitFor({
  state: 'visible',
  timeout: 10000
});
```

**3. Check element exists:**
```typescript
const count = await page.getByRole('button', { name: 'Submit' }).count();
console.log('Button count:', count);  // Should be 1
```

**4. Update selector if UI changed:**
```typescript
// Old (might be outdated)
await page.getByRole('button', { name: 'Opprett' }).click();

// New (check current UI)
await page.getByRole('button', { name: 'Opprett ny behandling' }).click();
```

### Button not enabled

**Symptom:**
```
Error: expect(locator).toBeEnabled
```

**Cause:** Form validation not complete or API still processing.

**Solution:**
```typescript
// Wait for button to be enabled
const submitButton = page.getByRole('button', { name: 'Submit' });
await submitButton.waitFor({ state: 'visible' });
await expect(submitButton).toBeEnabled({ timeout: 10000 });
await submitButton.click();
```

### Using `networkidle` (Anti-Pattern)

**Problem:**
```typescript
// ❌ Don't do this - Playwright docs explicitly discourage it
await page.waitForLoadState('networkidle', { timeout: 15000 });
```

**Why it fails:**
- Waits for NO network activity for 500ms
- Fails if there are polling requests
- Too broad - doesn't target specific APIs
- Unreliable in CI

**Solution:**
```typescript
// ✅ Wait for specific API response
const responsePromise = page.waitForResponse(
  response => response.url().includes('/api/endpoint') && response.status() === 200
);
await someAction();  // Triggers API
await responsePromise;
```

---

## Database Issues

### JPA cache errors

**Symptom:**
```
ORA-02291: integrity constraint violated - parent key not found
```

**Cause:** Application cache has references to deleted entities.

**Solution:**
Fixtures automatically handle this! They:
1. Clean database with TRUNCATE
2. Clear JPA/Hibernate caches via `/internal/e2e/caches/clear`
3. Wait for process instances to complete

**Manual cache clear:**
```bash
curl -X POST http://localhost:8080/internal/e2e/caches/clear
```

### Database not cleaning between tests

**Symptom:**
Tests fail because of leftover data from previous tests.

**Diagnosis:**
```typescript
import { withDatabase } from '../helpers/db-helper';

await withDatabase(async (db) => {
  await db.showAllData();  // See what data exists
});
```

**Solution:**
Make sure you're using fixtures:
```typescript
// ✅ Correct - auto-cleanup
import { test, expect } from '../fixtures';

// ❌ Wrong - no cleanup
import { test, expect } from '@playwright/test';
```

### Foreign key constraint violations

**Symptom:**
```
ORA-02292: integrity constraint (MELOSYS.FK_SAK_ID) violated - child record found
```

**Cause:** Trying to delete parent row before children.

**Solution:**
Fixtures handle cleanup in correct order. If you see this:
1. Check you're using fixtures
2. Check process instances completed before cleanup
3. Check cache clearing is working

**Debug:**
```bash
# Check process instances
curl http://localhost:8080/internal/e2e/process-instances/await
```

---

## Docker Logs

### Cannot find docker logs

**Symptom:**
```
Error: No such container: melosys-api
```

**Diagnosis:**
```bash
docker ps | grep melosys
```

**Solution:**
```bash
# Start services
cd ../melosys-docker-compose
make start-all
```

### Seeing errors from previous tests

**Symptom:**
Docker log checking shows errors from other tests.

**Cause:** System clock mismatch or time zone issue.

**Solution:**
- Check system clock is accurate
- Verify container time matches host time
- Restart Docker if needed

### Too many logs

**Symptom:**
Console output overwhelmed with log messages.

**Solution:**
Adjust filtering in `fixtures/docker-logs.ts`:

```typescript
// Be more selective about what counts as error
const errors = logLines.filter(line =>
  line.includes('FATAL') ||  // Only fatal errors
  (line.includes('ERROR') && !line.includes('HikariPool'))  // Exclude normal HikariPool errors
);
```

---

## GitHub Actions CI

### "no matching manifest for linux/amd64"

**Symptom:**
```
Error: no matching manifest for linux/amd64 in the manifest list
```

**Cause:** Image only built for ARM64 (Mac), not AMD64 (GitHub Actions).

**Solution:**
Rebuild image with multi-arch support:

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/<IMAGE_NAME>:latest \
  --push .
```

**Verify:**
```bash
docker manifest inspect <IMAGE>:latest | grep -A3 "platform"
```

### Services timeout in CI

**Symptom:**
Services fail to start within timeout in GitHub Actions.

**Diagnosis:**
Check workflow logs for:
- Which service is unhealthy
- Container startup logs
- Docker Compose status

**Solutions:**

**1. Increase timeout:**
```yaml
# .github/workflows/e2e-tests.yml
timeout-minutes: 60  # Increase from 45
```

**2. Use 8-core runner:**
```yaml
runs-on: ubuntu-latest-8-cores  # Faster startup
```

**3. Check health check logic:**
Services must respond:
- Kafka: Docker health status = healthy
- melosys-api: `/internal/health` returns 200
- melosys-web: `/melosys/` accessible

### Tests not found in CI

**Symptom:**
```
Error: No tests found
```

**Cause:** Test pattern doesn't match in CI environment.

**Solution:**
Use filename instead of test name:

```bash
# ❌ Doesn't work
npx playwright test "should complete workflow"

# ✅ Works
npx playwright test example-workflow.spec.ts
```

---

## Playwright Specific

### Recorded test breaks after UI changes

**Symptom:**
Test recorded with `codegen` fails after frontend changes.

**Solution:**

**1. Re-record:**
```bash
npm run codegen
# Perform workflow again
# Copy new generated code
```

**2. Use POMs (better long-term):**
```typescript
// Instead of inline selectors
await page.getByRole('button', { name: 'Submit' }).click();

// Use POM
await myPage.clickSubmit();
```

UI changes only require updating POM file, not all tests.

**3. Request stable selectors:**
Ask frontend team to add `data-testid` attributes:
```html
<button data-testid="submit-button">Submit</button>
```

```typescript
await page.getByTestId('submit-button').click();
```

### Trace viewer won't open

**Symptom:**
```
Error: Failed to open trace
```

**Solution:**
```bash
# Make sure trace file exists
ls -la test-results/

# Use correct path
npx playwright show-trace test-results/my-test-chromium/trace.zip

# Or use npm script
npm run show-trace test-results/my-test-chromium/trace.zip
```

### Slow test execution

**Symptom:**
Tests take too long to run.

**Diagnosis:**
Check `slowMo` setting:

```typescript
// playwright.config.ts
use: {
  slowMo: 500,  // 500ms delay between actions - too slow!
}
```

**Solution:**

**1. Reduce slowMo:**
```typescript
slowMo: 100,  // Or remove entirely
```

**2. Remove unnecessary waits:**
```typescript
// ❌ Don't use fixed waits
await page.waitForTimeout(5000);

// ✅ Wait for specific condition
await page.waitForLoadState('domcontentloaded');
```

**3. Use network idle sparingly:**
Only when absolutely necessary (see "Using networkidle" above).

---

## Development Workflow

### Changes not reflecting

**Symptom:**
Code changes don't seem to affect test behavior.

**Solution:**

**1. Restart services:**
```bash
cd ../melosys-docker-compose
docker compose down
make start-all
```

**2. Clear npm cache:**
```bash
npm run clean-results
```

**3. Rebuild if needed:**
```bash
npm install
npx playwright install
```

### TypeScript errors

**Symptom:**
```
Property 'methodName' does not exist on type 'PageObjectModel'
```

**Solution:**

**1. Check TypeScript:**
```bash
npx tsc --noEmit
```

**2. Check imports:**
```typescript
// Make sure path is correct
import { MyPage } from '../pages/my-page.page';
```

**3. Check method exists:**
Look at POM file to ensure method is defined and exported.

---

## Best Practices to Avoid Issues

### ✅ DO

1. **Use fixtures** - Import from `../fixtures`
2. **Use FormHelper** - For fields that trigger APIs
3. **Wait for elements** - Before interacting
4. **Use POMs** - Encapsulate selectors
5. **Check Docker logs** - After failed tests
6. **Verify services running** - Before running tests
7. **Use specific waits** - Wait for specific API responses
8. **Add assertions** - Verify expected state

### ❌ DON'T

1. **Use fixed timeouts** - `waitForTimeout(5000)`
2. **Use networkidle** - Playwright discourages it
3. **Skip FormHelper** - For API-triggered fields
4. **Listen after action** - Create promise before triggering
5. **Ignore Docker errors** - Even if test passes
6. **Commit `showAllData()`** - It's for debugging only
7. **Use inline selectors** - Use POMs instead
8. **Assume services ready** - Verify with health checks

---

## Getting Help

### Information to Gather

When asking for help, provide:

**1. Error message:**
```
Copy the full error from terminal
```

**2. Which test:**
```
tests/example-workflow.spec.ts
Test: "should complete workflow"
```

**3. Trace file:**
```bash
# Find latest trace
find test-results -name "trace.zip" -type f | head -1

# Share location or upload trace
```

**4. What you tried:**
```
- Checked services running
- Increased timeout
- Updated selector
- Still failing
```

**5. Environment:**
```
- Local Mac (ARM64) or Intel
- Docker Compose running
- Database: freepdb1 or XEPDB1
```

### Quick Debug Commands

```bash
# Check services
docker ps | grep melosys

# Check specific service logs
docker logs melosys-api --tail 50

# Check database
curl http://localhost:8080/internal/health

# Check web
curl http://localhost:3000/melosys/

# Run test with debug
npx playwright test --debug tests/my-test.spec.ts

# Run test in UI mode
npm run test:ui tests/my-test.spec.ts

# View latest trace
find test-results -name "trace.zip" -type f | head -1 | xargs npx playwright show-trace
```

---

## Related Documentation

- **Fixtures Guide**: `docs/guides/FIXTURES.md` - Automatic cleanup and monitoring
- **Helpers Guide**: `docs/guides/HELPERS.md` - FormHelper, DatabaseHelper, etc.
- **GitHub Actions Guide**: `docs/ci-cd/GITHUB-ACTIONS.md` - CI/CD setup
- **POM Guide**: `docs/pom/QUICK-START.md` - Page Object Model usage
- **Main README**: `README.md` - Complete project documentation
