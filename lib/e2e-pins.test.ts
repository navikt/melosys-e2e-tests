import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — .mjs uten typedeklarasjon; scriptet er ren node uten avhengigheter.
import { brukPinner, lesPinner, TJENESTER } from '../scripts/e2e-pins.mjs';

/**
 * Pin-fila styrer imagevalget i alle E2E Tests-kjøringer. To feil er alvorlige: en pin som
 * overstyrer tjenesten under test (gaten tester da feil image og blir grønn på feil grunnlag),
 * og en ugyldig fil som slipper gjennom (alle kjøringer i alle repoer henter feil image).
 */

const script = join(__dirname, '..', 'scripts', 'e2e-pins.mjs');
const alleLatest = Object.fromEntries(Object.values(TJENESTER).map((v) => [v as string, 'latest']));

test('tom fil og {} gir ingen pinner', () => {
  assert.deepEqual(lesPinner(''), {});
  assert.deepEqual(lesPinner('  \n'), {});
  assert.deepEqual(lesPinner('{}'), {});
});

test('pinnen gjelder tjenester som har latest', () => {
  const pinner = lesPinner('{"melosys-web": "br-123", "melosys-skjema-api": "br-123"}');
  assert.deepEqual(brukPinner(pinner, alleLatest), [
    { variabel: 'MELOSYS_WEB_TAG', tjeneste: 'melosys-web', tag: 'br-123' },
    { variabel: 'MELOSYS_SKJEMA_API_TAG', tjeneste: 'melosys-skjema-api', tag: 'br-123' },
  ]);
});

test('tjenesten under test beholder sin egen tag', () => {
  const pinner = lesPinner('{"melosys-web": "br-123", "melosys-api": "br-123"}');
  const tagger = { ...alleLatest, MELOSYS_WEB_TAG: 'mq-abc' };
  assert.deepEqual(brukPinner(pinner, tagger), [
    { variabel: 'MELOSYS_API_TAG', tjeneste: 'melosys-api', tag: 'br-123' },
  ]);
});

test('tom api-tag (tom environment) får ikke pinnen', () => {
  const pinner = lesPinner('{"melosys-api": "br-123"}');
  assert.deepEqual(brukPinner(pinner, { ...alleLatest, MELOSYS_API_TAG: '' }), []);
});

test('ugyldige filer avvises med en melding', () => {
  assert.throws(() => lesPinner('{"melosys-web": '), /ikke gyldig JSON/);
  for (const tekst of ['null', '[]', '"br-1"', '42']) {
    assert.throws(() => lesPinner(tekst), /skal være et objekt/, tekst);
  }
  assert.throws(() => lesPinner('{"melosys-wbe": "br-1"}'), /ukjent tjeneste «melosys-wbe»/);
  for (const nøkkel of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.throws(() => lesPinner(`{"${nøkkel}": "br-1"}`), /ukjent tjeneste/, nøkkel);
  }
  assert.throws(() => lesPinner('{"melosys-web": 123}'), /ikke en gyldig docker-tag/);
  assert.throws(() => lesPinner('{"melosys-web": "br-1\\nMELOSYS_API_TAG x y"}'), /ikke en gyldig docker-tag/);
  assert.throws(() => lesPinner('{"melosys-web": "br 1"}'), /ikke en gyldig docker-tag/);
  assert.throws(() => lesPinner('{"melosys-web": "latest"}'), /pinnet til latest/);
});

test('CLI: leser taggene fra miljøet og skriver én linje per pin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-pins-'));
  const fil = join(dir, 'e2e-pins.json');
  writeFileSync(fil, '{"melosys-web": "br-123", "melosys-api": "br-123"}');
  const ut = execFileSync(process.execPath, [script, fil], {
    env: { ...alleLatest, MELOSYS_API_TAG: 'abc123' },
  }).toString();
  assert.equal(ut, 'MELOSYS_WEB_TAG melosys-web br-123\n');

  // En pin som ikke brukes fordi tjenesten er under test, skal synes i loggen.
  const res = spawnSync(process.execPath, [script, fil], {
    env: { ...alleLatest, MELOSYS_API_TAG: 'abc123' },
    encoding: 'utf8',
  });
  assert.match(res.stderr, /melosys-api er pinnet til br-123, men er under test med abc123/);

  assert.equal(execFileSync(process.execPath, [script, join(dir, 'finnes-ikke.json')]).toString(), '');

  writeFileSync(fil, '{"ukjent": "br-1"}');
  assert.throws(
    () => execFileSync(process.execPath, [script, fil], { stdio: 'pipe' }),
    (e: { status: number; stderr: Buffer }) => e.status === 1 && /ukjent tjeneste/.test(e.stderr.toString()),
  );
});
