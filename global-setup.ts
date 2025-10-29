/**
 * Global setup - runs once before all tests
 */
export default async function globalSetup() {
  console.log('🚀 Global setup: Docker log monitoring enabled for each test');
  console.log('   Import test from fixtures/docker-log-fixture.ts to enable per-test log checking');
}
