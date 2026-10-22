import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  brukPinner,
  lesArgumenter,
  lesPinner,
  lesVariabel,
  planleggSet,
  revisjonFraImage,
  sjekkBrancherKjøring,
  skriv,
  startStatus,
  TJENESTER,
  TJENESTER_MED_KO,
  velgPinner,
  vurderPin,
  vurderService,
  // @ts-expect-error — .mjs uten typedeklarasjon; scriptet er ren node uten avhengigheter.
} from '../scripts/e2e-pins.mjs';
// @ts-expect-error — .mjs uten typedeklarasjon.
import { REPOER_MED_KO } from '../scripts/koblet-merge.mjs';
import { imageTagsFromEnv } from '../reporters/test-summary';

/**
 * Pinnene styrer imagevalget i alle E2E Tests-kjøringer. Feilene som koster mest: en pin som
 * overstyrer tjenesten under test (gaten tester feil image og blir grønn på feil grunnlag), en pin
 * som gjelder før testene har e2e-PR-en eller etter at latest har service-PR-en, en ugyldig fil
 * som slipper gjennom, og en ugyldig variabel som stopper alle gates.
 */

type Obj = Record<string, any>;

const script = join(__dirname, '..', 'scripts', 'e2e-pins.mjs');
const alleLatest = Object.fromEntries(Object.values(TJENESTER).map((v) => [v as string, 'latest']));
const sha = (c: string) => c.repeat(40);
const NÅ = Date.parse('2026-10-22T15:00:00Z');
const PIN = { tag: 'br-39778214986', e2e_pr: 388, service_pr: 3267, satt: '2026-10-22T14:00:00Z' };

/** Henter med faste svar. `pr` er nøklet på «<repo>#<nr>»; en Error-verdi kastes. */
function lagHenter({ pr = {}, revisjon = sha('b'), compare = 'ahead' }: { pr?: Obj; revisjon?: any; compare?: any } = {}) {
  const kall: string[] = [];
  const svar = (v: any) => (v instanceof Error ? Promise.reject(v) : Promise.resolve(v));
  return {
    kall,
    pr: (repo: string, nr: number) => (kall.push(`pr ${repo}#${nr}`), svar(pr[`${repo}#${nr}`] ?? { state: 'open', merged: false, head: { sha: sha('9') } })),
    revisjon: (repo: string) => (kall.push(`revisjon ${repo}`), svar(revisjon)),
    compare: (repo: string, base: string, head: string) => (kall.push(`compare ${repo} ${base.slice(0, 1)}...${head.slice(0, 1)}`), svar(compare)),
  };
}
const merget = { state: 'closed', merged: true, merge_commit_sha: sha('a') };

// ---------------------------------------------------------------- fila

test('tom fil og {} gir ingen pinner', () => {
  assert.deepEqual(lesPinner(''), {});
  assert.deepEqual(lesPinner('  \n'), {});
  assert.deepEqual(lesPinner('{}'), {});
});

test('pinnen i fila gjelder tjenester som har latest', () => {
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

// ---------------------------------------------------------------- variabelen

test('variabelen: tom tekst og {} gir ingen pinner, satt er valgfri', () => {
  assert.deepEqual(lesVariabel(''), {});
  assert.deepEqual(lesVariabel(undefined), {});
  assert.deepEqual(lesVariabel(' \n'), {});
  assert.deepEqual(lesVariabel('{}'), {});
  assert.deepEqual(lesVariabel(JSON.stringify({ 'melosys-web': PIN })), { 'melosys-web': PIN });
  const utenSatt = { tag: PIN.tag, e2e_pr: PIN.e2e_pr, service_pr: PIN.service_pr };
  assert.deepEqual(lesVariabel(JSON.stringify({ faktureringskomponenten: utenSatt })), { faktureringskomponenten: utenSatt });
});

test('variabelen: ugyldige verdier avvises', () => {
  const med = (felt: Obj, tjeneste = 'melosys-web') => JSON.stringify({ [tjeneste]: { ...PIN, ...felt } });
  assert.throws(() => lesVariabel('{"melosys-web": '), /ikke gyldig JSON/);
  for (const tekst of ['null', '[]', '"x"', '1']) assert.throws(() => lesVariabel(tekst), /skal være et objekt/, tekst);
  // melosys-mock har ingen merge-kø, og service-PR-en kan ikke leses med github.token.
  for (const nøkkel of ['melosys-mock', 'melosys-dokgen', '__proto__', 'constructor']) {
    assert.throws(() => lesVariabel(med({}, nøkkel)), /ukjent tjeneste/, nøkkel);
  }
  assert.throws(() => lesVariabel('{"melosys-web": "br-1"}'), /skal være et objekt med tag/);
  assert.throws(() => lesVariabel(med({ ekstra: 1 })), /ukjente felt/);
  assert.throws(() => lesVariabel(med({ tag: 'latest' })), /pinnet til latest/);
  assert.throws(() => lesVariabel(med({ tag: 'br 1' })), /gyldig docker-tag/);
  assert.throws(() => lesVariabel(med({ tag: 1 })), /gyldig docker-tag/);
  for (const nr of [0, -1, 1.5, '388', null]) {
    assert.throws(() => lesVariabel(med({ e2e_pr: nr })), /e2e_pr .* positivt heltall/, String(nr));
    assert.throws(() => lesVariabel(med({ service_pr: nr })), /service_pr .* positivt heltall/, String(nr));
  }
  assert.throws(() => lesVariabel(JSON.stringify({ 'melosys-web': { e2e_pr: 1, service_pr: 2 } })), /gyldig docker-tag/);
  for (const satt of ['i går', '2026-10-22', '2026-13-40T99:00:00Z', 1]) {
    assert.throws(() => lesVariabel(med({ satt })), /satt .* tidspunkt/, String(satt));
  }
});

test('TJENESTER_MED_KO er listen koblet-merge bruker, og alle er tjenester i TJENESTER', () => {
  assert.equal(REPOER_MED_KO, TJENESTER_MED_KO);
  for (const t of TJENESTER_MED_KO) assert.ok(Object.hasOwn(TJENESTER, t), t);
});

// ---------------------------------------------------------------- startregelen

test('start: pinnen starter når (#N)-commiten er HEAD eller lenger bak', () => {
  const emne = 'TEK Nye tester for web (#388)';
  assert.equal(startStatus([emne, 'eldre (#380)'], 388).startet, true);
  assert.equal(startStatus(['TEK noe annet (#390)', 'TEK mer (#389)', emne], 388).startet, true);
  assert.equal(startStatus([`${emne} `], 388).startet, true);
});

test('start: ikke før e2e-PR-en er merget eller i køen', () => {
  const ikke = startStatus(['TEK noe (#387)', 'TEK annet (#3880)', 'Nevner (#388) midt i'], 388);
  assert.deepEqual(ikke, { startet: false, grunn: 'testene har ikke e2e #388' });
  assert.equal(startStatus([], 388).startet, false);
});

test('start: en revert slår av pinnen, i begge formene', () => {
  const emne = 'TEK Nye tester for web (#388)';
  // GitHubs revert-knapp: «Revert "<PR-tittel>" (#M)» uten #388 (målt på melosys-api #3413).
  const knapp = startStatus(['Revert "TEK Nye tester for web" (#391)', emne], 388);
  assert.equal(knapp.startet, false);
  assert.match(knapp.grunn, /e2e #388 er revertert/);
  assert.equal(startStatus(['TEK revert av #388', emne], 388).startet, false);
  assert.equal(startStatus(['Revert #388 for hånd', emne], 388).startet, false);
  // En revert av revert-en slår ikke pinnen på igjen.
  assert.equal(startStatus(['Revert "Revert "TEK Nye tester for web"" (#392)', 'Revert "TEK Nye tester for web" (#391)', emne], 388).startet, false);
});

test('start: lignende emner er ikke en revert', () => {
  const emne = 'TEK Nye tester for web (#388)';
  assert.equal(startStatus(['Revert #3880', emne], 388).startet, true);
  assert.equal(startStatus(['Revert "TEK Annen PR" (#391)', emne], 388).startet, true);
  assert.equal(startStatus(['TEK Følger opp #388', emne], 388).startet, true);
  // En revert før (#N)-commiten teller ikke.
  assert.equal(startStatus([emne, 'Revert "TEK Nye tester for web" (#300)'], 388).startet, true);
});

// ---------------------------------------------------------------- utløpsregelen

test('revisjonen leses fra multi-arch og fra et image med én plattform', () => {
  const labels = { 'org.opencontainers.image.revision': sha('c') };
  assert.equal(revisjonFraImage({ 'linux/amd64': { config: { Labels: labels } }, 'linux/arm64': { config: { Labels: {} } } }), sha('c'));
  assert.equal(revisjonFraImage({ config: { Labels: labels } }), sha('c'));
  assert.equal(revisjonFraImage({ config: { Labels: null } }), null);
  assert.equal(revisjonFraImage({ 'linux/arm64': { config: { Labels: labels } } }), null);
  assert.equal(revisjonFraImage({ config: { Labels: { 'org.opencontainers.image.revision': 'main' } } }), null);
  assert.equal(revisjonFraImage(null), null);
  assert.equal(revisjonFraImage([]), null);
});

test('utløp: åpen service-PR er aktiv, lukket uten merge er forlatt', async () => {
  assert.deepEqual(await vurderService('melosys-web', 3267, lagHenter()), { status: 'aktiv', grunn: 'melosys-web #3267 er ikke merget' });
  const lukket = await vurderService('melosys-web', 3267, lagHenter({ pr: { 'melosys-web#3267': { state: 'closed', merged: false } } }));
  assert.equal(lukket.status, 'forlatt');
  assert.match(lukket.advarsel, /lukket uten merge/);
});

test('utløp: latest lik eller foran merge-commiten er utløpt, bak er aktiv', async () => {
  const pr = { 'melosys-web#3267': merget };
  for (const compare of ['identical', 'ahead']) {
    const hent = lagHenter({ pr, compare });
    const v = await vurderService('melosys-web', 3267, hent);
    assert.equal(v.status, 'utløpt', compare);
    assert.equal(v.advarsel, undefined);
    // base er merge-commiten, head er revisjonen på latest.
    assert.deepEqual(hent.kall, ['pr melosys-web#3267', 'revisjon melosys-web', 'compare melosys-web a...b']);
  }
  const bak = await vurderService('melosys-web', 3267, lagHenter({ pr, compare: 'behind' }));
  assert.deepEqual(bak, { status: 'aktiv', grunn: 'latest (bbbbbbb) er bygd før melosys-web #3267 (aaaaaaa)' });
  const sidelengs = await vurderService('melosys-web', 3267, lagHenter({ pr, compare: 'diverged' }));
  assert.equal(sidelengs.status, 'aktiv');
  assert.match(sidelengs.advarsel, /hver sin vei/);
});

test('utløp: feil underveis beholder pinnen med en advarsel', async () => {
  const pr = { 'melosys-web#3267': merget };
  const tilfeller: [string, Obj][] = [
    ['PR-kallet feiler', { pr: { 'melosys-web#3267': new Error('HTTP 502') } }],
    ['docker feiler', { pr, revisjon: new Error('unauthorized') }],
    ['labelen mangler', { pr, revisjon: null }],
    ['compare feiler', { pr, compare: new Error('HTTP 404') }],
    ['merge-commiten mangler', { pr: { 'melosys-web#3267': { ...merget, merge_commit_sha: null } } }],
  ];
  for (const [navn, oppsett] of tilfeller) {
    const v = await vurderService('melosys-web', 3267, lagHenter(oppsett));
    assert.equal(v.status, 'aktiv', navn);
    assert.match(v.advarsel, /pinnen beholdes/, navn);
  }
});

test('vurderPin: under test og ikke startet slår ikke opp noe', async () => {
  const hent = lagHenter();
  const underTest = await vurderPin('melosys-web', PIN, { tagger: { ...alleLatest, MELOSYS_WEB_TAG: 'br-1' }, emner: ['x (#388)'], hent, nå: NÅ });
  assert.equal(underTest.status, 'under test');
  const ikke = await vurderPin('melosys-web', PIN, { tagger: alleLatest, emner: ['x (#387)'], hent, nå: NÅ });
  assert.equal(ikke.status, 'ikke startet');
  assert.deepEqual(hent.kall, []);
  assert.deepEqual(
    { tjeneste: ikke.tjeneste, tag: ikke.tag, e2ePr: ikke.e2ePr, servicePr: ikke.servicePr, satt: ikke.satt },
    { tjeneste: 'melosys-web', tag: PIN.tag, e2ePr: 388, servicePr: 3267, satt: PIN.satt },
  );
});

test('vurderPin: en aktiv pin eldre enn tre dager gir en advarsel, en utløpt gir ingen', async () => {
  const gammel = { ...PIN, satt: '2026-10-19T14:59:00Z' };
  const aktiv = await vurderPin('melosys-web', gammel, { tagger: alleLatest, emner: ['x (#388)'], hent: lagHenter(), nå: NÅ });
  assert.equal(aktiv.status, 'aktiv');
  assert.match(aktiv.advarsel, /mer enn tre dager/);
  const fersk = await vurderPin('melosys-web', { ...PIN, satt: '2026-10-19T15:01:00Z' }, { tagger: alleLatest, emner: ['x (#388)'], hent: lagHenter(), nå: NÅ });
  assert.equal(fersk.advarsel, null);
  const utløpt = await vurderPin('melosys-web', gammel, { tagger: alleLatest, emner: ['x (#388)'], hent: lagHenter({ pr: { 'melosys-web#3267': merget } }), nå: NÅ });
  assert.equal(utløpt.status, 'utløpt');
  assert.equal(utløpt.advarsel, null);
});

// ---------------------------------------------------------------- avgjørelsen

const velg = (felt: Obj) =>
  velgPinner({ kilde: 'E2E_PINS', tagger: alleLatest, emner: ['TEK x (#388)'], hent: lagHenter(), nå: NÅ, ...felt });

test('velg: bare en aktiv pin i variabelen brukes', async () => {
  const tekst = JSON.stringify({
    'melosys-web': PIN,
    'melosys-api': { ...PIN, e2e_pr: 400 },
    faktureringskomponenten: { ...PIN, service_pr: 99 },
  });
  const r = await velg({ tekst, hent: lagHenter({ pr: { 'faktureringskomponenten#99': merget } }) });
  assert.deepEqual(r.bruk, [{ variabel: 'MELOSYS_WEB_TAG', tjeneste: 'melosys-web', tag: PIN.tag }]);
  assert.deepEqual(r.pinner.map((p: Obj) => [p.tjeneste, p.status]), [
    ['melosys-web', 'aktiv'],
    ['melosys-api', 'ikke startet'],
    ['faktureringskomponenten', 'utløpt'],
  ]);
  assert.equal(r.pinnerFeil, null);
  assert.ok(r.logg.some((l: Obj) => l.nivå === 'warning' && /melosys-web er pinnet til br-39778214986 i E2E_PINS/.test(l.tekst)));
  assert.ok(r.logg.some((l: Obj) => l.nivå === 'info' && /faktureringskomponenten .* utløpt/.test(l.tekst)));
});

test('velg: ugyldig variabel gir ingen pinner fra den, men fila gjelder', async () => {
  const r = await velg({ tekst: '{"melosys-web": "br-1"}', filPinner: { 'melosys-api': 'br-5' } });
  assert.deepEqual(r.pinner, []);
  assert.match(r.pinnerFeil, /^E2E_PINS pinnen for melosys-web skal være et objekt/);
  assert.deepEqual(r.bruk, [{ variabel: 'MELOSYS_API_TAG', tjeneste: 'melosys-api', tag: 'br-5' }]);
  assert.ok(r.logg.some((l: Obj) => l.nivå === 'error' && /ingen pinner fra E2E_PINS/.test(l.tekst)));
});

test('velg: en aktiv pin i variabelen vinner over fila, ellers gjelder fila', async () => {
  const tekst = JSON.stringify({ 'melosys-web': PIN });
  const aktiv = await velg({ tekst, filPinner: { 'melosys-web': 'br-fil' } });
  assert.deepEqual(aktiv.bruk, [{ variabel: 'MELOSYS_WEB_TAG', tjeneste: 'melosys-web', tag: PIN.tag }]);
  assert.ok(aktiv.logg.some((l: Obj) => l.nivå === 'warning' && /både i .github\/e2e-pins.json/.test(l.tekst)));
  const ikkeStartet = await velg({ tekst, filPinner: { 'melosys-web': 'br-fil' }, emner: [] });
  assert.deepEqual(ikkeStartet.bruk, [{ variabel: 'MELOSYS_WEB_TAG', tjeneste: 'melosys-web', tag: 'br-fil' }]);
});

test('velg: tjenesten under test får verken pinnen i variabelen eller i fila', async () => {
  const tagger = { ...alleLatest, MELOSYS_WEB_TAG: 'mq-abc' };
  const r = await velg({ tekst: JSON.stringify({ 'melosys-web': PIN }), filPinner: { 'melosys-web': 'br-fil' }, tagger });
  assert.deepEqual(r.bruk, []);
  assert.equal(r.pinner[0].status, 'under test');
  assert.ok(r.logg.some((l: Obj) => /pinnet til br-fil, men kjøringen har taggen «mq-abc»/.test(l.tekst)));
});

// ---------------------------------------------------------------- skriveren

test('argumentene til set og fjern', () => {
  assert.deepEqual(lesArgumenter(['set', 'melosys-web', 'br-123', '388', '3267', '--erstatt']), {
    kommando: 'set', tjeneste: 'melosys-web', tag: 'br-123', e2ePr: 388, servicePr: 3267, erstatt: true, tving: false, dryRun: false,
  });
  assert.deepEqual(lesArgumenter(['fjern', 'melosys-web', '--dry-run']), { kommando: 'fjern', tjeneste: 'melosys-web', dryRun: true });
  assert.throws(() => lesArgumenter(['set', 'melosys-mock', 'br-1', '1', '2']), /tjenesten må være en av/);
  assert.throws(() => lesArgumenter(['set', 'melosys-web', 'latest', '1', '2']), /br-<run_id>/);
  assert.throws(() => lesArgumenter(['set', 'melosys-web', 'br-koetest', '1', '2']), /br-<run_id>/);
  assert.throws(() => lesArgumenter(['set', 'melosys-web', 'br-1', '0', '2']), /e2e_pr/);
  assert.throws(() => lesArgumenter(['set', 'melosys-web', 'br-1', '1']), /bruk: set/);
  assert.throws(() => lesArgumenter(['fjern', 'melosys-web', '--tving']), /bruk: fjern/);
  assert.throws(() => lesArgumenter(['set', 'melosys-web', 'br-1', '1', '2', '--force']), /ukjent flagg/);
  assert.throws(() => lesArgumenter(['legg-til', 'melosys-web']), /bruk: set/);
});

const SET = { kommando: 'set', tjeneste: 'melosys-web', tag: 'br-500', e2ePr: 390, servicePr: 3300, erstatt: false, tving: false, dryRun: false };
const ny = { tag: 'br-500', e2e_pr: 390, service_pr: 3300, satt: '2026-10-22T15:00:00Z' };
const planlegg = (felt: Obj) => planleggSet({ pinner: {}, vurdering: {}, args: SET, e2e: 'åpen', service: 'åpen', nå: NÅ, ...felt });

test('set: ny pin, og utløpte og forlatte pinner ryddes bort', () => {
  assert.deepEqual(planlegg({}), { pinner: { 'melosys-web': ny }, ryddet: [], uendret: false, tvunget: false });
  const pinner = { 'melosys-api': PIN, faktureringskomponenten: PIN, 'melosys-eessi': PIN };
  const vurdering = { 'melosys-api': { status: 'utløpt' }, faktureringskomponenten: { status: 'forlatt' }, 'melosys-eessi': { status: 'aktiv' } };
  const plan = planlegg({ pinner, vurdering });
  assert.deepEqual(plan.ryddet, ['melosys-api', 'faktureringskomponenten']);
  assert.deepEqual(plan.pinner, { 'melosys-eessi': PIN, 'melosys-web': ny });
});

test('set: en pin fra et annet par overskrives bare når den er utløpt eller med --tving', () => {
  const pinner = { 'melosys-web': PIN };
  for (const status of ['aktiv', 'ikke startet']) {
    assert.throws(() => planlegg({ pinner, vurdering: { 'melosys-web': { status, grunn: 'g' } } }), /pinnet for e2e #388 .*--tving/, status);
  }
  assert.deepEqual(planlegg({ pinner, vurdering: { 'melosys-web': { status: 'utløpt' } } }).pinner, { 'melosys-web': ny });
  const tvunget = planlegg({ pinner, vurdering: { 'melosys-web': { status: 'aktiv' } }, args: { ...SET, tving: true } });
  assert.deepEqual(tvunget.pinner, { 'melosys-web': ny });
  assert.equal(tvunget.tvunget, true);
});

test('set: samme par byttes bare med --erstatt, og en lik pin er uendret', () => {
  const sammePar = { 'melosys-web': { ...PIN, e2e_pr: 390 } };
  assert.throws(() => planlegg({ pinner: sammePar, vurdering: { 'melosys-web': { status: 'aktiv' } } }), /--erstatt for å bytte/);
  const erstattet = planlegg({ pinner: sammePar, vurdering: { 'melosys-web': { status: 'aktiv' } }, args: { ...SET, erstatt: true } });
  assert.deepEqual(erstattet.pinner, { 'melosys-web': ny });
  // Service-PR-en ble lukket og erstattet: pinnen er forlatt, men --erstatt finner den likevel.
  const forlatt = planlegg({ pinner: sammePar, vurdering: { 'melosys-web': { status: 'forlatt' } }, args: { ...SET, erstatt: true } });
  assert.deepEqual(forlatt.pinner, { 'melosys-web': ny });
  const lik = { 'melosys-web': { tag: 'br-500', e2e_pr: 390, service_pr: 3300, satt: '2026-10-20T00:00:00Z' } };
  const uendret = planlegg({ pinner: lik, vurdering: { 'melosys-web': { status: 'aktiv' } } });
  assert.equal(uendret.uendret, true);
  assert.deepEqual(uendret.pinner, lik);
  assert.throws(() => planlegg({ args: { ...SET, erstatt: true } }), /--erstatt: melosys-web har ingen pin fra e2e #390/);
});

test('set: e2e-PR-en må være åpen, eller merget med --erstatt, og service-PR-en åpen', () => {
  assert.throws(() => planlegg({ e2e: 'lukket' }), /e2e #390 er lukket/);
  assert.throws(() => planlegg({ e2e: 'merget' }), /e2e #390 er merget/);
  const sammePar = { 'melosys-web': { ...PIN, e2e_pr: 390 } };
  assert.doesNotThrow(() => planlegg({ e2e: 'merget', pinner: sammePar, vurdering: { 'melosys-web': { status: 'aktiv' } }, args: { ...SET, erstatt: true } }));
  for (const service of ['merget', 'lukket']) assert.throws(() => planlegg({ service }), /melosys-web #3300 er/, service);
});

const brancher = (felt: Obj = {}) => ({
  runId: '500',
  orkestrator: { path: '.github/workflows/e2e-brancher.yml', conclusion: 'success' },
  e2eKjøring: { conclusion: 'success', created_at: '2026-10-22T12:00:00Z' },
  kontekst: {
    headBranch: 'gren',
    inputs: { test_grep: null as string | null },
    branchContext: { branches: [{ repo: 'melosys-web', sha: sha('1') }, { repo: 'melosys-e2e-tests', sha: sha('2') }] },
  },
  tjeneste: 'melosys-web',
  serviceHead: sha('1'),
  e2e: { head: sha('2'), merget: false, mergedAt: null as string | null },
  ...felt,
});

test('set: br-kjøringen må være grønn, hele suiten og mot nåværende heads', () => {
  assert.doesNotThrow(() => sjekkBrancherKjøring(brancher()));
  assert.throws(() => sjekkBrancherKjøring(brancher({ orkestrator: { path: '.github/workflows/e2e-tests.yml', conclusion: 'success' } })), /ikke en kjøring av «E2E med brancher»/);
  assert.throws(() => sjekkBrancherKjøring(brancher({ orkestrator: { path: '.github/workflows/e2e-brancher.yml', conclusion: 'failure' } })), /er failure, ikke grønn/);
  assert.throws(() => sjekkBrancherKjøring(brancher({ e2eKjøring: null })), /Fant ikke E2E Tests-kjøringen/);
  assert.throws(() => sjekkBrancherKjøring(brancher({ e2eKjøring: { conclusion: 'cancelled' } })), /E2E Tests for br-500 er cancelled/);
  assert.throws(() => sjekkBrancherKjøring(brancher({ kontekst: null })), /Fant ikke trigger-context.json/);
  const k = brancher().kontekst;
  assert.throws(() => sjekkBrancherKjøring(brancher({ kontekst: { ...k, inputs: { test_grep: 'smoke' } } })), /test_grep «smoke»/);
  assert.throws(() => sjekkBrancherKjøring(brancher({ serviceHead: sha('3') })), /testet melosys-web på 1111111, men service-PR-en har 3333333/);
  assert.throws(() => sjekkBrancherKjøring(brancher({ tjeneste: 'melosys-api' })), /testet ikke en branch i melosys-api/);
  assert.throws(() => sjekkBrancherKjøring(brancher({ e2e: { head: sha('4'), merget: false } })), /e2e-PR-en har 4444444/);
  const utenE2e = { ...k, branchContext: { branches: [k.branchContext.branches[0]] } };
  assert.throws(() => sjekkBrancherKjøring(brancher({ kontekst: utenE2e })), /testet ikke e2e-PR-en/);
});

test('set --erstatt for merget e2e-PR: en kjøring på main etter mergen godtas', () => {
  const k = brancher().kontekst;
  const påMain = { ...k, headBranch: 'main', branchContext: { branches: [k.branchContext.branches[0]] } };
  const e2e = { head: sha('2'), merget: true, mergedAt: '2026-10-22T11:00:00Z' };
  assert.doesNotThrow(() => sjekkBrancherKjøring(brancher({ kontekst: påMain, e2e })));
  assert.throws(() => sjekkBrancherKjøring(brancher({ kontekst: påMain, e2e: { ...e2e, mergedAt: '2026-10-22T13:00:00Z' } })), /testet ikke e2e-PR-en/);
  assert.throws(() => sjekkBrancherKjøring(brancher({ kontekst: { ...påMain, headBranch: 'gren' }, e2e })), /testet ikke e2e-PR-en/);
});

/** Falsk GitHub for skriveren: variabelen, kjøringene og PR-ene. */
function lagGitHub({ verdi, prer = {}, ikkeLagre = false, kjøringerPerSide = false }: { verdi?: string; prer?: Obj; ikkeLagre?: boolean; kjøringerPerSide?: boolean }) {
  const kall: string[] = [];
  const lagret: { verdi?: string } = { verdi };
  const github = async (metode: string, sti: string, body?: Obj) => {
    kall.push(`${metode} ${sti.split('?')[0]}`);
    if (sti.endsWith('/actions/variables/E2E_PINS')) {
      if (metode === 'GET') return lagret.verdi === undefined ? { status: 404, data: null } : { status: 200, data: { value: lagret.verdi } };
      if (!ikkeLagre) lagret.verdi = body!.value;
      return { status: 204, data: null };
    }
    if (sti.endsWith('/actions/variables') && metode === 'POST') {
      lagret.verdi = body!.value;
      return { status: 201, data: null };
    }
    if (sti.endsWith('/actions/runs/500')) {
      return { status: 200, data: { path: '.github/workflows/e2e-brancher.yml', conclusion: 'success', run_attempt: 2, created_at: '2026-10-22T12:00:00Z' } };
    }
    if (sti.includes('/workflows/e2e-tests.yml/runs')) {
      if (kjøringerPerSide) {
        // 100 nyere kjøringer på side 1, kjøringen til br-500 på side 2.
        const side = Number(new URLSearchParams(sti.split('?')[1]).get('page') ?? '1');
        const andre = Array.from({ length: 100 }, (_, i) => ({ id: 1000 + i, display_title: `E2E Tests · gate-${i}` }));
        const runs = side === 1 ? andre : side === 2 ? [{ id: 8, display_title: 'E2E Tests · br-500-2', conclusion: 'success', created_at: '2026-10-22T12:05:00Z' }] : [];
        return { status: 200, data: { workflow_runs: runs } };
      }
      const kjøringer = [
        { id: 7, display_title: 'E2E Tests · br-500-1', conclusion: 'failure' },
        { id: 8, display_title: 'E2E Tests · br-500-2', conclusion: 'success', created_at: '2026-10-22T12:05:00Z' },
      ];
      return { status: 200, data: { workflow_runs: kjøringer } };
    }
    throw new Error(`uventet kall ${metode} ${sti}`);
  };
  const åpen = (head: string) => ({ state: 'open', merged: false, head: { sha: head } });
  const hent = lagHenter({ pr: { 'melosys-e2e-tests#390': åpen(sha('2')), 'melosys-web#3300': åpen(sha('1')), ...prer } });
  const lastet: number[] = [];
  const lastNed = async (id: number) => (lastet.push(id), brancher().kontekst);
  const logg: string[] = [];
  return { kall, lagret, lastet, logg, io: { github, hent, lastNed, nå: () => NÅ, logg: (t: string) => logg.push(t) } };
}

test('skriv: set oppretter variabelen når den mangler, med kjøringen fra siste forsøk', async () => {
  const g = lagGitHub({});
  await skriv(SET, g.io);
  assert.deepEqual(JSON.parse(g.lagret.verdi!), { 'melosys-web': ny });
  assert.ok(g.kall.includes('POST /repos/navikt/melosys-e2e-tests/actions/variables'));
  assert.deepEqual(g.lastet, [8]);
});

test('skriv: set rydder en utløpt pin og skriver med PATCH', async () => {
  const g = lagGitHub({ verdi: JSON.stringify({ 'melosys-api': { ...PIN, service_pr: 77 } }), prer: { 'melosys-api#77': merget } });
  await skriv(SET, g.io);
  assert.deepEqual(JSON.parse(g.lagret.verdi!), { 'melosys-web': ny });
  assert.ok(g.kall.includes('PATCH /repos/navikt/melosys-e2e-tests/actions/variables/E2E_PINS'));
  assert.ok(g.logg.some((l) => /Rydder bort pinnen for melosys-api: utløpt/.test(l)));
});

test('skriv: --dry-run skriver ingenting, og en lik pin skrives ikke på nytt', async () => {
  const g = lagGitHub({ verdi: '{}' });
  await skriv({ ...SET, dryRun: true }, g.io);
  assert.equal(g.lagret.verdi, '{}');
  assert.ok(g.logg.some((l) => /--dry-run: ville skrevet E2E_PINS/.test(l)));
  const lik = JSON.stringify({ 'melosys-web': { ...ny, satt: '2026-10-21T00:00:00Z' } });
  const h = lagGitHub({ verdi: lik });
  await skriv(SET, h.io);
  assert.equal(h.lagret.verdi, lik);
  assert.ok(h.logg.some((l) => /allerede pinnet til br-500/.test(l)));
});

test('skriv: en lik pin sjekkes også mot nåværende heads', async () => {
  // Service-PR-en har fått nye commits siden br-kjøringen; set med samme argumenter skal ikke si
  // at alt er i orden.
  const lik = JSON.stringify({ 'melosys-web': { ...ny, satt: '2026-10-21T00:00:00Z' } });
  const g = lagGitHub({ verdi: lik, prer: { 'melosys-web#3300': { state: 'open', merged: false, head: { sha: sha('5') } } } });
  await assert.rejects(skriv(SET, g.io), /service-PR-en har 5555555 nå/);
  assert.equal(g.lagret.verdi, lik);
});

test('skriv: finner E2E Tests-kjøringen også når den ikke er på første side', async () => {
  const g = lagGitHub({ kjøringerPerSide: true });
  await skriv(SET, g.io);
  assert.deepEqual(g.lastet, [8]);
  assert.ok(g.kall.filter((k) => k.includes('/workflows/e2e-tests.yml/runs')).length >= 2);
});

test('skriv: feiler når pinnen mangler etter skrivingen', async () => {
  const g = lagGitHub({ verdi: '{}', ikkeLagre: true });
  await assert.rejects(skriv(SET, g.io), /har ikke fått pinnen for melosys-web etter skrivingen/);
});

test('skriv: en ugyldig variabel rettes for hånd først', async () => {
  const g = lagGitHub({ verdi: '{"melosys-web": "br-1"}' });
  await assert.rejects(skriv(SET, g.io), /Rett den med «gh variable set E2E_PINS/);
  await assert.rejects(skriv({ kommando: 'fjern', tjeneste: 'melosys-web' }, g.io), /Rett den/);
});

test('skriv: fjern tar bort én pin og lar resten stå', async () => {
  const g = lagGitHub({ verdi: JSON.stringify({ 'melosys-web': PIN, 'melosys-api': PIN }) });
  await skriv({ kommando: 'fjern', tjeneste: 'melosys-web' }, g.io);
  assert.deepEqual(JSON.parse(g.lagret.verdi!), { 'melosys-api': PIN });
  await skriv({ kommando: 'fjern', tjeneste: 'melosys-web' }, g.io);
  assert.ok(g.logg.some((l) => /har ingen pin i E2E_PINS; ingenting å fjerne/.test(l)));
  await skriv({ kommando: 'fjern', tjeneste: 'melosys-api' }, g.io);
  assert.equal(g.lagret.verdi, '{}');
});

// ---------------------------------------------------------------- CLI og workflow

test('CLI velg: pinnene fra fila og statusen per pin i variabelen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-pins-'));
  const fil = join(dir, 'e2e-pins.json');
  const ut = join(dir, 'pinner.json');
  writeFileSync(fil, '{"melosys-web": "br-123", "melosys-api": "br-123"}');
  // e2e #999999 finnes ikke i historikken, så pinnen starter ikke, og ingen kall går mot GitHub.
  const variabel = JSON.stringify({ 'melosys-eessi': { ...PIN, e2e_pr: 999999 } });
  const miljø = { ...alleLatest, PATH: process.env.PATH };
  const res = spawnSync(process.execPath, [script, 'velg', fil, ut], {
    env: { ...miljø, MELOSYS_API_TAG: 'abc123', E2E_PINS_VAR: variabel },
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, 'MELOSYS_WEB_TAG melosys-web br-123\n');
  assert.match(res.stderr, /melosys-api er pinnet til br-123, men kjøringen har taggen «abc123»/);
  assert.match(res.stderr, /::warning::📌 melosys-web er pinnet til br-123 i .github\/e2e-pins.json/);
  const resultat = JSON.parse(readFileSync(ut, 'utf8'));
  assert.equal(resultat.pinnerFeil, null);
  assert.deepEqual(resultat.pinner.map((p: Obj) => [p.tjeneste, p.status]), [['melosys-eessi', 'ikke startet']]);

  // Inputen erstatter variabelen; ugyldig gir en feilmelding, ingen pinner og exit 0.
  const ugyldig = spawnSync(process.execPath, [script, 'velg', join(dir, 'finnes-ikke.json'), ut], {
    env: { ...miljø, E2E_PINS_VAR: variabel, E2E_PINS_INPUT: '{"melosys-web": ' },
    encoding: 'utf8',
  });
  assert.equal(ugyldig.status, 0, ugyldig.stderr);
  assert.equal(ugyldig.stdout, '');
  assert.match(ugyldig.stderr, /::error::input e2e_pins er ikke gyldig JSON/);
  assert.deepEqual(JSON.parse(readFileSync(ut, 'utf8')), { pinner: [], pinnerFeil: 'input e2e_pins er ikke gyldig JSON' });

  writeFileSync(fil, '{"ukjent": "br-1"}');
  assert.throws(
    () => execFileSync(process.execPath, [script, 'velg', fil, ut], { stdio: 'pipe' }),
    (e: { status: number; stderr: Buffer }) => e.status === 1 && /ukjent tjeneste/.test(e.stderr.toString()),
  );
});

const yml = readFileSync(join(__dirname, '..', '.github', 'workflows', 'e2e-tests.yml'), 'utf8');

test('TJENESTER følger tjenestene i «Determine image tags»', () => {
  // Begge feilene er stille: mangler tjenesten i export-lista, ser ikke scriptet taggen, og
  // pinnen brukes aldri. Mangler den i case-blokken, ignoreres taggen fra environment, tjenesten
  // beholder latest, og pinnen brukes også når tjenesten skulle vært under test.
  const exportLinje = yml.match(/export (MELOSYS_API_TAG[\s\S]*?)\n\s*PINNER_FIL=/)?.[1] ?? '';
  const eksportert = exportLinje.split(/[\s\\]+/).filter(Boolean).sort();
  assert.deepEqual(eksportert, Object.values(TJENESTER).sort());

  const steg = yml.slice(yml.indexOf('Parsing multi-service tag format'), yml.indexOf('Simple format: just a tag'));
  const iCase = [...steg.matchAll(/^\s+([a-z-]+)\)\n\s+([A-Z_]+)="\$tag"/gm)].map(([, t, v]) => [t, v]);
  assert.deepEqual(Object.fromEntries(iCase), TJENESTER);

  // Begge greinene (repository_dispatch og workflow_dispatch) setter alle tjenester til latest
  // først. Mangler en, er variabelen tom, og pinnen gjelder ikke.
  const standard = [...yml.matchAll(/# Default all services to latest\n((?:\s+[A-Z_]+="latest"\n)+)/g)];
  assert.equal(standard.length, 2);
  for (const [, blokk] of standard) {
    const variabler = [...blokk.matchAll(/([A-Z_]+)="latest"/g)].map(([, v]) => v).sort();
    assert.deepEqual(variabler, Object.values(TJENESTER).sort());
  }
});

test('resolvedTags i trigger-konteksten og tags i test-summary har alle tjenestene', () => {
  // Konsollen viser taggen kjøringen brukte fra resolvedTags; uten skjema-nøklene ser den ikke en
  // pin for melosys-skjema-api eller melosys-skjema-web.
  const blokk = yml.slice(yml.indexOf('RESOLVED_TAGS=$(jq -n'), yml.indexOf('| with_entries(select(.value != ""))'));
  const nøkler = [...blokk.matchAll(/^\s+"([a-z-]+)": \$[A-Za-z]+,?$/gm)].map(([, n]) => n).sort();
  assert.deepEqual(nøkler, Object.keys(TJENESTER).sort());
  const env = Object.fromEntries(Object.values(TJENESTER).map((v) => [v as string, `tag-${v}`]));
  assert.deepEqual(Object.keys(imageTagsFromEnv(env)).sort(), Object.keys(TJENESTER).sort());
});

test('plan-jobben henter hele historikken og logger inn før taggvalget', () => {
  const plan = yml.slice(yml.indexOf('  plan:\n'), yml.indexOf('- name: Pin image-tagger til digest'));
  assert.match(plan, /actions\/checkout@v4\n\s+with:\n(\s+#.*\n)*\s+fetch-depth: 0\n/);
  const login = plan.indexOf('- name: Login to NAIS registry');
  assert.ok(login !== -1 && login < plan.indexOf('- name: Determine image tags from trigger source'));
  assert.match(plan, /E2E_PINS_INPUT: \$\{\{ inputs\.e2e_pins \}\}/);
  assert.match(plan, /E2E_PINS_VAR: \$\{\{ vars\.E2E_PINS \}\}/);
  // Begge trigger-kontekstene får pinnene.
  assert.equal([...yml.matchAll(/\+ \$gate \+ \$branch \+ \$pinner'\)/g)].length, 2);
});
