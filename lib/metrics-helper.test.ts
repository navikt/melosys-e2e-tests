/**
 * Unit tests for MetricsHelper
 *
 * Run tests:
 *   npm run test:unit
 */
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { MetricsHelper } from '../helpers/metrics-helper';

describe('MetricsHelper', () => {
  const helper = new MetricsHelper();

  describe('parsePrometheusText', () => {
    test('should parse simple counter metric', () => {
      const text = `
# HELP melosys_saker_opprettet_total Total number of saker created
# TYPE melosys_saker_opprettet_total counter
melosys_saker_opprettet_total 5.0
`;
      const metrics = helper.parsePrometheusText(text);

      assert.strictEqual(metrics.length, 1);
      assert.strictEqual(metrics[0].name, 'melosys_saker_opprettet_total');
      assert.strictEqual(metrics[0].type, 'counter');
      assert.strictEqual(metrics[0].help, 'Total number of saker created');
      assert.strictEqual(metrics[0].values.length, 1);
      assert.strictEqual(metrics[0].values[0].value, 5);
      assert.deepStrictEqual(metrics[0].values[0].labels, {});
    });

    test('should parse metric with labels', () => {
      const text = `
# HELP melosys_prosessinstanser_opprettet_total Process instances created
# TYPE melosys_prosessinstanser_opprettet_total counter
melosys_prosessinstanser_opprettet_total{type="OPPRETT_SAK"} 3.0
melosys_prosessinstanser_opprettet_total{type="IVERKSETT_VEDTAK"} 2.0
`;
      const metrics = helper.parsePrometheusText(text);

      assert.strictEqual(metrics.length, 1);
      assert.strictEqual(metrics[0].values.length, 2);
      assert.deepStrictEqual(metrics[0].values[0].labels, { type: 'OPPRETT_SAK' });
      assert.strictEqual(metrics[0].values[0].value, 3);
      assert.deepStrictEqual(metrics[0].values[1].labels, { type: 'IVERKSETT_VEDTAK' });
      assert.strictEqual(metrics[0].values[1].value, 2);
    });

    test('should parse metric with multiple labels', () => {
      const text = `
# TYPE melosys_prosessinstanser_steg_utfoert_total counter
melosys_prosessinstanser_steg_utfoert_total{type="OPPRETT_SAK_OG_BEH",status="FERDIG"} 5.0
melosys_prosessinstanser_steg_utfoert_total{type="OPPRETT_SAK_OG_BEH",status="FEILET"} 1.0
`;
      const metrics = helper.parsePrometheusText(text);

      assert.strictEqual(metrics.length, 1);
      assert.strictEqual(metrics[0].values.length, 2);
      assert.deepStrictEqual(metrics[0].values[0].labels, {
        type: 'OPPRETT_SAK_OG_BEH',
        status: 'FERDIG',
      });
      assert.deepStrictEqual(metrics[0].values[1].labels, {
        type: 'OPPRETT_SAK_OG_BEH',
        status: 'FEILET',
      });
    });

    test('should parse gauge metric', () => {
      const text = `
# HELP melosys_prosessinstanser_feilet Failed process instances
# TYPE melosys_prosessinstanser_feilet gauge
melosys_prosessinstanser_feilet{prosessinstanstype="OPPRETT_SAK"} 0.0
`;
      const metrics = helper.parsePrometheusText(text);

      assert.strictEqual(metrics.length, 1);
      assert.strictEqual(metrics[0].type, 'gauge');
    });

    test('should handle empty input', () => {
      const metrics = helper.parsePrometheusText('');
      assert.strictEqual(metrics.length, 0);
    });

    test('should handle multiple different metrics', () => {
      const text = `
# TYPE melosys_saker_opprettet_total counter
melosys_saker_opprettet_total 5.0
# TYPE melosys_behandlinger_avsluttet_total counter
melosys_behandlinger_avsluttet_total 3.0
`;
      const metrics = helper.parsePrometheusText(text);

      assert.strictEqual(metrics.length, 2);
      assert.strictEqual(metrics[0].name, 'melosys_saker_opprettet_total');
      assert.strictEqual(metrics[1].name, 'melosys_behandlinger_avsluttet_total');
    });
  });

  describe('filterMelosysMetrics', () => {
    test('should filter to only melosys metrics', () => {
      const metrics = [
        { name: 'melosys_saker_opprettet_total', type: 'counter' as const, help: '', values: [] },
        { name: 'jvm_memory_used_bytes', type: 'gauge' as const, help: '', values: [] },
        {
          name: 'melosys_behandlinger_avsluttet_total',
          type: 'counter' as const,
          help: '',
          values: [],
        },
        { name: 'http_requests_total', type: 'counter' as const, help: '', values: [] },
      ];

      const filtered = helper.filterMelosysMetrics(metrics);

      assert.strictEqual(filtered.length, 2);
      assert.strictEqual(filtered[0].name, 'melosys_saker_opprettet_total');
      assert.strictEqual(filtered[1].name, 'melosys_behandlinger_avsluttet_total');
    });
  });

  describe('calculateDeltas', () => {
    test('should calculate delta for simple counter', () => {
      const before = {
        timestamp: '2024-01-01T00:00:00Z',
        metrics: [
          {
            name: 'melosys_saker_opprettet_total',
            type: 'counter' as const,
            help: '',
            values: [{ labels: {}, value: 5 }],
          },
        ],
      };

      const after = {
        timestamp: '2024-01-01T01:00:00Z',
        metrics: [
          {
            name: 'melosys_saker_opprettet_total',
            type: 'counter' as const,
            help: '',
            values: [{ labels: {}, value: 8 }],
          },
        ],
      };

      const deltas = helper.calculateDeltas(before, after);

      assert.strictEqual(deltas.length, 1);
      assert.strictEqual(deltas[0].name, 'melosys_saker_opprettet_total');
      assert.strictEqual(deltas[0].deltas.length, 1);
      assert.strictEqual(deltas[0].deltas[0].before, 5);
      assert.strictEqual(deltas[0].deltas[0].after, 8);
      assert.strictEqual(deltas[0].deltas[0].delta, 3);
    });

    test('should calculate delta for labeled metrics', () => {
      const before = {
        timestamp: '2024-01-01T00:00:00Z',
        metrics: [
          {
            name: 'melosys_prosessinstanser_opprettet_total',
            type: 'counter' as const,
            help: '',
            values: [
              { labels: { type: 'OPPRETT_SAK' }, value: 2 },
              { labels: { type: 'IVERKSETT_VEDTAK' }, value: 1 },
            ],
          },
        ],
      };

      const after = {
        timestamp: '2024-01-01T01:00:00Z',
        metrics: [
          {
            name: 'melosys_prosessinstanser_opprettet_total',
            type: 'counter' as const,
            help: '',
            values: [
              { labels: { type: 'OPPRETT_SAK' }, value: 5 },
              { labels: { type: 'IVERKSETT_VEDTAK' }, value: 1 }, // unchanged
              { labels: { type: 'NEW_TYPE' }, value: 3 }, // new
            ],
          },
        ],
      };

      const deltas = helper.calculateDeltas(before, after);

      assert.strictEqual(deltas.length, 1);
      // Should only include changed values (OPPRETT_SAK: +3, NEW_TYPE: +3)
      assert.strictEqual(deltas[0].deltas.length, 2);

      const opprettSakDelta = deltas[0].deltas.find((d) => d.labels.type === 'OPPRETT_SAK');
      assert.strictEqual(opprettSakDelta?.delta, 3);

      const newTypeDelta = deltas[0].deltas.find((d) => d.labels.type === 'NEW_TYPE');
      assert.strictEqual(newTypeDelta?.delta, 3);
      assert.strictEqual(newTypeDelta?.before, 0);
    });

    test('should not include metrics with zero delta', () => {
      const before = {
        timestamp: '2024-01-01T00:00:00Z',
        metrics: [
          {
            name: 'melosys_saker_opprettet_total',
            type: 'counter' as const,
            help: '',
            values: [{ labels: {}, value: 5 }],
          },
        ],
      };

      const after = {
        timestamp: '2024-01-01T01:00:00Z',
        metrics: [
          {
            name: 'melosys_saker_opprettet_total',
            type: 'counter' as const,
            help: '',
            values: [{ labels: {}, value: 5 }], // unchanged
          },
        ],
      };

      const deltas = helper.calculateDeltas(before, after);

      assert.strictEqual(deltas.length, 0);
    });
  });

  describe('calculateCoverage', () => {
    test('should calculate process type coverage', () => {
      const deltas = [
        {
          name: 'melosys_prosessinstanser_opprettet_total',
          deltas: [
            { labels: { type: 'OPPRETT_SAK' }, before: 0, after: 5, delta: 5 },
            { labels: { type: 'IVERKSETT_VEDTAK_FTRL' }, before: 0, after: 3, delta: 3 },
          ],
        },
      ];

      const coverage = helper.calculateCoverage(deltas);

      assert(coverage.processTypes.exercised.includes('OPPRETT_SAK'));
      assert(coverage.processTypes.exercised.includes('IVERKSETT_VEDTAK_FTRL'));
      assert.strictEqual(coverage.processTypes.counts['OPPRETT_SAK'], 5);
      assert.strictEqual(coverage.processTypes.counts['IVERKSETT_VEDTAK_FTRL'], 3);
      assert(!coverage.processTypes.notExercised.includes('OPPRETT_SAK'));
    });

    test('should calculate process step coverage with success/failed', () => {
      const deltas = [
        {
          name: 'melosys_prosessinstanser_steg_utfoert_total',
          deltas: [
            {
              labels: { type: 'OPPRETT_SAK_OG_BEH', status: 'FERDIG' },
              before: 0,
              after: 5,
              delta: 5,
            },
            {
              labels: { type: 'OPPRETT_SAK_OG_BEH', status: 'FEILET' },
              before: 0,
              after: 1,
              delta: 1,
            },
          ],
        },
      ];

      const coverage = helper.calculateCoverage(deltas);

      assert(coverage.processSteps.exercised.includes('OPPRETT_SAK_OG_BEH'));
      assert.deepStrictEqual(coverage.processSteps.counts['OPPRETT_SAK_OG_BEH'], {
        success: 5,
        failed: 1,
      });
    });

    test('should calculate summary stats', () => {
      const deltas = [
        {
          name: 'melosys_saker_opprettet_total',
          deltas: [{ labels: {}, before: 0, after: 5, delta: 5 }],
        },
        {
          name: 'melosys_behandlinger_avsluttet_total',
          deltas: [{ labels: {}, before: 0, after: 3, delta: 3 }],
        },
      ];

      const coverage = helper.calculateCoverage(deltas);

      assert.strictEqual(coverage.summary.sakCreated, 5);
      assert.strictEqual(coverage.summary.behandlingerCompleted, 3);
    });
  });
});
