import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — .mjs uten typedeklarasjon; scriptet er ren node uten avhengigheter.
import { affectedSpecs, changedFiles, isDoc } from '../scripts/affected-tests.mjs';

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
  assert.deepEqual(kall, [['diff', '--name-only', 'origin/main...origin/annen']]);
});
