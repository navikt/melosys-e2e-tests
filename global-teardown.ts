/**
 * Global teardown - runs once after all tests complete
 *
 * Generates metrics coverage report comparing before/after snapshots
 */
import * as fs from 'fs';
import * as path from 'path';
import { MetricsHelper, MetricsSnapshot } from './helpers/metrics-helper';
import {
  generateMetricsMarkdown,
  generateMetricsJson,
  MetricsCoverageReport,
} from './lib/metrics-reporter';

export default async function globalTeardown() {
  const metrics = new MetricsHelper();
  const resultsDir = path.join(process.cwd(), 'test-results');

  // Write to test-results directory (persists across reporter phases)
  // The test-summary reporter will copy these to playwright-report/
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  try {
    // Check if before snapshot exists
    const beforePath = path.join(resultsDir, '.metrics-before.json');
    if (!fs.existsSync(beforePath)) {
      console.warn('⚠️  No metrics-before snapshot found, skipping coverage report');
      return;
    }

    // Load before snapshot
    const beforeJson = fs.readFileSync(beforePath, 'utf-8');
    const before: MetricsSnapshot = JSON.parse(beforeJson);

    // Fetch after snapshot
    console.log('📊 Fetching final metrics...');
    const after = await metrics.fetchMetrics();

    // Calculate deltas
    const deltas = metrics.calculateDeltas(before, after);
    const melosysDeltas = deltas.filter((d) => d.name.startsWith('melosys_'));

    // Calculate coverage stats
    const coverage = metrics.calculateCoverage(melosysDeltas);

    // Build report
    const report: MetricsCoverageReport = {
      timestamp: new Date().toISOString(),
      before,
      after,
      deltas: melosysDeltas,
      coverage,
    };

    // Generate and save reports to test-results (persists)
    const markdownReport = generateMetricsMarkdown(report);
    const jsonReport = generateMetricsJson(report);

    fs.writeFileSync(path.join(resultsDir, 'metrics-summary.md'), markdownReport);
    fs.writeFileSync(path.join(resultsDir, 'metrics-coverage.json'), jsonReport);

    // Print summary to console
    console.log('');
    console.log('📊 Metrics Coverage Report');
    console.log('═'.repeat(50));
    console.log(`   Cases created:        ${coverage.summary.sakCreated}`);
    console.log(`   Treatments completed: ${coverage.summary.behandlingerCompleted}`);
    console.log(
      `   Process types:        ${coverage.processTypes.exercised.length} exercised (${coverage.processTypes.percentage.toFixed(1)}%)`
    );
    console.log(
      `   Process steps:        ${coverage.processSteps.exercised.length} exercised (${coverage.processSteps.percentage.toFixed(1)}%)`
    );
    console.log('═'.repeat(50));

    if (coverage.processTypes.exercised.length > 0) {
      console.log('');
      console.log('Process types triggered:');
      for (const [type, count] of Object.entries(coverage.processTypes.counts).slice(0, 10)) {
        console.log(`   ${type}: ${count}`);
      }
      if (Object.keys(coverage.processTypes.counts).length > 10) {
        console.log(`   ... and ${Object.keys(coverage.processTypes.counts).length - 10} more`);
      }
    }

    console.log('');
    console.log('📄 Full report: test-results/metrics-summary.md');
    console.log('📄 JSON data:   test-results/metrics-coverage.json');

    // Clean up before snapshot
    fs.unlinkSync(beforePath);
  } catch (error) {
    console.warn('⚠️  Could not generate metrics report:', (error as Error).message);
  }
}
