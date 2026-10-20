import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — .mjs uten typedeklarasjon; scriptet er ren node uten avhengigheter.
import { affectedSpecs, changedFiles, isDoc, pinFilIgnoreres } from '../scripts/affected-tests.mjs';

const ROT = join(__dirname, '..');

/**
 * Regresjonstest for utvelgeren bak `make ci-affected`.
 *
 * De to egenskapene under er de som kan ryke stille: et filter som blir for smalt sender en
 * grønn CI-kjøring som ikke rørte koden du endret. Begge er tatt fra en faktisk feil — en
 * grovere variant som matchet på filnavn-stamme i stedet for å løse stien blandet
 * `fixtures/index.ts` med `atdd/fixtures.ts` og tok med fire spec-er for mye.
 */

test('følger importgrafen over flere hopp, ikke bare direkte importer', () => {
  // lovvalg.assertions importeres ikke av noen spec direkte — den nås bare via page-objektet
  // som eier den. Stopper utvelgeren etter første hopp, blir svaret her tomt.
  const specs = affectedSpecs(['pages/behandling/lovvalg.assertions.ts']);
  assert.ok(specs.length > 0, 'flerhopps-kjeden skal gi treff, ikke tom liste');
  assert.ok(
    specs.every((p: string) => p.endsWith('.spec.ts')),
    'bare spec-filer skal rapporteres'
  );
});

test('løser katalogimport til index-fila, så fixtures-endringer treffer hele suiten', () => {
  // Spec-ene importerer '../../fixtures', som er fixtures/index.ts. Løses den ikke, faller
  // antallet til nesten null og filteret blir farlig smalt.
  const specs = affectedSpecs(['fixtures/index.ts']);
  assert.ok(specs.length > 40, `fixtures/index.ts skal treffe det meste, fikk ${specs.length}`);
});

test('følger lange kjeder: helper → fixtures → spec', () => {
  // Rundt 20 spec-er importerer unleash-helper direkte; resten nås bare via fixtures/, tre hopp
  // unna. En utvelger som stopper etter to hopp finner bare de direkte.
  const specs = affectedSpecs(['helpers/unleash-helper.ts']);
  assert.ok(specs.length > 40, `unleash-helper skal treffe det meste, fikk ${specs.length}`);
});

test('en endret spec-fil velger seg selv', () => {
  const selv = 'tests/eu-eos/eu-eos-art11-3b-medlemskap-offentlig-tjenesteperson.spec.ts';
  assert.ok(affectedSpecs([selv]).includes(selv));
});

test('en fil ingen importerer gir ingen spec-er', () => {
  assert.deepEqual(affectedSpecs(['helpers/form-helper.ts']), []);
});

test('alt under docs/ regnes som dokumentasjon, ikke som fil utenfor grafen', () => {
  // Et diagram i docs/ tvang hele suiten fordi bare .md-filer var unntatt.
  assert.ok(isDoc('docs/diagrams/docker-services.svg'));
  assert.ok(isDoc('docs/diagrams/docker-services.architecture.json'));
  assert.ok(isDoc('specs/noe.md'));
  assert.ok(!isDoc('playwright.config.ts'), 'konfig skal fortsatt tvinge hele suiten');
  assert.ok(!isDoc('package.json'));
});

test('uten arbeidstreet teller bare committede filer, slik CI ser branchen', () => {
  // CI kjører origin/<branch>. En usporet lokal fil skal ikke bestemme hva CI kjører.
  const run = (cmd: string) =>
    cmd === 'diff' ? 'tests/a.spec.ts\n' : '?? scratch/lokal.json\n M helpers/b.ts\n';
  assert.deepEqual(changedFiles('origin/main', { arbeidstre: false, run }), ['tests/a.spec.ts']);
  assert.deepEqual(changedFiles('origin/main', { run }), [
    'tests/a.spec.ts',
    'scratch/lokal.json',
    'helpers/b.ts',
  ]);
});

test('head velger hvilken ref diffen regnes mot', () => {
  // ci-e2e.sh --branch regner utvalget fra origin/<branch>, ikke fra branchen du står på.
  const kall: string[][] = [];
  const run = (...a: string[]) => {
    kall.push(a);
    return '';
  };
  changedFiles('origin/main', { arbeidstre: false, head: 'origin/annen', run });
  assert.deepEqual(kall, [['diff', '--no-renames', '--name-only', 'origin/main...origin/annen']]);
});

// ---- Pin-fila (.github/e2e-pins.json) ----

const PIN = JSON.stringify({
  'melosys-web': { tag: 'a'.repeat(40), jira: 'MELOSYS-9000', utloper: '2026-11-03' },
});

test('pin-fila: samme pinner i base og head gir ingen tester, også uten flagget', () => {
  assert.equal(pinFilIgnoreres({ baseTekst: '', headTekst: '{}\n' }).ignorer, true);
  const omformatert = JSON.stringify(JSON.parse(PIN), null, 2);
  assert.equal(pinFilIgnoreres({ baseTekst: PIN, headTekst: omformatert }).ignorer, true);
});

test('pin-fila: endrede pinner gir hele suiten uten --pinner-uten-virkning', () => {
  assert.equal(pinFilIgnoreres({ baseTekst: '{}', headTekst: PIN }).ignorer, false);
  assert.equal(pinFilIgnoreres({ baseTekst: PIN, headTekst: '{}' }).ignorer, false);
  assert.equal(pinFilIgnoreres({ baseTekst: '{}', headTekst: PIN, pinnerUtenVirkning: true }).ignorer, true);
});

test('pin-fila: en fil som ikke kan leses, gir hele suiten selv med flagget', () => {
  assert.equal(pinFilIgnoreres({ baseTekst: '{}', headTekst: '{', pinnerUtenVirkning: true }).ignorer, false);
});

/**
 * Lager en commit oppå HEAD der bare pin-fila er endret, uten å røre arbeidstreet eller noen
 * branch: blob, tre og commit skrives rett i objektdatabasen.
 */
function commitMedPinFil(innhold: string): string {
  const git = (args: string[], env: NodeJS.ProcessEnv = {}, input?: string) =>
    execFileSync('git', args, { cwd: ROT, encoding: 'utf8', env: { ...process.env, ...env }, input }).trim();
  const indeks = join(mkdtempSync(join(tmpdir(), 'pin-indeks-')), 'index');
  const blob = git(['hash-object', '-w', '--stdin'], {}, innhold);
  git(['read-tree', 'HEAD'], { GIT_INDEX_FILE: indeks });
  git(['update-index', '--add', '--cacheinfo', `100644,${blob},.github/e2e-pins.json`], { GIT_INDEX_FILE: indeks });
  const tre = git(['write-tree'], { GIT_INDEX_FILE: indeks });
  return git(['commit-tree', tre, '-p', 'HEAD', '-m', 'test: pin-fil'], {
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  });
}

function kjørUtvalg(head: string, ...flagg: string[]) {
  const r = spawnSync('node', ['scripts/affected-tests.mjs', '--kun-committet', '--base', 'HEAD', '--head', head, ...flagg], {
    cwd: ROT, encoding: 'utf8',
  });
  return { kode: r.status, grep: r.stdout.trim(), logg: r.stderr };
}

test('utvalget i køen: bare pin-fila endret gir hele suiten uten flagget og ingenting med det', () => {
  const head = commitMedPinFil(PIN);
  const uten = kjørUtvalg(head);
  assert.equal(uten.kode, 0, uten.logg);
  assert.equal(uten.grep, '', 'tom linje betyr hele suiten');
  assert.match(uten.logg, /Pin-fila: hele suiten/);
  const med = kjørUtvalg(head, '--pinner-uten-virkning');
  assert.equal(med.kode, 3, med.logg);
  assert.match(med.logg, /Pin-fila: ingen tester/);
});
