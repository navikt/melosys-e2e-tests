import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TJENESTER,
  anvendPins,
  gyldigBranchnavn,
  lesPins,
  regel6,
  shaBakLatest,
  tjenesterUnderTest,
  utenVirkning,
  utloptePins,
  valider,
  validerFjerning,
  validerMotKilder,
  // @ts-expect-error — .mjs uten typedeklarasjon; fila er ren node uten avhengigheter.
} from './e2e-pins.mjs';

/**
 * Pin-fila styrer hvilke images alle E2E Tests-kjøringer bruker, og hvilke dispatcher som hoppes
 * over. En feil her treffer alle repoene med merge queue, så reglene fra planen er testet hver
 * for seg: «under test», regel 6, kravene til koblede pinner (D13), fjerning (D14) og utvalget.
 */

const sha = (c: string) => c.repeat(40);
const DIGEST_LATEST = 'sha256:' + 'f'.repeat(64);
const DIGEST_GAMMEL = 'sha256:' + 'e'.repeat(64);

const koblet = {
  tag: sha('a'),
  e2e_branch: 'MELOSYS-9000-ny-knapp',
  service_pr: 3300,
  jira: 'MELOSYS-9000',
  utloper: '2026-11-03',
};
const karantene = { tag: sha('b'), jira: 'MELOSYS-9001', utloper: '2026-11-03' };

type Pr = { merged: boolean; state: string; merge_commit_sha?: string };
type Kildeoppsett = {
  digester?: Record<string, string>;
  forfedre?: Array<[string, string]>;
  prer?: Record<string, Pr>;
  commits?: string[];
  feilPå?: string;
};

/** Falske oppslag. `forfedre` er par [forfar, etterkommer]; alt annet er ikke forfar. */
function kilder({ digester = {}, forfedre = [], prer = {}, commits = [], feilPå }: Kildeoppsett = {}) {
  const kall: string[] = [];
  const sjekk = (navn: string) => {
    kall.push(navn);
    if (feilPå === navn) throw new Error(`${navn} feilet`);
  };
  return {
    kall,
    async digest(image: string, tag: string) {
      sjekk('digest');
      return digester[`${image}:${tag}`] ?? null;
    },
    async standardBranch(repo: string) {
      sjekk('standardBranch');
      return repo === 'melosys-api' ? 'master' : 'main';
    },
    async sammenlign(_repo: string, forfar: string, etterkommer: string) {
      sjekk('sammenlign');
      return forfar === etterkommer || forfedre.some(([f, e]) => f === forfar && e === etterkommer);
    },
    async hentPr(repo: string, nummer: number) {
      sjekk('hentPr');
      return prer[`${repo}#${nummer}`] ?? null;
    },
    async sisteCommits() {
      sjekk('sisteCommits');
      return commits;
    },
  };
}

// ---- Fila ----

test('tom fil og {} betyr ingen pinner', () => {
  assert.deepEqual(lesPins(''), { pins: {}, feil: [] });
  assert.deepEqual(lesPins('{}\n'), { pins: {}, feil: [] });
  assert.deepEqual(lesPins(undefined), { pins: {}, feil: [] });
});

test('gyldig koblet pin og karantenepin leses', () => {
  const { pins, feil } = lesPins(JSON.stringify({ 'melosys-web': koblet, 'melosys-dokgen': karantene }));
  assert.deepEqual(feil, []);
  assert.deepEqual(pins, { 'melosys-web': koblet, 'melosys-dokgen': karantene });
});

test('fil som ikke er JSON, gir feil', () => {
  const { pins, feil } = lesPins('{ "melosys-web": ');
  assert.deepEqual(pins, {});
  assert.match(feil[0], /ikke gyldig JSON/);
});

test('liste eller null på toppnivå gir feil', () => {
  assert.match(lesPins('[]').feil[0], /JSON-objekt/);
  assert.match(lesPins('null').feil[0], /JSON-objekt/);
});

test('ukjent tjeneste og ukjent felt gir feil', () => {
  assert.match(lesPins(JSON.stringify({ 'melosys-ukjent': karantene })).feil[0], /ukjent tjeneste/);
  assert.match(lesPins(JSON.stringify({ 'melosys-web': { ...karantene, kommentar: 'x' } })).feil[0], /ukjente felt/);
});

test('tag, jira og utloper valideres', () => {
  const feil = (pin: object) => lesPins(JSON.stringify({ 'melosys-web': pin })).feil.join('\n');
  assert.match(feil({ ...karantene, tag: 'latest' }), /40 hex/);
  assert.match(feil({ ...karantene, tag: sha('A') }), /40 hex/, 'store bokstaver er ikke en git-sha');
  assert.match(feil({ ...karantene, jira: 'TEK-1' }), /MELOSYS-nøkkel/);
  assert.match(feil({ ...karantene, utloper: '2026-02-30' }), /dato/);
  assert.match(feil({ ...karantene, utloper: '3.11.2026' }), /dato/);
  const { jira, ...utenJira } = karantene;
  void jira;
  assert.match(feil(utenJira), /MELOSYS-nøkkel/, 'jira er påkrevd');
});

test('tekstfeltene skal være tekst: en liste med gyldig verdi avvises', () => {
  // «Determine image tags» i e2e-tests.yml ville ellers brukt ["aaaa…"] som tag.
  const feil = (pin: object) => lesPins(JSON.stringify({ 'melosys-web': pin })).feil.join('\n');
  assert.match(feil({ ...karantene, tag: [sha('a')] }), /tag skal være tekst, ikke en liste/);
  assert.match(feil({ ...karantene, jira: ['MELOSYS-9'] }), /jira skal være tekst, ikke en liste/);
  assert.match(feil({ ...karantene, utloper: ['2026-11-03'] }), /utloper skal være tekst, ikke en liste/);
  assert.match(feil({ ...koblet, e2e_branch: ['MELOSYS-9000-ny-knapp'] }), /e2e_branch skal være tekst, ikke en liste/);
  assert.match(feil({ ...karantene, tag: 1234 }), /tag skal være tekst, ikke et tall/);
  assert.match(feil({ ...koblet, service_pr: [3300] }), /service_pr skal være et positivt heltall/);
});

test('e2e_branch og service_pr står sammen, og service_pr er et positivt heltall', () => {
  const feil = (pin: object) => lesPins(JSON.stringify({ 'melosys-web': pin })).feil.join('\n');
  assert.match(feil({ ...karantene, e2e_branch: 'b' }), /sammen/);
  assert.match(feil({ ...karantene, service_pr: 1 }), /sammen/);
  assert.match(feil({ ...koblet, service_pr: '3300' }), /positivt heltall/);
  assert.match(feil({ ...koblet, service_pr: 0 }), /positivt heltall/);
  assert.match(feil({ ...koblet, service_pr: 1.5 }), /positivt heltall/);
  assert.match(feil({ ...koblet, e2e_branch: 'a..b' }), /branchnavn/);
});

test('D13: bare de seks tjenestene med gate kan ha koblet pin', () => {
  const medGate = ['melosys-api', 'melosys-web', 'melosys-skjema-api', 'melosys-skjema-web', 'melosys-eessi', 'faktureringskomponenten'];
  for (const tjeneste of Object.keys(TJENESTER)) {
    const { feil } = lesPins(JSON.stringify({ [tjeneste]: koblet }));
    if (medGate.includes(tjeneste)) assert.deepEqual(feil, [], tjeneste);
    else assert.match(feil.join('\n'), /bare ha karantenepin/, tjeneste);
    assert.deepEqual(lesPins(JSON.stringify({ [tjeneste]: karantene })).feil, [], `karantene for ${tjeneste}`);
  }
});

test('branchnavn sjekkes som git check-ref-format --branch', () => {
  const navn = ['MELOSYS-9000-ny-knapp', 'ok/branch-1', 'æøå', 'HEAD', '-x', 'a..b', 'a/.b', 'a.lock', 'a b', 'a@{b',
    'a/', '/a', 'a//b', 'a.', '.a', 'a~1', 'a^', 'a:b', 'a?', 'a*', 'a[b', 'a\\b', 'tab\tx'];
  for (const b of navn) {
    let git = true;
    try {
      execFileSync('git', ['check-ref-format', '--branch', b], { stdio: 'ignore' });
    } catch {
      git = false;
    }
    assert.equal(gyldigBranchnavn(b), git, b);
  }
});

test('tjenestelista er lik case-en i e2e-gate.yml', () => {
  const gate = readFileSync(join(__dirname, '..', '.github', 'workflows', 'e2e-gate.yml'), 'utf8');
  const blokk = gate.match(/case "\$SERVICE" in\n([\s\S]*?)\) ;;/);
  assert.ok(blokk, 'fant ikke case "$SERVICE" in i e2e-gate.yml');
  const iGaten = blokk[1].split(/[|\\\s]+/).filter(Boolean).sort();
  assert.deepEqual(iGaten, Object.keys(TJENESTER).sort());
});

// ---- Under test (regel 1 og 2) ----

test('«under test»: latest, melosys-api:latest, bar tag, flere tjenester og dispatch', () => {
  const under = (a: object) => [...tjenesterUnderTest(a)].sort();
  assert.deepEqual(under({ hendelse: 'workflow_dispatch', environment: 'latest' }), []);
  assert.deepEqual(under({ hendelse: 'merge_group', environment: 'latest' }), [], 'e2e-køen sender latest');
  assert.deepEqual(under({ hendelse: 'workflow_dispatch', environment: 'melosys-api:latest' }), []);
  assert.deepEqual(under({ hendelse: 'workflow_dispatch', environment: 'e2e-logging' }), ['melosys-api']);
  assert.deepEqual(
    under({ hendelse: 'workflow_dispatch', environment: 'melosys-web:mq-abc, melosys-api:latest,ukjent:x' }),
    ['melosys-web']
  );
  assert.deepEqual(under({ hendelse: 'repository_dispatch', eventType: 'melosys-web-published' }), ['melosys-web']);
  assert.deepEqual(under({ hendelse: 'repository_dispatch', eventType: 'noe-annet' }), []);
});

test('karantenepin brukes når tjenesten ikke er under test', () => {
  const pins = { 'melosys-web': karantene };
  const r = anvendPins(pins, tjenesterUnderTest({ hendelse: 'workflow_dispatch', environment: 'latest' }));
  assert.deepEqual(r, { anvendt: { 'melosys-web': karantene.tag }, underTest: [] });
});

test('koblet pin: tjenesten under test vinner, andre tjenester får pinnen', () => {
  const pins = { 'melosys-web': koblet, 'melosys-dokgen': karantene };
  const gate = anvendPins(pins, tjenesterUnderTest({ hendelse: 'workflow_dispatch', environment: `melosys-web:mq-${sha('c')}` }));
  assert.deepEqual(gate, { anvendt: { 'melosys-dokgen': karantene.tag }, underTest: ['melosys-web'] });
  const api = anvendPins(pins, tjenesterUnderTest({ hendelse: 'repository_dispatch', eventType: 'melosys-api-published' }));
  assert.deepEqual(api.anvendt, { 'melosys-web': koblet.tag, 'melosys-dokgen': karantene.tag });
});

test('regel 7: pinnen er utløpt dagen etter utloper', () => {
  const pins = { 'melosys-web': koblet };
  assert.deepEqual(utloptePins(pins, '2026-11-03'), []);
  assert.deepEqual(utloptePins(pins, '2026-11-04'), [{ tjeneste: 'melosys-web', utloper: '2026-11-03', jira: 'MELOSYS-9000' }]);
});

// ---- Regel 6 ----

const MERGE = sha('d');
const DISPATCH = sha('9');
const regel6Args = (k: ReturnType<typeof kilder>, over: object = {}) => ({
  pins: { 'melosys-web': koblet },
  hendelse: 'repository_dispatch',
  eventType: 'melosys-web-published',
  sha: DISPATCH,
  kilder: k,
  ...over,
});

test('regel 6: merget service_pr som er forfar til dispatchen, hoppes over', async () => {
  const k = kilder({
    prer: { 'melosys-web#3300': { merged: true, state: 'closed', merge_commit_sha: MERGE } },
    forfedre: [[MERGE, DISPATCH]],
  });
  const r = await regel6(regel6Args(k));
  assert.equal(r.hopp, true);
  assert.match(r.grunn, /MELOSYS-9000-ny-knapp/);
});

test('regel 6: åpen PR kjøres, selv om pulls-API-et gir merge_commit_sha', async () => {
  const k = kilder({
    prer: { 'melosys-web#3300': { merged: false, state: 'open', merge_commit_sha: MERGE } },
    forfedre: [[MERGE, DISPATCH]],
  });
  assert.equal((await regel6(regel6Args(k))).hopp, false);
});

test('regel 6: en annen dispatch fra tjenesten kjøres', async () => {
  const k = kilder({ prer: { 'melosys-web#3300': { merged: true, state: 'closed', merge_commit_sha: MERGE } } });
  const r = await regel6(regel6Args(k));
  assert.equal(r.hopp, false);
  assert.match(r.grunn, /inneholder ikke/);
});

test('regel 6: feilet oppslag kjører testene', async () => {
  for (const feilPå of ['hentPr', 'sammenlign']) {
    const k = kilder({
      prer: { 'melosys-web#3300': { merged: true, state: 'closed', merge_commit_sha: MERGE } },
      forfedre: [[MERGE, DISPATCH]],
      feilPå,
    });
    const r = await regel6(regel6Args(k));
    assert.equal(r.hopp, false, feilPå);
    assert.match(r.grunn, /feilet/, feilPå);
  }
});

test('regel 6: karantenepin, upinnet tjeneste, annen hendelse og manglende sha kjører uten oppslag', async () => {
  const k = kilder();
  assert.equal((await regel6(regel6Args(k, { pins: { 'melosys-web': karantene } }))).hopp, false);
  assert.equal((await regel6(regel6Args(k, { eventType: 'melosys-api-published' }))).hopp, false);
  assert.equal((await regel6(regel6Args(k, { hendelse: 'workflow_dispatch' }))).hopp, false);
  assert.equal((await regel6(regel6Args(k, { sha: 'latest' }))).hopp, false);
  assert.deepEqual(k.kall, []);
});

// ---- Validering mot GitHub og GAR ----

test('tag som mangler i GAR eller ikke ligger på default-branchen, gir feil', async () => {
  const pins = { 'melosys-web': koblet, 'melosys-mock': karantene };
  const mangler = await validerMotKilder(pins, kilder());
  assert.match(mangler.join('\n'), /melosys-web:a{40} finnes ikke i GAR/);
  assert.match(mangler.join('\n'), /melosys-docker-compose-mock:b{40} finnes ikke i GAR/, 'mock har eget imagenavn');

  const k = kilder({
    digester: { [`melosys-web:${koblet.tag}`]: DIGEST_GAMMEL, [`melosys-docker-compose-mock:${karantene.tag}`]: DIGEST_GAMMEL },
    forfedre: [[koblet.tag, 'main']],
  });
  const feil = await validerMotKilder(pins, k);
  assert.equal(feil.length, 1);
  assert.match(feil[0], /melosys-mock: b{40} ligger ikke på main i melosys-docker-compose/);
});

test('sha bak latest er commiten på default-branchen med samme digest', async () => {
  const k = kilder({
    digester: { 'melosys-web:latest': DIGEST_LATEST, [`melosys-web:${sha('1')}`]: DIGEST_GAMMEL, [`melosys-web:${sha('2')}`]: DIGEST_LATEST },
    commits: [sha('3'), sha('2'), sha('1')],
  });
  assert.equal(await shaBakLatest('melosys-web', k), sha('2'));
  await assert.rejects(shaBakLatest('melosys-web', kilder({ digester: { 'melosys-web:latest': DIGEST_LATEST }, commits: [sha('1')] })), /deploy-manuelt/);
});

// ---- D14: fjerning og omkobling av koblet pin ----

const LATEST_SHA = sha('2');
const d14 = (pr: Pr | undefined, ekstra: Kildeoppsett = {}) =>
  kilder({
    digester: { 'melosys-web:latest': DIGEST_LATEST, [`melosys-web:${LATEST_SHA}`]: DIGEST_LATEST },
    commits: [LATEST_SHA],
    prer: pr ? { 'melosys-web#3300': pr } : {},
    ...ekstra,
  });
const base = { 'melosys-web': koblet };

test('D14: fjerning godtas når service_pr er merget og ligger i latest', async () => {
  const k = d14({ merged: true, state: 'closed', merge_commit_sha: MERGE }, { forfedre: [[MERGE, LATEST_SHA]] });
  assert.deepEqual(await validerFjerning(base, {}, { barePinfil: false, kilder: k }), []);
});

test('D14: fjerning avvises når service_pr er merget, men ikke i latest ennå', async () => {
  const k = d14({ merged: true, state: 'closed', merge_commit_sha: MERGE });
  assert.match((await validerFjerning(base, {}, { barePinfil: false, kilder: k })).join('\n'), /har den ikke ennå/);
});

test('D14: fjerning godtas når service_pr er lukket uten merge', async () => {
  const k = d14({ merged: false, state: 'closed' });
  assert.deepEqual(await validerFjerning(base, {}, { barePinfil: false, kilder: k }), []);
});

test('D14: fjerning av pin med åpen service_pr godtas bare når PR-en endrer bare pin-fila', async () => {
  const åpen = { merged: false, state: 'open', merge_commit_sha: MERGE };
  assert.match((await validerFjerning(base, {}, { barePinfil: false, kilder: d14(åpen) })).join('\n'), /mens melosys-web#3300 er åpen/);
  const k = d14(åpen);
  assert.deepEqual(await validerFjerning(base, {}, { barePinfil: true, kilder: k }), []);
  assert.deepEqual(k.kall, [], 'ingen oppslag når PR-en bare endrer pin-fila');
});

test('D14: endret service_pr eller e2e_branch, og omgjøring til karantene, regnes som fjerning', async () => {
  const åpen = { merged: false, state: 'open' };
  for (const etter of [{ ...koblet, service_pr: 3301 }, { ...koblet, e2e_branch: 'annen' }, { tag: koblet.tag, jira: koblet.jira, utloper: koblet.utloper }]) {
    const feil = await validerFjerning(base, { 'melosys-web': etter }, { barePinfil: false, kilder: d14(åpen) });
    assert.equal(feil.length, 1, JSON.stringify(etter));
  }
});

test('D14 gjelder ikke ny tag eller utloper på samme koblede pin, eller karantenepinner', async () => {
  const k = d14(undefined);
  assert.deepEqual(await validerFjerning(base, { 'melosys-web': { ...koblet, tag: sha('c'), utloper: '2026-12-01' } }, { barePinfil: false, kilder: k }), []);
  assert.deepEqual(await validerFjerning({ 'melosys-dokgen': karantene }, {}, { barePinfil: false, kilder: k }), []);
  assert.deepEqual(k.kall, []);
});

// ---- Utvalget: pinner uten virkning ----

const utvalgKilder = () =>
  kilder({
    digester: {
      'melosys-web:latest': DIGEST_LATEST,
      [`melosys-web:${koblet.tag}`]: DIGEST_LATEST,
      [`melosys-web:${sha('c')}`]: DIGEST_GAMMEL,
    },
  });

test('utvalg: ny pin på dagens latest har ingen virkning', async () => {
  assert.equal(await utenVirkning({}, { 'melosys-web': koblet }, utvalgKilder()), true);
});

test('utvalg: ny pin til en eldre sha har virkning', async () => {
  assert.equal(await utenVirkning({}, { 'melosys-web': { ...koblet, tag: sha('c') } }, utvalgKilder()), false);
});

test('utvalg: fjernet pin, eller ny service_pr, med tag lik latest har ingen virkning', async () => {
  assert.equal(await utenVirkning(base, {}, utvalgKilder()), true);
  assert.equal(await utenVirkning(base, { 'melosys-web': { ...koblet, service_pr: 3301 } }, utvalgKilder()), true);
});

test('utvalg: fjerning etter at tjenesten har flyttet latest, har virkning', async () => {
  assert.equal(await utenVirkning({ 'melosys-web': { ...koblet, tag: sha('c') } }, {}, utvalgKilder()), false);
});

test('utvalg: tjeneste uten latest i GAR regnes som virkning', async () => {
  assert.equal(await utenVirkning({}, { 'melosys-dokgen': karantene }, utvalgKilder()), false);
});

// ---- Hele valideringen ----

test('valider: ugyldig head stopper før oppslag', async () => {
  const k = kilder();
  const r = await valider({ headTekst: '{', baseTekst: '{}', kilder: k });
  assert.match(r.feil[0], /JSON/);
  assert.deepEqual(k.kall, []);
});

test('valider: ny koblet pin på latest er gyldig og uten virkning', async () => {
  const k = d14(undefined, { forfedre: [[koblet.tag, 'main']] });
  k.digest = async (image: string, tag: string) =>
    ({ 'melosys-web:latest': DIGEST_LATEST, [`melosys-web:${koblet.tag}`]: DIGEST_LATEST } as Record<string, string>)[`${image}:${tag}`] ?? null;
  const r = await valider({ headTekst: JSON.stringify(base), baseTekst: '', idag: '2026-11-04', kilder: k });
  assert.deepEqual(r.feil, []);
  assert.equal(r.utenVirkning, true);
  assert.equal(r.utlopt.length, 1);
});
