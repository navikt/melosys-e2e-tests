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
    runs: [],
    jobs: {},
    forfedre: {},
    apnePulls: [],
    graphqlSvar: [],
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
      if (s.graphqlSvar.length) {
        const neste = s.graphqlSvar.shift();
        if (neste instanceof Error) throw neste;
        return neste;
      }
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
    if ((r = /^actions\/runs\?(.*)$/.exec(rest))) {
      const q = new URLSearchParams(r[1]);
      const runs = (s.runs as Pr[]).filter((run) => !q.get('head_sha') || run.head_sha === q.get('head_sha'));
      return svar(200, { workflow_runs: runs });
    }
    if ((r = /^actions\/runs\/(\d+)\/jobs/.exec(rest))) return svar(200, { jobs: s.jobs[r[1]] ?? [] });
    if ((r = /^compare\/([^.]+)\.\.\.([^?]+)/.exec(rest))) {
      const [, base, head] = r;
      const status = base === head ? 'identical' : s.forfedre[head]?.includes(base) ? 'ahead' : 'diverged';
      return svar(200, { status });
    }
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
  return { ctx: { fetch, sleep: async (ms: number) => void sover.push(ms), logg: () => {}, now: () => 1_000_000_000 }, sover };
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

test('nye forsøk: primær rate limit venter til x-ratelimit-reset, maks 15 min', async () => {
  const naa = 1_000_000; // sekunder; retryCtx sin klokke står på 1_000_000_000 ms
  const tom = (reset: number) => svar(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) });
  const f = fetchSomSvarer(tom(naa + 300), svar(429, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(naa + 7200) }), tom(naa - 5), svar(200, {}));
  const { ctx, sover } = retryCtx(f.fetch);
  assert.equal((await hentMedNyeForsok(ctx, 'u', {}, 'x')).status, 200);
  assert.deepEqual(sover, [300_000, 900_000, 1000]);
});

test('nye forsøk: 5xx med x-ratelimit-reset venter vanlig pause, ikke til timekvoten fornyes', async () => {
  const f = fetchSomSvarer(svar(502, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(1_000_000 + 600) }), svar(200, {}));
  const { ctx, sover } = retryCtx(f.fetch);
  assert.equal((await hentMedNyeForsok(ctx, 'u', {}, 'x')).status, 200);
  assert.deepEqual(sover, [5000]);
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
  assert.deepEqual(a.utdata, { trengs: 'false' });
  const b = await kjorSteg(har, 'pin-skriv');
  assert.deepEqual(b.utdata, { trengs: 'false' });
  assert.deepEqual(skriveKall(har.kall), []);

  const mangler = par();
  mangler.s.filer['head-380'] = pinTekst({ 'melosys-api': 'br-1' });
  assert.equal((await kjorSteg(mangler, 'pin-sjekk')).utdata.trengs, 'true');
  const c = await kjorSteg(mangler, 'pin-skriv');
  assert.deepEqual(c.utdata, { trengs: 'false' });
  const tre = mangler.kall.find((k) => k.sti.endsWith('/git/trees'))!;
  assert.deepEqual(JSON.parse(tre.body.tree[0].content), { 'melosys-api': 'br-1', 'melosys-web': TAG });
  const patch = mangler.kall.find((k) => k.metode === 'PATCH')!;
  assert.match(patch.sti, /git\/refs\/heads\/gren-380$/);
  assert.deepEqual(patch.body, { sha: 'ny-commit', force: false });
});

test('pin: merget e2e-PR sjekkes mot merge-commiten', async () => {
  const ok = await kjorSteg(par({ e2e: { state: 'MERGED', mergeCommit: { oid: 'merge-380' } } }), 'pin-sjekk');
  assert.deepEqual(ok.utdata, { trengs: 'false' });
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
  await kjorSteg(gh, 'sett-i-ko', ['melosys-e2e-tests', '380'], { PR_ID: 'PR_melosys-e2e-tests_380', HEAD_OID: 'head-380' });
  const [m] = skriveKall(gh.kall);
  assert.match(m.body.query, /enqueuePullRequest\(input: \{ pullRequestId: \$id, expectedHeadOid: \$oid \}\)/);
  assert.doesNotMatch(m.body.query, /jump/);
  assert.deepEqual(m.body.variables, { id: 'PR_melosys-e2e-tests_380', oid: 'head-380' });
});

const graphqlFeil = (...errors: Pr[]) => svar(200, { data: null, errors });

test('sett-i-ko: feiler enqueue, varsler jobben og ber om «Merge when ready»', async () => {
  const env = { PR_ID: 'PR_melosys-web_3253', HEAD_OID: 'head-3253' };
  const intern = par();
  intern.s.graphqlSvar.push(graphqlFeil({ message: 'Could not enqueue: internal error' }));
  const a = await kjorSteg(intern, 'sett-i-ko', ['melosys-web', '3253'], env);
  assert.ok(
    a.logg.includes('::warning::Fikk ikke lagt melosys-web #3253 i køen (GraphQL: Could not enqueue: internal error). Trykk «Merge when ready» på https://github.com/navikt/melosys-web/pull/3253; jobben venter videre.'),
    a.logg.join('\n'),
  );
  assert.ok(a.logg.some((l) => l.startsWith('⚠️ Fikk ikke lagt melosys-web #3253 i køen')), 'linje i sammendraget');
  assert.equal(a.utdata.satt, 'false');

  const nede = par();
  nede.s.graphqlSvar.push(...[1, 2, 3, 4].map(() => svar(502, { message: 'Bad gateway' })));
  const b = await kjorSteg(nede, 'sett-i-ko', ['melosys-e2e-tests', '380'], env);
  assert.ok(b.logg.some((l) => l.startsWith('::warning::Fikk ikke lagt melosys-e2e-tests #380 i køen (GraphQL ga HTTP 502')), b.logg.join('\n'));
  assert.equal(b.utdata.satt, 'false');

  const nett = par();
  nett.s.graphqlSvar.push(...[1, 2, 3, 4].map(() => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })));
  const c = await kjorSteg(nett, 'sett-i-ko', ['melosys-web', '3253'], env);
  assert.ok(c.logg.some((l) => l.startsWith('::warning::Fikk ikke lagt melosys-web #3253 i køen (GraphQL feilet etter 4 forsøk: ECONNRESET)')), c.logg.join('\n'));
  assert.equal(c.utdata.satt, 'false');

  const ok = par();
  assert.equal((await kjorSteg(ok, 'sett-i-ko', ['melosys-web', '3253'], env)).utdata.satt, 'true');
});

test('sett-i-ko: feil head, manglende rettighet og PR som allerede er i køen feiler jobben', async () => {
  const env = { PR_ID: 'PR_melosys-web_3253', HEAD_OID: 'head-3253' };
  const tilfeller: [Response, RegExp][] = [
    [graphqlFeil({ type: 'UNPROCESSABLE', message: "Head sha didn't match expected head sha" }), /GraphQL: Head sha didn't match expected head sha/],
    [graphqlFeil({ type: 'FORBIDDEN', message: 'Resource not accessible by integration' }), /GraphQL: Resource not accessible by integration/],
    [graphqlFeil({ type: 'UNPROCESSABLE', message: 'Pull request is already queued to merge' }), /already queued/],
    [svar(403, { message: 'Resource not accessible by integration' }), /GraphQL ga HTTP 403/],
    [svar(401, { message: 'Bad credentials' }), /GraphQL ga HTTP 401/],
  ];
  for (const [feil, grunn] of tilfeller) {
    const gh = par();
    gh.s.graphqlSvar.push(feil);
    await assert.rejects(
      kjorSteg(gh, 'sett-i-ko', ['melosys-web', '3253'], env),
      (e: Error) => /^Fikk ikke lagt melosys-web #3253 i køen: /.test(e.message) && grunn.test(e.message),
      String(grunn),
    );
  }
});

test('sett-i-ko: hver feilklasse fra enqueue gir enten «Merge when ready» eller stopp', async () => {
  const env = { PR_ID: 'PR_melosys-web_3253', HEAD_OID: 'head-3253' };
  const fire = (lag: () => Response | Error) => [1, 2, 3, 4].map(lag);
  const nett = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
  const brukt = (status: number) => () => svar(status, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1' });
  const sekundaer = () => svar(403, { message: 'You have exceeded a secondary rate limit' }, { 'retry-after': '1' });
  // Ubesvart: GitHub svarte ikke, feilet internt eller begrenset kallene. Jobben venter på «Merge when ready».
  const ubesvart: [string, (Response | Error)[]][] = [
    ['nettverksfeil', fire(nett)],
    ['HTTP 502', fire(() => svar(502, { message: 'Bad gateway' }))],
    ['HTTP 403 brukt timekvote', fire(brukt(403))],
    ['HTTP 429 brukt timekvote', fire(brukt(429))],
    ['HTTP 403 sekundær grense', fire(sekundaer)],
    ['GraphQL RATE_LIMITED', fire(() => graphqlFeil({ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }))],
    ['GraphQL something went wrong', fire(() => graphqlFeil({ message: 'Something went wrong while executing your query.' }))],
    ['GraphQL timeout', fire(() => graphqlFeil({ message: 'Timeout on validation of query' }))],
    ['GraphQL intern feil', [graphqlFeil({ message: 'Could not enqueue: internal error' })]],
  ];
  for (const [navn, svarene] of ubesvart) {
    const gh = par();
    gh.s.graphqlSvar.push(...svarene);
    const { utdata, logg } = await kjorSteg(gh, 'sett-i-ko', ['melosys-web', '3253'], env);
    assert.equal(utdata.satt, 'false', navn);
    assert.ok(logg.some((l) => l.startsWith('::warning::Fikk ikke lagt melosys-web #3253 i køen (')), navn);
  }
  // Besvart: GitHub avviste forespørselen. Jobben stopper med grunnen.
  const besvart: [string, Response, RegExp][] = [
    ['HTTP 401', svar(401, { message: 'Bad credentials' }), /GraphQL ga HTTP 401: Bad credentials$/],
    ['HTTP 403 uten grense', svar(403, { message: 'Resource not accessible by integration' }), /GraphQL ga HTTP 403: Resource not accessible by integration$/],
    ['HTTP 404', svar(404, { message: 'Not Found' }), /GraphQL ga HTTP 404: Not Found$/],
    ['GraphQL feil head', graphqlFeil({ type: 'UNPROCESSABLE', message: "Head sha didn't match expected head sha" }), /GraphQL: Head sha didn't match expected head sha$/],
    ['GraphQL blandet', graphqlFeil({ message: 'Could not enqueue: internal error' }, { type: 'FORBIDDEN', message: 'Resource not accessible by integration' }), /internal error; Resource not accessible by integration$/],
    ['GraphQL uten melding', graphqlFeil({ type: 'INTERNAL' }), /GraphQL: INTERNAL$/],
  ];
  for (const [navn, feil, grunn] of besvart) {
    const gh = par();
    gh.s.graphqlSvar.push(feil);
    await assert.rejects(
      kjorSteg(gh, 'sett-i-ko', ['melosys-web', '3253'], env),
      (e: Error) => /^Fikk ikke lagt melosys-web #3253 i køen: /.test(e.message) && grunn.test(e.message),
      navn,
    );
  }
});

test('vent-merget: etter mislykket enqueue venter jobben til noen setter PR-en i kø', async () => {
  const gh = par();
  gh.s.etterKall = (s: any, kall: any[]) => {
    const pr = s.prs['melosys-e2e-tests#380'];
    if (kall.length === 4) pr.isInMergeQueue = true;
    if (kall.length === 5) pr.state = 'MERGED';
  };
  const { tid } = await kjorSteg(gh, 'vent-merget', ['melosys-e2e-tests', '380'], { SATT_I_KO: 'false' });
  assert.equal(tid, 5 * 30_000, 'fire lesinger utenfor køen og én i køen');

  // Har den vært i køen, gjelder vanlig regel: to lesinger utenfor betyr at den er tatt ut.
  const ute = par();
  ute.s.etterKall = (s: any, kall: any[]) => {
    const pr = s.prs['melosys-e2e-tests#380'];
    if (kall.length === 2) pr.isInMergeQueue = true;
    if (kall.length === 3) pr.isInMergeQueue = false;
  };
  await assert.rejects(kjorSteg(ute, 'vent-merget', ['melosys-e2e-tests', '380'], { SATT_I_KO: 'false' }), /tatt ut av køen/);
  assert.equal(ute.kall.length, 5);
});

test('GraphQL: forbigående feil med HTTP 200 prøves igjen, valideringsfeil gjør ikke', async () => {
  const rl = par();
  rl.s.graphqlSvar.push(graphqlFeil({ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }), graphqlFeil({ message: 'Something went wrong while executing your query.' }));
  const a = await kjorSteg(rl, 'pin-sjekk');
  assert.equal(a.utdata.trengs, 'false');
  assert.equal(a.tid, 15_000, '5 s og 10 s som for REST');

  const tidsavbrudd = par();
  tidsavbrudd.s.graphqlSvar.push(...[1, 2, 3, 4].map(() => graphqlFeil({ message: 'Timeout on validation of query' })));
  await assert.rejects(kjorSteg(tidsavbrudd, 'pin-sjekk'), /GraphQL: Timeout on validation of query/);
  assert.equal(tidsavbrudd.kall.length, 4, 'tre nye forsøk');

  const validering = par();
  validering.s.graphqlSvar.push(graphqlFeil({ type: 'NOT_FOUND', message: "Could not resolve to a Repository with the name 'navikt/x'." }));
  await assert.rejects(kjorSteg(validering, 'pin-sjekk'), /Could not resolve/);
  assert.equal(validering.kall.length, 1, 'prøves ikke igjen');
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

// ---------------------------------------------------------------- fjern pinnen

const mergetWeb = { web: { state: 'MERGED', mergeCommit: { oid: 'sha-web' } } };

test('fjern-pin: service-PR-ene må være merget før pinnen fjernes', async () => {
  const apen = par();
  apen.s.filer.main = pinTekst({ 'melosys-web': TAG });
  for (const steg of ['fjern-sjekk', 'fjern-skriv']) {
    await assert.rejects(kjorSteg(apen, steg), /^Error: melosys-web #3253 er ikke merget, og pinnen fjernes først etter at service-PR-ene er merget\.$/);
  }
  assert.deepEqual(skriveKall(apen.kall), []);
  const torr = await kjorSteg(apen, 'fjern-sjekk', [], { DRY_RUN: 'true' });
  assert.ok(torr.logg.includes('::notice::dry_run: melosys-web #3253 er ikke merget, og pinnen fjernes først etter at service-PR-ene er merget.'), torr.logg.join('\n'));
});

test('fjern-pin: main uten pinnen er ferdig; branch og åpen PR gjenbrukes', async () => {
  assert.equal((await kjorSteg(par(), 'fjern-sjekk')).utdata.ferdig, 'true');

  const ny = par(mergetWeb);
  ny.s.filer.main = pinTekst({ 'melosys-web': TAG });
  assert.equal((await kjorSteg(ny, 'fjern-sjekk')).utdata.ferdig, 'false');
  const laget = await kjorSteg(ny, 'fjern-skriv', [], { REQUESTED_BY: '@rune' });
  assert.ok(laget.logg.includes('🧹 PR-en som fjerner pinnen: https://x/999. Merge den med «Merge when ready».'), laget.logg.join('\n'));
  assert.deepEqual(skriveKall(ny.kall).map((k) => `${k.metode} ${k.sti.split('/').slice(-2).join('/')}`), [
    'POST git/trees',
    'POST git/commits',
    'POST git/refs',
    'POST melosys-e2e-tests/pulls',
  ]);
  const tekst = skriveKall(ny.kall).at(-1)!.body.body;
  assert.match(tekst, /Bestilt av `rune` via/);
  assert.match(tekst, /^Fjerner pinnen til `br-38725776923` nå som navikt\/melosys-web#3253 er merget\. Merge med «Merge when ready»: e2e-køen kjører hele suiten mot latest og blir grønn først når latest har endringene\./);

  // Lenker og HTML i requested_by blir kode i PR-teksten, også med backticks.
  const lenke = par(mergetWeb);
  lenke.s.filer.main = pinTekst({ 'melosys-web': TAG });
  await kjorSteg(lenke, 'fjern-skriv', [], { REQUESTED_BY: '[klikk](https://x.example) <img src=x>' });
  assert.match(skriveKall(lenke.kall).at(-1)!.body.body, /Bestilt av `\[klikk\]\(https:\/\/x\.example\) <img src=x>` via/);
  const backtick = par(mergetWeb);
  backtick.s.filer.main = pinTekst({ 'melosys-web': TAG });
  await kjorSteg(backtick, 'fjern-skriv', [], { REQUESTED_BY: 'a`[b](https://x)``c' });
  assert.match(skriveKall(backtick.kall).at(-1)!.body.body, /Bestilt av ```a`\[b\]\(https:\/\/x\)``c``` via/);
  const kant = par(mergetWeb);
  kant.s.filer.main = pinTekst({ 'melosys-web': TAG });
  await kjorSteg(kant, 'fjern-skriv', [], { REQUESTED_BY: '`x`' });
  assert.match(skriveKall(kant.kall).at(-1)!.body.body, /Bestilt av `` `x` `` via/);
  for (const [bestiller, forventet] of [['`x', '`` `x ``'], ['x`', '`` x` ``']]) {
    const en = par(mergetWeb);
    en.s.filer.main = pinTekst({ 'melosys-web': TAG });
    await kjorSteg(en, 'fjern-skriv', [], { REQUESTED_BY: bestiller });
    assert.ok(skriveKall(en.kall).at(-1)!.body.body.includes(`Bestilt av ${forventet} via`), bestiller);
  }

  const gammel = par(mergetWeb, { apnePulls: [{ number: 5, html_url: 'https://x/5' }] });
  gammel.s.filer.main = pinTekst({ 'melosys-web': TAG });
  gammel.s.filer['gren-sha'] = pinTekst({ 'melosys-web': TAG });
  gammel.s.refs[`fjern-pin-${TAG}`] = 'gren-sha';
  const gjenbrukt = await kjorSteg(gammel, 'fjern-skriv');
  assert.ok(gjenbrukt.logg.includes('🧹 PR-en som fjerner pinnen: https://x/5. Merge den med «Merge when ready».'), gjenbrukt.logg.join('\n'));
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
    ['fjern-sjekk', []],
  ];
  for (const [navn, args] of steg) {
    const { tid } = await kjorSteg(gh, navn, args, env);
    assert.equal(tid, 0, `${navn} venter ikke`);
  }
  assert.deepEqual(skriveKall(gh.kall), []);
  for (const navn of ['pin-skriv', 'fjern-skriv']) await assert.rejects(kjorSteg(gh, navn, [], env), /dry_run: stoppet/);
  await assert.rejects(kjorSteg(gh, 'sett-i-ko', ['x', '1'], { ...env, PR_ID: 'a', HEAD_OID: 'b' }), /dry_run: stoppet en GraphQL-mutasjon/);
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
    ['fjern-pin', 'Fjern pinnen'],
  ]);
  for (const inp of ['tag', 'e2e_pr', 'tjenester', 'requested_by', 'dry_run']) assert.match(yml, new RegExp(`^      ${inp}:$`, 'm'));
  assert.match(yml, /^run-name: .*\$\{\{ inputs\.dry_run && ' \(prøvekjøring\)' \|\| '' \}\}"$/m);
  assert.match(yml, /group: koblet-merge-\$\{\{ inputs\.tag \}\}\n  cancel-in-progress: false/);
  assert.match(yml, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  const tokenSteg = yml.split('uses: actions/create-github-app-token@v3').slice(1);
  assert.equal(tokenSteg.length, 4);
  for (const s of tokenSteg) assert.match(s, /\n\s+repositories: (melosys-e2e-tests|\$\{\{ matrix\.repo \}\})\n/);
  assert.equal((yml.match(/MELOSYS_CI_PRIVATE_KEY/g) ?? []).length, 4, 'nøkkelen brukes bare i token-stegene');
  const pinJobb = yml.slice(yml.indexOf('\n  pin:\n'), yml.indexOf('\n  e2e-ko:\n'));
  assert.doesNotMatch(pinJobb, /\n    outputs:/, 'ingen leser utdata fra pin-jobben');
});

test('workflowen: sett-i-ko får PR-nummeret, og vent-merget får vite om enqueue feilet', () => {
  const yml = readFileSync(join(__dirname, '..', '.github', 'workflows', 'koblet-merge.yml'), 'utf8');
  const settIKo = [...yml.matchAll(/koblet-merge\.mjs sett-i-ko (.*)$/gm)].map((m) => m[1]);
  assert.deepEqual(settIKo, ['melosys-e2e-tests "$E2E_PR"', '"$REPO" "$PR"']);
  const ventSteg = yml.split('      - name: ').filter((s) => s.includes('koblet-merge.mjs vent-merget'));
  assert.equal(ventSteg.length, 2);
  for (const s of ventSteg) assert.match(s, /SATT_I_KO: \$\{\{ steps\.ko\.outputs\.satt \}\}/);
  assert.equal((yml.match(/\n        id: ko\n/g) ?? []).length, 2);
});

test('workflowen: Fjern pinnen kommer etter service-jobbene og setter ikke PR-en i kø', () => {
  const yml = readFileSync(join(__dirname, '..', '.github', 'workflows', 'koblet-merge.yml'), 'utf8');
  assert.doesNotMatch(yml, /^  latest:$/m);
  const fjernJobb = yml.slice(yml.indexOf('\n  fjern-pin:\n'));
  assert.match(fjernJobb, /\n    needs: service\n/);
  assert.match(fjernJobb, /koblet-merge\.mjs fjern-skriv\n/);
  assert.doesNotMatch(fjernJobb, /koblet-merge\.mjs (klar|sett-i-ko|vent-merget)\b/);
});

test('workflowen: hver jobb tåler den lengste ventingen på timekvoten', async () => {
  // Fire svar med brukt timekvote og fornyelse om to timer: lengste venting i ett kall.
  const brukt = () => svar(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(1_000_000 + 7200) });
  const f = fetchSomSvarer(brukt(), brukt(), brukt(), brukt());
  const { ctx, sover } = retryCtx(f.fetch);
  await hentMedNyeForsok(ctx, 'u', {}, 'x');
  const lengsteMin = sover.reduce((a, b) => a + b, 0) / 60_000;
  const yml = readFileSync(join(__dirname, '..', '.github', 'workflows', 'koblet-merge.yml'), 'utf8');
  const jobber = yml.slice(yml.indexOf('\njobs:\n')).split(/\n  (?=[a-z0-9-]+:\n)/).slice(1);
  assert.ok(jobber.length >= 5);
  for (const jobb of jobber) {
    const grense = Number(/\n    timeout-minutes: (\d+)\n/.exec(jobb)?.[1]);
    assert.ok(grense >= lengsteMin + 10, `${jobb.split(':')[0]}: timeout-minutes ${grense} < ${lengsteMin} min venting + 10`);
  }
});

test('workflowen: app-token og skriving bare uten dry_run', () => {
  const yml = readFileSync(join(__dirname, '..', '.github', 'workflows', 'koblet-merge.yml'), 'utf8');
  const steg = yml.split(/\n      - /).slice(1);
  const token = steg.filter((s) => /\buses: actions\/create-github-app-token@/.test(s));
  const skriv = steg.filter((s) => /koblet-merge\.mjs (pin-skriv|fjern-skriv|sett-i-ko)\b/.test(s));
  assert.equal(token.length, 4);
  assert.equal(skriv.length, 4);
  for (const s of [...token, ...skriv]) {
    const hvis = /^\s+if: (.*)$/m.exec(s)?.[1] ?? '';
    assert.match(hvis, /^\$\{\{ !inputs\.dry_run && [^|]+ \}\}$/, `steget «${s.split('\n')[0]}» må ha if: \${{ !inputs.dry_run && … }} uten ||, har ${hvis}`);
  }
});

test('koblet-merge starter ikke e2e-suiten', () => {
  assert.equal(utenE2eEffekt('scripts/koblet-merge.mjs'), true);
  assert.equal(utenE2eEffekt('.github/workflows/koblet-merge.yml'), true);
  assert.equal(utenE2eEffekt('scripts/e2e-pins.mjs'), false, 'E2E Tests kjører e2e-pins.mjs');
});
