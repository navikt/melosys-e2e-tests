import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — .mjs uten typedeklarasjon; scriptet er ren node uten avhengigheter.
import { MIN_SHARD_MS, fileArgs, listedTests, planShards, previousDurations } from '../scripts/shard-plan.mjs';

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
/** Samme varighet for hver test, lang nok til at antall shards ikke begrenses av MIN_SHARD_MS. */
const lange = (all: T[]) => new Map(all.map((t) => [`${t.file}::${t.title}`, MIN_SHARD_MS] as const));
const MIN = 60_000;

test('hver test havner i nøyaktig én shard', () => {
  const all = tests({ 'a/x.spec.ts': 3, 'b/y.spec.ts': 2, 'c/z.spec.ts': 1, 'd/w.spec.ts': 4, 'skjema/s1.spec.ts': 1, 'skjema/s2.spec.ts': 2 });
  const plan = planShards(all, lange(all), 3);
  assert.equal(plan.shardCount, 3);
  const files = plan.shards.flatMap((s: { files: string[] }) => s.files);
  assert.deepEqual([...files].sort(), [...new Set(all.map((t) => t.file))].sort());
  assert.equal(new Set(files).size, files.length, 'ingen fil i to shards');
  assert.equal(plan.shards.reduce((n: number, s: { tests: number }) => n + s.tests, 0), all.length);
});

test('fordeler etter varighet, lengste fil først', () => {
  const all = tests({ 'lang.spec.ts': 1, 'm1.spec.ts': 1, 'm2.spec.ts': 1, 'k.spec.ts': 1 });
  const d = durations({ 'lang.spec.ts::t0': 100 * MIN, 'm1.spec.ts::t0': 60 * MIN, 'm2.spec.ts::t0': 50 * MIN, 'k.spec.ts::t0': 10 * MIN });
  const plan = planShards(all, d, 2);
  // lang (100) og m1 (60) får hver sin; m2 går til m1 (110), k til lang (110).
  assert.deepEqual(
    plan.shards.map((s: { files: string[] }) => s.files),
    [['k.spec.ts', 'lang.spec.ts'], ['m1.spec.ts', 'm2.spec.ts']]
  );
});

test('skjema-filene går i samme shard, og bare den shard-en får skjema-flagget', () => {
  const all = tests({ 'skjema/a.spec.ts': 1, 'skjema/b.spec.ts': 1, 'x.spec.ts': 1, 'y.spec.ts': 1, 'z.spec.ts': 1 });
  const plan = planShards(all, lange(all), 3);
  assert.equal(plan.shardCount, 3);
  const medSkjema = plan.shards.filter((s: { files: string[] }) => s.files.some((f) => f.startsWith('skjema/')));
  assert.equal(medSkjema.length, 1);
  assert.deepEqual(
    plan.shards.map((s: { skjema: boolean }) => s.skjema),
    plan.shards.map((s: { files: string[] }) => s.files.some((f) => f.startsWith('skjema/')))
  );
});

test('aldri flere shards enn filer å fordele, og ingen tom shard', () => {
  const all = tests({ 'a.spec.ts': 5, 'b.spec.ts': 1 });
  const plan = planShards(all, lange(all), 4);
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

test('shardene får i snitt minst MIN_SHARD_MS estimert testtid', () => {
  // Merge queue-utvalg: noen få korte tester skal kjøre på én stack, uten filfilter.
  const få = tests({ 'a.spec.ts': 1, 'b.spec.ts': 1, 'c.spec.ts': 1 });
  const liten = planShards(få, durations({ 'a.spec.ts::t0': MIN, 'b.spec.ts::t0': 2 * MIN, 'c.spec.ts::t0': MIN }), 3);
  assert.equal(liten.shardCount, 1);
  assert.equal(liten.requestedShards, 3);
  assert.deepEqual(liten.shards[0].files, []);
  assert.equal(liten.estimatedSeconds, 4 * 60);

  // 9 min gir én shard: to shards ville fått 4,5 min hver.
  const ni = planShards(få, durations({ 'a.spec.ts::t0': 3 * MIN, 'b.spec.ts::t0': 3 * MIN, 'c.spec.ts::t0': 3 * MIN }), 3);
  assert.equal(ni.shardCount, 1);

  // 12 min gir to shards, ikke tre på 4 min.
  const tolv = planShards(få, durations({ 'a.spec.ts::t0': 4 * MIN, 'b.spec.ts::t0': 4 * MIN, 'c.spec.ts::t0': 4 * MIN }), 3);
  assert.equal(tolv.shardCount, 2);

  // Uten målte varigheter teller hver test 30 s: 19 tester = 9,5 min = én shard, 20 tester = to.
  assert.equal(planShards(tests({ 'a.spec.ts': 10, 'b.spec.ts': 9 }), new Map(), 3).shardCount, 1);
  assert.equal(planShards(tests({ 'a.spec.ts': 10, 'b.spec.ts': 10 }), new Map(), 3).shardCount, 2);
});

test('repeat_each ganger estimatet, så få tester med mange gjentak fordeles', () => {
  const få = tests({ 'a.spec.ts': 1, 'b.spec.ts': 1, 'c.spec.ts': 1 });
  const d = durations({ 'a.spec.ts::t0': MIN, 'b.spec.ts::t0': 2 * MIN, 'c.spec.ts::t0': MIN });
  // 4 min uten gjentak gir én shard; 20 gjentak gir 80 min, nok til tre.
  const tjue = planShards(få, d, 3, 20);
  assert.equal(tjue.shardCount, 3);
  assert.equal(tjue.totalTests, 60);
  assert.equal(tjue.estimatedSeconds, 80 * 60);
  assert.equal(tjue.shards.reduce((n: number, s: { tests: number }) => n + s.tests, 0), 60);
  // Få gjentak holder seg på én shard, og den ene shardens tall er også ganget.
  const to = planShards(få, d, 3, 2);
  assert.equal(to.shardCount, 1);
  assert.equal(to.shards[0].tests, 6);
  assert.equal(to.shards[0].estimatedSeconds, 8 * 60);
  // Ugyldig verdi (tom input fra workflow_call) teller som 1.
  assert.equal(planShards(få, d, 3, '').shardCount, 1);
});

test('CLI: --repeat-each ganger totalTests og knownDurations likt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shard-plan-'));
  const list = join(dir, 'list.json');
  const prev = join(dir, 'prev.json');
  writeFileSync(list, JSON.stringify({ suites: [{ specs: [{ file: 'a.spec.ts', title: 'x' }, { file: 'b.spec.ts', title: 'y' }] }] }));
  writeFileSync(prev, JSON.stringify({ tests: [{ file: '/r/tests/a.spec.ts', title: 'x', duration: 1000 }] }));
  // Fra repo-rota, som npm run test:unit.
  const script = join(process.cwd(), 'scripts/shard-plan.mjs');
  const ut = execFileSync(process.execPath, [script, '--list', list, '--previous', prev, '--shards', '2', '--repeat-each', '4']);
  const plan = JSON.parse(ut.toString());
  assert.equal(plan.repeatEach, 4);
  assert.equal(plan.totalTests, 8);
  assert.equal(plan.knownDurations, 4);
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
  assert.ok(!re.test('/home/runner/work/r/r/tests/eu-eos/a.spec.ts.orig'), 'slutten av stien');
});

test('samme test flere ganger i test-summary.json summeres', () => {
  // repeat_each eller like titler i ulike describe-blokker gir samme «fil::tittel».
  const d = previousDurations({
    tests: [
      { file: '/r/tests/a.spec.ts', title: 'x', duration: 1000 },
      { file: '/r/tests/a.spec.ts', title: 'x', duration: 2500 },
    ],
  });
  assert.equal(d.get('a.spec.ts::x'), 3500);
});

// ---- «Hent varigheter fra forrige fulle kjøring» i e2e-tests.yml ----

/** Skriptet i steget, slik det står i workflowen. */
function varighetSteg(): string {
  const linjer = readFileSync(join(process.cwd(), '.github/workflows/e2e-tests.yml'), 'utf8').split('\n');
  const start = linjer.findIndex((l) => l === '      - name: Hent varigheter fra forrige fulle kjøring');
  assert.ok(start !== -1, 'fant ikke steget');
  const run = linjer.findIndex((l, i) => i > start && l === '        run: |');
  const skript: string[] = [];
  for (const l of linjer.slice(run + 1)) {
    if (l !== '' && !l.startsWith('          ')) break;
    skript.push(l.slice(10));
  }
  return skript.join('\n');
}

type Kjøring = { id: number; summary: object; trigger: object };
const fullSummary = { status: 'passed', tests: [{ file: '/r/tests/a.spec.ts', title: 'x', duration: 1000 }] };
const regel6Summary = { status: 'skipped', skipped: true, skipReason: 'pinned-service', duration: 0, tests: [] };
const dispatch = { event: 'repository_dispatch', inputs: null };

/** Kjører steget med en falsk `gh` som lister `kjøringer` (nyeste først) og laster ned artefaktene deres. */
function hentVarigheter(kjøringer: Kjøring[]) {
  const dir = mkdtempSync(join(tmpdir(), 'varigheter-'));
  const fake = join(dir, 'fake');
  const bin = join(dir, 'bin');
  const temp = join(dir, 'runner-temp');
  for (const d of [fake, bin, temp]) mkdirSync(d, { recursive: true });
  writeFileSync(join(fake, 'runs.json'), JSON.stringify(kjøringer.map((k) => ({ databaseId: k.id, event: dispatch.event }))));
  for (const k of kjøringer) {
    mkdirSync(join(fake, String(k.id)));
    writeFileSync(join(fake, String(k.id), 'test-summary.json'), JSON.stringify(k.summary));
    writeFileSync(join(fake, String(k.id), 'trigger-context.json'), JSON.stringify(k.trigger));
  }
  writeFileSync(
    join(bin, 'gh'),
    `#!/usr/bin/env bash
if [ "$1 $2" = "run list" ]; then
  while [ $# -gt 0 ]; do [ "$1" = --jq ] && { shift; f="$1"; }; shift; done
  exec jq -r "$f" "${fake}/runs.json"
fi
if [ "$1 $2" = "run download" ]; then
  id="$3"; while [ $# -gt 0 ]; do [ "$1" = -D ] && { shift; d="$1"; }; shift; done
  [ -d "${fake}/$id" ] || exit 1
  mkdir -p "$d" && cp "${fake}/$id"/* "$d"/
  exit 0
fi
exit 2
`
  );
  chmodSync(join(bin, 'gh'), 0o755);
  const skript = join(dir, 'steg.sh');
  writeFileSync(skript, varighetSteg());
  const output = join(dir, 'github-output');
  writeFileSync(output, '');
  execFileSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', skript], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: temp, GITHUB_OUTPUT: output, GH_TOKEN: 'x', REPO: 'navikt/melosys-e2e-tests' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const runId = readFileSync(output, 'utf8').match(/^run_id=(\d+)$/m)?.[1];
  return { runId: runId ? Number(runId) : undefined, previous: existsSync(join(temp, 'previous.json')) ? JSON.parse(readFileSync(join(temp, 'previous.json'), 'utf8')) : undefined };
}

test('varigheter: en regel 6-kjøring uten tester hoppes over, og en eldre full kjøring brukes', () => {
  const r = hentVarigheter([
    { id: 10, summary: regel6Summary, trigger: dispatch },
    { id: 9, summary: fullSummary, trigger: dispatch },
  ]);
  assert.equal(r.runId, 9);
  assert.deepEqual(r.previous, fullSummary);
});

test('varigheter: en kjøring med tom testliste hoppes over, også uten skipped', () => {
  const { skipped, ...utenSkipped } = regel6Summary;
  void skipped;
  assert.equal(hentVarigheter([{ id: 20, summary: utenSkipped, trigger: dispatch }, { id: 19, summary: fullSummary, trigger: dispatch }]).runId, 19);
});

test('varigheter: seks regel 6-kjøringer på rad skjuler ikke en eldre full kjøring', () => {
  const regel6 = [106, 105, 104, 103, 102, 101].map((id) => ({ id, summary: regel6Summary, trigger: dispatch }));
  assert.equal(hentVarigheter([...regel6, { id: 100, summary: fullSummary, trigger: dispatch }]).runId, 100);
});
