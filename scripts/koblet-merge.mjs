#!/usr/bin/env node
/**
 * Sjekker en koblet endring for .github/workflows/koblet-merge.yml. Hver underkommando er ett
 * steg i workflowen, og alle leser med github.token. Pinnen skrives av scripts/e2e-pins.mjs i
 * jobben etter. Utdata går til GITHUB_OUTPUT.
 * Oppskriften står i docs/ci-cd/KOBLEDE-ENDRINGER.md.
 */
import { appendFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TJENESTER_MED_KO } from './e2e-pins.mjs';

const EIER = 'navikt';
const E2E_REPO = 'melosys-e2e-tests';
const API = 'https://api.github.com';

/** Repoene med merge-kø. Pin-nøkkelen er reponavnet. */
export const REPOER_MED_KO = TJENESTER_MED_KO;

// ---------------------------------------------------------------- rene funksjoner

/** Tekst fra GitHub eller inputene skal ikke bli workflow-kommandoer i loggen. */
export const vask = (t) => String(t).replace(/[\r\n]+/g, ' ').replace(/::/g, ': :').replace(/##\[/g, '# #[');

/** Fjerner kontrolltegn, # og @ (ingen nevninger i PR-teksten), maks 100 tegn. */
export function vaskBestiller(t) {
  // eslint-disable-next-line no-control-regex
  return String(t ?? '').replace(/[\u0000-\u001f\u007f#@]/g, '').slice(0, 100).trim() || 'ukjent';
}

export function lesInput({ tag, e2ePr, tjenester, requestedBy, dryRun }) {
  const feil = [];
  if (!/^br-[0-9]+$/.test(tag ?? '')) feil.push('tag må være br-<run_id> fra «E2E med brancher».');
  if (!/^[1-9][0-9]*$/.test(e2ePr ?? '')) feil.push('e2e_pr må være et PR-nummer i melosys-e2e-tests.');
  const liste = [];
  const deler = String(tjenester ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!deler.length) feil.push('tjenester må ha minst én <repo>#<pr>, for eksempel melosys-web#3253.');
  for (const del of deler) {
    const m = /^([A-Za-z0-9._-]+)#([1-9][0-9]*)$/.exec(del);
    if (!m) feil.push(`«${vask(del)}» er ikke på formen <repo>#<pr>.`);
    else if (!REPOER_MED_KO.includes(m[1])) feil.push(`${m[1]} har ingen merge-kø; bruk den manuelle oppskriften.`);
    else if (liste.some((t) => t.repo === m[1])) feil.push(`${m[1]} står to ganger.`);
    else liste.push({ repo: m[1], pr: Number(m[2]) });
  }
  if (feil.length) throw new Error(feil.join(' '));
  return { tag, e2ePr: Number(e2ePr), tjenester: liste, bestiller: vaskBestiller(requestedBy), dryRun: String(dryRun) === 'true' };
}

/**
 * Sjekker en PR i «Sjekk paret». Pinnen settes før noen av PR-ene er i kø: en køkjøring som har
 * startet, ser ikke variabelen, og en service-PR i kø før e2e-PR-en er merget, blir rød.
 */
export function sjekkPr(pr, navn, repo) {
  if (!pr) throw new Error(`Fant ikke ${navn}.`);
  if (pr.state !== 'OPEN') throw new Error(`${navn} er ${pr.state}. Pinnen settes mens alle PR-ene er åpne.`);
  const feil = [];
  if (pr.isDraft) feil.push(`${navn} er et utkast.`);
  if (pr.baseRefName !== pr.defaultBranch) feil.push(`${navn} går mot ${vask(pr.baseRefName)}, ikke ${pr.defaultBranch}.`);
  if (pr.headRepository?.nameWithOwner !== `${EIER}/${repo}`) feil.push(`${navn} kommer fra en fork; branchen må ligge i ${EIER}/${repo}.`);
  if (pr.mergeStateStatus === 'DIRTY') feil.push(`${navn} har konflikter.`);
  if (pr.isInMergeQueue) feil.push(`${navn} står i merge-køen. Ta den ut, start på nytt, og sett den i kø i rekkefølgen sammendraget viser.`);
  if (feil.length) throw new Error(feil.join(' '));
}

// ---------------------------------------------------------------- GitHub

const apiFeil = (status, melding) => Object.assign(new Error(melding), { status });
/** GraphQL svarer HTTP 200 med `errors` også når GitHub feiler internt. */
const forbigaende = (e) => e.type === 'RATE_LIMITED' || /something went wrong|timed? ?out/i.test(e.message ?? '');

const rateBegrenset = (res) =>
  (res.status === 403 || res.status === 429) && (res.headers.get('retry-after') !== null || res.headers.get('x-ratelimit-remaining') === '0');

/** Sekunder før neste forsøk. Er timekvoten brukt opp, venter vi til den fornyes, maks 15 min. */
function ventetid(ctx, res, forsok) {
  const retryAfter = res?.headers.get('retry-after');
  if (retryAfter != null) return Math.min(60, Number(retryAfter) || 5 * 2 ** forsok);
  const reset = Number(res?.headers.get('x-ratelimit-reset'));
  if (res && rateBegrenset(res) && reset) return Math.min(15 * 60, Math.max(1, Math.ceil(reset - ctx.now() / 1000)));
  return 5 * 2 ** forsok;
}

/** fetch med opptil tre nye forsøk ved nettverksfeil, 5xx og rate limit. */
export async function hentMedNyeForsok(ctx, url, init, hva) {
  for (let forsok = 0; ; forsok++) {
    let res;
    let nettfeil;
    try {
      res = await ctx.fetch(url, init);
    } catch (e) {
      nettfeil = e;
    }
    if (res && res.status < 500 && !rateBegrenset(res)) return res;
    const grunn = nettfeil ? vask(nettfeil.cause?.code ?? nettfeil.message) : `HTTP ${res.status}`;
    if (forsok >= 3) {
      if (nettfeil) throw Object.assign(new Error(`${hva} feilet etter 4 forsøk: ${grunn}`), { nettfeil: true });
      return res;
    }
    const sek = ventetid(ctx, res, forsok);
    ctx.logg(`${hva}: ${grunn}; prøver igjen om ${sek} s.`);
    await ctx.sleep(sek * 1000);
  }
}

export function lagKlient(ctx, token) {
  const kall = async (metode, sti, body, hva) => {
    const res = await hentMedNyeForsok(ctx, `${API}${sti}`, {
      method: metode,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'melosys-koblet-merge', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }, hva);
    const tekst = await res.text();
    if (!res.ok) {
      let melding = tekst;
      try {
        melding = JSON.parse(tekst).message ?? tekst;
      } catch {}
      throw apiFeil(res.status, `${hva} ga HTTP ${res.status}: ${vask(melding)}`);
    }
    return tekst ? JSON.parse(tekst) : null;
  };
  return {
    /** Bare spørringer: workflowen skriver ingenting med github.token. */
    async graphql(query, variables) {
      if (/^\s*mutation\b/.test(query)) throw new Error('koblet-merge.mjs skriver ikke til GitHub.');
      for (let forsok = 0; ; forsok++) {
        const data = await kall('POST', '/graphql', { query, variables }, 'GraphQL');
        if (!data.errors?.length) return data.data;
        const melding = `GraphQL: ${vask(data.errors.map((e) => e.message ?? e.type ?? 'ukjent feil').join('; '))}`;
        if (forsok >= 3 || !data.errors.every(forbigaende)) throw Object.assign(apiFeil(200, melding), { graphql: data.errors });
        const sek = 5 * 2 ** forsok;
        ctx.logg(`${melding}; prøver igjen om ${sek} s.`);
        await ctx.sleep(sek * 1000);
      }
    },
  };
}

async function hentPr(ctx, repo, nr) {
  const d = await ctx.api.graphql(
    `query Pr($eier: String!, $repo: String!, $nr: Int!) { repository(owner: $eier, name: $repo) { defaultBranchRef { name }
      pullRequest(number: $nr) { number state isDraft baseRefName headRepository { nameWithOwner } isInMergeQueue mergeStateStatus } } }`,
    { eier: EIER, repo, nr },
  );
  return d.repository?.pullRequest ? { ...d.repository.pullRequest, defaultBranch: d.repository.defaultBranchRef.name } : null;
}

// ---------------------------------------------------------------- stegene

const e2eNavn = (inp) => `e2e #${inp.e2ePr}`;
const lenke = (repo, nr) => `https://github.com/${EIER}/${repo}/pull/${nr}`;

function input(ctx) {
  ctx.utdata('matrix', JSON.stringify({ include: ctx.input.tjenester }));
}

async function sjekk(ctx) {
  const inp = ctx.input;
  const prer = [{ repo: E2E_REPO, pr: inp.e2ePr, navn: e2eNavn(inp) }, ...inp.tjenester.map((t) => ({ ...t, navn: `${t.repo} #${t.pr}` }))];
  const feil = [];
  for (const { repo, pr, navn } of prer) {
    try {
      sjekkPr(await hentPr(ctx, repo, pr), navn, repo);
    } catch (e) {
      feil.push(e.message);
    }
  }
  if (feil.length) throw new Error(feil.join('\n'));
  ctx.sammendrag(`✅ Paret er klart: ${prer.map((p) => p.navn).join(', ')} (${inp.tag}).`);
}

/**
 * Rekkefølgen utvikleren merger i. Workflowen setter ingenting i kø (D2): e2e-PR-en først, så
 * service-PR-ene i rekkefølgen fra input, hver når køen i repoet er tom. En PR foran i køen har
 * ikke endringen og ville blitt rød mot de nye testene.
 */
function neste(ctx) {
  const inp = ctx.input;
  const tjenester = inp.tjenester.map((t) => t.repo).join(', ');
  const linjer = [
    inp.dryRun
      ? `🧪 Prøvekjøring: E2E_PINS er ikke skrevet. Med pinnen ville rekkefølgen vært:`
      : `📌 ${tjenester} er pinnet til ${inp.tag} i E2E_PINS for ${e2eNavn(inp)}. Merge med «Merge when ready» i denne rekkefølgen:`,
    `1. ${e2eNavn(inp)}: ${lenke(E2E_REPO, inp.e2ePr)}`,
    ...inp.tjenester.map((t, i) => {
      const forrige = i === 0 ? e2eNavn(inp) : `${inp.tjenester[i - 1].repo} #${inp.tjenester[i - 1].pr}`;
      return `${i + 2}. ${t.repo} #${t.pr}, når ${forrige} er merget og ${t.repo}-køen er tom: ${lenke(t.repo, t.pr)}`;
    }),
    `Pinnen gjelder fra testene har ${e2eNavn(inp)} til latest har service-PR-en, og slår seg av selv. Bestilt av ${inp.bestiller}.`,
  ];
  for (const l of linjer) ctx.sammendrag(l);
}

// ---------------------------------------------------------------- CLI

const STEG = { input, sjekk, neste };

/** Kjører ett steg. Testene sender inn fetch, sleep og klokke. */
export async function kjor(steg, { env, fetch, sleep, now, logg, sammendrag, utdata }) {
  if (!Object.hasOwn(STEG, steg)) throw new Error(`Ukjent steg «${vask(steg)}». Gyldige: ${Object.keys(STEG).join(', ')}.`);
  const inp = lesInput({ tag: env.TAG, e2ePr: env.E2E_PR, tjenester: env.TJENESTER, requestedBy: env.REQUESTED_BY, dryRun: env.DRY_RUN });
  const ctx = { input: inp, env, fetch, sleep, now, logg, sammendrag, utdata };
  if (steg === 'sjekk' && !env.GH_TOKEN) throw new Error('GH_TOKEN mangler.');
  ctx.api = lagKlient(ctx, env.GH_TOKEN);
  await STEG[steg](ctx);
}

async function main() {
  const [steg] = process.argv.slice(2);
  const env = process.env;
  const skriv = (fil, t) => fil && appendFileSync(fil, t);
  try {
    await kjor(steg ?? '', {
      env,
      fetch: globalThis.fetch,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: () => Date.now(),
      logg: (t) => console.log(t),
      sammendrag: (t) => (console.log(t), skriv(env.GITHUB_STEP_SUMMARY, `${vask(t)}\n`)),
      utdata: (k, v) => (console.log(`${k}=${v}`), skriv(env.GITHUB_OUTPUT, `${k}<<KOBLET_EOF\n${v}\nKOBLET_EOF\n`)),
    });
  } catch (e) {
    for (const linje of String(e.message).split('\n')) console.log(`::error::${vask(linje)}`);
    skriv(env.GITHUB_STEP_SUMMARY, `❌ ${vask(e.message)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
