import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — .mjs uten typedeklarasjon; scriptet er ren node uten avhengigheter.
import { fileArgs, listedTests, planShards, previousDurations } from '../scripts/shard-plan.mjs';

/**
 * Regresjonstest for fordelingen plan-jobben i e2e-tests.yml lager. En feil her gir enten en
 * test som ikke kjører i noen shard (grønn kjøring som ikke testet alt) eller en test som kjører
 * i to shards mot hver sin stack.
 */

type T = { file: string; title: string };
const tests = (spec: Record<string, number>): T[] =>
  Object.entries(spec).flatMap(([file, n]) => Array.from({ length: n }, (_, i) => ({ file, title: `t${i}` })));
const durations = (spec: Record<string, number>) => {
  const m = new Map<string, number>();
  for (const [key, ms] of Object.entries(spec)) m.set(key, ms);
  return m;
};

test('hver test havner i nøyaktig én shard', () => {
  const all = tests({ 'a/x.spec.ts': 3, 'b/y.spec.ts': 2, 'c/z.spec.ts': 1, 'd/w.spec.ts': 4, 'skjema/s1.spec.ts': 1, 'skjema/s2.spec.ts': 2 });
  const plan = planShards(all, new Map(), 3);
  const files = plan.shards.flatMap((s: { files: string[] }) => s.files);
  assert.deepEqual([...files].sort(), [...new Set(all.map((t) => t.file))].sort());
  assert.equal(new Set(files).size, files.length, 'ingen fil i to shards');
  assert.equal(plan.shards.reduce((n: number, s: { tests: number }) => n + s.tests, 0), all.length);
});

test('fordeler etter varighet, lengste fil først', () => {
  const all = tests({ 'lang.spec.ts': 1, 'm1.spec.ts': 1, 'm2.spec.ts': 1, 'k.spec.ts': 1 });
  const d = durations({ 'lang.spec.ts::t0': 100, 'm1.spec.ts::t0': 60, 'm2.spec.ts::t0': 50, 'k.spec.ts::t0': 10 });
  const plan = planShards(all, d, 2);
  // lang (100) og m1 (60) får hver sin; m2 går til m1 (110), k til lang (110).
  assert.deepEqual(
    plan.shards.map((s: { files: string[] }) => s.files),
    [['k.spec.ts', 'lang.spec.ts'], ['m1.spec.ts', 'm2.spec.ts']]
  );
});

test('skjema-filene går i samme shard, og bare den shard-en får skjema-flagget', () => {
  const all = tests({ 'skjema/a.spec.ts': 1, 'skjema/b.spec.ts': 1, 'x.spec.ts': 1, 'y.spec.ts': 1, 'z.spec.ts': 1 });
  const plan = planShards(all, new Map(), 3);
  const medSkjema = plan.shards.filter((s: { files: string[] }) => s.files.some((f) => f.startsWith('skjema/')));
  assert.equal(medSkjema.length, 1);
  assert.deepEqual(
    plan.shards.map((s: { skjema: boolean }) => s.skjema),
    plan.shards.map((s: { files: string[] }) => s.files.some((f) => f.startsWith('skjema/')))
  );
});

test('aldri flere shards enn filer å fordele, og ingen tom shard', () => {
  const plan = planShards(tests({ 'a.spec.ts': 5, 'b.spec.ts': 1 }), new Map(), 4);
  assert.equal(plan.shardCount, 2);
  assert.ok(plan.shards.every((s: { files: string[] }) => s.files.length > 0));
});

test('én shard kjører uten filfilter, også når filteret ga ingen tester', () => {
  const én = planShards(tests({ 'a.spec.ts': 2, 'skjema/s.spec.ts': 1 }), new Map(), 1);
  assert.deepEqual(én.shards[0].files, []);
  assert.equal(én.shards[0].skjema, true);

  const ingen = planShards([], new Map(), 3);
  assert.equal(ingen.shardCount, 1);
  assert.deepEqual(ingen.shards[0].files, []);
  assert.equal(ingen.shards[0].skjema, false);
});

test('ukjent test får medianen av de kjente, ikke 0', () => {
  const all = tests({ 'ny.spec.ts': 1, 'kjent.spec.ts': 3 });
  const d = durations({ 'kjent.spec.ts::t0': 10_000, 'kjent.spec.ts::t1': 20_000, 'kjent.spec.ts::t2': 90_000 });
  const plan = planShards(all, d, 1);
  assert.equal(plan.shards[0].estimatedSeconds, 20 + 10 + 20 + 90);
});

test('leser CI-stier fra test-summary.json relativt til tests/', () => {
  const d = previousDurations({
    tests: [
      { file: '/home/runner/work/melosys-e2e-tests/melosys-e2e-tests/tests/eu-eos/a.spec.ts', title: 'x', duration: 1200 },
      { file: '/home/runner/work/melosys-e2e-tests/melosys-e2e-tests/tests/eu-eos/a.spec.ts', title: 'y' },
    ],
  });
  assert.deepEqual([...d.entries()], [['eu-eos/a.spec.ts::x', 1200]]);
});

test('listedTests går gjennom nøstede describe-blokker', () => {
  const report = {
    suites: [
      { specs: [{ file: 'a.spec.ts', title: 'topp' }], suites: [{ specs: [{ file: 'a.spec.ts', title: 'inni describe' }] }] },
    ],
  };
  assert.deepEqual(listedTests(report).map((t: T) => t.title), ['topp', 'inni describe']);
});

test('filargumentet treffer bare sin egen fil', () => {
  // Playwright gjør «/…/»-argumenter om til RegExp(innhold) uten flagg og tester mot absolutt sti.
  const [arg] = fileArgs(['eu-eos/a.spec.ts']);
  const re = new RegExp(arg.slice(1, -1));
  assert.ok(re.test('/home/runner/work/r/r/tests/eu-eos/a.spec.ts'));
  assert.ok(!re.test('/home/runner/work/r/r/tests/eu-eos/xa.spec.ts'), 'samme filnavn-hale');
  assert.ok(!re.test('/home/runner/work/r/r/tests/x-eu-eos/a.spec.ts'), 'samme katalog-hale');
  assert.ok(!re.test('/home/runner/work/r/r/tests/eu-eos/aXspec.ts'), 'punktum er bokstavelig');
});
