# Debugging Unleash Feature Toggle Issues

This guide explains how to diagnose and fix issues related to Unleash feature toggles in E2E tests, particularly race conditions and caching problems.

## Table of Contents
- [The Problem: Multi-Layer Caching](#the-problem-multi-layer-caching)
- [Symptoms](#symptoms)
- [Architecture Overview](#architecture-overview)
- [Diagnostic Steps](#diagnostic-steps)
- [The Solution](#the-solution)
- [Common Issues](#common-issues)
- [Best Practices](#best-practices)

## The Problem: Multi-Layer Caching

Unleash feature toggles go through **multiple caching layers** before reaching the frontend:

```
Test (UnleashHelper)
    ↓ Changes toggle via Admin API
Unleash Server
    ↓ Server-side cache (~10-15s refresh)
Unleash Admin API
    ↓
melosys-api (/featuretoggle endpoint)
    ↓ Backend cache (polling interval)
Frontend (React state)
    ↓ Component-level caching
Browser
```

### The Race Condition

When tests change toggles:

1. ✅ Admin API accepts change immediately
2. ⏳ Unleash server cache refreshes (10-15 seconds)
3. ⏳ melosys-api polls Unleash (configurable interval)
4. ⏳ Frontend fetches from melosys-api
5. ❌ Test proceeds before all layers sync → **Flaky test**

**Result:**
- Local tests (slower) → Pass ✅
- GitHub Actions (faster) → Fail ❌

## Symptoms

### 1. Flaky Tests on CI/CD
- Tests pass locally but fail on GitHub Actions
- Same test passes/fails randomly
- No code changes between runs

### 2. Wrong Toggle State in Trace
Open Playwright trace and check Network tab:

```json
{
  "melosys.faktureringskomponenten.ikke-tidligere-perioder": false,  // ❌ Wrong!
  // Test expects: true
}
```

### 3. Test Timing Issues
- Frontend receives old toggle value
- Page behaves differently than expected
- Elements don't appear/disappear as expected

### 4. Cleanup Not Working
- Test 1 changes toggle
- Cleanup runs and restores
- Test 2 still sees wrong value

## Architecture Overview

### Unleash Admin API (Port 4242)
- URL: `http://localhost:4242/api/admin/projects/default/features/{feature}/environments/development/on`
- Used by: `UnleashHelper.enableFeature()` / `disableFeature()`
- Cache: Server-side, ~10-15s refresh interval
- Purpose: Configure toggles

### Unleash Frontend/Proxy API
- Used by: Unleash SDK clients
- Cache: Depends on SDK configuration
- Purpose: Serve toggle state to applications

### melosys-api Feature Toggle Endpoint
- URL: `http://localhost:8080/api/featuretoggle`
- Used by: Frontend (melosys-web) and E2E tests
- Cache: Backend polling interval (typically 10-30s)
- Returns: JSON map of all toggle states
- Authentication: Requires Bearer token (LOCAL_AUTH_TOKEN)

### Frontend (melosys-web)
- Fetches toggles on page load
- Stores in Redux state
- Uses `useFeatureToggle()` hook
- Cache: Component lifecycle

## Diagnostic Steps

### Step 1: Check Playwright Trace

1. Download trace from GitHub Actions artifacts
2. Open with `npx playwright show-trace trace.zip`
3. Go to Network tab
4. Find request to `/featuretoggle` or similar
5. Check Response body for toggle values

**What to look for:**
```json
{
  "melosys.faktureringskomponenten.ikke-tidligere-perioder": false,
}
```

If the value is wrong, you have a caching issue.

### Step 2: Check Test Logs

Look for Unleash confirmation messages:

```bash
✅ Unleash: Disabled feature 'melosys.faktureringskomponenten.ikke-tidligere-perioder'
   ✅ Unleash: Confirmed 'melosys.faktureringskomponenten.ikke-tidligere-perioder' is disabled (took 8ms)
```

**Red flags:**
- ⚠️ Timeout waiting for toggle state
- Missing confirmation messages
- Very long wait times (>5 seconds)

### Step 3: Check Test Execution Order

```bash
# In CI logs, look for test execution order
✓ Test 1: arsavregning-ikke-skattepliktig
✓ Test 2: komplett-sak-2-8a
```

If Test 1 uses Unleash but Test 2 doesn't, and Test 2 fails with wrong toggle state, cleanup didn't propagate.

### Step 4: Verify Cleanup Fixture

Check if test uses correct fixture:

```typescript
// ❌ Wrong - no cleanup
import { test } from '../../../fixtures';

// ✅ Correct - with Unleash cleanup
import { test } from '../../../fixtures/unleash-cleanup';
```

### Step 5: Check for Race Conditions

Add debug logging in `UnleashHelper`:

```typescript
console.log(`Admin API state: ${adminState}`);
console.log(`Frontend API state: ${frontendState}`);
```

If they differ, you have a propagation issue.

## The Solution

### 1. Dual-API Polling (Implemented)

`UnleashHelper` now waits for **both** APIs to confirm changes:

```typescript
private async waitForToggleState(featureName: string, expectedState: boolean) {
  // Poll Admin API
  let adminState = await this.isFeatureEnabled(featureName);

  // Poll Frontend API (what the browser actually sees)
  let frontendState = await this.getFrontendToggleState(featureName);

  // Wait until BOTH match expected state
  while (adminState !== expectedState || frontendState !== expectedState) {
    await new Promise(resolve => setTimeout(resolve, 500));
    adminState = await this.isFeatureEnabled(featureName);
    frontendState = await this.getFrontendToggleState(featureName);
  }
}
```

### 2. Cache-Busting

Frontend API calls include feature names and timestamp to avoid HTTP cache:

```typescript
const cacheBust = Date.now();
const featureName = 'melosys.my-feature';
await this.request.get(`http://localhost:8080/api/featuretoggle?features=${encodeURIComponent(featureName)}&_=${cacheBust}`, {
  headers: { 'Authorization': `Bearer ${authToken}` }
});
```

### 3. Automatic Cleanup Polling

The `unleash-cleanup` fixture automatically waits for propagation:

```typescript
// Cleanup restores and waits
if (wasEnabled) {
  await unleash.enableFeature(feature);  // Includes polling
} else {
  await unleash.disableFeature(feature); // Includes polling
}
```

## Common Issues

### Issue 1: Toggle Shows Wrong State in Test

**Symptom:** Test expects toggle enabled, but trace shows disabled

**Cause:** Previous test's cleanup didn't propagate, or race condition between Admin API and Frontend API

**Fix:**
1. **Add frontend API assertion** to catch race condition early:
   ```typescript
   const adminState = await unleash.isFeatureEnabled(toggleName);
   const frontendState = await unleash.getFrontendToggleState(toggleName);

   expect(adminState, 'Admin API should show toggle enabled').toBe(true);
   expect(frontendState, 'Frontend API should match Admin API').toBe(true);
   ```
2. Ensure previous test uses `unleash-cleanup` fixture
3. Check cleanup logs for "Restored X toggle(s)"
4. Increase polling timeout if needed

### Issue 2: Test Times Out Waiting for Toggle

**Symptom:**
```
⚠️ Unleash: Timeout waiting for 'melosys.feature' to be enabled
   Admin API state: true, Frontend API state: false
```

**Cause:** melosys-api cache not refreshing

**Fix:**
1. Check melosys-api Unleash polling configuration
2. Increase timeout in `waitForToggleState()`
3. Add manual cache-clearing endpoint

### Issue 3: Tests Pass Locally, Fail on CI

**Symptom:** All tests green locally, red on GitHub Actions

**Cause:** Timing differences - CI runs faster

**Fix:**
1. Don't rely on timing - use explicit polling
2. Ensure cleanup waits for propagation
3. Add longer timeout for CI environment

### Issue 4: Cleanup Not Running

**Symptom:** Toggle state leaks between tests

**Cause:** Test doesn't use `unleash-cleanup` fixture

**Fix:**
```typescript
// Change from:
import { test } from '../../../fixtures';

// To:
import { test } from '../../../fixtures/unleash-cleanup';
```

### Issue 5: Page Closed During Cleanup

**Symptom:**
```
Error: apiRequestContext.get: Target page, context or browser has been closed
```

**Cause:** Cleanup tries to check frontend API after page disposal

**Fix:** Already handled - `getFrontendToggleState()` returns `null` when page is closed, and polling falls back to Admin API only.

## Best Practices

### 1. Always Use Unleash-Cleanup Fixture

If your test touches Unleash toggles:

```typescript
import { test } from '../../../fixtures/unleash-cleanup';
import { UnleashHelper } from '../../../helpers/unleash-helper';

test('my test', async ({ page, request }) => {
  const unleash = new UnleashHelper(request);
  await unleash.enableFeature('melosys.my-feature');

  // Test logic...

  // Cleanup happens automatically
});
```

### 2. Always Assert Frontend API State

Don't just check the Admin API - **always verify what the frontend actually sees**:

```typescript
// ✅ Correct - Check both APIs
const unleash = new UnleashHelper(request);
const toggleName = 'melosys.my-feature';

// Check both Admin API and Frontend API
const adminState = await unleash.isFeatureEnabled(toggleName);
const frontendState = await unleash.getFrontendToggleState(toggleName);

console.log(`Admin API: ${adminState ? 'ENABLED' : 'DISABLED'}`);
console.log(`Frontend API: ${frontendState ? 'ENABLED' : 'DISABLED'}`);

// Assert both states match expected
expect(adminState).toBe(true);
expect(frontendState, 'Frontend API must match Admin API state').toBe(true);

// ❌ Wrong - Only checks Admin API
const isEnabled = await unleash.isFeatureEnabled(toggleName);
expect(isEnabled).toBe(true);  // Might be true in Admin but false in Frontend!
```

**Why this matters:**
- Admin API might return `true` immediately after enabling
- Frontend API (melosys-api) might still return `false` due to caching
- Test proceeds with wrong assumption → flaky test
- Asserting frontend state catches the race condition early

### 3. Set Toggles BEFORE Login

Frontend fetches toggles on page load, so set them **before** authentication:

```typescript
// ✅ Correct
await unleash.disableFeature('melosys.feature');
await auth.login();  // Page loads with correct toggle state

// ❌ Wrong
await auth.login();
await unleash.disableFeature('melosys.feature');  // Too late!
```

### 4. Don't Mix Toggle States

Each test should be self-contained:

```typescript
// ❌ Bad - depends on default state
test('my test', async ({ page }) => {
  // Assumes toggle is enabled...
});

// ✅ Good - explicitly sets state
test('my test', async ({ page, request }) => {
  const unleash = new UnleashHelper(request);
  await unleash.enableFeature('melosys.feature');
  // Now we're sure!
});
```

### 5. Check Playwright Traces

When debugging flaky tests:

1. Download trace from CI
2. Check Network tab for `/featuretoggle` requests
3. Compare toggle values with test expectations
4. Look for timing patterns

### 6. Monitor Cleanup Logs

In CI output, verify cleanup is working:

```bash
✅ Unleash: Restored 1 toggle(s) to original state
```

If you don't see this after a test that changes toggles, cleanup might not be running.

### 7. Use Descriptive Test Names

Include toggle state in test name when relevant:

```typescript
test('skal vise årsavregning advarsel når toggle er aktivert', ...)
test('skal ikke vise årsavregning når toggle er deaktivert', ...)
```

## Configuration

### Timeout Settings

Current defaults in `UnleashHelper`:

- **Polling timeout**: 30 seconds
- **Poll interval**: 500ms
- **Initial delay**: 100ms

To adjust:

```typescript
// In unleash-helper.ts
private async waitForToggleState(
  featureName: string,
  expectedState: boolean,
  timeoutMs: number = 30000,  // Increase for slower environments
  pollIntervalMs: number = 500  // Decrease for faster checking
)
```

### Unleash Server Cache

Unleash server typically refreshes its cache every 10-15 seconds. This is configured in Unleash server settings, not in our code.

### melosys-api Polling

Check `melosys-api` configuration for Unleash SDK polling interval. Typically 10-30 seconds.

## Troubleshooting Checklist

When debugging Unleash-related test failures:

- [ ] Check Playwright trace - is toggle value correct?
- [ ] Verify test uses `unleash-cleanup` fixture
- [ ] Check toggle is set BEFORE login
- [ ] Look for "Confirmed toggle state" messages in logs
- [ ] Verify cleanup ran ("Restored X toggle(s)")
- [ ] Check test execution order (which test ran before?)
- [ ] Compare local vs CI timing
- [ ] Check for timeout warnings in logs
- [ ] Verify no manual cache clearing needed
- [ ] Check melosys-api Unleash configuration

## Related Files

- `helpers/unleash-helper.ts` - Toggle manipulation with polling
- `fixtures/unleash-cleanup.ts` - Automatic cleanup fixture
- `tests/unleash-eksempel.spec.ts` - Example usage
- `docs/guides/HELPERS.md` - UnleashHelper documentation

## Further Reading

- [Unleash Documentation](https://docs.getunleash.io)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [E2E Test Isolation](https://playwright.dev/docs/test-isolation)
