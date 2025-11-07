import { test, expect } from '@playwright/test';
import { AdminApiHelper } from '../../helpers/api-helper';

test.describe('Melosys Admin API', () => {
  test('should find ikke-skattepliktige saker via admin API', async ({ request }) => {
    // Create admin API helper
    const adminApi = new AdminApiHelper();

    // Call the admin API to find ikke-skattepliktige saker
    const response = await adminApi.finnIkkeSkattepliktigeSaker(
      request,
      '2024-01-01',
      '2024-12-31',
      false // lagProsessinstanser
    );

    // Verify response
    expect(response.status()).toBe(200);
    expect(response.ok()).toBeTruthy();

    // Parse and log response data
    const data = await response.json();
    console.log('\n=== API Response ===');
    console.log(JSON.stringify(data, null, 2));
    console.log('====================\n');

    // Verify response structure
    expect(data).toHaveProperty('fomDato');
    expect(data).toHaveProperty('tomDato');
    expect(data.fomDato).toBe('2024-01-01');
    expect(data.tomDato).toBe('2024-12-31');
    expect(data.lagProsessinstanser).toBe(false);
  });
});



