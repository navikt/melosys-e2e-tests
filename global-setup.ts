/**
 * Global setup - runs once before all tests
 *
 * Captures initial metrics snapshot for coverage tracking
 */
import * as fs from 'fs';
import * as path from 'path';
import { MetricsHelper } from './helpers/metrics-helper';

export default async function globalSetup() {
  console.log('🚀 Global setup: Docker log monitoring enabled for each test');
  console.log(
    '   Import test from fixtures/docker-log-fixture.ts to enable per-test log checking'
  );

  // Capture metrics snapshot before tests
  const metrics = new MetricsHelper();
  const resultsDir = path.join(process.cwd(), 'test-results');

  // Ensure test-results directory exists
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  try {
    const snapshot = await metrics.fetchMetrics();
    const snapshotPath = path.join(resultsDir, '.metrics-before.json');
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    console.log('📊 Captured initial metrics snapshot');
  } catch (error) {
    console.warn('⚠️  Could not capture metrics (API not running?):', (error as Error).message);
  }
}
