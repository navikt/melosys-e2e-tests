import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
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
    affectedFra: (mappe: string, ...a: string[]) =>
      spawnSync('node', [join(realpathSync(arbeid), 'scripts/affected-tests.mjs'), ...a], {
        cwd: join(realpathSync(arbeid), mappe),
        env,
        encoding: 'utf8',
      }),
    affectedViaSymlink: (...a: string[]) =>
      spawnSync('node', [join(arbeid, 'scripts/affected-tests.mjs'), ...a], { cwd: arbeid, env, encoding: 'utf8' }),
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

test('--affected ser bort fra lokale filer og filer under docs/', { skip: HAR_JQ ? false : 'krever jq for å etterligne gh --jq' }, () => {
  const repo = lagRepo(
    TO_SPECS,
    { 'docs/diagrams/tjenester.svg': '<svg/>\n', 'helpers/bare-b.ts': 'export const b = 2;\n' },
    { 'lokal.json': '{}\n' }
  );
  const r = repo.ciE2e('--affected');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(sendtFilter(repo.ghKall()), 'b\\.spec\\.ts', 'CI ser ikke lokal.json');
  // make affected viser fortsatt rekkevidden av arbeidstreet.
  assert.equal(JSON.parse(repo.affected('--json').stdout).fullSuite, true);
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

// Alle måtene å skrive stien til helpers/bare-b.ts på, fra roten og fra tests/. mkdtemp gir en
// sti under /var på macOS, som er en symlink til /private/var, så «absolutt» dekker også symlinker.
const STIER: [string, string, (arbeid: string) => string][] = [
  ['repo-relativ fra roten', '.', () => 'helpers/bare-b.ts'],
  ['./-prefiks fra roten', '.', () => './helpers/bare-b.ts'],
  ['absolutt sti', '.', (arbeid) => join(arbeid, 'helpers/bare-b.ts')],
  ['absolutt sti uten symlinker', '.', (arbeid) => join(realpathSync(arbeid), 'helpers/bare-b.ts')],
  ['repo-relativ fra tests/', 'tests', () => 'helpers/bare-b.ts'],
  ['relativ til mappa fra tests/', 'tests', () => '../helpers/bare-b.ts'],
  ['absolutt sti fra tests/', 'tests', (arbeid) => join(arbeid, 'helpers/bare-b.ts')],
];
for (const [navn, mappe, sti] of STIER) {
  test(`affected-tests --changed: ${navn}`, () => {
    const repo = lagRepo(TO_SPECS);
    const r = repo.affectedFra(mappe, '--changed', sti(repo.arbeid));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'b\\.spec\\.ts', r.stderr);
  });
}

test('affected-tests skriver resultatet også når skriptet startes via en symlinket sti', () => {
  const repo = lagRepo(TO_SPECS);
  assert.notEqual(repo.arbeid, realpathSync(repo.arbeid), 'forutsetter at tmpdir går via en symlink');
  const r = repo.affectedViaSymlink('--changed', 'helpers/bare-b.ts');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'b\\.spec\\.ts', r.stderr);
});

test('affected-tests --changed: en spec relativ til mappa fra tests/', () => {
  const repo = lagRepo(TO_SPECS);
  const r = repo.affectedFra('tests', '--changed', 'a.spec.ts');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'a\\.spec\\.ts', r.stderr);
});

test('affected-tests tar med nye spec-filer i en usporet mappe', () => {
  const repo = lagRepo(TO_SPECS, {}, { 'tests/ny/c.spec.ts': 'export {};\n' });
  const r = repo.affected();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'ny/c\\.spec\\.ts');
});

// ---- Advarsel når main ikke er merget inn ----

const JQ_SKIP = { skip: HAR_JQ ? false : 'krever jq for å etterligne gh --jq' };
const ADVARSEL = /mangler (\d+) commit\(s\) fra origin\/main/;

/** Committer på main fra arbeidsrepoet og pusher, og går tilbake til feature. */
function nyCommitPåMain(arbeid: string, fil: string) {
  git(arbeid, 'checkout', '-q', 'main');
  writeFileSync(join(arbeid, fil), `${fil}\n`);
  git(arbeid, 'add', '-A');
  git(arbeid, 'commit', '-q', '-m', fil);
  git(arbeid, 'push', '-q', 'origin', 'main');
  git(arbeid, 'checkout', '-q', 'feature');
}

test('advarer når branchen mangler commits fra main, og starter kjøringen likevel', JQ_SKIP, () => {
  const repo = lagRepo(TO_SPECS);
  nyCommitPåMain(repo.arbeid, 'main-1.md');
  nyCommitPåMain(repo.arbeid, 'main-2.md');
  const r = repo.ciE2e();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr.match(ADVARSEL)?.[1], '2', r.stderr);
  assert.ok(dispatch(repo.ghKall()), 'kjøringen skal startes selv om main mangler');
});

test('advarer ikke når main er merget inn i branchen', JQ_SKIP, () => {
  const repo = lagRepo(TO_SPECS);
  nyCommitPåMain(repo.arbeid, 'main-1.md');
  git(repo.arbeid, 'merge', '-q', '--no-edit', 'origin/main');
  git(repo.arbeid, 'push', '-q', 'origin', 'feature');
  const r = repo.ciE2e();
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, ADVARSEL);
});

test('henter main før sjekken, så en gammel lokal origin/main ikke skjuler at branchen er bak', JQ_SKIP, () => {
  const repo = lagRepo(TO_SPECS);
  // En kollega pusher til main fra en annen klon; arbeidsrepoets origin/main er da gammel.
  const origin = git(repo.arbeid, 'remote', 'get-url', 'origin').trim();
  const kollega = mkdtempSync(join(tmpdir(), 'ci-e2e-kollega-'));
  git(kollega, 'clone', '-q', origin, '.');
  git(kollega, 'config', 'user.email', 'k@test');
  git(kollega, 'config', 'user.name', 'k');
  writeFileSync(join(kollega, 'kollega.md'), 'k\n');
  git(kollega, 'add', '-A');
  git(kollega, 'commit', '-q', '-m', 'kollega');
  git(kollega, 'push', '-q', 'origin', 'main');
  const r = repo.ciE2e();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr.match(ADVARSEL)?.[1], '1', r.stderr);
});

test('stopper ikke når origin/main ikke finnes lokalt, for eksempel i en --single-branch-klon', JQ_SKIP, () => {
  const repo = lagRepo(TO_SPECS);
  git(repo.arbeid, 'config', 'remote.origin.fetch', '+refs/heads/feature:refs/remotes/origin/feature');
  git(repo.arbeid, 'update-ref', '-d', 'refs/remotes/origin/main');
  const r = repo.ciE2e();
  assert.equal(r.status, 0, `scriptet stoppet (exit ${r.status}):\n${r.stderr}`);
  assert.ok(dispatch(repo.ghKall()), 'kjøringen skal startes');
});

/** Pusher en branch fra main med `endringer` og går tilbake til feature. */
function lagBranch(arbeid: string, navn: string, endringer: Filer) {
  git(arbeid, 'checkout', '-q', '-b', navn, 'main');
  for (const [sti, innhold] of Object.entries(endringer)) {
    mkdirSync(dirname(join(arbeid, sti)), { recursive: true });
    writeFileSync(join(arbeid, sti), innhold);
  }
  git(arbeid, 'add', '-A');
  git(arbeid, 'commit', '-q', '-m', navn);
  git(arbeid, 'push', '-q', 'origin', navn);
  git(arbeid, 'checkout', '-q', 'feature');
}

test('--branch kjører påvirkede tester for en annen branch enn den du står på', JQ_SKIP, () => {
  const repo = lagRepo(TO_SPECS, { 'helpers/felles.ts': 'export const felles = 2;\n' });
  lagBranch(repo.arbeid, 'annen', { 'helpers/bare-b.ts': 'export const b = 2;\n' });
  repo.settRuns([[{ databaseId: 1, event: 'workflow_dispatch', createdAt: 'NÅ', headBranch: 'annen' }]]);
  const r = repo.ciE2e('--affected', '--branch', 'annen');
  assert.equal(r.status, 0, r.stderr);
  const d = dispatch(repo.ghKall());
  assert.ok(d);
  assert.equal(d[d.indexOf('--ref') + 1], 'annen');
  assert.equal(sendtFilter(repo.ghKall()), 'b\\.spec\\.ts', 'utvalget skal regnes fra annen, ikke feature');
  assert.doesNotMatch(r.stderr, /peker på en annen commit/, 'HEAD på feature gjelder ikke annen');
});

test('--branch finner spec-filer som bare finnes på den andre branchen', JQ_SKIP, () => {
  // Grafen må bygges fra origin/<branch>. Fra arbeidstreet på feature finnes ikke c.spec.ts, så
  // utvalget blir tomt og hele suiten kjøres.
  const repo = lagRepo(TO_SPECS);
  lagBranch(repo.arbeid, 'annen', { 'tests/c.spec.ts': "import { b } from '../helpers/bare-b';\n" });
  repo.settRuns([[{ databaseId: 1, event: 'workflow_dispatch', createdAt: 'NÅ', headBranch: 'annen' }]]);
  const r = repo.ciE2e('--affected', '--branch', 'annen');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(sendtFilter(repo.ghKall()), 'c\\.spec\\.ts');
  assert.match(r.stdout, /Påvirkede spec-filer: 1 av 3/);
});

test('--affected skriver sammendraget av utvalget i startblokken', JQ_SKIP, () => {
  const repo = lagRepo(TO_SPECS, { 'helpers/bare-b.ts': 'export const b = 2;\n' });
  const r = repo.ciE2e('--affected');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Endrede filer: 1\n/);
  assert.match(r.stdout, /Påvirkede spec-filer: 1 av 2 \(50 %\)/);
});

for (const flagg of ['--preview', '-p']) {
  test(`${flagg} skriver ut kommandoen uten å starte workflowen`, JQ_SKIP, () => {
    const repo = lagRepo(TO_SPECS, { 'helpers/bare-b.ts': 'export const b = 2;\n' });
    const r = repo.ciE2e('--affected', flagg);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(dispatch(repo.ghKall()), undefined, 'ingen workflow skal startes');
    const linje = r.stdout.split('\n').find((l) => l.startsWith('gh workflow run '));
    assert.ok(linje, `kommandoen skal skrives ut, fikk:\n${r.stdout}`);
    // Kommandoen skal kunne limes inn i et skall og gi de samme argumentene som en ekte dispatch.
    const args = execFileSync('bash', ['-c', `printf '%s\\n' ${linje.slice('gh '.length)}`], { encoding: 'utf8' });
    assert.deepEqual(args.trim().split('\n'), [
      'workflow', 'run', 'E2E Tests', '--ref', 'feature',
      '-f', 'environment=latest', '-f', 'disable_retries=true', '-f', 'test_grep=b\\.spec\\.ts',
    ]);
  });
}

test('--branch virker i en klon som ikke henter den andre branchen', JQ_SKIP, () => {
  // I en --single-branch-klon oppdaterer `git fetch origin <branch>` ikke origin/<branch>.
  const repo = lagRepo(TO_SPECS);
  lagBranch(repo.arbeid, 'annen', { 'helpers/bare-b.ts': 'export const b = 2;\n' });
  git(repo.arbeid, 'config', 'remote.origin.fetch', '+refs/heads/feature:refs/remotes/origin/feature');
  git(repo.arbeid, 'update-ref', '-d', 'refs/remotes/origin/annen');
  git(repo.arbeid, 'update-ref', '-d', 'refs/remotes/origin/main');
  repo.settRuns([[{ databaseId: 1, event: 'workflow_dispatch', createdAt: 'NÅ', headBranch: 'annen' }]]);
  const r = repo.ciE2e('--affected', '--branch', 'annen');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(sendtFilter(repo.ghKall()), 'b\\.spec\\.ts');
});

test('--affected viser feilen fra utvelgeren når den stopper', JQ_SKIP, () => {
  const repo = lagRepo(TO_SPECS);
  writeFileSync(join(repo.arbeid, 'scripts', 'affected-tests.mjs'), "process.stderr.write('utvelgeren feilet\\n'); process.exit(2);\n");
  const r = repo.ciE2e('--affected');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /utvelgeren feilet/);
  assert.equal(dispatch(repo.ghKall()), undefined);
});

test('affected-tests --head står i rapporten og i feilmeldingen', () => {
  const repo = lagRepo(TO_SPECS);
  assert.equal(JSON.parse(repo.affected('--json', '--head', 'origin/feature').stdout).head, 'origin/feature');
  const r = repo.affected('--head', 'origin/finnes-ikke');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Fant ikke endrede filer mellom origin\/main og origin\/finnes-ikke: fatal/);
});

const make = (env: Record<string, string>, ...a: string[]) =>
  execFileSync('make', ['-n', ...a], { cwd: REPO, env: { ...process.env, ...env }, encoding: 'utf8' });

test('make leser BRANCH og PREVIEW bare fra kommandolinjen, ikke fra miljøet', () => {
  const ut = make({ BRANCH: 'fra-miljoet', PREVIEW: '1' }, 'ci', 'ci-affected', 'ci-grep', 'affected', 'GREP=x');
  assert.doesNotMatch(ut, /fra-miljoet|--preview/);
  const arg = make({}, 'ci-affected', 'BRANCH=min-branch', 'PREVIEW=1');
  assert.match(arg, /--branch "min-branch"/);
  assert.match(arg, /--preview/);
});

test('make affected BRANCH= henter branchen før utvalget regnes', () => {
  // && gjør at en branch som ikke finnes stopper make i stedet for å regne mot en gammel ref.
  assert.match(
    make({}, 'affected', 'BRANCH=min-branch'),
    /git fetch --quiet origin "\+refs\/heads\/main:refs\/remotes\/origin\/main" "\+refs\/heads\/min-branch:refs\/remotes\/origin\/min-branch" && node scripts\/affected-tests\.mjs --files --kun-committet --head "origin\/min-branch"/
  );
});

const HAR_PYTHON = spawnSync('python3', ['--version']).status === 0;

/** Kjører ci-e2e.sh i en ekte terminal, venter på spørsmålet og skriver `svar`. */
const PTY = `
import os, pty, select, sys, time
pid, fd = pty.fork()
if pid == 0:
    os.chdir(sys.argv[1])
    os.execvp('bash', ['bash', 'scripts/ci-e2e.sh', '--preview'])
ut = b''
slutt = time.time() + 30
while b'[J/n] ' not in ut and time.time() < slutt:
    if select.select([fd], [], [], 0.2)[0]:
        ut += os.read(fd, 4096)
os.write(fd, sys.argv[2].encode())
while True:
    try:
        c = os.read(fd, 4096)
    except OSError:
        break
    if not c:
        break
    ut += c
_, status = os.waitpid(pid, 0)
sys.stdout.write(ut.decode(errors='replace'))
sys.exit(os.waitstatus_to_exitcode(status))
`;

for (const [navn, svar] of [
  ['Ctrl-D på spørsmålet om branchen du står på', '\x04'],
  ['Ctrl-D når scriptet spør om branchnavn', 'n\n\x04'],
]) {
  test(`${navn} avbryter med en melding`, { skip: HAR_PYTHON ? false : 'krever python3 for pty' }, () => {
    const repo = lagRepo(TO_SPECS);
    const r = spawnSync('python3', ['-c', PTY, repo.arbeid, svar], { encoding: 'utf8', timeout: 60_000 });
    assert.equal(r.status, 2, r.stdout);
    assert.match(r.stdout, /❌ Avbrutt\./);
  });
}
