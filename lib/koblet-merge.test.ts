import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fjernPinner,
  hentMedNyeForsok,
  kjor,
  koStatus,
  leggTilPinner,
  lesInput,
  tolkLatest,
  vaskBestiller,
  // @ts-expect-error — .mjs uten typedeklarasjon; scriptet er ren node uten avhengigheter.
} from '../scripts/koblet-merge.mjs';
// @ts-expect-error — .mjs uten typedeklarasjon.
import { utenE2eEffekt } from '../scripts/affected-tests.mjs';

/**
 * Feilene som koster mest: en dry_run som skriver, en merget PR uten pinnen som godtas, en
 * service-PR som flettes i feil rekkefølge, og en PR som faller ut av køen uten at jobben feiler.
 */

const TAG = 'br-38725776923';
type Pr = Record<string, any>;

function lagPr(repo: string, nr: number, felt: Pr = {}): Pr {
  return {
    id: `PR_${repo}_${nr}`,
    number: nr,
    state: 'OPEN',
    isDraft: false,
    baseRefName: repo === 'melosys-e2e-tests' ? 'main' : 'master',
    headRefName: `gren-${nr}`,
    headRefOid: `head-${nr}`,
    headRepository: { nameWithOwner: `navikt/${repo}` },
    isInMergeQueue: false,
    mergeCommit: null,
    mergeStateStatus: 'CLEAN',
    ...felt,
  };
}

const pinTekst = (o: Record<string, string>) => JSON.stringify(o, null, 2) + '\n';
const svar = (status: number, data: any, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers });

/** En liten GitHub i minnet. `etterKall` kan flytte tilstanden mens et steg venter. */
function lagGitHub(start: Record<string, any> = {}) {
  const s: Record<string, any> = {
    prs: {},
    koer: { 'melosys-e2e-tests': 0, 'melosys-web': 0, 'melosys-api': 0 },
    filer: {},
    refs: { main: 'main-sha' },
    runs: {},
    jobs: {},
    apnePulls: [],
    etterKall: () => {},
    ...start,
  };
  const kall: { metode: string; sti: string; body: any }[] = [];
  const fetch = async (url: string, init: any = {}) => {
    const metode = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    const sti = url.replace('https://api.github.com', '');
    kall.push({ metode, sti, body });
    try {
      return håndter(metode, sti, body);
    } finally {
      s.etterKall(s, kall);
    }
  };
  function håndter(metode: string, sti: string, body: any) {
    if (sti === '/graphql') {
      const v = body.variables;
      const op = /^\s*(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1];
      if (op === 'Pr') {
        const pr = s.prs[`${v.repo}#${v.nr}`];
        const standard = v.repo === 'melosys-e2e-tests' ? 'main' : 'master';
        return svar(200, { data: { repository: { defaultBranchRef: { name: standard }, pullRequest: pr ?? null } } });
      }
      if (op === 'Ko') {
        const n = s.koer[v.repo];
        return svar(200, { data: { repository: { mergeQueue: n === undefined ? null : { entries: { totalCount: n } } } } });
      }
      if (op === 'SettIKo') {
        (Object.values(s.prs).find((p: any) => p.id === v.id) as Pr).isInMergeQueue = true;
        return svar(200, { data: {} });
      }
      throw new Error(`ukjent GraphQL ${op}`);
    }
    const rest = sti.replace(/^\/repos\/navikt\/[^/]+\//, '');
    let r: RegExpExecArray | null;
    if ((r = /^contents\/\.github\/e2e-pins\.json\?ref=(.*)$/.exec(rest))) {
      const t = s.filer[decodeURIComponent(r[1])];
      return t == null ? svar(404, { message: 'Not Found' }) : svar(200, { content: Buffer.from(t).toString('base64') });
    }
    if ((r = /^git\/ref\/heads\/(.*)$/.exec(rest))) {
      const sha = s.refs[decodeURIComponent(r[1])];
      return sha ? svar(200, { object: { sha } }) : svar(404, { message: 'Not Found' });
    }
    if ((r = /^git\/commits\/(.*)$/.exec(rest)) && metode === 'GET') return svar(200, { tree: { sha: `tre-${r[1]}` } });
    if (rest === 'git/trees') return svar(201, { sha: 'nytt-tre' });
    if (rest === 'git/commits') return svar(201, { sha: 'ny-commit' });
    if ((r = /^git\/refs\/heads\/(.*)$/.exec(rest)) && metode === 'PATCH') {
      s.refs[decodeURIComponent(r[1])] = body.sha;
      return svar(200, {});
    }
    if (rest === 'git/refs' && metode === 'POST') return svar(201, {});
    if (rest.startsWith('pulls?')) return svar(200, s.apnePulls);
    if (rest === 'pulls' && metode === 'POST') return svar(201, { number: 999, html_url: 'https://x/999' });
    if ((r = /^actions\/runs\?head_sha=([^&]+)/.exec(rest))) return svar(200, { workflow_runs: s.runs[r[1]] ?? [] });
    if ((r = /^actions\/runs\/(\d+)\/jobs/.exec(rest))) return svar(200, { jobs: s.jobs[r[1]] ?? [] });
    throw new Error(`ukjent kall ${metode} ${sti}`);
  }
  return { s, kall, fetch };
}

async function kjorSteg(gh: ReturnType<typeof lagGitHub>, steg: string, args: string[] = [], env: Record<string, string> = {}) {
  let t = 0;
  const logg: string[] = [];
  const utdata: Record<string, string> = {};
  await kjor(steg, args, {
    env: { GH_TOKEN: 't', TAG, E2E_PR: '380', TJENESTER: 'melosys-web#3253', DRY_RUN: 'false', ...env },
    fetch: gh.fetch,
    sleep: async (ms: number) => void (t += ms),
    now: () => t,
    logg: (l: string) => logg.push(l),
    sammendrag: (l: string) => logg.push(l),
    utdata: (k: string, v: string) => (utdata[k] = v),
  });
  return { logg, utdata, tid: t };
}

const skriveKall = (kall: { metode: string; sti: string; body: any }[]) =>
  kall.filter((k) => (k.sti === '/graphql' ? /^\s*mutation\b/.test(k.body.query) : k.metode !== 'GET'));

function par(felt: { e2e?: Pr; web?: Pr; api?: Pr } = {}, start: Record<string, any> = {}) {
  return lagGitHub({
    prs: {
      'melosys-e2e-tests#380': lagPr('melosys-e2e-tests', 380, felt.e2e),
      'melosys-web#3253': lagPr('melosys-web', 3253, felt.web),
      'melosys-api#100': lagPr('melosys-api', 100, felt.api),
    },
    refs: { main: 'main-sha', 'gren-380': 'head-380' },
    filer: { 'head-380': pinTekst({ 'melosys-web': TAG }), 'merge-380': pinTekst({ 'melosys-web': TAG }) },
    ...start,
  });
}

// ---------------------------------------------------------------- rene funksjoner

test('input: format og repoer uten merge-kø avvises', () => {
  const ok = { tag: TAG, e2ePr: '380', tjenester: 'melosys-web#3253, melosys-api#1', requestedBy: 'x', dryRun: 'true' };
  assert.deepEqual(lesInput(ok).tjenester, [{ repo: 'melosys-web', pr: 3253 }, { repo: 'melosys-api', pr: 1 }]);
  assert.equal(lesInput(ok).dryRun, true);
  for (const tag of ['br-abc', '38725776923', 'latest', '']) assert.throws(() => lesInput({ ...ok, tag }), /tag må være/);
  assert.throws(() => lesInput({ ...ok, e2ePr: '0' }), /e2e_pr/);
  assert.throws(() => lesInput({ ...ok, tjenester: '' }), /minst én/);
  assert.throws(() => lesInput({ ...ok, tjenester: 'melosys-web' }), /<repo>#<pr>/);
  assert.throws(() => lesInput({ ...ok, tjenester: 'melosys-web#1,melosys-web#2' }), /to ganger/);
  for (const repo of ['melosys-docker-compose', 'melosys-mock', 'melosys-trygdeavgift-beregning']) {
    assert.throws(() => lesInput({ ...ok, tjenester: `${repo}#1` }), new RegExp(`${repo} har ingen merge-kø; bruk den manuelle oppskriften`));
  }
});

test('requested_by: kontrolltegn, # og @ fjernes, maks 100 tegn', () => {
  assert.equal(vaskBestiller('@rune\n#1 @team'), 'rune1 team');
  assert.equal(vaskBestiller('a'.repeat(150)).length, 100);
  assert.equal(vaskBestiller('@#'), 'ukjent');
  assert.equal(vaskBestiller(undefined), 'ukjent');
});

test('pinner: legges til og fjernes idempotent, andre pinner står', () => {
  const start = pinTekst({ 'melosys-api': 'br-1' });
  const lagt = leggTilPinner(start, ['melosys-web'], TAG);
  assert.equal(lagt.endret, true);
  assert.deepEqual(JSON.parse(lagt.tekst), { 'melosys-api': 'br-1', 'melosys-web': TAG });
  assert.equal(leggTilPinner(lagt.tekst, ['melosys-web'], TAG).endret, false);
  assert.equal(leggTilPinner(null, ['melosys-web'], TAG).endret, true);

  const fjernet = fjernPinner(lagt.tekst, ['melosys-web', 'melosys-api'], TAG);
  assert.deepEqual(fjernet.fjernet, ['melosys-web'], 'melosys-api står på en annen tag');
  assert.equal(fjernet.tekst, start);
  assert.equal(fjernPinner(fjernet.tekst, ['melosys-web'], TAG).endret, false);
  assert.equal(fjernPinner(pinTekst({ 'melosys-web': TAG }), ['melosys-web'], TAG).tekst, null, 'tom fil slettes');
});

test('koStatus: klare tilstander, venting, kø, merget og feil', () => {
  for (const m of ['CLEAN', 'HAS_HOOKS', 'UNSTABLE', 'BEHIND']) assert.equal(koStatus(lagPr('r', 1, { mergeStateStatus: m }), 'x'), 'klar');
  for (const m of ['BLOCKED', 'UNKNOWN']) assert.equal(koStatus(lagPr('r', 1, { mergeStateStatus: m }), 'x'), 'vent');
  assert.equal(koStatus(lagPr('r', 1, { isInMergeQueue: true }), 'x'), 'i-ko');
  assert.equal(koStatus(lagPr('r', 1, { state: 'MERGED' }), 'x'), 'merget');
  assert.throws(() => koStatus(lagPr('r', 1, { mergeStateStatus: 'DIRTY' }), 'x'), /konflikter/);
  assert.throws(() => koStatus(lagPr('r', 1, { state: 'CLOSED' }), 'x'), /CLOSED/);
});

test('latest: Build grønn er nok selv om deploy feiler; Build rød feiler', () => {
  const jobb = (name: string, conclusion: string | null, status = 'completed') => ({ name, status, conclusion });
  assert.equal(tolkLatest([jobb('Build', 'success'), jobb('deploy', 'failure')]), 'klar');
  assert.equal(tolkLatest([jobb('Build app and push docker image to GAR', 'success')]), 'klar');
  assert.equal(tolkLatest([jobb('Build', 'failure'), jobb('deploy', 'skipped')]), 'feilet');
  assert.equal(tolkLatest([jobb('Build', null, 'in_progress')]), 'venter');
  assert.equal(tolkLatest([]), 'venter');
});

// ---------------------------------------------------------------- nye forsøk

function fetchSomSvarer(...svarListe: (Response | Error)[]) {
  const kall: string[] = [];
  return {
    kall,
    fetch: async (url: string) => {
      kall.push(url);
      const s = svarListe.shift();
      if (s instanceof Error) throw s;
      return s;
    },
  };
}

const retryCtx = (fetch: any) => {
  const sover: number[] = [];
  return { ctx: { fetch, sleep: async (ms: number) => void sover.push(ms), logg: () => {} }, sover };
};

test('nye forsøk: 502 og ECONNRESET prøves igjen, så lykkes kallet', async () => {
  const nettfeil = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
  const f = fetchSomSvarer(svar(502, {}), nettfeil, svar(200, { ok: 1 }));
  const { ctx, sover } = retryCtx(f.fetch);
  const res = await hentMedNyeForsok(ctx, 'u', {}, 'GET /x');
  assert.equal(res.status, 200);
  assert.equal(f.kall.length, 3);
  assert.deepEqual(sover, [5000, 10000]);
});

test('nye forsøk: rate limit prøves igjen; annen 4xx og vedvarende nettfeil gir opp', async () => {
  const rl = fetchSomSvarer(svar(403, {}, { 'x-ratelimit-remaining': '0' }), svar(429, {}, { 'retry-after': '2' }), svar(200, {}));
  const a = retryCtx(rl.fetch);
  assert.equal((await hentMedNyeForsok(a.ctx, 'u', {}, 'x')).status, 200);
  assert.deepEqual(a.sover, [5000, 2000]);

  for (const status of [403, 404, 422]) {
    const f = fetchSomSvarer(svar(status, { message: 'nei' }));
    assert.equal((await hentMedNyeForsok(retryCtx(f.fetch).ctx, 'u', {}, 'x')).status, status);
    assert.equal(f.kall.length, 1, `${status} prøves ikke igjen`);
  }
  const e = new TypeError('fetch failed');
  const nede = fetchSomSvarer(e, e, e, e, svar(200, {}));
  await assert.rejects(hentMedNyeForsok(retryCtx(nede.fetch).ctx, 'u', {}, 'GET /x'), /GET \/x feilet etter 4 forsøk/);
  assert.equal(nede.kall.length, 4);
});

test('API-feil: 4xx feiler med meldingen fra GitHub, og en HTML-side tåles', async () => {
  const gh = par();
  const fetch = gh.fetch;
  gh.fetch = (async (url: string, init: any) =>
    url.endsWith('/graphql') ? new Response('<html>Bad gateway</html>', { status: 400 }) : fetch(url, init)) as any;
  await assert.rejects(kjorSteg(gh, 'pin-sjekk'), /GraphQL ga HTTP 400: <html>Bad gateway<\/html>/);
});

// ---------------------------------------------------------------- sjekk paret

test('sjekk: åpent par og PR-er i kø godtas', async () => {
  await kjorSteg(par(), 'sjekk');
  await kjorSteg(par({ e2e: { isInMergeQueue: true }, web: { isInMergeQueue: true } }), 'sjekk');
});

test('sjekk: merget e2e-PR godtas bare med pinnen i merge-commiten', async () => {
  const merget = { state: 'MERGED', mergeCommit: { oid: 'merge-380' } };
  const { logg } = await kjorSteg(par({ e2e: merget }), 'sjekk');
  assert.ok(logg.some((l) => /fortsetter der forrige slapp/.test(l)));
  await kjorSteg(par({ e2e: merget, web: { state: 'MERGED' } }), 'sjekk');

  const utenPin = par({ e2e: { state: 'MERGED', mergeCommit: { oid: 'uten-pin' } } });
  await assert.rejects(kjorSteg(utenPin, 'sjekk'), /merget uten pinnen/);
  const annenTag = par({ e2e: merget });
  annenTag.s.filer['merge-380'] = pinTekst({ 'melosys-web': 'br-1' });
  await assert.rejects(kjorSteg(annenTag, 'sjekk'), /merget uten pinnen/);
});

test('sjekk: service-PR merget i feil rekkefølge stopper kjøringen', async () => {
  await assert.rejects(kjorSteg(par({ web: { state: 'MERGED' } }), 'sjekk'), /melosys-web #3253 er merget før/);
  const merget = { state: 'MERGED', mergeCommit: { oid: 'merge-380' } };
  const env = { TJENESTER: 'melosys-api#100,melosys-web#3253' };
  const pinner = pinTekst({ 'melosys-api': TAG, 'melosys-web': TAG });
  const utenApi = par({ e2e: merget, web: { state: 'MERGED' } });
  utenApi.s.filer['merge-380'] = pinner;
  await assert.rejects(kjorSteg(utenApi, 'sjekk', [], env), /melosys-web #3253 er merget før/);
  const iRekkefolge = par({ e2e: merget, api: { state: 'MERGED' }, web: { state: 'MERGED' } });
  iRekkefolge.s.filer['merge-380'] = pinner;
  await kjorSteg(iRekkefolge, 'sjekk', [], env);
});

test('sjekk: utkast, fork, feil base, konflikt og lukket PR stopper', async () => {
  const tilfeller: [Pr, RegExp][] = [
    [{ isDraft: true }, /utkast/],
    [{ headRepository: { nameWithOwner: 'fork/melosys-web' } }, /fork/],
    [{ baseRefName: 'dev' }, /går mot dev/],
    [{ mergeStateStatus: 'DIRTY' }, /konflikter/],
    [{ state: 'CLOSED' }, /CLOSED/],
  ];
  for (const [felt, feil] of tilfeller) await assert.rejects(kjorSteg(par({ web: felt }), 'sjekk'), feil);
  const gh = par();
  delete gh.s.prs['melosys-web#3253'];
  await assert.rejects(kjorSteg(gh, 'sjekk'), /Fant ikke melosys-web #3253/);
});

// ---------------------------------------------------------------- pinnen

test('pin: står pinnen på head, skrives ingenting; ellers committes den uten force', async () => {
  const har = par();
  const a = await kjorSteg(har, 'pin-sjekk');
  assert.deepEqual(a.utdata, { trengs: 'false', head: 'head-380' });
  const b = await kjorSteg(har, 'pin-skriv');
  assert.equal(b.utdata.head, 'head-380');
  assert.deepEqual(skriveKall(har.kall), []);

  const mangler = par();
  mangler.s.filer['head-380'] = pinTekst({ 'melosys-api': 'br-1' });
  assert.equal((await kjorSteg(mangler, 'pin-sjekk')).utdata.trengs, 'true');
  const c = await kjorSteg(mangler, 'pin-skriv');
  assert.equal(c.utdata.head, 'ny-commit');
  const tre = mangler.kall.find((k) => k.sti.endsWith('/git/trees'))!;
  assert.deepEqual(JSON.parse(tre.body.tree[0].content), { 'melosys-api': 'br-1', 'melosys-web': TAG });
  const patch = mangler.kall.find((k) => k.metode === 'PATCH')!;
  assert.match(patch.sti, /git\/refs\/heads\/gren-380$/);
  assert.deepEqual(patch.body, { sha: 'ny-commit', force: false });
});

test('pin: merget e2e-PR sjekkes mot merge-commiten', async () => {
  const ok = await kjorSteg(par({ e2e: { state: 'MERGED', mergeCommit: { oid: 'merge-380' } } }), 'pin-sjekk');
  assert.deepEqual(ok.utdata, { trengs: 'false', head: 'merge-380' });
  await assert.rejects(kjorSteg(par({ e2e: { state: 'MERGED', mergeCommit: { oid: 'x' } } }), 'pin-sjekk'), /merget uten pinnen/);
});

// ---------------------------------------------------------------- køene

test('e2e-klar: venter til PR-en er klar, og pinnen sjekkes på head-en som sendes til køen', async () => {
  const gh = par({ e2e: { mergeStateStatus: 'BLOCKED' } });
  gh.s.etterKall = (s: any, kall: any[]) => {
    if (kall.length === 2) Object.assign(s.prs['melosys-e2e-tests#380'], { mergeStateStatus: 'CLEAN', headRefOid: 'head-ny' });
  };
  gh.s.filer['head-ny'] = pinTekst({ 'melosys-web': TAG });
  const { utdata } = await kjorSteg(gh, 'e2e-klar');
  assert.deepEqual(utdata, { status: 'klar', id: 'PR_melosys-e2e-tests_380', head: 'head-ny' });
  assert.ok(gh.kall.some((k) => k.sti.endsWith('ref=head-ny')));

  gh.s.etterKall = () => {};
  delete gh.s.filer['head-ny'];
  await assert.rejects(kjorSteg(gh, 'e2e-klar'), /har ikke pinnen på head-ny/);
  await assert.rejects(kjorSteg(par({ e2e: { mergeStateStatus: 'BLOCKED' } }), 'e2e-klar'), /ble ikke klar for køen på 30 min/);
});

test('sett-i-ko: enqueuePullRequest med expectedHeadOid og uten køhopp', async () => {
  const gh = par();
  await kjorSteg(gh, 'sett-i-ko', ['melosys-e2e-tests'], { PR_ID: 'PR_melosys-e2e-tests_380', HEAD_OID: 'head-380' });
  const [m] = skriveKall(gh.kall);
  assert.match(m.body.query, /enqueuePullRequest\(input: \{ pullRequestId: \$id, expectedHeadOid: \$oid \}\)/);
  assert.doesNotMatch(m.body.query, /jump/);
  assert.deepEqual(m.body.variables, { id: 'PR_melosys-e2e-tests_380', oid: 'head-380' });
});

test('vent-merget: én lesing utenfor køen tåles, to på rad feiler', async () => {
  const blipp = par({ e2e: { isInMergeQueue: true } });
  blipp.s.etterKall = (s: any, kall: any[]) => {
    const pr = s.prs['melosys-e2e-tests#380'];
    if (kall.length === 1) pr.isInMergeQueue = false;
    if (kall.length === 2) pr.isInMergeQueue = true;
    if (kall.length === 4) pr.state = 'MERGED';
  };
  await kjorSteg(blipp, 'vent-merget', ['melosys-e2e-tests', '380']);

  const ute = par({ e2e: { isInMergeQueue: true } });
  ute.s.etterKall = (s: any, kall: any[]) => {
    if (kall.length === 1) s.prs['melosys-e2e-tests#380'].isInMergeQueue = false;
  };
  await assert.rejects(kjorSteg(ute, 'vent-merget', ['melosys-e2e-tests', '380']), /tatt ut av køen uten merge/);
  assert.equal(ute.kall.length, 3, 'feiler på andre lesing utenfor køen');
  await assert.rejects(kjorSteg(par({ e2e: { state: 'CLOSED' } }), 'vent-merget', ['melosys-e2e-tests', '380']), /tatt ut/);
});

test('service-klar: e2e-PR-en må være merget, og jobben venter på tom kø', async () => {
  await assert.rejects(kjorSteg(par(), 'service-klar', ['melosys-web', '3253']), /e2e-tests #380 er ikke merget/);

  const gh = par({ e2e: { state: 'MERGED' } }, { koer: { 'melosys-web': 2 } });
  gh.s.etterKall = (s: any, kall: any[]) => {
    if (kall.filter((k) => /query Ko/.test(k.body?.query ?? '')).length === 2) s.koer['melosys-web'] = 0;
  };
  const { utdata, tid } = await kjorSteg(gh, 'service-klar', ['melosys-web', '3253']);
  assert.equal(utdata.status, 'klar');
  assert.equal(tid, 60_000, 'to ventepauser før køen er tom');

  const full = par({ e2e: { state: 'MERGED' } }, { koer: { 'melosys-web': 1 } });
  await assert.rejects(kjorSteg(full, 'service-klar', ['melosys-web', '3253']), /ikke tom etter 60 min/);

  const iKo = par({ e2e: { state: 'MERGED' }, web: { isInMergeQueue: true } }, { koer: { 'melosys-web': 3 } });
  assert.equal((await kjorSteg(iKo, 'service-klar', ['melosys-web', '3253'])).utdata.status, 'i-ko');
  await assert.rejects(kjorSteg(par({ e2e: { state: 'MERGED' } }, { koer: {} }), 'service-klar', ['melosys-web', '3253']), /ingen merge-kø/);
});

test('latest-steget: venter på Build i deploy-kjøringen for merge-commiten', async () => {
  const gh = par({ web: { state: 'MERGED', mergeCommit: { oid: 'sha-web' } } }, {
    runs: { 'sha-web': [{ id: 7, name: 'deploy-dev', html_url: 'https://run/7' }, { id: 8, name: 'CodeQL' }] },
    jobs: { 7: [{ name: 'Build', status: 'in_progress', conclusion: null }] },
  });
  gh.s.etterKall = (s: any, kall: any[]) => {
    if (kall.length === 5) s.jobs[7] = [{ name: 'Build', status: 'completed', conclusion: 'success' }, { name: 'deploy', status: 'completed', conclusion: 'failure' }];
  };
  const { logg, tid } = await kjorSteg(gh, 'latest', ['melosys-web', '3253']);
  assert.ok(logg.some((l) => l.includes('https://run/7')));
  assert.ok(tid > 0, 'ventet på Build');
  assert.ok(gh.kall.some((k) => /head_sha=sha-web&event=push&branch=master/.test(k.sti)));

  gh.s.jobs[7] = [{ name: 'Build', status: 'completed', conclusion: 'failure' }];
  gh.s.etterKall = () => {};
  await assert.rejects(kjorSteg(gh, 'latest', ['melosys-web', '3253']), /Build-jobben i «deploy-dev» .* feilet/);
});

// ---------------------------------------------------------------- fjern pinnen

test('fjern-pin: main uten pinnen er ferdig; branch og åpen PR gjenbrukes', async () => {
  assert.equal((await kjorSteg(par(), 'fjern-sjekk')).utdata.ferdig, 'true');

  const ny = par();
  ny.s.filer.main = pinTekst({ 'melosys-web': TAG });
  assert.equal((await kjorSteg(ny, 'fjern-sjekk')).utdata.ferdig, 'false');
  assert.equal((await kjorSteg(ny, 'fjern-skriv', [], { REQUESTED_BY: '@rune' })).utdata.pr, '999');
  assert.deepEqual(skriveKall(ny.kall).map((k) => `${k.metode} ${k.sti.split('/').slice(-2).join('/')}`), [
    'POST git/trees',
    'POST git/commits',
    'POST git/refs',
    'POST melosys-e2e-tests/pulls',
  ]);
  assert.match(skriveKall(ny.kall).at(-1)!.body.body, /Bestilt av rune via/);

  const gammel = par({}, { apnePulls: [{ number: 5, html_url: 'https://x/5' }] });
  gammel.s.filer.main = pinTekst({ 'melosys-web': TAG });
  gammel.s.filer['gren-sha'] = pinTekst({ 'melosys-web': TAG });
  gammel.s.refs[`fjern-pin-${TAG}`] = 'gren-sha';
  assert.equal((await kjorSteg(gammel, 'fjern-skriv')).utdata.pr, '5');
  const patch = skriveKall(gammel.kall).find((k) => k.metode === 'PATCH')!;
  assert.deepEqual(patch.body, { sha: 'ny-commit', force: false });
  assert.ok(!skriveKall(gammel.kall).some((k) => k.sti.endsWith('/pulls')), 'åpen PR gjenbrukes');

  gammel.kall.length = 0;
  await kjorSteg(gammel, 'fjern-skriv');
  assert.deepEqual(skriveKall(gammel.kall), [], 'branchen har allerede riktig innhold');
});

// ---------------------------------------------------------------- dry_run

test('dry_run: ingen steg skriver, og ingen venter', async () => {
  const gh = par({ e2e: { mergeStateStatus: 'BLOCKED' } }, { koer: { 'melosys-web': 4 } });
  gh.s.filer.main = pinTekst({ 'melosys-web': TAG });
  delete gh.s.filer['head-380'];
  const env = { DRY_RUN: 'true' };
  const steg: [string, string[]][] = [
    ['sjekk', []],
    ['pin-sjekk', []],
    ['e2e-klar', []],
    ['vent-merget', ['melosys-e2e-tests', '380']],
    ['service-klar', ['melosys-web', '3253']],
    ['vent-merget', ['melosys-web', '3253']],
    ['latest', ['melosys-web', '3253']],
    ['fjern-sjekk', []],
  ];
  for (const [navn, args] of steg) {
    const { tid } = await kjorSteg(gh, navn, args, env);
    assert.equal(tid, 0, `${navn} venter ikke`);
  }
  assert.deepEqual(skriveKall(gh.kall), []);
  for (const navn of ['pin-skriv', 'fjern-skriv']) await assert.rejects(kjorSteg(gh, navn, [], env), /dry_run: stoppet/);
  await assert.rejects(kjorSteg(gh, 'sett-i-ko', ['x'], { ...env, PR_ID: 'a', HEAD_OID: 'b' }), /dry_run: stoppet en GraphQL-mutasjon/);
  assert.deepEqual(skriveKall(gh.kall), []);
});

// ---------------------------------------------------------------- CLI og kontrakt

test('CLI: input skriver matrisen, og feil blir ::error::', () => {
  const script = join(__dirname, '..', 'scripts', 'koblet-merge.mjs');
  const ut = execFileSync(process.execPath, [script, 'input'], { env: { TAG, E2E_PR: '380', TJENESTER: 'melosys-web#3253' } }).toString();
  assert.match(ut, /matrix=\{"include":\[\{"repo":"melosys-web","pr":3253\}\]\}/);
  assert.throws(
    () => execFileSync(process.execPath, [script, 'input'], { env: { TAG, E2E_PR: '1', TJENESTER: 'melosys-docker-compose#1' }, stdio: 'pipe' }),
    (e: { status: number; stdout: Buffer }) => e.status === 1 && /::error::melosys-docker-compose har ingen merge-kø/.test(e.stdout.toString()),
  );
});

test('workflowen: jobbnavnene konsollen leser, prøvekjøring i run-name og app-token for ett repo', () => {
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
  assert.match(yml, /^run-name: .*\$\{\{ inputs\.dry_run && ' \(prøvekjøring\)' \|\| '' \}\}"$/m);
  assert.match(yml, /group: koblet-merge-\$\{\{ inputs\.tag \}\}\n  cancel-in-progress: false/);
  assert.match(yml, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  const tokenSteg = yml.split('uses: actions/create-github-app-token@v3').slice(1);
  assert.equal(tokenSteg.length, 5);
  for (const s of tokenSteg) assert.match(s, /\n\s+repositories: (melosys-e2e-tests|\$\{\{ matrix\.repo \}\})\n/);
  assert.equal((yml.match(/MELOSYS_CI_PRIVATE_KEY/g) ?? []).length, 5, 'nøkkelen brukes bare i token-stegene');
});

test('koblet-merge starter ikke e2e-suiten', () => {
  assert.equal(utenE2eEffekt('scripts/koblet-merge.mjs'), true);
  assert.equal(utenE2eEffekt('.github/workflows/koblet-merge.yml'), true);
  assert.equal(utenE2eEffekt('scripts/e2e-pins.mjs'), false, 'E2E Tests kjører e2e-pins.mjs');
});
