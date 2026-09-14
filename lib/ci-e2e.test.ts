import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Tester scripts/ci-e2e.sh og scripts/affected-tests.mjs slik de brukes: i et eget git-repo med
 * en lokal origin, og med en falsk `gh` og `sleep` først i PATH. Ingen workflow startes.
 *
 * Den falske `gh` logger hvert kall, svarer på `run list` fra en liste med svar (ett per kall)
 * og sender `--jq` gjennom ekte jq, slik gh gjør.
 */

const REPO = join(__dirname, '..');
const HAR_JQ = spawnSync('jq', ['--version']).status === 0;

const GH_STUB = `#!/usr/bin/env node
const fs = require('fs');
const { execFileSync } = require('child_process');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.GH_LOG, JSON.stringify(args) + '\\n');
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
const nå = () => new Date().toISOString().replace(/\\.\\d{3}/, '');
let data = null;
if (args[0] === 'api' && args[1] === 'user') data = { login: 'tester' };
if (args[0] === 'run' && args[1] === 'list') {
  const svar = JSON.parse(fs.readFileSync(process.env.GH_RUNS, 'utf8'));
  const tellerFil = process.env.GH_RUNS + '.teller';
  const n = fs.existsSync(tellerFil) ? Number(fs.readFileSync(tellerFil, 'utf8')) : 0;
  fs.writeFileSync(tellerFil, String(n + 1));
  let runs = svar[Math.min(n, svar.length - 1)].map((r) => ({ ...r, createdAt: r.createdAt === 'NÅ' ? nå() : r.createdAt }));
  if (flag('--event')) runs = runs.filter((r) => r.event === flag('--event'));
  if (flag('--user')) runs = runs.filter((r) => (r.user ?? 'tester') === flag('--user'));
  if (flag('--branch')) runs = runs.filter((r) => (r.headBranch ?? 'feature') === flag('--branch'));
  if (flag('--limit')) runs = runs.slice(0, Number(flag('--limit')));
  data = runs;
}
if (args[0] === 'run' && args[1] === 'view') {
  if (args.includes('--log')) process.exit(0);
  const id = args[2];
  data = { url: 'https://github.test/runs/' + id, status: 'completed', conclusion: process.env.GH_CONCLUSION || 'success' };
}
if (data === null) process.exit(0);
const json = JSON.stringify(data);
const jq = flag('--jq');
process.stdout.write(jq ? execFileSync('jq', ['-r', jq], { input: json, encoding: 'utf8' }) : json + '\\n');
`;

type Filer = Record<string, string>;

const git = (cwd: string, ...a: string[]) =>
  execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Repo med `main` og en `feature`-branch på origin. `endringer` committes på feature. */
function lagRepo(main: Filer, endringer: Filer = {}, ucommittet: Filer = {}) {
  const rot = mkdtempSync(join(tmpdir(), 'ci-e2e-test-'));
  const origin = join(rot, 'origin.git');
  const arbeid = join(rot, 'arbeid');
  const bin = join(rot, 'bin');
  mkdirSync(arbeid);
  mkdirSync(bin);
  git(rot, 'init', '-q', '--bare', origin);
  git(arbeid, 'init', '-q', '-b', 'main');
  git(arbeid, 'config', 'user.email', 'test@test');
  git(arbeid, 'config', 'user.name', 'test');
  const skriv = (filer: Filer) => {
    for (const [sti, innhold] of Object.entries(filer)) {
      mkdirSync(dirname(join(arbeid, sti)), { recursive: true });
      writeFileSync(join(arbeid, sti), innhold);
    }
  };
  mkdirSync(join(arbeid, 'scripts'));
  for (const f of ['ci-e2e.sh', 'affected-tests.mjs']) {
    copyFileSync(join(REPO, 'scripts', f), join(arbeid, 'scripts', f));
  }
  skriv(main);
  git(arbeid, 'add', '-A');
  git(arbeid, 'commit', '-q', '-m', 'main');
  git(arbeid, 'remote', 'add', 'origin', origin);
  git(arbeid, 'push', '-q', 'origin', 'main');
  git(arbeid, 'checkout', '-q', '-b', 'feature');
  if (Object.keys(endringer).length) {
    skriv(endringer);
    git(arbeid, 'add', '-A');
    git(arbeid, 'commit', '-q', '-m', 'endring');
  }
  git(arbeid, 'push', '-q', '-u', 'origin', 'feature');
  skriv(ucommittet);

  writeFileSync(join(bin, 'gh'), GH_STUB);
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(bin, 'gh'), 0o755);
  chmodSync(join(bin, 'sleep'), 0o755);

  const logg = join(rot, 'gh.log');
  const runs = join(rot, 'runs.json');
  writeFileSync(logg, '');
  writeFileSync(runs, JSON.stringify([[{ databaseId: 1, event: 'workflow_dispatch', createdAt: 'NÅ' }]]));

  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, FORCE_COLOR: '3', GH_LOG: logg, GH_RUNS: runs };
  return {
    arbeid,
    settRuns: (svar: unknown[][]) => writeFileSync(runs, JSON.stringify(svar)),
    ciE2e: (...a: string[]) => spawnSync('bash', ['scripts/ci-e2e.sh', ...a], { cwd: arbeid, env, encoding: 'utf8' }),
    affected: (...a: string[]) =>
      spawnSync('node', ['scripts/affected-tests.mjs', ...a], { cwd: arbeid, env, encoding: 'utf8' }),
    ghKall: (): string[][] =>
      existsSync(logg) ? readFileSync(logg, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [],
  };
}

const dispatch = (kall: string[][]) => kall.find((a) => a[0] === 'workflow' && a[1] === 'run');
const sendtFilter = (kall: string[][]) => {
  const d = dispatch(kall);
  assert.ok(d, 'workflowen skal være startet');
  const f = d.find((a) => a.startsWith('test_grep='));
  return f === undefined ? null : f.slice('test_grep='.length);
};

const TO_SPECS: Filer = {
  'helpers/felles.ts': 'export const felles = 1;\n',
  'helpers/bare-b.ts': 'export const b = 1;\n',
  'tests/a.spec.ts': "import { felles } from '../helpers/felles';\n",
  'tests/b.spec.ts': "import { felles } from '../helpers/felles';\nimport { b } from '../helpers/bare-b';\n",
};

test('--affected kjører hele suiten når alt er påvirket', { skip: HAR_JQ ? false : 'krever jq for å etterligne gh --jq' }, () => {
  const repo = lagRepo(TO_SPECS, { 'helpers/felles.ts': 'export const felles = 2;\n' });
  const r = repo.ciE2e('--affected');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(sendtFilter(repo.ghKall()), null, 'hele suiten skal kjøres uten test_grep');
});

test('--affected sender filteret når bare en del av suiten er påvirket', { skip: HAR_JQ ? false : 'krever jq for å etterligne gh --jq' }, () => {
  const repo = lagRepo(TO_SPECS, { 'helpers/bare-b.ts': 'export const b = 2;\n' });
  const r = repo.ciE2e('--affected');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(sendtFilter(repo.ghKall()), 'b\\.spec\\.ts');
});

test('--affected kjører hele suiten når en endret fil ligger utenfor importgrafen', { skip: HAR_JQ ? false : 'krever jq for å etterligne gh --jq' }, () => {
  const repo = lagRepo(TO_SPECS, {
    'playwright.config.ts': 'export default {};\n',
    'helpers/bare-b.ts': 'export const b = 2;\n',
  });
  const r = repo.ciE2e('--affected');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(sendtFilter(repo.ghKall()), null, 'playwright.config.ts kan påvirke alle tester');
});

test('--affected kjører hele suiten ved nøyaktig 80 % påvirket', { skip: HAR_JQ ? false : 'krever jq for å etterligne gh --jq' }, () => {
  const felles = "import { felles } from '../helpers/felles';\n";
  const repo = lagRepo(
    {
      'helpers/felles.ts': 'export const felles = 1;\n',
      'tests/a.spec.ts': felles,
      'tests/b.spec.ts': felles,
      'tests/c.spec.ts': felles,
      'tests/d.spec.ts': felles,
      'tests/e.spec.ts': 'export {};\n',
    },
    { 'helpers/felles.ts': 'export const felles = 2;\n' }
  );
  const r = repo.ciE2e('--affected');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(sendtFilter(repo.ghKall()), null, '4 av 5 er 80 %');
});

test('--affected kjører hele suiten når ingen spec er påvirket', { skip: HAR_JQ ? false : 'krever jq for å etterligne gh --jq' }, () => {
  const repo = lagRepo({ ...TO_SPECS, 'helpers/ubrukt.ts': 'export const u = 1;\n' }, {
    'helpers/ubrukt.ts': 'export const u = 2;\n',
  });
  const r = repo.ciE2e('--affected');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(sendtFilter(repo.ghKall()), null);
  // Et tomt utvalg gir tomt filter uansett; valget skal likevel stå som hele suiten i rapporten.
  const rapport = JSON.parse(repo.affected('--json').stdout);
  assert.equal(rapport.fullSuite, true);
  assert.equal(rapport.reason, 'ingen spec-filer er påvirket');
});

test('en endret Markdown-fil utvider ikke utvalget', { skip: HAR_JQ ? false : 'krever jq for å etterligne gh --jq' }, () => {
  const repo = lagRepo(TO_SPECS, { 'README.md': '# ny\n', 'helpers/bare-b.ts': 'export const b = 2;\n' });
  const r = repo.ciE2e('--affected');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(sendtFilter(repo.ghKall()), 'b\\.spec\\.ts');
});

test('følger kjøringen denne dispatchen startet, ikke en eldre eller en fra et annet event', { skip: HAR_JQ ? false : 'krever jq for å etterligne gh --jq' }, () => {
  const repo = lagRepo(TO_SPECS);
  const gammel = { databaseId: 111, event: 'workflow_dispatch', createdAt: '2020-01-01T00:00:00Z' };
  const annetEvent = { databaseId: 333, event: 'repository_dispatch', createdAt: 'NÅ' };
  const ny = { databaseId: 222, event: 'workflow_dispatch', createdAt: 'NÅ' };
  // Første oppslag: den nye kjøringen er ikke registrert ennå.
  repo.settRuns([[annetEvent, gammel], [ny, annetEvent, gammel]]);
  const r = repo.ciE2e();
  assert.equal(r.status, 0, r.stderr);
  const sette = repo.ghKall().filter((a) => a[0] === 'run' && a[1] === 'view').map((a) => a[2]);
  assert.ok(sette.length > 0, 'skal ha sett på en kjøring');
  assert.deepEqual([...new Set(sette)], ['222']);
});

test('følger ikke kjøringer fra andre brukere eller andre brancher', { skip: HAR_JQ ? false : 'krever jq for å etterligne gh --jq' }, () => {
  const repo = lagRepo(TO_SPECS);
  const annenBruker = { databaseId: 444, event: 'workflow_dispatch', createdAt: 'NÅ', user: 'kollega' };
  const annenBranch = { databaseId: 555, event: 'workflow_dispatch', createdAt: 'NÅ', headBranch: 'main' };
  const ny = { databaseId: 222, event: 'workflow_dispatch', createdAt: 'NÅ' };
  repo.settRuns([[annenBruker, annenBranch], [ny, annenBruker, annenBranch]]);
  const r = repo.ciE2e();
  assert.equal(r.status, 0, r.stderr);
  const sette = repo.ghKall().filter((a) => a[0] === 'run' && a[1] === 'view').map((a) => a[2]);
  assert.deepEqual([...new Set(sette)], ['222']);
});

test('--grep med tomt mønster avvises i stedet for å kjøre hele suiten', { skip: HAR_JQ ? false : 'krever jq for å etterligne gh --jq' }, () => {
  const repo = lagRepo(TO_SPECS);
  const r = repo.ciE2e('--grep', '');
  assert.notEqual(r.status, 0);
  assert.equal(dispatch(repo.ghKall()), undefined, 'ingen workflow skal startes');
});

test('affected-tests feiler når --base ikke finnes, i stedet for å svare med færre tester', () => {
  const repo = lagRepo(TO_SPECS, { 'helpers/bare-b.ts': 'export const b = 2;\n' });
  assert.notEqual(repo.affected('--base', 'origin/finnes-ikke').status, 0);
  assert.notEqual(repo.affected('--base').status, 0, '--base uten verdi');
});

test('affected-tests godtar --changed med ./-prefiks', () => {
  const repo = lagRepo(TO_SPECS);
  const r = repo.affected('--changed', './helpers/bare-b.ts');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'b\\.spec\\.ts');
});

test('affected-tests tar med nye spec-filer i en usporet mappe', () => {
  const repo = lagRepo(TO_SPECS, {}, { 'tests/ny/c.spec.ts': 'export {};\n' });
  const r = repo.affected();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'ny/c\\.spec\\.ts');
});
