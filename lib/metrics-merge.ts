/**
 * Slår sammen metrics-coverage.json fra flere shards. Hver shard har sin egen melosys-api, så
 * tellerne er uavhengige og deltaene kan summeres per metrikk og labelsett.
 */

import { MetricsHelper, type MetricDelta, type MetricsDelta } from '../helpers/metrics-helper';
import type { MetricsCoverageReport } from './metrics-reporter';

/** Labelsettet som nøkkel, uavhengig av rekkefølgen labelene ble parset i. */
function labelKey(labels: Record<string, string>): string {
  return JSON.stringify(Object.keys(labels).sort().map((k) => [k, labels[k]]));
}

export function mergeMetricsDeltas(perShard: MetricsDelta[][]): MetricsDelta[] {
  const metrics = new Map<string, Map<string, MetricDelta>>();
  for (const deltas of perShard) {
    for (const metric of deltas) {
      const byLabels = metrics.get(metric.name) ?? new Map<string, MetricDelta>();
      metrics.set(metric.name, byLabels);
      for (const d of metric.deltas) {
        const key = labelKey(d.labels);
        const sum = byLabels.get(key);
        if (sum) {
          sum.before += d.before;
          sum.after += d.after;
          sum.delta += d.delta;
        } else {
          byLabels.set(key, { labels: d.labels, before: d.before, after: d.after, delta: d.delta });
        }
      }
    }
  }
  return [...metrics].map(([name, byLabels]) => ({ name, deltas: [...byLabels.values()] }));
}

/** Rapporten for de summerte deltaene. Snapshotene finnes ikke etter sammenslåing og står tomme. */
export function mergeMetricsReports(reports: { deltas?: MetricsDelta[] }[], timestamp: string): MetricsCoverageReport {
  const deltas = mergeMetricsDeltas(reports.map((r) => r.deltas ?? []));
  return {
    timestamp,
    before: { timestamp, metrics: [] },
    after: { timestamp, metrics: [] },
    deltas,
    coverage: new MetricsHelper().calculateCoverage(deltas),
  };
}
