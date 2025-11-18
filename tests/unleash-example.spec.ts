import { test, expect } from '../fixtures';
import { AuthHelper } from '../helpers/auth-helper';
import { UnleashHelper } from '../helpers/unleash-helper';

/**
 * Example test demonstrating how to control feature toggles during E2E tests
 *
 * This test shows:
 * 1. How to enable/disable specific toggles
 * 2. How toggles affect all services (melosys-api, faktureringskomponenten, etc.)
 * 3. How cleanup fixture automatically resets toggles to defaults BEFORE each test
 *    (No cleanup after test - leaves state for debugging)
 */

test.describe('Unleash Feature Toggle Control', () => {
  test('should enable and disable feature toggles @manual', async ({ page, request }) => {
    const unleash = new UnleashHelper(request);

    // Enable a specific feature
    await unleash.enableFeature('melosys.behandlingstype.klage');

    // Verify it's enabled
    const isEnabled = await unleash.isFeatureEnabled('melosys.behandlingstype.klage');
    expect(isEnabled).toBe(true);

    // Disable the feature
    await unleash.disableFeature('melosys.behandlingstype.klage');

    // Verify it's disabled
    const isDisabled = await unleash.isFeatureEnabled('melosys.behandlingstype.klage');
    expect(isDisabled).toBe(false);
  });

  test('should test workflow with feature toggle enabled', async ({ page, request }) => {
    const auth = new AuthHelper(page);
    const unleash = new UnleashHelper(request);

    // Enable a feature for this test
    await unleash.enableFeature('melosys.send_melding_om_vedtak');

    // Login
    await auth.login();

    // Navigate to application
    await page.goto('http://localhost:3000/melosys/');

    // Your test workflow here...
    // The feature toggle will affect behavior in:
    // - melosys-api
    // - faktureringskomponenten
    // - melosys-trygdeavgift-beregning
    // - Any other service configured with Unleash

    // Verify some UI behavior based on the toggle...
  });

  test('should test workflow with feature toggle disabled', async ({ page, request }) => {
    const auth = new AuthHelper(page);
    const unleash = new UnleashHelper(request);

    // Disable a feature for this test
    await unleash.disableFeature('melosys.send_melding_om_vedtak');

    // Login
    await auth.login();

    // Navigate to application
    await page.goto('http://localhost:3000/melosys/');

    // Test that the feature is NOT active...
    // Verify different UI behavior when toggle is off
  });

  test('should enable multiple toggles at once', async ({ request }) => {
    const unleash = new UnleashHelper(request);

    // Enable multiple features
    await unleash.enableFeatures([
      'melosys.pensjonist',
      'melosys.pensjonist_eos',
      'melosys.arsavregning',
    ]);

    // All three should be enabled
    expect(await unleash.isFeatureEnabled('melosys.pensjonist')).toBe(true);
    expect(await unleash.isFeatureEnabled('melosys.pensjonist_eos')).toBe(true);
    expect(await unleash.isFeatureEnabled('melosys.arsavregning')).toBe(true);
  });

  test('should list all feature toggles', async ({ request }) => {
    const unleash = new UnleashHelper(request);

    const features = await unleash.listFeatures();

    // Should have all the default toggles
    expect(features).toContain('melosys.behandlingstype.klage');
    expect(features).toContain('melosys.send_melding_om_vedtak');
    expect(features).toContain('melosys.arsavregning');

    console.log('📋 All feature toggles:', features);
  });

  test('cleanup fixture resets toggles automatically', async ({ request }) => {
    const unleash = new UnleashHelper(request);

    // Change a toggle
    await unleash.disableFeature('melosys.arsavregning');

    // Verify it's disabled
    expect(await unleash.isFeatureEnabled('melosys.arsavregning')).toBe(false);

    // After this test completes, the cleanup fixture will automatically
    // reset all toggles to their defaults (melosys.arsavregning will be enabled again)
  });
});

test.describe('Unleash Integration with Workflows', () => {
  test.skip('example: test pension workflow with pension toggle enabled', async ({
    page,
    request,
  }) => {
    const auth = new AuthHelper(page);
    const unleash = new UnleashHelper(request);

    // Enable pension features
    await unleash.enableFeatures(['melosys.pensjonist', 'melosys.pensjonist_eos']);

    // Login and run test
    await auth.login();
    await page.goto('http://localhost:3000/melosys/');

    // TODO: Add your pension workflow test here
    // This workflow will now have pension features enabled
  });

  test.skip('example: test årsvgregning without flyt', async ({ page, request }) => {
    const auth = new AuthHelper(page);
    const unleash = new UnleashHelper(request);

    // Enable årsavregning but disable flyt
    await unleash.enableFeature('melosys.arsavregning');
    await unleash.disableFeature('melosys.arsavregning.uten.flyt');

    // Login and test
    await auth.login();
    await page.goto('http://localhost:3000/melosys/');

    // TODO: Add your årsavregning test here
  });
});
