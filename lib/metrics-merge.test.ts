import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeMetricsDeltas, mergeMetricsReports } from './metrics-merge';

const OPPRETTET = 'melosys_prosessinstanser_opprettet_total';
const STEG = 'melosys_prosessinstanser_steg_utfoert_total';
const d = (labels: Record<string, string>, before: number, after: number) => ({ labels, before, after, delta: after - before });

test('summerer deltaene per metrikk og labelsett på tvers av shards', () => {
  const merged = mergeMetricsDeltas([
    [{ name: OPPRETTET, deltas: [d({ type: 'OPPRETT_SAK' }, 0, 3), d({ type: 'IVERKSETT_VEDTAK_FTRL' }, 1, 2)] }],
    [
      { name: OPPRETTET, deltas: [d({ type: 'OPPRETT_SAK' }, 0, 2)] },
      { name: 'melosys_saker_opprettet_total', deltas: [d({}, 0, 4)] },
    ],
  ]);
  assert.deepEqual(merged, [
    { name: OPPRETTET, deltas: [d({ type: 'OPPRETT_SAK' }, 0, 5), d({ type: 'IVERKSETT_VEDTAK_FTRL' }, 1, 2)] },
    { name: 'melosys_saker_opprettet_total', deltas: [d({}, 0, 4)] },
  ]);
});

test('samme labelsett i ulik rekkefølge er samme serie', () => {
  const merged = mergeMetricsDeltas([
    [{ name: STEG, deltas: [d({ type: 'LAGRE', status: 'FERDIG' }, 0, 1)] }],
    [{ name: STEG, deltas: [d({ status: 'FERDIG', type: 'LAGRE' }, 0, 2)] }],
  ]);
  assert.equal(merged[0].deltas.length, 1);
  assert.equal(merged[0].deltas[0].delta, 3);
});

test('ulike labelverdier holdes adskilt', () => {
  const merged = mergeMetricsDeltas([
    [{ name: STEG, deltas: [d({ type: 'LAGRE', status: 'FERDIG' }, 0, 1)] }],
    [{ name: STEG, deltas: [d({ type: 'LAGRE', status: 'FEILET' }, 0, 1)] }],
  ]);
  assert.equal(merged[0].deltas.length, 2);
});

test('dekningen regnes på nytt fra summen, og en shard uten deltas teller ikke', () => {
  const report = mergeMetricsReports(
    [
      { deltas: [{ name: OPPRETTET, deltas: [d({ type: 'OPPRETT_SAK' }, 0, 3)] }, { name: STEG, deltas: [d({ type: 'LAGRE', status: 'FERDIG' }, 0, 2)] }] },
      { deltas: [{ name: OPPRETTET, deltas: [d({ type: 'OPPRETT_SAK' }, 0, 1), d({ type: 'VALIDER_SOKNAD' }, 0, 1)] }, { name: STEG, deltas: [d({ type: 'LAGRE', status: 'FEILET' }, 0, 1)] }] },
      {},
    ],
    '2026-10-02T00:00:00.000Z'
  );
  assert.deepEqual(report.coverage.processTypes.counts, { OPPRETT_SAK: 4, VALIDER_SOKNAD: 1 });
  assert.deepEqual(report.coverage.processSteps.counts, { LAGRE: { success: 2, failed: 1 } });
  assert.equal(report.timestamp, '2026-10-02T00:00:00.000Z');
});

test('ingen shards gir ingen deltas', () => {
  assert.deepEqual(mergeMetricsDeltas([]), []);
});
