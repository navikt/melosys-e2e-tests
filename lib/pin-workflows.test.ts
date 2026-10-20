import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
// @ts-expect-error — .mjs uten typedeklarasjon; scriptet er ren node uten avhengigheter.
import { changedFiles } from '../scripts/affected-tests.mjs';

/**
 * Stegene i e2e-for-merge.yml og e2e-pins-utlop.yml som avgjør om pin-fila skal valideres,
 * kjørt slik de står i workflowen, mot et ekte git-repo i en midlertidig mappe.
 */

const PIN = '.github/e2e-pins.json';
const ROT = process.cwd();
const EN_PIN = JSON.stringify({ 'melosys-web': { tag: 'a'.repeat(40), jira: 'MELOSYS-9000', utloper: '2026-11-03' } });

/** Skriptet i steget `navn` i `workflow`, slik det står der. */
function steg(workflow: string, navn: string): string {
  const linjer = readFileSync(join(ROT, '.github/workflows', workflow), 'utf8').split('\n');
  const start = linjer.findIndex((l) => l === `      - name: ${navn}`);
  assert.ok(start !== -1, `fant ikke steget «${navn}» i ${workflow}`);
  const run = linjer.findIndex((l, i) => i > start && l === '        run: |');
  const skript: string[] = [];
  for (const l of linjer.slice(run + 1)) {
    if (l !== '' && !l.startsWith('          ')) break;
    skript.push(l.slice(10));
  }
  return skript.join('\n');
}

/** Kjører `skript` som GitHub Actions gjør (bash -eo pipefail) og gir GITHUB_OUTPUT som objekt. */
function kjørSteg(skript: string, cwd: string, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pin-steg-'));
  const fil = join(dir, 'steg.sh');
  const output = join(dir, 'github-output');
  const temp = join(dir, 'runner-temp');
  mkdirSync(temp);
  writeFileSync(fil, skript);
  writeFileSync(output, '');
  execFileSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', fil], {
    cwd,
    env: { ...process.env, ...gitEnv, RUNNER_TEMP: temp, GITHUB_OUTPUT: output, ...env },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const ut = Object.fromEntries(
    readFileSync(output, 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
  );
  return { ut, temp };
}

// Uten brukerens git-oppsett: diff.renames eller lignende der skal ikke styre testen.
const gitEnv = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};

/** Et ekte git-repo med pin-fila og en testfil på main. */
function lagRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'pin-repo-'));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, env: { ...process.env, ...gitEnv }, encoding: 'utf8' }).trim();
  const skriv = (sti: string, innhold: string) => {
    mkdirSync(dirname(join(dir, sti)), { recursive: true });
    writeFileSync(join(dir, sti), innhold);
  };
  const commit = (melding: string) => {
    git('add', '-A');
    git('commit', '-q', '-m', melding);
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q', '-b', 'main');
  skriv(PIN, EN_PIN);
  skriv('tests/a.spec.ts', 'a');
  const start = commit('start');
  return { dir, git, skriv, commit, start };
}

// ---- «Er pin-fila endret?» i e2e-for-merge.yml ----

const endretSteg = () => steg('e2e-for-merge.yml', 'Er pin-fila endret?');

test('køen: en PR som bare endrer pin-fila, bak en annen PR i køen, regnes som bare pin-fila', () => {
  // GitHub lager hver køoppføring som én squash-commit på forrige oppføring, og base_sha er den
  // forrige oppføringen (melosys-web kjøring 39368635780: base_sha 1d05b2e er pr-3258 i køen).
  const r = lagRepo();
  r.skriv('tests/a.spec.ts', 'endret');
  const forrige = r.commit('forrige oppføring');
  r.skriv(PIN, '{}');
  const denne = r.commit('pin-PR');
  const { ut, temp } = kjørSteg(endretSteg(), r.dir, { BASE_SHA: forrige, HEAD_SHA: denne });
  assert.equal(ut.endret, 'true');
  assert.equal(ut.bare_pinfil, 'true');
  assert.equal(readFileSync(join(temp, 'base-pins.json'), 'utf8'), EN_PIN);
  assert.equal(readFileSync(join(temp, 'head-pins.json'), 'utf8'), '{}');
});

test('køen: en PR bak en PR som bare endrer pin-fila, ser ikke pin-endringen', () => {
  const r = lagRepo();
  r.skriv(PIN, '{}');
  const forrige = r.commit('pin-PR');
  r.skriv('tests/a.spec.ts', 'endret');
  const denne = r.commit('annen PR');
  const { ut } = kjørSteg(endretSteg(), r.dir, { BASE_SHA: forrige, HEAD_SHA: denne });
  assert.equal(ut.endret, 'false');
});

test('PR: bare pin-fila regnes mot merge-basen, også når main har fått andre endringer', () => {
  const r = lagRepo();
  r.git('checkout', '-q', '-b', 'pr');
  r.skriv(PIN, '{}');
  const pr = r.commit('pin-PR');
  r.git('checkout', '-q', 'main');
  r.skriv('tests/a.spec.ts', 'endret på main');
  const main = r.commit('main går videre');
  const { ut } = kjørSteg(endretSteg(), r.dir, { BASE_SHA: main, HEAD_SHA: pr });
  assert.equal(ut.endret, 'true');
  assert.equal(ut.bare_pinfil, 'true');
});

test('pin-fila som flyttes med git mv, regnes som endret og fjernet', () => {
  const r = lagRepo();
  r.git('mv', PIN, 'pins-backup.json');
  const head = r.commit('flytt pin-fila');
  const { ut, temp } = kjørSteg(endretSteg(), r.dir, { BASE_SHA: r.start, HEAD_SHA: head });
  assert.equal(ut.endret, 'true');
  assert.equal(ut.bare_pinfil, 'false', 'den nye fila er også en endring');
  assert.equal(readFileSync(join(temp, 'head-pins.json'), 'utf8'), '');
});

// ---- changedFiles i affected-tests.mjs ----

test('changedFiles: en flyttet pin-fil gir både gammel og ny sti i arbeidstreet', () => {
  const r = lagRepo();
  r.git('mv', PIN, 'pins-backup.json');
  assert.deepEqual([...changedFiles(r.start, { run: (...a: string[]) => r.git(...a) + '\n' })].sort(), [PIN, 'pins-backup.json']);
});

test('changedFiles: en flyttet pin-fil gir både gammel og ny sti i committede endringer', () => {
  const r = lagRepo();
  r.git('mv', PIN, 'pins-backup.json');
  const head = r.commit('flytt pin-fila');
  const run = (...a: string[]) => r.git(...a) + '\n';
  assert.deepEqual([...changedFiles(r.start, { arbeidstre: false, head, run })].sort(), [PIN, 'pins-backup.json']);
});

// ---- «Finnes det pinner?» i e2e-pins-utlop.yml ----

/** Kjører steget mot en sjekket ut kopi av repoet med `innhold` som pin-fil (undefined: ingen fil). */
function finnesPinner(innhold: string | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), 'pin-utlop-'));
  mkdirSync(join(dir, 'lib'));
  mkdirSync(join(dir, '.github'));
  writeFileSync(join(dir, 'lib/e2e-pins.mjs'), readFileSync(join(ROT, 'lib/e2e-pins.mjs')));
  if (innhold !== undefined) writeFileSync(join(dir, PIN), innhold);
  assert.equal(existsSync(join(dir, PIN)), innhold !== undefined);
  return kjørSteg(steg('e2e-pins-utlop.yml', 'Finnes det pinner?'), dir).ut.pinner;
}

test('utløpsjobben: ingen fil, tom fil og {} betyr ingen pinner', () => {
  for (const innhold of [undefined, '', '  \n', '{}', '{ }\n']) {
    assert.equal(finnesPinner(innhold), 'false', JSON.stringify(innhold));
  }
});

test('utløpsjobben: en gyldig pin valideres', () => {
  assert.equal(finnesPinner(EN_PIN), 'true');
});

test('utløpsjobben: en fil lesPins avviser, valideres og varsles, også når jq gir lengde 0', () => {
  // null, [] og "" har lengde 0 i jq, men plan-jobben i E2E Tests avviser dem.
  for (const innhold of ['null', '[]', '""', '{', '"x"', '{"ukjent": {}}']) {
    assert.equal(finnesPinner(innhold), 'true', innhold);
  }
});
