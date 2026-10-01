#!/usr/bin/env node
/**
 * Fordeler spec-filene på N shards etter målt varighet, for plan-jobben i e2e-tests.yml.
 *
 * Playwrights `--shard` deler etter antall tester og ga 3,6–4,2 min lengre maks-shard enn en
 * grådig fordeling etter varighet (målt på kjøring 36424666656). Her fordeles hele filer med
 * LPT: lengste fil først, til shardet med minst estimert tid.
 *
 *   - Testene som skal kjøres, kommer fra `playwright test --list --reporter=json`, så
 *     `test_grep` og `@manual`-filteret i configen alt er brukt.
 *   - Varigheten per test kommer fra test-summary.json fra en tidligere kjøring. En test som
 *     ikke finnes der, får medianen av de kjente.
 *   - Skjema-filene (skjema/) går i samme shard: bare det shardet trenger skjema-stacken.
 *   - Antall shards blir aldri høyere enn antall enheter å fordele, så ingen shard står tom.
 *     Ingen tester gir én shard uten filfilter; da melder shard-jobben «0 tester» som før.
 *
 * Bruk:
 *   node scripts/shard-plan.mjs --list list.json [--previous test-summary.json] --shards 3
 * Planen skrives som JSON på stdout.
 */
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SKJEMA_PREFIX = 'skjema/';
const DEFAULT_TEST_MS = 30_000;

/** Testene i en `--list --reporter=json`-rapport, med fil relativt til testDir. */
export function listedTests(report) {
  const tests = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) tests.push({ file: spec.file, title: spec.title });
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return tests;
}

/**
 * Varighet per «fil::tittel» fra test-summary.json. Reporteren lagrer absolutt sti, som på CI
 * er /home/runner/work/<repo>/<repo>/tests/..., så stien kuttes etter «/tests/».
 */
export function previousDurations(summary) {
  const durations = new Map();
  for (const t of summary?.tests ?? []) {
    if (typeof t.file !== 'string' || typeof t.duration !== 'number') continue;
    const i = t.file.lastIndexOf('/tests/');
    const file = i === -1 ? t.file : t.file.slice(i + '/tests/'.length);
    const key = `${file}::${t.title}`;
    durations.set(key, (durations.get(key) ?? 0) + t.duration);
  }
  return durations;
}

function median(values) {
  if (values.length === 0) return DEFAULT_TEST_MS;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** LPT-fordeling. Gir samme plan for samme inndata: like lange enheter sorteres på navn. */
export function planShards(tests, durations, requestedShards) {
  const requested = Math.max(1, Math.floor(Number(requestedShards) || 1));
  const fallback = median([...durations.values()]);

  const units = new Map();
  for (const t of tests) {
    const name = t.file.startsWith(SKJEMA_PREFIX) ? SKJEMA_PREFIX : t.file;
    const unit = units.get(name) ?? { name, files: new Set(), tests: 0, ms: 0 };
    unit.files.add(t.file);
    unit.tests += 1;
    unit.ms += durations.get(`${t.file}::${t.title}`) ?? fallback;
    units.set(name, unit);
  }

  const shardCount = Math.max(1, Math.min(requested, units.size));
  const base = { requestedShards: requested, shardCount, totalTests: tests.length };

  // Én shard kjører uten filfilter, nøyaktig som en kjøring uten sharding.
  if (shardCount === 1) {
    const ms = [...units.values()].reduce((sum, u) => sum + u.ms, 0);
    return {
      ...base,
      shards: [
        { shard: 1, files: [], tests: tests.length, estimatedSeconds: Math.round(ms / 1000), skjema: units.has(SKJEMA_PREFIX) },
      ],
    };
  }

  const shards = Array.from({ length: shardCount }, (_, i) => ({ shard: i + 1, files: [], tests: 0, ms: 0, skjema: false }));
  const ordered = [...units.values()].sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name));
  for (const unit of ordered) {
    const target = shards.reduce((min, s) => (s.ms < min.ms ? s : min));
    target.files.push(...[...unit.files].sort());
    target.tests += unit.tests;
    target.ms += unit.ms;
    if (unit.name === SKJEMA_PREFIX) target.skjema = true;
  }

  return {
    ...base,
    shards: shards.map(({ ms, ...s }) => ({ ...s, files: s.files.sort(), estimatedSeconds: Math.round(ms / 1000) })),
  };
}

/**
 * Argumentene shard-jobben gir `playwright test`: ett anker per fil. Playwright leser
 * posisjonsargumenter som regex mot den absolutte stien, så en bar sti ville også truffet
 * en annen fil som slutter på samme navn.
 */
export function fileArgs(files) {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return files.map((f) => `/\\/tests\\/${escape(f)}$/`);
}

function fail(msg) {
  process.stderr.write(`❌ ${msg}\n`);
  process.exit(2);
}

function main() {
  const args = process.argv.slice(2);
  const valueOf = (flag) => {
    const i = args.indexOf(flag);
    if (i === -1) return undefined;
    const v = args[i + 1];
    if (!v || v.startsWith('--')) fail(`${flag} krever en verdi`);
    return v;
  };

  if (args.includes('--file-args')) {
    const plan = JSON.parse(readFileSync(valueOf('--file-args'), 'utf8'));
    const shard = plan.shards.find((s) => s.shard === Number(valueOf('--shard')));
    if (!shard) fail(`shard ${valueOf('--shard')} finnes ikke i planen`);
    process.stdout.write(fileArgs(shard.files).join('\n') + (shard.files.length ? '\n' : ''));
    return;
  }

  const listPath = valueOf('--list') ?? fail('--list mangler');
  const previousPath = valueOf('--previous');
  const tests = listedTests(JSON.parse(readFileSync(listPath, 'utf8')));
  const durations =
    previousPath && existsSync(previousPath) ? previousDurations(JSON.parse(readFileSync(previousPath, 'utf8'))) : new Map();
  const plan = planShards(tests, durations, valueOf('--shards') ?? 1);
  plan.knownDurations = tests.filter((t) => durations.has(`${t.file}::${t.title}`)).length;
  process.stdout.write(JSON.stringify(plan) + '\n');
}

// Kjør bare når scriptet startes direkte, ikke når testen importerer funksjonene.
if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  main();
}
