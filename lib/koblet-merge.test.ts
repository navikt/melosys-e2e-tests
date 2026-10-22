import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  andreIKo,
  fjernPinner,
  GRENSER,
  kjor,
  lagJwt,
  lagKlient,
  lagTokenKilde,
  leggTilPinner,
  lesInput,
  sjekkPr,
  tolkDeploy,
  tolkKoPoll,
  velgDeployKjoring,
  velgKoHandling,
  vaskBestiller,
  // @ts-expect-error — .mjs uten typedeklarasjon; scriptet er ren node uten avhengigheter.
} from '../scripts/koblet-merge.mjs';
// @ts-expect-error — .mjs uten typedeklarasjon.
import { utenE2eEffekt } from '../scripts/affected-tests.mjs';

/**
 * Koblet merge setter PR-er i merge-køer og committer til e2e-repoet. Feilene som koster mest:
 * en dry_run som skriver, en pin-endring som sletter andres pinner, en service-PR som settes i
 * kø mens køen har andre PR-er (D4), og en PR som faller ut av køen uten at jobben feiler.
 */

const TAG = 'br-38725776923';
const MIN = 60_000;

// ---------------------------------------------------------------- falsk GitHub

type Pr = Record<string, any>;

function lagPr(repo: string, nr: number, felt: Pr = {}): Pr {
  return {
    id: `PR_${repo}_${nr}`,
    number: nr,
    url: `https://github.com/navikt/${repo}/pull/${nr}`,
    title: 'x',
    state: 'OPEN',
    isDraft: false,
    baseRefName: repo === 'melosys-e2e-tests' ? 'main' : 'master',
    headRefName: `gren-${nr}`,
    headRefOid: `head-${nr}`,
    headRepository: { nameWithOwner: `navikt/${repo}` },
    isInMergeQueue: false,
    mergeQueueEntry: null,
    mergeCommit: null,
    mergeStateStatus: 'CLEAN',
    reviewDecision: null,
    viewerCanEnableAutoMerge: false,
    autoMergeRequest: null,
    ...felt,
  };
}

/**
 * En liten GitHub i minnet. `prs` er nøklet «repo#nr», `koer` er PR-numre per repo (mangler
 * repoet, har det ingen kø), `filer` er pin-fila per ref. `etterKall` kjøres etter hvert kall,
 * så testen kan flytte tilstanden (køen tømmes, PR-en merges) mens jobben venter.
 */
function lagGitHub(start: Partial<Record<string, any>> = {}) {
  const s: Record<string, any> = {
    prs: {},
    standard: { 'melosys-e2e-tests': 'main' },
    koer: { 'melosys-e2e-tests': [], 'melosys-web': [], 'melosys-skjema-api': [] },
    filer: {},
    refs: { main: 'main-sha' },
    runs: {},
    apnePulls: [],
    refFlyttet: false,
    etterKall: () => {},
    ...start,
  };
  const kall: { metode: string; sti: string; body: any; operasjon?: string }[] = [];
  const svar = (status: number, data: any) => ({ ok: status < 300, status, text: async () => JSON.stringify(data) });

  const fetch = async (url: string, init: any = {}) => {
    const metode = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    const sti = url.replace('https://api.github.com', '');
    const operasjon = body?.query ? /^\s*(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1] : undefined;
    kall.push({ metode, sti, body, operasjon });
    try {
      return håndter(metode, sti, body, operasjon);
    } finally {
      s.etterKall(s, kall);
    }
  };

  function håndter(metode: string, sti: string, body: any, operasjon?: string) {
    if (sti === '/graphql') {
      const v = body.variables;
      const pr = s.prs[`${v.repo}#${v.nr}`];
      switch (operasjon) {
        case 'Pr':
          if (!pr) return svar(200, { data: { repository: null }, errors: [{ message: 'Could not resolve to a PullRequest' }] });
          return svar(200, { data: { repository: { defaultBranchRef: { name: s.standard[v.repo] ?? 'master' }, pullRequest: pr } } });
        case 'Ko': {
          const ko = s.koer[v.repo];
          const mergeQueue = ko
            ? { entries: { totalCount: ko.length, nodes: ko.map((n: number) => ({ pullRequest: { number: n } })) } }
            : null;
          return svar(200, { data: { repository: { mergeQueue } } });
        }
        case 'SettIKo':
        case 'AutoMerge': {
          const funnet = Object.values(s.prs).find((p: any) => p.id === v.id) as Pr;
          if (operasjon === 'SettIKo') funnet.isInMergeQueue = true;
          else funnet.autoMergeRequest = { enabledAt: 'nå' };
          return svar(200, { data: {} });
        }
      }
      throw new Error(`ukjent GraphQL-operasjon ${operasjon}`);
    }
    const m = /^\/repos\/navikt\/([^/]+)\/(.*)$/.exec(sti);
    if (!m) throw new Error(`ukjent sti ${sti}`);
    const [, , rest] = m;
    let r: RegExpExecArray | null;
    if ((r = /^contents\/\.github\/e2e-pins\.json\?ref=(.*)$/.exec(rest))) {
      const tekst = s.filer[decodeURIComponent(r[1])];
      return tekst == null ? svar(404, { message: 'Not Found' }) : svar(200, { content: Buffer.from(tekst).toString('base64') });
    }
    if ((r = /^git\/ref\/heads\/(.*)$/.exec(rest))) return svar(200, { object: { sha: s.refs[decodeURIComponent(r[1])] } });
    if ((r = /^git\/commits\/(.*)$/.exec(rest)) && metode === 'GET') return svar(200, { tree: { sha: `tre-${r[1]}` } });
    if (rest === 'git/trees') return svar(201, { sha: 'nytt-tre' });
    if (rest === 'git/commits') return svar(201, { sha: 'ny-commit' });
    if ((r = /^git\/refs\/heads\/(.*)$/.exec(rest)) && metode === 'PATCH') {
      if (s.refFlyttet) return svar(422, { message: 'Update is not a fast forward' });
      s.refs[decodeURIComponent(r[1])] = body.sha;
      return svar(200, {});
    }
    if (rest === 'git/refs' && metode === 'POST') {
      const navn = body.ref.replace('refs/heads/', '');
      if (s.refs[navn]) return svar(422, { message: 'Reference already exists' });
      s.refs[navn] = body.sha;
      return svar(201, {});
    }
    if (rest.startsWith('pulls?')) return svar(200, s.apnePulls);
    if (rest === 'pulls' && metode === 'POST') {
      s.prs['melosys-e2e-tests#999'] = lagPr('melosys-e2e-tests', 999, { headRefName: body.head, title: body.title });
      return svar(201, { number: 999, html_url: 'https://github.com/navikt/melosys-e2e-tests/pull/999' });
    }
    if ((r = /^actions\/runs\?head_sha=([^&]+)/.exec(rest))) return svar(200, { workflow_runs: s.runs[r[1]] ?? [] });
    throw new Error(`ukjent kall ${metode} ${sti}`);
  }

  return { s, kall, fetch };
}

/** Kjører en jobb mot den falske GitHuben med en klokke som går fram når jobben sover. */
async function kjorJobb(gh: ReturnType<typeof lagGitHub>, jobb: string, args: string[] = [], env: Record<string, string> = {}) {
  let t = 0;
  const logg: string[] = [];
  const sammendrag: string[] = [];
  const utdata: Record<string, string> = {};
  await kjor(jobb, args, {
    env: { GH_TOKEN: 't0', TAG, E2E_PR: '380', TJENESTER: 'melosys-web#3253', DRY_RUN: 'false', RUN_URL: 'https://run', ...env },
    fetch: gh.fetch,
    sleep: async (ms: number) => {
      t += ms;
    },
    now: () => t,
    logg: (l: string) => logg.push(l),
    sammendrag: (l: string) => sammendrag.push(l),
    utdata: (k: string, v: string) => (utdata[k] = v),
  });
  return { logg, sammendrag, utdata, tid: () => t };
}

const skriveKall = (kall: { metode: string; sti: string; body: any; operasjon?: string }[]) =>
  kall.filter((k) => (k.sti === '/graphql' ? /^\s*mutation\b/.test(k.body.query) : k.metode !== 'GET'));

const pinTekst = (o: Record<string, string>) => JSON.stringify(o, null, 2) + '\n';

/** Et åpent par: e2e #380 med pinnen på head, melosys-web #3253 klar. */
function aaptPar(felt: { e2e?: Pr; web?: Pr } = {}) {
  return lagGitHub({
    prs: {
      'melosys-e2e-tests#380': lagPr('melosys-e2e-tests', 380, felt.e2e),
      'melosys-web#3253': lagPr('melosys-web', 3253, felt.web),
    },
    refs: { main: 'main-sha', 'gren-380': 'head-380' },
    filer: { 'head-380': pinTekst({ 'melosys-web': TAG }) },
  });
}

// ---------------------------------------------------------------- input

test('input: tag, e2e_pr og tjenester valideres', () => {
  const ok = { tag: TAG, e2ePr: '380', tjenester: 'melosys-web#3253', requestedBy: 'rune', dryRun: 'false' };
  assert.deepEqual(lesInput(ok).tjenester, [{ repo: 'melosys-web', pr: 3253, nokkel: 'melosys-web' }]);
  for (const tag of ['br-abc', '38725776923', 'br-1\n', 'latest', '', 'br-']) {
    assert.throws(() => lesInput({ ...ok, tag }), /tag må være br-<run_id>/, JSON.stringify(tag));
  }
  for (const e2ePr of ['0', 'abc', '', '12a', '-1']) {
    assert.throws(() => lesInput({ ...ok, e2ePr }), /e2e_pr må være/, e2ePr);
  }
  for (const tjenester of ['melosys-web', 'melosys-web#0', 'melosys-web#', 'melosys-web 3253', 'melosys-web#1#2']) {
    assert.throws(() => lesInput({ ...ok, tjenester }), /ikke på formen <repo>#<pr>/, tjenester);
  }
  assert.throws(() => lesInput({ ...ok, tjenester: ' , ' }), /minst én/);
  assert.throws(() => lesInput({ ...ok, dryRun: 'ja' }), /dry_run/);
});

test('input: ukjent repo avvises; melosys-docker-compose er melosys-mock', () => {
  const ok = { tag: TAG, e2ePr: '380', tjenester: '', requestedBy: '', dryRun: '' };
  for (const repo of ['melosys-foo', 'melosys-mock', 'constructor', '__proto__', 'melosys-e2e-tests']) {
    assert.throws(() => lesInput({ ...ok, tjenester: `${repo}#1` }), /Ukjent repo/, repo);
  }
  assert.throws(() => lesInput({ ...ok, tjenester: 'melosys-web#1,melosys-web#2' }), /to ganger/);

  const inp = lesInput({ ...ok, tjenester: 'melosys-skjema-api#422, melosys-docker-compose#9,melosys-skjema-web#695' });
  assert.deepEqual(inp.tjenester, [
    { repo: 'melosys-skjema-api', pr: 422, nokkel: 'melosys-skjema-api' },
    { repo: 'melosys-docker-compose', pr: 9, nokkel: 'melosys-mock' },
    { repo: 'melosys-skjema-web', pr: 695, nokkel: 'melosys-skjema-web' },
  ]);
  assert.equal(inp.dryRun, false);
  assert.equal(inp.bestiller, 'ukjent');
});

test('requested_by vaskes som i e2e-brancher.yml', () => {
  assert.equal(vaskBestiller('Rune\n::error::x #1'), 'Rune::error::x 1');
  assert.equal(vaskBestiller('a'.repeat(150)).length, 100);
  assert.equal(vaskBestiller(''), 'ukjent');
  assert.equal(vaskBestiller(undefined), 'ukjent');
});

// ---------------------------------------------------------------- pinner

test('leggTilPinner beholder andre pinner og er idempotent', () => {
  const før = pinTekst({ 'melosys-api': 'br-1', 'melosys-web': 'br-2' });
  const en = leggTilPinner(før, ['melosys-web', 'melosys-mock'], TAG);
  assert.equal(en.endret, true);
  assert.deepEqual(JSON.parse(en.tekst), { 'melosys-api': 'br-1', 'melosys-web': TAG, 'melosys-mock': TAG });
  const to = leggTilPinner(en.tekst, ['melosys-web', 'melosys-mock'], TAG);
  assert.equal(to.endret, false);
  assert.equal(to.tekst, en.tekst);

  assert.deepEqual(JSON.parse(leggTilPinner(null, ['melosys-web'], TAG).tekst), { 'melosys-web': TAG });
  assert.throws(() => leggTilPinner('{"ukjent": "br-1"}', ['melosys-web'], TAG), /ukjent tjeneste/);
});

test('fjernPinner fjerner bare nøkler som fortsatt står på taggen', () => {
  const tekst = pinTekst({ 'melosys-api': TAG, 'melosys-web': TAG, 'melosys-mock': 'br-9' });
  const r = fjernPinner(tekst, ['melosys-web', 'melosys-mock'], TAG);
  assert.deepEqual(r.fjernet, ['melosys-web']);
  assert.equal(r.endret, true);
  // melosys-api er ikke i paret; melosys-mock er pinnet av en annen endring.
  assert.deepEqual(JSON.parse(r.tekst), { 'melosys-api': TAG, 'melosys-mock': 'br-9' });

  const tom = fjernPinner(pinTekst({ 'melosys-web': TAG }), ['melosys-web'], TAG);
  assert.equal(tom.tekst, null);
  assert.equal(tom.endret, true);

  for (const t of [null, '', pinTekst({ 'melosys-web': 'br-1' })]) {
    assert.equal(fjernPinner(t, ['melosys-web'], TAG).endret, false);
  }
});

// ---------------------------------------------------------------- kø og deploy

test('sjekkPr og andreIKo', () => {
  const navn = 'x #1';
  assert.equal(sjekkPr(lagPr('melosys-web', 1), { navn, base: 'master' }), 'åpen');
  assert.equal(sjekkPr(lagPr('melosys-web', 1, { state: 'MERGED' }), { navn, base: 'master' }), 'merget');
  assert.throws(() => sjekkPr(lagPr('melosys-web', 1, { state: 'CLOSED' }), { navn, base: 'master' }), /CLOSED, ikke OPEN/);
  assert.throws(() => sjekkPr(lagPr('melosys-web', 1, { isDraft: true }), { navn, base: 'master' }), /utkast/);
  assert.throws(() => sjekkPr(lagPr('melosys-web', 1, { isInMergeQueue: true }), { navn, base: 'master' }), /står i merge-køen/);
  assert.throws(() => sjekkPr(lagPr('melosys-web', 1, { mergeStateStatus: 'DIRTY' }), { navn, base: 'master' }), /konflikter/);
  assert.throws(() => sjekkPr(lagPr('melosys-web', 1), { navn, base: 'main' }), /går mot master/);
  const fork = lagPr('melosys-e2e-tests', 1, { headRepository: { nameWithOwner: 'noen/melosys-e2e-tests' } });
  assert.throws(() => sjekkPr(fork, { navn, base: 'main', egetRepo: 'navikt/melosys-e2e-tests' }), /fork/);
  assert.throws(() => sjekkPr(lagPr('x', 1, { reviewDecision: 'REVIEW_REQUIRED' }), { navn, base: 'master' }), /godkjenning/);

  const ko = { entries: { nodes: [{ pullRequest: { number: 7 } }, { pullRequest: { number: 3253 } }] } };
  assert.equal(andreIKo(ko, { repo: 'r', branch: 'b', prNummer: 3253 }), 1);
  assert.throws(() => andreIKo(null, { repo: 'r', branch: 'b', prNummer: 1 }), /har ingen merge-kø på b/);
});

test('velgKoHandling og tolkKoPoll', () => {
  const h = (felt: Pr) => velgKoHandling(lagPr('r', 1, felt), 'r #1');
  assert.equal(h({ state: 'MERGED' }), 'merget');
  assert.equal(h({ isInMergeQueue: true }), 'i-ko');
  assert.equal(h({ autoMergeRequest: {} }), 'auto-merge-på');
  for (const m of ['CLEAN', 'HAS_HOOKS', 'UNSTABLE', 'BEHIND']) assert.equal(h({ mergeStateStatus: m }), 'sett-i-ko', m);
  assert.equal(h({ mergeStateStatus: 'BLOCKED' }), 'vent-på-sjekker');
  assert.equal(h({ mergeStateStatus: 'UNKNOWN', viewerCanEnableAutoMerge: true }), 'slå-på-auto-merge');
  assert.throws(() => h({ mergeStateStatus: 'DIRTY' }), /konflikter/);
  assert.throws(() => h({ state: 'CLOSED' }), /CLOSED/);

  const p = (felt: Pr) => tolkKoPoll(lagPr('r', 1, felt));
  assert.equal(p({ state: 'MERGED' }), 'merget');
  assert.equal(p({ state: 'CLOSED' }), 'lukket');
  assert.equal(p({ isInMergeQueue: true }), 'venter');
  assert.equal(p({ autoMergeRequest: {} }), 'venter');
  assert.equal(p({}), 'ute');
});

test('deploy-kjøringen finnes for begge navneformene, og nyeste vinner', () => {
  const runs = [
    { id: 1, name: 'Integration Tests (Playback)', created_at: '2026-10-22T10:05:00Z', status: 'completed', conclusion: 'success' },
    { id: 2, name: 'deploy-dev', created_at: '2026-10-22T10:00:00Z', status: 'completed', conclusion: 'failure' },
    { id: 3, name: 'deploy-dev', created_at: '2026-10-22T10:30:00Z', status: 'in_progress', conclusion: null },
    { id: 4, name: 'Publish Types', created_at: '2026-10-22T11:00:00Z', status: 'completed', conclusion: 'success' },
  ];
  assert.equal(velgDeployKjoring(runs).id, 3);
  assert.equal(velgDeployKjoring([{ id: 5, name: 'Build and Push melosys-mock', created_at: 'x' }]).id, 5);
  assert.equal(velgDeployKjoring([{ id: 6, name: 'deploy til Q2', created_at: 'x' }]).id, 6);
  assert.equal(velgDeployKjoring([runs[0], runs[3]]), null);
  assert.equal(tolkDeploy(null), 'mangler');
  assert.equal(tolkDeploy(runs[2]), 'venter');
  assert.equal(tolkDeploy(runs[1]), 'feilet');
  assert.equal(tolkDeploy(runs[0]), 'ok');
});

// ---------------------------------------------------------------- jobbene

test('sjekk: en service-kø med andre PR-er stopper kjøringen', async () => {
  const gh = aaptPar();
  gh.s.koer['melosys-web'] = [11, 12];
  await assert.rejects(kjorJobb(gh, 'sjekk'), /melosys-web har 2 PR-er i køen\. Vent til køen er tom og start på nytt\./);
  gh.s.koer['melosys-web'] = [];
  const { sammendrag } = await kjorJobb(gh, 'sjekk');
  assert.match(sammendrag.join(), /Paret er klart/);
  delete gh.s.koer['melosys-web'];
  await assert.rejects(kjorJobb(gh, 'sjekk'), /melosys-web har ingen merge-kø på master/);
});

test('sjekk: merget e2e-PR uten pinnen er ikke OPEN; med pinnen fortsetter kjøringen', async () => {
  const gh = aaptPar({ e2e: { state: 'MERGED', mergeCommit: { oid: 'm-380' } }, web: { state: 'MERGED' } });
  await assert.rejects(kjorJobb(gh, 'sjekk'), /e2e #380 er MERGED, ikke OPEN/);
  gh.s.filer['m-380'] = pinTekst({ 'melosys-web': TAG });
  const { logg } = await kjorJobb(gh, 'sjekk');
  assert.match(logg.join('\n'), /allerede merget med pinnen/);
  assert.equal(skriveKall(gh.kall).length, 0);
});

test('pin: committer oppå head, hopper over når pinnen står, og stopper når branchen er flyttet', async () => {
  const gh = aaptPar();
  gh.s.filer['head-380'] = pinTekst({ 'melosys-api': 'br-1' });
  await kjorJobb(gh, 'pin');
  const tre = gh.kall.find((k) => k.sti.endsWith('/git/trees'))!;
  assert.deepEqual(JSON.parse(tre.body.tree[0].content), { 'melosys-api': 'br-1', 'melosys-web': TAG });
  const commit = gh.kall.find((k) => k.sti.endsWith('/git/commits') && k.metode === 'POST')!;
  assert.deepEqual(commit.body.parents, ['head-380']);
  assert.equal(commit.body.message, `TEK Pin melosys-web til ${TAG}`);
  const patch = gh.kall.find((k) => k.metode === 'PATCH')!;
  assert.equal(patch.body.force, false);
  assert.equal(gh.s.refs['gren-380'], 'ny-commit');

  const ferdig = aaptPar();
  await kjorJobb(ferdig, 'pin');
  assert.equal(skriveKall(ferdig.kall).length, 0, 'pinnen sto allerede');

  const flyttet = aaptPar();
  flyttet.s.filer['head-380'] = null;
  flyttet.s.refFlyttet = true;
  await assert.rejects(kjorJobb(flyttet, 'pin'), /gren-380 er endret siden jobben leste den \(head-380\)/);
});

test('service: venter til køen er tom, setter PR-en i kø uten køhopp og venter på merge', async () => {
  const gh = aaptPar({ e2e: { state: 'MERGED' } });
  gh.s.koer['melosys-web'] = [11];
  let koLesinger = 0;
  gh.s.etterKall = (s: any, kall: any[]) => {
    const siste = kall[kall.length - 1];
    if (siste.operasjon === 'Ko' && ++koLesinger === 3) s.koer['melosys-web'] = [];
    const pr = s.prs['melosys-web#3253'];
    if (pr.isInMergeQueue && siste.operasjon === 'Pr' && kall.filter((k) => k.operasjon === 'Pr').length > 8) {
      Object.assign(pr, { state: 'MERGED', isInMergeQueue: false });
    }
  };
  const { tid } = await kjorJobb(gh, 'service', ['melosys-web', '3253']);
  const i = gh.kall.findIndex((k) => k.operasjon === 'SettIKo');
  assert.ok(i > 0, 'PR-en ble satt i kø');
  // Køen tømmes etter tredje lesing, så fjerde lesing er den første som ser den tom.
  assert.equal(gh.kall.filter((k, j) => k.operasjon === 'Ko' && j < i).length, 4, 'satt i kø først når køen var tom');
  assert.equal(gh.kall[i].body.query.includes('jump'), false);
  assert.equal(gh.kall[i].body.variables.oid, 'head-3253');
  assert.equal(gh.s.prs['melosys-web#3253'].state, 'MERGED');
  assert.ok(tid() >= 2 * GRENSER.intervall);
});

test('service: en kø som aldri tømmes, gir tidsavbrudd etter 60 min uten at PR-en settes i kø', async () => {
  const gh = aaptPar({ e2e: { state: 'MERGED' } });
  gh.s.koer['melosys-web'] = [11];
  await assert.rejects(kjorJobb(gh, 'service', ['melosys-web', '3253']), /melosys-web-køen var ikke tom etter 60 min/);
  assert.equal(skriveKall(gh.kall).length, 0);
});

test('service: PR-en går ikke i kø før de foran er merget', async () => {
  const gh = aaptPar();
  await assert.rejects(kjorJobb(gh, 'service', ['melosys-web', '3253']), /e2e #380 er ikke merget ennå/);
  assert.equal(skriveKall(gh.kall).length, 0);
});

test('e2e-ko: en PR som faller ut av køen uten merge, feiler jobben; ett glipp tåles', async () => {
  const gh = aaptPar();
  let lesinger = 0;
  gh.s.etterKall = (s: any, kall: any[]) => {
    const pr = s.prs['melosys-e2e-tests#380'];
    if (kall[kall.length - 1].operasjon !== 'Pr' || !kall.some((k) => k.operasjon === 'SettIKo')) return;
    lesinger += 1;
    // Én lesing uten oppføring (køen henger etter), så tilbake i køen, så ute for godt.
    pr.isInMergeQueue = lesinger === 2 || lesinger === 3;
  };
  await assert.rejects(
    kjorJobb(gh, 'e2e-ko'),
    /e2e-PR-en ble tatt ut av køen\. Se kjøringen i køen, rett og start på nytt\./,
  );
  assert.ok(lesinger >= 5, `glippet på lesing 1 skal ikke feile jobben (${lesinger} lesinger)`);

  const lukket = aaptPar();
  lukket.s.etterKall = (s: any, kall: any[]) => {
    if (kall.some((k) => k.operasjon === 'SettIKo')) s.prs['melosys-e2e-tests#380'].state = 'CLOSED';
  };
  await assert.rejects(kjorJobb(lukket, 'e2e-ko'), /e2e-PR-en ble tatt ut av køen/);
});

test('e2e-ko: venter på sjekkene når auto-merge ikke er lov, og stopper når pinnen mangler', async () => {
  const gh = aaptPar({ e2e: { mergeStateStatus: 'BLOCKED' } });
  gh.s.etterKall = (s: any, kall: any[]) => {
    const pr = s.prs['melosys-e2e-tests#380'];
    if (kall.filter((k) => k.operasjon === 'Pr').length === 4) pr.mergeStateStatus = 'CLEAN';
    if (pr.isInMergeQueue && kall.filter((k) => k.operasjon === 'Pr').length > 6) Object.assign(pr, { state: 'MERGED', isInMergeQueue: false });
  };
  await kjorJobb(gh, 'e2e-ko');
  assert.deepEqual(skriveKall(gh.kall).map((k) => k.operasjon), ['SettIKo']);

  const uten = aaptPar();
  uten.s.filer['head-380'] = null;
  await assert.rejects(kjorJobb(uten, 'e2e-ko'), /pinner ikke melosys-web til br-38725776923/);
  assert.equal(skriveKall(uten.kall).length, 0);
});

test('latest: venter på deploy-kjøringen og feiler når den feiler', async () => {
  const gh = aaptPar({ web: { state: 'MERGED', mergeCommit: { oid: 'msha' } } });
  gh.s.runs.msha = [{ id: 1, name: 'deploy-dev', status: 'in_progress', created_at: 'a', html_url: 'u' }];
  let n = 0;
  gh.s.etterKall = (s: any, kall: any[]) => {
    if (kall[kall.length - 1].sti.includes('actions/runs') && ++n === 3) Object.assign(s.runs.msha[0], { status: 'completed', conclusion: 'success' });
  };
  const { sammendrag } = await kjorJobb(gh, 'latest', ['melosys-web', '3253']);
  assert.match(sammendrag.join(), /melosys-web latest har melosys-web #3253/);
  assert.equal(n, 3);

  gh.s.etterKall = () => {};
  gh.s.runs.msha = [{ id: 2, name: 'deploy-dev', status: 'completed', conclusion: 'failure', created_at: 'b', html_url: 'u2' }];
  await assert.rejects(kjorJobb(gh, 'latest', ['melosys-web', '3253']), /«deploy-dev» for msha i melosys-web endte med failure: u2/);
});

test('fjern-pin: åpner PR-en fra main, og main uten pinnen er ingen feil', async () => {
  const gh = aaptPar();
  gh.s.filer['main-sha'] = pinTekst({ 'melosys-web': TAG });
  gh.s.etterKall = (s: any) => {
    const pr = s.prs['melosys-e2e-tests#999'];
    if (pr?.isInMergeQueue) Object.assign(pr, { state: 'MERGED', isInMergeQueue: false });
  };
  await kjorJobb(gh, 'fjern-pin');
  const tre = gh.kall.find((k) => k.sti.endsWith('/git/trees'))!;
  assert.deepEqual(tre.body.tree[0], { path: '.github/e2e-pins.json', mode: '100644', type: 'blob', sha: null }, 'tom fil slettes');
  assert.deepEqual(gh.kall.find((k) => k.sti.endsWith('/git/commits') && k.metode === 'POST')!.body.parents, ['main-sha']);
  assert.equal(gh.s.refs[`fjern-pin-${TAG}`], 'ny-commit');
  const pr = gh.kall.find((k) => k.sti.endsWith('/pulls') && k.metode === 'POST')!;
  assert.equal(pr.body.title, `TEK Fjern pinnen for melosys-web (${TAG})`);
  assert.match(pr.body.body, /https:\/\/run/);
  assert.match(pr.body.body, /navikt\/melosys-web#3253/);
  assert.equal(gh.s.prs['melosys-e2e-tests#999'].state, 'MERGED');

  const tom = aaptPar();
  tom.s.filer['main-sha'] = pinTekst({ 'melosys-web': 'br-annen' });
  const { logg } = await kjorJobb(tom, 'fjern-pin');
  assert.match(logg.join(), /ingenting å fjerne/);
  assert.equal(skriveKall(tom.kall).length, 0);
});

test('dry_run: ingen jobb skriver, og alle fullfører', async () => {
  const gh = aaptPar({ e2e: { viewerCanEnableAutoMerge: true, mergeStateStatus: 'BLOCKED' } });
  gh.s.filer['head-380'] = null;
  gh.s.filer['main-sha'] = pinTekst({ 'melosys-web': TAG });
  gh.s.koer['melosys-web'] = [];
  const env = { DRY_RUN: 'true', APP_CLIENT_ID: 'Iv1', APP_PRIVATE_KEY: 'nøkkel' };
  for (const [jobb, args] of [
    ['input', []],
    ['sjekk', []],
    ['pin', []],
    ['e2e-ko', []],
    ['service', ['melosys-web', '3253']],
    ['latest', ['melosys-web', '3253']],
    ['fjern-pin', []],
  ] as [string, string[]][]) {
    const { logg } = await kjorJobb(gh, jobb, args, env);
    if (jobb !== 'input' && jobb !== 'sjekk') assert.match(logg.join('\n'), /dry_run/, jobb);
  }
  assert.ok(gh.kall.length > 10);
  assert.deepEqual(skriveKall(gh.kall), []);
  assert.ok(gh.kall.every((k) => k.metode === 'GET' || k.sti === '/graphql'));
});

test('dry_run-sperren i klienten stopper skriving selv om en jobb skulle prøve', async () => {
  const gh = aaptPar();
  gh.s.filer['head-380'] = null;
  // Med sperren alene (jobben tror den skal skrive) skal fetch aldri se skrivingen.
  const api = lagKlient({ token: 't', fetch: gh.fetch, dryRun: true });
  await assert.rejects(api.rest('POST', '/repos/navikt/melosys-e2e-tests/git/refs', {}), /dry_run: stoppet POST/);
  await assert.rejects(api.graphql('mutation X { a }', {}), /dry_run: stoppet en GraphQL-mutasjon/);
  assert.equal(gh.kall.length, 0);
});

test('app-tokenet byttes før det går ut', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const jwt = lagJwt('Iv1.abc', pem, 1_000_000);
  const [h, p, sig] = jwt.split('.');
  assert.ok(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, sig, 'base64url'));
  assert.equal(JSON.parse(Buffer.from(p, 'base64url').toString()).iss, 'Iv1.abc');

  let t = 0;
  const kall: any[] = [];
  const fetch = async (url: string, init: any = {}) => {
    kall.push({ url, init });
    const data = url.endsWith('/installation') ? { id: 42 } : { token: 't-ny' };
    return { ok: true, status: 200, text: async () => JSON.stringify(data) };
  };
  const kilde = lagTokenKilde({ token: 't0', klientId: 'Iv1.abc', nokkel: pem, repoer: ['melosys-e2e-tests'], fetch, now: () => t });
  assert.equal(await kilde(), 't0');
  t = 49 * MIN;
  assert.equal(await kilde(), 't0');
  t = 51 * MIN;
  assert.equal(await kilde(), 't-ny');
  assert.match(kall[1].url, /\/app\/installations\/42\/access_tokens$/);
  assert.deepEqual(JSON.parse(kall[1].init.body), { repositories: ['melosys-e2e-tests'] });
});

// ---------------------------------------------------------------- CLI og kontrakt

test('CLI: input skriver matrisen og repolista', () => {
  const script = join(__dirname, '..', 'scripts', 'koblet-merge.mjs');
  const ut = execFileSync(process.execPath, [script, 'input'], {
    env: { TAG, E2E_PR: '380', TJENESTER: 'melosys-docker-compose#5,melosys-web#3253' },
  }).toString();
  assert.match(ut, /matrix=\{"include":\[\{"repo":"melosys-docker-compose","pr":5,"nokkel":"melosys-mock"\}/);
  assert.match(ut, /repos=melosys-e2e-tests\nmelosys-docker-compose\nmelosys-web/);
  assert.throws(
    () => execFileSync(process.execPath, [script, 'input'], { env: { TAG: 'x', E2E_PR: '1', TJENESTER: 'melosys-web#1' }, stdio: 'pipe' }),
    (e: { status: number; stdout: Buffer }) => e.status === 1 && /::error::tag må være/.test(e.stdout.toString()),
  );
});

test('workflowen har jobbene og navnene konsollen leser', () => {
  const yml = readFileSync(join(__dirname, '..', '.github', 'workflows', 'koblet-merge.yml'), 'utf8');
  const jobber = [...yml.matchAll(/^  ([a-z0-9-]+):\n    name: "?(.+?)"?$/gm)].map(([, id, navn]) => [id, navn]);
  assert.deepEqual(jobber, [
    ['sjekk', 'Sjekk paret'],
    ['pin', 'Legg pinnen i e2e-PR-en'],
    ['e2e-ko', 'e2e-PR gjennom køen'],
    ['service', '${{ matrix.repo }} #${{ matrix.pr }} i køen'],
    ['latest', '${{ matrix.repo }} latest har endringen'],
    ['fjern-pin', 'Fjern pinnen'],
  ]);
  for (const inp of ['tag', 'e2e_pr', 'tjenester', 'requested_by', 'dry_run']) assert.match(yml, new RegExp(`^      ${inp}:$`, 'm'));
  assert.match(yml, /group: koblet-merge-\$\{\{ inputs\.tag \}\}\n  cancel-in-progress: false/);
  for (const jobb of ['sjekk', 'pin', 'e2e-ko', 'service', 'latest', 'fjern-pin']) {
    assert.match(yml, new RegExp(`koblet-merge\\.mjs ${jobb}\\b`), jobb);
  }
});

test('koblet-merge starter ikke e2e-suiten', () => {
  assert.equal(utenE2eEffekt('scripts/koblet-merge.mjs'), true);
  assert.equal(utenE2eEffekt('.github/workflows/koblet-merge.yml'), true);
  assert.equal(utenE2eEffekt('scripts/e2e-pins.mjs'), false, 'E2E Tests kjører e2e-pins.mjs');
});
