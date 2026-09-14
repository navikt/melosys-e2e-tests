import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — .mjs uten typedeklarasjon; scriptet er ren node uten avhengigheter.
import { affectedSpecs } from '../scripts/affected-tests.mjs';

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

test('en endret spec-fil velger seg selv', () => {
  const selv = 'tests/eu-eos/eu-eos-art11-3b-medlemskap-offentlig-tjenesteperson.spec.ts';
  assert.ok(affectedSpecs([selv]).includes(selv));
});

test('en fil ingen importerer gir ingen spec-er', () => {
  assert.deepEqual(affectedSpecs(['helpers/form-helper.ts']), []);
});
