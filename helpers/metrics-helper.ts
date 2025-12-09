/**
 * Helper for fetching and parsing Prometheus metrics from melosys-api
 *
 * Used to track which process types and steps are exercised by E2E tests,
 * helping prioritize what tests to add next.
 */

export interface MetricValue {
  labels: Record<string, string>;
  value: number;
}

export interface PrometheusMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary' | 'untyped';
  help: string;
  values: MetricValue[];
}

export interface MetricsSnapshot {
  timestamp: string;
  metrics: PrometheusMetric[];
}

export interface MetricDelta {
  labels: Record<string, string>;
  before: number;
  after: number;
  delta: number;
}

export interface MetricsDelta {
  name: string;
  deltas: MetricDelta[];
}

export interface CoverageStats {
  processTypes: {
    exercised: string[];
    notExercised: string[];
    counts: Record<string, number>;
    percentage: number;
  };
  processSteps: {
    exercised: string[];
    notExercised: string[];
    counts: Record<string, { success: number; failed: number }>;
    percentage: number;
  };
  summary: {
    sakCreated: number;
    behandlingerCompleted: number;
  };
}

// Known process types from ProsessType enum in melosys-api
const KNOWN_PROCESS_TYPES = [
  'ANMODNING_OM_UNNTAK',
  'OPPRETT_SAK',
  'IVERKSETT_VEDTAK_FTRL',
  'IVERKSETT_VEDTAK_LOVVALG',
  'IVERKSETT_VEDTAK_TRYGDEAVGIFT',
  'JFR_NY_SAK_BRUKER',
  'JFR_MOTTATT_SED',
  'JFR_UTGAAENDE_SED',
  'OPPRETT_OPPGAVE',
  'FERDIGSTILL_OPPGAVE',
  'DISTRIBUER_BREV',
  'SEND_NOTAT_TIL_GOSYS',
  'PUBLISER_VEDTAK_KAFKA',
  'OPPDATER_OPPGAVE',
  'VEDTAK_MEDLEMSKAP_UNNTAK',
  'VEDTAK_TRYGDETID',
  'REGISTRER_PAAKRAVD_MEDLEMSKAP',
  'LOVVALG_AVGJOERELSE',
  'OPPHOER_LOVVALG',
  'LUKK_BEHANDLING',
  'MOTTA_A003',
  'MOTTA_A009',
  'MOTTA_A010',
  'MOTTA_A011',
  'MOTTA_A012',
  'MOTTA_H001',
  'MOTTA_H002',
  'MOTTA_H003',
  'MOTTA_H004',
  'MOTTA_H005',
  'MOTTA_H006',
  'MOTTA_H010',
  'MOTTA_H011',
  'MOTTA_H012',
  'MOTTA_H020',
  'MOTTA_H021',
  'MOTTA_H061',
  'MOTTA_H062',
  'MOTTA_H065',
  'MOTTA_H066',
  'MOTTA_H070',
  'MOTTA_H120',
  'MOTTA_H121',
  'MOTTA_X001',
  'MOTTA_X007',
  'MOTTA_X008',
  'MOTTA_X009',
  'MOTTA_X010',
  'MOTTA_X012',
];

// Known process steps from ProsessSteg enum - subset of most important ones
const KNOWN_PROCESS_STEPS = [
  'OPPRETT_SAK_OG_BEH',
  'HENT_REGISTEROPPLYSNINGER',
  'REGISTERKONTROLL',
  'LAGRE_LOVVALGSPERIODE_MEDL',
  'LAGRE_MEDLEMSPERIODE_MEDL',
  'OPPRETT_JOURNALPOST',
  'FERDIGSTILL_JOURNALPOST',
  'DISTRIBUER_JOURNALPOST',
  'SEND_SED',
  'MOTTA_SED',
  'OPPRETT_OPPGAVE',
  'FERDIGSTILL_OPPGAVE',
  'OPPDATER_OPPGAVE',
  'LAGRE_VEDTAK',
  'PUBLISER_VEDTAK',
  'AVSLUTT_BEHANDLING',
  'HENT_INNTEKT',
  'BEREGN_TRYGDEAVGIFT',
  'FAKTURERING',
  'VALIDER_SOKNAD',
  'LAGRE_SOKNAD',
];

export class MetricsHelper {
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:8080') {
    this.baseUrl = baseUrl;
  }

  /**
   * Fetch metrics from Prometheus endpoint
   */
  async fetchMetrics(): Promise<MetricsSnapshot> {
    const response = await fetch(`${this.baseUrl}/internal/prometheus`);
    if (!response.ok) {
      throw new Error(`Failed to fetch metrics: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    return {
      timestamp: new Date().toISOString(),
      metrics: this.parsePrometheusText(text),
    };
  }

  /**
   * Parse Prometheus text format into structured data
   *
   * Format:
   * # HELP metric_name Description
   * # TYPE metric_name counter
   * metric_name{label="value"} 123.0
   */
  parsePrometheusText(text: string): PrometheusMetric[] {
    const lines = text.split('\n');
    const metrics: Map<string, PrometheusMetric> = new Map();

    let currentHelp = '';
    let currentType: PrometheusMetric['type'] = 'untyped';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Parse HELP line
      if (trimmed.startsWith('# HELP ')) {
        const match = trimmed.match(/^# HELP (\S+) (.*)$/);
        if (match) {
          currentHelp = match[2];
        }
        continue;
      }

      // Parse TYPE line
      if (trimmed.startsWith('# TYPE ')) {
        const match = trimmed.match(/^# TYPE (\S+) (\S+)$/);
        if (match) {
          currentType = match[2] as PrometheusMetric['type'];
        }
        continue;
      }

      // Skip other comments
      if (trimmed.startsWith('#')) continue;

      // Parse metric line: metric_name{labels} value
      const metricMatch = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([0-9.eE+-]+|NaN|Inf|-Inf)$/);
      if (metricMatch) {
        const [, name, labelsStr, valueStr] = metricMatch;
        const value = parseFloat(valueStr);

        // Parse labels
        const labels: Record<string, string> = {};
        if (labelsStr) {
          const labelMatches = labelsStr.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"/g);
          for (const labelMatch of labelMatches) {
            labels[labelMatch[1]] = labelMatch[2];
          }
        }

        // Get or create metric
        if (!metrics.has(name)) {
          metrics.set(name, {
            name,
            type: currentType,
            help: currentHelp,
            values: [],
          });
        }

        metrics.get(name)!.values.push({ labels, value });
      }
    }

    return Array.from(metrics.values());
  }

  /**
   * Filter to only melosys-specific metrics
   */
  filterMelosysMetrics(metrics: PrometheusMetric[]): PrometheusMetric[] {
    return metrics.filter((m) => m.name.startsWith('melosys_'));
  }

  /**
   * Calculate deltas between two snapshots
   */
  calculateDeltas(before: MetricsSnapshot, after: MetricsSnapshot): MetricsDelta[] {
    const deltas: MetricsDelta[] = [];

    // Create lookup map for before metrics
    const beforeMap = new Map<string, PrometheusMetric>();
    for (const metric of before.metrics) {
      beforeMap.set(metric.name, metric);
    }

    // Calculate deltas for each metric in after
    for (const afterMetric of after.metrics) {
      const beforeMetric = beforeMap.get(afterMetric.name);
      const metricDeltas: MetricDelta[] = [];

      for (const afterValue of afterMetric.values) {
        const labelKey = JSON.stringify(afterValue.labels);
        const beforeValue =
          beforeMetric?.values.find((v) => JSON.stringify(v.labels) === labelKey)?.value ?? 0;

        const delta = afterValue.value - beforeValue;
        if (delta !== 0) {
          metricDeltas.push({
            labels: afterValue.labels,
            before: beforeValue,
            after: afterValue.value,
            delta,
          });
        }
      }

      if (metricDeltas.length > 0) {
        deltas.push({
          name: afterMetric.name,
          deltas: metricDeltas,
        });
      }
    }

    return deltas;
  }

  /**
   * Calculate coverage statistics from metrics deltas
   */
  calculateCoverage(deltas: MetricsDelta[]): CoverageStats {
    const stats: CoverageStats = {
      processTypes: {
        exercised: [],
        notExercised: [...KNOWN_PROCESS_TYPES],
        counts: {},
        percentage: 0,
      },
      processSteps: {
        exercised: [],
        notExercised: [...KNOWN_PROCESS_STEPS],
        counts: {},
        percentage: 0,
      },
      summary: {
        sakCreated: 0,
        behandlingerCompleted: 0,
      },
    };

    for (const metricDelta of deltas) {
      // Process instances created
      if (metricDelta.name === 'melosys_prosessinstanser_opprettet_total') {
        for (const delta of metricDelta.deltas) {
          const type = delta.labels['type'];
          if (type && delta.delta > 0) {
            stats.processTypes.counts[type] = (stats.processTypes.counts[type] || 0) + delta.delta;
            if (!stats.processTypes.exercised.includes(type)) {
              stats.processTypes.exercised.push(type);
              stats.processTypes.notExercised = stats.processTypes.notExercised.filter(
                (t) => t !== type
              );
            }
          }
        }
      }

      // Process steps executed
      if (metricDelta.name === 'melosys_prosessinstanser_steg_utfoert_total') {
        for (const delta of metricDelta.deltas) {
          const step = delta.labels['type'];
          const status = delta.labels['status'];
          if (step && delta.delta > 0) {
            if (!stats.processSteps.counts[step]) {
              stats.processSteps.counts[step] = { success: 0, failed: 0 };
            }
            if (status === 'FERDIG') {
              stats.processSteps.counts[step].success += delta.delta;
            } else if (status === 'FEILET') {
              stats.processSteps.counts[step].failed += delta.delta;
            }
            if (!stats.processSteps.exercised.includes(step)) {
              stats.processSteps.exercised.push(step);
              stats.processSteps.notExercised = stats.processSteps.notExercised.filter(
                (s) => s !== step
              );
            }
          }
        }
      }

      // Cases created
      if (metricDelta.name === 'melosys_saker_opprettet_total') {
        for (const delta of metricDelta.deltas) {
          stats.summary.sakCreated += delta.delta;
        }
      }

      // Treatments completed
      if (metricDelta.name === 'melosys_behandlinger_avsluttet_total') {
        for (const delta of metricDelta.deltas) {
          stats.summary.behandlingerCompleted += delta.delta;
        }
      }
    }

    // Calculate percentages
    stats.processTypes.percentage =
      KNOWN_PROCESS_TYPES.length > 0
        ? (stats.processTypes.exercised.length / KNOWN_PROCESS_TYPES.length) * 100
        : 0;

    stats.processSteps.percentage =
      KNOWN_PROCESS_STEPS.length > 0
        ? (stats.processSteps.exercised.length / KNOWN_PROCESS_STEPS.length) * 100
        : 0;

    return stats;
  }
}
