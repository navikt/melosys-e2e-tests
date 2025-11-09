import { test, expect } from '@playwright/test';
import { AdminApiHelper } from '../../../helpers/api-helper';

test.describe('Melosys Admin API', () => {
  test('skal finne ikke-skattepliktige saker via admin API', async ({ request }) => {
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

  test('skal hente status for ikke-skattepliktige saker jobb', async ({ request }) => {
    // Create admin API helper
    const adminApi = new AdminApiHelper();

    // Call the admin API to get job status
    const response = await adminApi.getIkkeSkattepliktigeSakerStatus(request);

    // Verify response
    expect(response.status()).toBe(200);
    expect(response.ok()).toBeTruthy();

    // Parse and log response data
    const data = await response.json();
    console.log('\n=== Job Status ===');
    console.log(JSON.stringify(data, null, 2));
    console.log('==================\n');

    // Verify response structure
    expect(data).toHaveProperty('jobName');
    expect(data).toHaveProperty('isRunning');
    expect(data).toHaveProperty('startedAt');
    expect(data).toHaveProperty('runtime');
    expect(data).toHaveProperty('antallFunnet');
    expect(data).toHaveProperty('antallProsessert');
    expect(data.jobName).toBe('FinnSakerForÅrsavregningIkkeSkattepliktige');
    expect(typeof data.isRunning).toBe('boolean');
  });

  test('should start job and wait for completion', async ({ request }) => {
    // Create admin API helper
    const adminApi = new AdminApiHelper();

    // Start the job
    console.log('\n🚀 Starting ikke-skattepliktige saker job...');
    const startResponse = await adminApi.finnIkkeSkattepliktigeSaker(
      request,
      '2024-01-01',
      '2024-12-31',
      false
    );

    expect(startResponse.status()).toBe(200);
    const startData = await startResponse.json();
    console.log('Job started:', JSON.stringify(startData, null, 2));

    // Wait for job to complete
    const finalStatus = await adminApi.waitForIkkeSkattepliktigeSakerJob(
      request,
      60, // 60 seconds timeout
      1000 // Poll every 1 second
    );

    // Verify job completed successfully
    expect(finalStatus.isRunning).toBe(false);
    expect(finalStatus.jobName).toBe('FinnSakerForÅrsavregningIkkeSkattepliktige');
    expect(finalStatus).toHaveProperty('antallFunnet');
    expect(finalStatus.antallProsessert).toBe(1);
    expect(finalStatus.errorCount).toBe(0);

    console.log('\n✅ Job completed successfully');
    console.log(`   Total found: ${finalStatus.antallFunnet}`);
    console.log(`   Total processed: ${finalStatus.antallProsessert}`);
  });
});



