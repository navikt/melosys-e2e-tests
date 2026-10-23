import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hentMedNyeForsok,
  kjor,
  lesInput,
  vaskBestiller,
  // @ts-expect-error — .mjs uten typedeklarasjon; scriptet er ren node uten avhengigheter.
} from '../scripts/koblet-merge.mjs';
// @ts-expect-error — .mjs uten typedeklarasjon.
import { utenE2eEffekt } from '../scripts/affected-tests.mjs';

/**
 * Feilene som koster mest: en prøvekjøring som skriver variabelen, en prøvekjøring som tar plassen
 * til en ekte skriving i køen av skrivinger, en pin satt mens en PR allerede er i kø, og et
 * app-token som brukes til mer enn variabelen.
 */

const TAG = 'br-38725776923';
type Pr = Record<string, any>;

function lagPr(repo: string, nr: number, felt: Pr = {}): Pr {
  return {
    number: nr,
    state: 'OPEN',
    isDraft: false,
    baseRefName: repo === 'melosys-e2e-tests' ? 'main' : 'master',
    headRepository: { nameWithOwner: `navikt/${repo}` },
    isInMergeQueue: false,
    mergeStateStatus: 'CLEAN',
    ...felt,
  };
}

const svar = (status: number, data: any, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers });

/** En liten GitHub i minnet: bare PR-spørringen. */
function lagGitHub(prs: Record<string, Pr>) {
  const kall: { sti: string; body: any }[] = [];
  const fetch = async (url: string, init: any = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    const sti = url.replace('https://api.github.com', '');
    kall.push({ sti, body });
    if (sti !== '/graphql') throw new Error(`ukjent kall ${sti}`);
    const v = body.variables;
    const standard = v.repo === 'melosys-e2e-tests' ? 'main' : 'master';
    return svar(200, { data: { repository: { defaultBranchRef: { name: standard }, pullRequest: prs[`${v.repo}#${v.nr}`] ?? null } } });
  };
  return { prs, kall, fetch };
}

async function kjorSteg(gh: { fetch: any }, steg: string, env: Record<string, string> = {}) {
  let t = 0;
  const logg: string[] = [];
  const utdata: Record<string, string> = {};
  await kjor(steg, {
    env: { GH_TOKEN: 't', TAG, E2E_PR: '380', TJENESTER: 'melosys-web#3253', DRY_RUN: 'false', ...env },
    fetch: gh.fetch,
    sleep: async (ms: number) => void (t += ms),
    now: () => t,
    logg: (l: string) => logg.push(l),
    sammendrag: (l: string) => logg.push(l),
    utdata: (k: string, v: string) => (utdata[k] = v),
  });
  return { logg, utdata };
}

function par(felt: { e2e?: Pr; web?: Pr; api?: Pr } = {}) {
  return lagGitHub({
    'melosys-e2e-tests#380': lagPr('melosys-e2e-tests', 380, felt.e2e),
    'melosys-web#3253': lagPr('melosys-web', 3253, felt.web),
    'melosys-api#100': lagPr('melosys-api', 100, felt.api),
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
    assert.throws(() => lesInput({ ...ok, tjenester: `${repo}#1` }), new RegExp(`${repo} har ingen merge-kø`));
  }
});

test('requested_by: kontrolltegn, # og @ fjernes, maks 100 tegn', () => {
  assert.equal(vaskBestiller('@rune\n#1 @team'), 'rune1 team');
  assert.equal(vaskBestiller('a'.repeat(150)).length, 100);
  assert.equal(vaskBestiller('@#'), 'ukjent');
  assert.equal(vaskBestiller(undefined), 'ukjent');
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
  await assert.rejects(kjorSteg(gh, 'sjekk'), /GraphQL ga HTTP 400: <html>Bad gateway<\/html>/);
});

// ---------------------------------------------------------------- sjekk paret

test('sjekk: åpent par godtas, og bare spørringer sendes', async () => {
  const gh = par();
  const { logg } = await kjorSteg(gh, 'sjekk', { TJENESTER: 'melosys-api#100,melosys-web#3253' });
  assert.ok(logg.some((l) => /Paret er klart: e2e #380, melosys-api #100, melosys-web #3253/.test(l)));
  assert.equal(gh.kall.length, 3);
  for (const k of gh.kall) assert.match(k.body.query, /^\s*query\b/);
});

test('sjekk: en PR i kø, merget eller lukket stopper, fordi pinnen settes før køen', async () => {
  const tilfeller: [Pr, RegExp][] = [
    [{ isInMergeQueue: true }, /står i merge-køen/],
    [{ state: 'MERGED' }, /er MERGED\. Pinnen settes mens alle PR-ene er åpne/],
    [{ state: 'CLOSED' }, /er CLOSED/],
  ];
  for (const [felt, feil] of tilfeller) {
    await assert.rejects(kjorSteg(par({ e2e: felt }), 'sjekk'), feil, `e2e: ${JSON.stringify(felt)}`);
    await assert.rejects(kjorSteg(par({ web: felt }), 'sjekk'), feil, `web: ${JSON.stringify(felt)}`);
  }
});

test('sjekk: utkast, fork, feil base og konflikt stopper, og alle feilene vises', async () => {
  const tilfeller: [Pr, RegExp][] = [
    [{ isDraft: true }, /utkast/],
    [{ headRepository: { nameWithOwner: 'fork/melosys-web' } }, /fork/],
    [{ baseRefName: 'dev' }, /går mot dev/],
    [{ mergeStateStatus: 'DIRTY' }, /konflikter/],
  ];
  for (const [felt, feil] of tilfeller) await assert.rejects(kjorSteg(par({ web: felt }), 'sjekk'), feil);
  const gh = par({ e2e: { isDraft: true } });
  delete gh.prs['melosys-web#3253'];
  await assert.rejects(kjorSteg(gh, 'sjekk'), /e2e #380 er et utkast\.\nFant ikke melosys-web #3253/);
});

// ---------------------------------------------------------------- neste steg

test('neste: rekkefølgen er e2e-PR-en og så service-PR-ene, hver når køen er tom', async () => {
  const { logg } = await kjorSteg(par(), 'neste', { TJENESTER: 'melosys-api#100,melosys-web#3253', REQUESTED_BY: '@rune' });
  assert.match(logg[0], /melosys-api, melosys-web er pinnet til br-38725776923 i E2E_PINS for e2e #380/);
  assert.equal(logg[1], '1. e2e #380: https://github.com/navikt/melosys-e2e-tests/pull/380');
  assert.equal(logg[2], '2. melosys-api #100, når e2e #380 er merget og melosys-api-køen er tom: https://github.com/navikt/melosys-api/pull/100');
  assert.equal(logg[3], '3. melosys-web #3253, når melosys-api #100 er merget og melosys-web-køen er tom: https://github.com/navikt/melosys-web/pull/3253');
  assert.match(logg[4], /Bestilt av rune\.$/);
  const prøve = await kjorSteg(par(), 'neste', { DRY_RUN: 'true' });
  assert.match(prøve.logg[0], /Prøvekjøring: E2E_PINS er ikke skrevet/);
});

test('ingen steg skriver til GitHub med github.token', async () => {
  for (const steg of ['pin-skriv', 'sett-i-ko', 'fjern-skriv', 'e2e-klar', 'vent-merget']) {
    await assert.rejects(kjorSteg(par(), steg), /Ukjent steg/, steg);
  }
});

// ---------------------------------------------------------------- CLI og workflow

test('CLI: input skriver matrisen, og feil blir ::error::', () => {
  const script = join(__dirname, '..', 'scripts', 'koblet-merge.mjs');
  const ut = execFileSync(process.execPath, [script, 'input'], { env: { TAG, E2E_PR: '380', TJENESTER: 'melosys-web#3253' } }).toString();
  assert.match(ut, /matrix=\{"include":\[\{"repo":"melosys-web","pr":3253\}\]\}/);
  assert.throws(
    () => execFileSync(process.execPath, [script, 'input'], { env: { TAG, E2E_PR: '1', TJENESTER: 'melosys-docker-compose#1' }, stdio: 'pipe' }),
    (e: { status: number; stdout: Buffer }) => e.status === 1 && /::error::melosys-docker-compose har ingen merge-kø/.test(e.stdout.toString()),
  );
});

const yml = readFileSync(join(__dirname, '..', '.github', 'workflows', 'koblet-merge.yml'), 'utf8');
const jobb = (id: string) => {
  const start = yml.indexOf(`\n  ${id}:\n`);
  const slutt = yml.slice(start + 1).search(/\n  [a-z0-9-]+:\n/);
  return slutt === -1 ? yml.slice(start) : yml.slice(start, start + 1 + slutt);
};
const stegI = (tekst: string) => tekst.split(/\n      - /).slice(1);

test('workflowen: to jobber, og inputene konsollen sender, står', () => {
  const jobber = [...yml.matchAll(/^  ([a-z0-9-]+):\n    name: "?(.+?)"?$/gm)].map(([, id, navn]) => [id, navn]);
  assert.deepEqual(jobber, [
    ['sjekk', 'Sjekk paret'],
    ['pin', 'Skriv pinnen i E2E_PINS'],
  ]);
  for (const inp of ['tag', 'e2e_pr', 'tjenester', 'requested_by', 'dry_run']) assert.match(yml, new RegExp(`^      ${inp}:$`, 'm'));
  assert.match(yml, /^run-name: .*\$\{\{ inputs\.dry_run && ' \(prøvekjøring\)' \|\| '' \}\}"$/m);
  assert.match(yml, /group: koblet-merge-\$\{\{ inputs\.tag \}\}\n  cancel-in-progress: false/);
  assert.match(yml, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(yml, /e2e-pins\.json|sett-i-ko|vent-merget|fjern-skriv|pin-skriv/);
});

test('workflowen: skrivingene går én om gangen, og en prøvekjøring står utenfor køen', () => {
  const pin = jobb('pin');
  const gruppe = /\n    concurrency:\n      group: (.+)\n      cancel-in-progress: false\n/.exec(pin)?.[1];
  assert.equal(gruppe, "${{ inputs.dry_run && format('e2e-pins-prove-{0}', github.run_id) || 'e2e-pins-variabel' }}");
  assert.doesNotMatch(jobb('sjekk'), /concurrency:/);
});

test('workflowen: app-tokenet er bare for melosys-e2e-tests, bare uten dry_run, og bare for variabelen', () => {
  const token = stegI(yml).filter((s) => /\buses: actions\/create-github-app-token@/.test(s));
  assert.equal(token.length, 1);
  assert.match(token[0], /\n\s+if: \$\{\{ !inputs\.dry_run \}\}\n/);
  assert.match(token[0], /\n\s+repositories: melosys-e2e-tests\n/);
  assert.doesNotMatch(token[0], /permission-/);
  assert.equal((yml.match(/MELOSYS_CI_PRIVATE_KEY/g) ?? []).length, 1);
  assert.equal((yml.match(/steps\.token\.outputs\.token/g) ?? []).length, 1);
  const skriv = stegI(jobb('pin')).find((s) => s.includes('e2e-pins.mjs set'))!;
  assert.match(skriv, /\n\s+E2E_PINS_TOKEN: \$\{\{ steps\.token\.outputs\.token \}\}\n/);
  assert.match(skriv, /\n\s+E2E_PINS_VAR: \$\{\{ vars\.E2E_PINS \}\}\n/);
  assert.doesNotMatch(skriv, /GH_TOKEN:/, 'GH_TOKEN er github.token fra env på toppen');
});

test('workflowen: skrivejobben logger inn i GAR før skriveren, med id-token og actions: read', () => {
  const pin = jobb('pin');
  for (const r of ['contents: read', 'pull-requests: read', 'actions: read', 'id-token: write']) assert.match(pin, new RegExp(`\\n      ${r}\\n`), r);
  const login = pin.indexOf('uses: nais/login@v0');
  assert.ok(login !== -1 && login < pin.indexOf('e2e-pins.mjs set'));
  assert.ok(pin.indexOf('e2e-pins.mjs set') < pin.indexOf('koblet-merge.mjs neste'));
  assert.match(pin, /\n    needs: sjekk\n/);
});

/** Kjører run-blokken i «Skriv pinnen» med en node som bare skriver argumentene. */
function kjørSkrivSteg(env: Record<string, string>) {
  const skriv = stegI(jobb('pin')).find((s) => s.includes('e2e-pins.mjs set'))!;
  const blokk = /\n        run: \|\n((?:          .*\n?)+)/.exec(skriv)![1].replace(/^ {10}/gm, '');
  const dir = mkdtempSync(join(tmpdir(), 'koblet-merge-'));
  writeFileSync(join(dir, 'node'), '#!/bin/sh\necho "node $*"\n');
  chmodSync(join(dir, 'node'), 0o755);
  return spawnSync('bash', ['-eo', 'pipefail', '-c', blokk], { env: { PATH: `${dir}:${process.env.PATH}`, TAG, E2E_PR: '380', ...env }, encoding: 'utf8' });
}

test('workflowen: skriveren kalles én gang per tjeneste, med --dry-run bare i en prøvekjøring', () => {
  const MATRIX = JSON.stringify({ include: [{ repo: 'melosys-api', pr: 100 }, { repo: 'melosys-web', pr: 3253 }] });
  const ekte = kjørSkrivSteg({ MATRIX, DRY_RUN: 'false' });
  assert.equal(ekte.status, 0, ekte.stderr);
  assert.equal(ekte.stdout, `node scripts/e2e-pins.mjs set melosys-api ${TAG} 380 100\nnode scripts/e2e-pins.mjs set melosys-web ${TAG} 380 3253\n`);
  const prøve = kjørSkrivSteg({ MATRIX, DRY_RUN: 'true' });
  assert.equal(prøve.stdout, `node scripts/e2e-pins.mjs set melosys-api ${TAG} 380 100 --dry-run\nnode scripts/e2e-pins.mjs set melosys-web ${TAG} 380 3253 --dry-run\n`);
});

test('workflowen: hver jobb tåler den lengste ventingen på timekvoten', async () => {
  // Fire svar med brukt timekvote og fornyelse om to timer: lengste venting i ett kall.
  const brukt = () => svar(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(1_000_000 + 7200) });
  const f = fetchSomSvarer(brukt(), brukt(), brukt(), brukt());
  const { ctx, sover } = retryCtx(f.fetch);
  await hentMedNyeForsok(ctx, 'u', {}, 'x');
  const lengsteMin = sover.reduce((a, b) => a + b, 0) / 60_000;
  const grense = Number(/\n    timeout-minutes: (\d+)\n/.exec(jobb('sjekk'))?.[1]);
  assert.ok(grense >= lengsteMin + 10, `sjekk: timeout-minutes ${grense} < ${lengsteMin} min venting + 10`);
});

test('koblet-merge starter ikke e2e-suiten', () => {
  assert.equal(utenE2eEffekt('scripts/koblet-merge.mjs'), true);
  assert.equal(utenE2eEffekt('.github/workflows/koblet-merge.yml'), true);
  assert.equal(utenE2eEffekt('scripts/e2e-pins.mjs'), false, 'E2E Tests kjører e2e-pins.mjs');
});
