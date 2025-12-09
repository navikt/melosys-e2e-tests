/**
 * Generates markdown and JSON reports from Prometheus metrics coverage data
 */

import type { CoverageStats, MetricsDelta, MetricsSnapshot } from '../helpers/metrics-helper';

export interface MetricsCoverageReport {
  timestamp: string;
  testDuration?: number;
  before: MetricsSnapshot;
  after: MetricsSnapshot;
  deltas: MetricsDelta[];
  coverage: CoverageStats;
}

/**
 * Generate markdown report from metrics coverage data
 */
export function generateMetricsMarkdown(report: MetricsCoverageReport): string {
  const { coverage, deltas } = report;
  const lines: string[] = [];

  lines.push('# E2E Test Metrics Coverage Report');
  lines.push('');
  lines.push(`Generated: ${report.timestamp}`);
  lines.push('');

  // Summary section
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Cases created | ${coverage.summary.sakCreated} |`);
  lines.push(`| Treatments completed | ${coverage.summary.behandlingerCompleted} |`);
  lines.push(
    `| Process type coverage | ${coverage.processTypes.percentage.toFixed(1)}% (${coverage.processTypes.exercised.length} types) |`
  );
  lines.push(
    `| Process step coverage | ${coverage.processSteps.percentage.toFixed(1)}% (${coverage.processSteps.exercised.length} steps) |`
  );
  lines.push('');

  // Process types exercised
  if (coverage.processTypes.exercised.length > 0) {
    lines.push('## Process Types Exercised');
    lines.push('');
    lines.push('| Process Type | Count |');
    lines.push('|--------------|-------|');

    const sortedTypes = Object.entries(coverage.processTypes.counts).sort(([, a], [, b]) => b - a);

    for (const [type, count] of sortedTypes) {
      lines.push(`| ${type} | ${count} |`);
    }
    lines.push('');
  }

  // Process types NOT covered
  if (coverage.processTypes.notExercised.length > 0) {
    lines.push('## Process Types NOT Covered');
    lines.push('');
    lines.push(
      `These ${coverage.processTypes.notExercised.length} process types were not triggered by any test:`
    );
    lines.push('');

    // Show first 20, collapse rest
    const toShow = coverage.processTypes.notExercised.slice(0, 20);
    const remaining = coverage.processTypes.notExercised.length - 20;

    for (const type of toShow) {
      lines.push(`- \`${type}\``);
    }

    if (remaining > 0) {
      lines.push(`- ... and ${remaining} more`);
    }
    lines.push('');
  }

  // Process steps exercised
  if (coverage.processSteps.exercised.length > 0) {
    lines.push('## Process Steps Exercised');
    lines.push('');
    lines.push('| Step | Success | Failed |');
    lines.push('|------|---------|--------|');

    const sortedSteps = Object.entries(coverage.processSteps.counts).sort(
      ([, a], [, b]) => b.success + b.failed - (a.success + a.failed)
    );

    for (const [step, counts] of sortedSteps) {
      const failedStr = counts.failed > 0 ? `**${counts.failed}**` : '0';
      lines.push(`| ${step} | ${counts.success} | ${failedStr} |`);
    }
    lines.push('');
  }

  // All metric deltas (for debugging/detail)
  if (deltas.length > 0) {
    lines.push('<details>');
    lines.push('<summary>All Metric Changes (click to expand)</summary>');
    lines.push('');

    for (const metricDelta of deltas) {
      if (!metricDelta.name.startsWith('melosys_')) continue;

      lines.push(`### ${metricDelta.name}`);
      lines.push('');
      lines.push('| Labels | Before | After | Delta |');
      lines.push('|--------|--------|-------|-------|');

      for (const delta of metricDelta.deltas) {
        const labelsStr =
          Object.entries(delta.labels)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ') || '-';
        lines.push(`| ${labelsStr} | ${delta.before} | ${delta.after} | +${delta.delta} |`);
      }
      lines.push('');
    }

    lines.push('</details>');
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(
    '*This report shows which melosys-api code paths were exercised during E2E tests. Use it to identify coverage gaps and prioritize new tests.*'
  );

  return lines.join('\n');
}

/**
 * Generate JSON report from metrics coverage data
 */
export function generateMetricsJson(report: MetricsCoverageReport): string {
  return JSON.stringify(
    {
      timestamp: report.timestamp,
      testDuration: report.testDuration,
      coverage: {
        processTypes: {
          exercised: report.coverage.processTypes.exercised,
          notExercised: report.coverage.processTypes.notExercised,
          counts: report.coverage.processTypes.counts,
          percentage: report.coverage.processTypes.percentage,
        },
        processSteps: {
          exercised: report.coverage.processSteps.exercised,
          counts: report.coverage.processSteps.counts,
          percentage: report.coverage.processSteps.percentage,
        },
        summary: report.coverage.summary,
      },
      deltas: report.deltas.filter((d) => d.name.startsWith('melosys_')),
    },
    null,
    2
  );
}
