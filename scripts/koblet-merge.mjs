#!/usr/bin/env node
/**
 * Fletter en koblet endring for .github/workflows/koblet-merge.yml. Hver underkommando er ett
 * steg i workflowen. Lesestegene bruker github.token; skrivestegene (pin-skriv, fjern-skriv,
 * sett-i-ko) får et app-token for ett repo, hentet i steget rett før. Utdata går til
 * GITHUB_OUTPUT. Med DRY_RUN=true skriver scriptet ingenting og venter ikke på køer.
 * Oppskriften står i docs/ci-cd/KOBLEDE-ENDRINGER.md.
 */
import { appendFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lesPinner } from './e2e-pins.mjs';

const EIER = 'navikt';
const E2E_REPO = 'melosys-e2e-tests';
const PIN_FIL = '.github/e2e-pins.json';
const API = 'https://api.github.com';
const MIN = 60_000;

/** Repoene med merge-kø. Pin-nøkkelen er reponavnet. */
export const REPOER_MED_KO = ['melosys-api', 'melosys-web', 'melosys-skjema-api', 'melosys-skjema-web', 'melosys-eessi', 'faktureringskomponenten'];
export const GRENSER = { klar: 30 * MIN, tomKo: 60 * MIN, ko: 150 * MIN, intervall: 30_000 };

// ---------------------------------------------------------------- rene funksjoner

/** Tekst fra GitHub eller inputene skal ikke bli workflow-kommandoer i loggen. */
export const vask = (t) => String(t).replace(/[\r\n]+/g, ' ').replace(/::/g, ': :').replace(/##\[/g, '# #[');

/** Fjerner kontrolltegn, # og @ (ingen nevninger i PR-teksten), maks 100 tegn. */
export function vaskBestiller(t) {
  // eslint-disable-next-line no-control-regex
  return String(t ?? '').replace(/[\u0000-\u001f\u007f#@]/g, '').slice(0, 100).trim() || 'ukjent';
}

/** Markdown-kodespenn: lengre skilletegn enn den lengste rekken av backticks i teksten. */
export function kodespenn(t) {
  const n = Math.max(0, ...(String(t).match(/`+/g) ?? []).map((m) => m.length)) + 1;
  const kant = /^`|`$/.test(t) ? ' ' : '';
  return '`'.repeat(n) + kant + t + kant + '`'.repeat(n);
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

const tilTekst = (pinner) => (Object.keys(pinner).length ? JSON.stringify(pinner, null, 2) + '\n' : null);

/** Pin-fila med tjenestene pinnet til `tag`; andre pinner står. */
export function leggTilPinner(tekst, repoer, tag) {
  const pinner = lesPinner(tekst ?? '');
  return { tekst: tilTekst({ ...pinner, ...Object.fromEntries(repoer.map((r) => [r, tag])) }), endret: repoer.some((r) => pinner[r] !== tag) };
}

/** Pin-fila uten pinnene som står på `tag`. `tekst` null betyr at fila slettes. */
export function fjernPinner(tekst, repoer, tag) {
  const pinner = lesPinner(tekst ?? '');
  const fjernet = repoer.filter((r) => pinner[r] === tag);
  return { tekst: tilTekst(Object.fromEntries(Object.entries(pinner).filter(([r]) => !fjernet.includes(r)))), endret: fjernet.length > 0, fjernet };
}

export const harPinnene = (tekst, repoer, tag) => !leggTilPinner(tekst, repoer, tag).endret;

/** Sjekker en PR i «Sjekk paret»: 'merget' | 'i-ko' | 'åpen'; alt annet kaster. */
export function sjekkPr(pr, navn, repo) {
  if (!pr) throw new Error(`Fant ikke ${navn}.`);
  if (pr.state === 'MERGED') return 'merget';
  if (pr.state !== 'OPEN') throw new Error(`${navn} er ${pr.state}.`);
  const feil = [];
  if (pr.isDraft) feil.push(`${navn} er et utkast.`);
  if (pr.baseRefName !== pr.defaultBranch) feil.push(`${navn} går mot ${vask(pr.baseRefName)}, ikke ${pr.defaultBranch}.`);
  if (pr.headRepository?.nameWithOwner !== `${EIER}/${repo}`) feil.push(`${navn} kommer fra en fork; branchen må ligge i ${EIER}/${repo}.`);
  if (pr.mergeStateStatus === 'DIRTY') feil.push(`${navn} har konflikter.`);
  if (feil.length) throw new Error(feil.join(' '));
  return pr.isInMergeQueue ? 'i-ko' : 'åpen';
}

/** 'merget' | 'i-ko' | 'klar' (kan settes i kø) | 'vent'. Lukket eller konflikt kaster. */
export function koStatus(pr, navn) {
  if (pr.state === 'MERGED') return 'merget';
  if (pr.state !== 'OPEN') throw new Error(`${navn} er ${pr.state}.`);
  if (pr.isInMergeQueue) return 'i-ko';
  if (pr.mergeStateStatus === 'DIRTY') throw new Error(`${navn} har konflikter. Løs dem og start på nytt.`);
  return ['CLEAN', 'HAS_HOOKS', 'UNSTABLE', 'BEHIND'].includes(pr.mergeStateStatus) ? 'klar' : 'vent';
}

/**
 * Kaller `sjekk` til den svarer noe annet enn undefined, eller til `grense` ms er gått.
 * Med dry_run sjekker den én gang og venter ikke.
 */
export async function vent(ctx, grense, tidsavbrudd, sjekk) {
  if (ctx.input.dryRun) return sjekk();
  const start = ctx.now();
  for (;;) {
    const svar = await sjekk();
    if (svar !== undefined) return svar;
    if (ctx.now() - start >= grense) throw new Error(tidsavbrudd);
    await ctx.sleep(ctx.grenser.intervall);
  }
}

// ---------------------------------------------------------------- GitHub

const apiFeil = (status, melding) => Object.assign(new Error(melding), { status });
const dryRunFeil = (melding) => Object.assign(new Error(melding), { dryRun: true });
/** GraphQL svarer HTTP 200 med `errors` også når GitHub feiler internt. */
const forbigaende = (e) => e.type === 'RATE_LIMITED' || /something went wrong|timed? ?out/i.test(e.message ?? '');
/** GitHub svarte ikke, feilet internt eller begrenset kallene; alt annet er et svar på selve forespørselen. */
const ikkeBesvart = (e) => e.nettfeil || e.rateBegrenset || e.status >= 500 || (e.graphql?.every((g) => forbigaende(g) || /internal (server )?error/i.test(g.message ?? '')) ?? false);
/** 404 blir null. */
const ellerNull = (p) => p.catch((e) => (e.status === 404 ? null : Promise.reject(e)));

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
      throw Object.assign(apiFeil(res.status, `${hva} ga HTTP ${res.status}: ${vask(melding)}`), { rateBegrenset: rateBegrenset(res) });
    }
    return tekst ? JSON.parse(tekst) : null;
  };
  return {
    rest(metode, sti, body) {
      if (ctx.input.dryRun && metode !== 'GET') throw dryRunFeil(`dry_run: stoppet ${metode} ${sti}`);
      return kall(metode, sti, body, `${metode} ${sti.split('?')[0]}`);
    },
    async graphql(query, variables) {
      if (ctx.input.dryRun && /^\s*mutation\b/.test(query)) throw dryRunFeil('dry_run: stoppet en GraphQL-mutasjon');
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
      pullRequest(number: $nr) { id number state isDraft baseRefName headRefName headRefOid headRepository { nameWithOwner }
        isInMergeQueue mergeCommit { oid } mergeStateStatus } } }`,
    { eier: EIER, repo, nr },
  );
  return d.repository?.pullRequest ? { ...d.repository.pullRequest, defaultBranch: d.repository.defaultBranchRef.name } : null;
}

async function antallIKo(ctx, repo, branch) {
  const d = await ctx.api.graphql(
    `query Ko($eier: String!, $repo: String!, $branch: String!) { repository(owner: $eier, name: $repo) { mergeQueue(branch: $branch) { entries { totalCount } } } }`,
    { eier: EIER, repo, branch },
  );
  if (!d.repository?.mergeQueue) throw new Error(`${repo} har ingen merge-kø på ${branch}; bruk den manuelle oppskriften.`);
  return d.repository.mergeQueue.entries.totalCount;
}

const R = `/repos/${EIER}/${E2E_REPO}`;
const refSti = (b) => b.split('/').map(encodeURIComponent).join('/');

async function hentFil(ctx, ref) {
  const fil = await ellerNull(ctx.api.rest('GET', `${R}/contents/${PIN_FIL}?ref=${encodeURIComponent(ref)}`));
  return fil && Buffer.from(fil.content ?? '', 'base64').toString('utf8');
}

const hentRef = async (ctx, branch) => (await ellerNull(ctx.api.rest('GET', `${R}/git/ref/heads/${refSti(branch)}`)))?.object.sha ?? null;

/** Ny commit oppå `parent` der pin-fila er `tekst` (null sletter fila). */
async function lagCommit(ctx, parent, tekst, melding) {
  const tre = (await ctx.api.rest('GET', `${R}/git/commits/${parent}`)).tree.sha;
  const blob = tekst === null ? { sha: null } : { content: tekst };
  const nytt = await ctx.api.rest('POST', `${R}/git/trees`, { base_tree: tre, tree: [{ path: PIN_FIL, mode: '100644', type: 'blob', ...blob }] });
  return (await ctx.api.rest('POST', `${R}/git/commits`, { message: melding, tree: nytt.sha, parents: [parent] })).sha;
}

async function flyttRef(ctx, branch, sha, gammel) {
  try {
    await ctx.api.rest('PATCH', `${R}/git/refs/heads/${refSti(branch)}`, { sha, force: false });
  } catch (e) {
    if (e.status === 422) throw new Error(`${vask(branch)} er endret siden jobben leste den (${gammel}). Start på nytt.`);
    throw e;
  }
}

// ---------------------------------------------------------------- stegene

const repoer = (inp) => inp.tjenester.map((t) => t.repo);
const e2eNavn = (inp) => `e2e #${inp.e2ePr}`;

function input(ctx) {
  ctx.utdata('matrix', JSON.stringify({ include: ctx.input.tjenester }));
}

async function sjekk(ctx) {
  const inp = ctx.input;
  const feil = [];
  let e2eMerget = false;
  try {
    const pr = await hentPr(ctx, E2E_REPO, inp.e2ePr);
    if (sjekkPr(pr, e2eNavn(inp), E2E_REPO) === 'merget') {
      if (!harPinnene(await hentFil(ctx, pr.mergeCommit.oid), repoer(inp), inp.tag)) {
        throw new Error(`${e2eNavn(inp)} er merget uten pinnen ${repoer(inp).join(', ')} → ${inp.tag}. Bruk den manuelle oppskriften.`);
      }
      e2eMerget = true;
      ctx.notis(`${e2eNavn(inp)} er merget med pinnen; kjøringen fortsetter der forrige slapp.`);
    }
  } catch (e) {
    feil.push(e.message);
  }
  let forranMerget = e2eMerget;
  for (const t of inp.tjenester) {
    const navn = `${t.repo} #${t.pr}`;
    try {
      const status = sjekkPr(await hentPr(ctx, t.repo, t.pr), navn, t.repo);
      if (status === 'merget' && !forranMerget) throw new Error(`${navn} er merget før e2e-PR-en og tjenestene foran den. Rett opp for hånd.`);
      if (status !== 'merget') forranMerget = false;
    } catch (e) {
      forranMerget = false;
      feil.push(e.message);
    }
  }
  if (feil.length) throw new Error(feil.join('\n'));
  ctx.sammendrag(`✅ Paret er klart: ${e2eNavn(inp)} og ${inp.tjenester.map((t) => `${t.repo} #${t.pr}`).join(', ')} (${inp.tag}).`);
}

/** Uten `skriv` sier steget bare om pinnen trengs. */
async function pin(ctx, skriv) {
  const inp = ctx.input;
  const pr = await hentPr(ctx, E2E_REPO, inp.e2ePr);
  const merget = pr.state === 'MERGED';
  if (!merget && pr.state !== 'OPEN') throw new Error(`${e2eNavn(inp)} er ${pr.state}.`);
  const head = merget ? pr.mergeCommit.oid : pr.headRefOid;
  const { tekst, endret } = leggTilPinner(await hentFil(ctx, head), repoer(inp), inp.tag);
  if (endret && merget) throw new Error(`${e2eNavn(inp)} er merget uten pinnen.`);
  if (endret && !skriv) {
    if (inp.dryRun) ctx.notis(`dry_run: ville committet ${PIN_FIL} til ${vask(pr.headRefName)} oppå ${head.slice(0, 7)}: ${tekst}`);
    return ctx.utdata('trengs', 'true');
  }
  let ny = head;
  if (endret) {
    ny = await lagCommit(ctx, head, tekst, `TEK Pin ${repoer(inp).join(', ')} til ${inp.tag}`);
    await flyttRef(ctx, pr.headRefName, ny, head);
  } else ctx.notis(`Pinnen står på ${head.slice(0, 7)} i ${e2eNavn(inp)}.`);
  ctx.utdata('trengs', 'false');
  ctx.sammendrag(`📌 Pinnen står i ${e2eNavn(inp)} (${ny.slice(0, 7)}).`);
}

/** Venter til PR-en kan settes i kø, og skriver status, id og head til utdata. */
async function klar(ctx, repo, nr, navn) {
  let pr = await hentPr(ctx, repo, nr);
  let status = koStatus(pr, navn);
  if (status === 'vent') {
    status = await vent(ctx, ctx.grenser.klar, `${navn} ble ikke klar for køen på ${ctx.grenser.klar / MIN} min (status ${pr.mergeStateStatus}). Sjekk godkjenning og sjekker.`, async () => {
      pr = await hentPr(ctx, repo, nr);
      const s = koStatus(pr, navn);
      return s === 'vent' ? undefined : s;
    }) ?? 'vent';
  }
  if (ctx.input.dryRun) ctx.notis(`dry_run: ${navn} har status ${status} (${pr.mergeStateStatus}).`);
  ctx.utdata('status', status);
  ctx.utdata('id', pr.id);
  ctx.utdata('head', pr.headRefOid);
  return { status, pr };
}

async function e2eKlar(ctx) {
  const inp = ctx.input;
  const { status, pr } = await klar(ctx, E2E_REPO, inp.e2ePr, e2eNavn(inp));
  if (status === 'klar' && !harPinnene(await hentFil(ctx, pr.headRefOid), repoer(inp), inp.tag)) {
    const melding = `${e2eNavn(inp)} har ikke pinnen på ${pr.headRefOid.slice(0, 7)}.`;
    if (!inp.dryRun) throw new Error(`${melding} Start på nytt, så legger pin-jobben den inn.`);
    ctx.notis(`dry_run: ${melding} Pin-jobben ville lagt den inn.`);
  }
}

async function serviceKlar(ctx, repo, nr) {
  const inp = ctx.input;
  const i = inp.tjenester.findIndex((t) => t.repo === repo && t.pr === Number(nr));
  if (i === -1) throw new Error(`${vask(repo)} #${vask(nr)} står ikke i tjenester.`);
  const navn = `${repo} #${nr}`;
  for (const f of [{ repo: E2E_REPO, pr: inp.e2ePr }, ...inp.tjenester.slice(0, i)]) {
    if ((await hentPr(ctx, f.repo, f.pr)).state === 'MERGED') continue;
    const melding = `${f.repo} #${f.pr} er ikke merget, og ${navn} skal inn etter den.`;
    if (!inp.dryRun) throw new Error(melding);
    ctx.notis(`dry_run: ${melding}`);
  }
  const pr = await hentPr(ctx, repo, Number(nr));
  if (['klar', 'vent'].includes(koStatus(pr, navn))) {
    await vent(ctx, ctx.grenser.tomKo, `${repo}-køen var ikke tom etter ${ctx.grenser.tomKo / MIN} min. Start på nytt senere.`, async () => {
      const n = await antallIKo(ctx, repo, pr.defaultBranch);
      if (n === 0) return true;
      ctx.logg(`${repo}-køen har ${n} PR-er; venter til den er tom.`);
    });
  }
  await klar(ctx, repo, Number(nr), navn);
}

/**
 * Svarer ikke GitHub, varsler steget og lar vent-merget vente på at noen setter PR-en i kø.
 * Det gjelder også rate limit. Avviser GitHub forespørselen (feil head, PR-en er i køen, mangler
 * rettighet), feiler jobben.
 */
async function settIKo(ctx, repo, nr) {
  const { PR_ID: id, HEAD_OID: oid } = ctx.env;
  if (!id || !oid) throw new Error('PR_ID og HEAD_OID mangler.');
  if (!/^[1-9][0-9]*$/.test(nr ?? '')) throw new Error('sett-i-ko trenger <repo> <pr>.');
  const navn = `${repo} #${nr}`;
  try {
    await ctx.api.graphql(
      `mutation SettIKo($id: ID!, $oid: GitObjectID!) { enqueuePullRequest(input: { pullRequestId: $id, expectedHeadOid: $oid }) { mergeQueueEntry { position } } }`,
      { id, oid },
    );
  } catch (e) {
    if (e.dryRun) throw e;
    if (!ikkeBesvart(e)) throw new Error(`Fikk ikke lagt ${navn} i køen: ${e.message}`);
    const melding = `Fikk ikke lagt ${navn} i køen (${e.message}). Trykk «Merge when ready» på https://github.com/${EIER}/${repo}/pull/${nr}; jobben venter videre.`;
    ctx.logg(`::warning::${vask(melding)}`);
    ctx.sammendrag(`⚠️ ${melding}`);
    return ctx.utdata('satt', 'false');
  }
  ctx.utdata('satt', 'true');
  ctx.logg(`${vask(navn)} er satt i køen (${oid.slice(0, 7)}).`);
}

/**
 * Venter til PR-en er merget. To lesinger på rad utenfor køen betyr at den er tatt ut. Med
 * SATT_I_KO=false (enqueue feilet) teller lesinger utenfor køen først når PR-en har vært i den.
 */
export async function ventMerget(ctx, repo, nr) {
  const navn = `${repo} #${nr}`;
  const ut = `${navn} ble tatt ut av køen uten merge. Se køkjøringen, rett og start på nytt.`;
  let settIKo = ctx.env.SATT_I_KO !== 'false';
  let utenfor = 0;
  const merget = await vent(ctx, ctx.grenser.ko, `${navn} var ikke merget etter ${ctx.grenser.ko / MIN} min.`, async () => {
    const pr = await hentPr(ctx, repo, Number(nr));
    if (pr.state === 'MERGED') return true;
    if (pr.state !== 'OPEN') throw new Error(ut);
    if (pr.isInMergeQueue) settIKo = true;
    utenfor = pr.isInMergeQueue || !settIKo ? 0 : utenfor + 1;
    if (utenfor >= 2) throw new Error(ut);
    if (ctx.input.dryRun) ctx.notis(`dry_run: ${navn} er ${pr.isInMergeQueue ? 'i køen' : 'ikke i køen'}; venter ikke.`);
  });
  if (merget) ctx.sammendrag(`🚦 ${navn} er merget.`);
}

/**
 * Uten `skriv` sier steget bare om main fortsatt har pinnen. Med `skriv` lager det branchen og
 * PR-en, men setter den ikke i kø: e2e-køen blir grønn først når latest har endringene.
 */
async function fjern(ctx, skriv) {
  const inp = ctx.input;
  const gren = `fjern-pin-${inp.tag}`;
  const tittel = `TEK Fjern pinnen for ${repoer(inp).join(', ')} (${inp.tag})`;
  const { tekst, endret, fjernet } = fjernPinner(await hentFil(ctx, 'main'), repoer(inp), inp.tag);
  ctx.utdata('ferdig', String(!endret));
  if (!endret) return ctx.notis(`main pinner ikke ${repoer(inp).join(', ')} til ${inp.tag}; ingenting å fjerne.`);
  for (const t of inp.tjenester) {
    if ((await hentPr(ctx, t.repo, t.pr))?.state === 'MERGED') continue;
    const melding = `${t.repo} #${t.pr} er ikke merget, og pinnen fjernes først etter at service-PR-ene er merget.`;
    if (!inp.dryRun) throw new Error(melding);
    ctx.notis(`dry_run: ${melding}`);
  }
  if (!skriv) {
    if (inp.dryRun) ctx.notis(`dry_run: ville fjernet ${fjernet.join(', ')} på ${gren} og åpnet PR-en. ${tekst ?? 'Fila slettes.'}`);
    return;
  }
  const head = await hentRef(ctx, gren);
  if (!head) {
    const main = await hentRef(ctx, 'main');
    await ctx.api.rest('POST', `${R}/git/refs`, { ref: `refs/heads/${gren}`, sha: await lagCommit(ctx, main, tekst, tittel) });
  } else if ((await hentFil(ctx, head)) !== tekst) {
    await flyttRef(ctx, gren, await lagCommit(ctx, head, tekst, tittel), head);
  }
  const apne = await ctx.api.rest('GET', `${R}/pulls?state=open&head=${EIER}:${encodeURIComponent(gren)}`);
  const pr = apne[0] ?? (await ctx.api.rest('POST', `${R}/pulls`, {
    title: tittel,
    head: gren,
    base: 'main',
    body: `Fjerner pinnen til \`${inp.tag}\` nå som ${inp.tjenester.map((t) => `${EIER}/${t.repo}#${t.pr}`).join(', ')} er merget. Merge med «Merge when ready»: e2e-køen kjører hele suiten mot latest og blir grønn først når latest har endringene.\n\nBestilt av ${kodespenn(inp.bestiller)} via [Koblet merge](${ctx.env.RUN_URL ?? ''}).`,
  }));
  ctx.sammendrag(`🧹 PR-en som fjerner pinnen: ${pr.html_url}. Merge den med «Merge when ready».`);
}

// ---------------------------------------------------------------- CLI

const STEG = {
  input,
  sjekk,
  'pin-sjekk': (ctx) => pin(ctx, false),
  'pin-skriv': (ctx) => pin(ctx, true),
  'e2e-klar': e2eKlar,
  'service-klar': serviceKlar,
  'sett-i-ko': settIKo,
  'vent-merget': ventMerget,
  'fjern-sjekk': (ctx) => fjern(ctx, false),
  'fjern-skriv': (ctx) => fjern(ctx, true),
};

/** Kjører ett steg. Testene sender inn fetch, sleep og klokke. */
export async function kjor(steg, args, { env, fetch, sleep, now, logg, sammendrag, utdata }) {
  if (!Object.hasOwn(STEG, steg)) throw new Error(`Ukjent steg «${vask(steg)}». Gyldige: ${Object.keys(STEG).join(', ')}.`);
  const inp = lesInput({ tag: env.TAG, e2ePr: env.E2E_PR, tjenester: env.TJENESTER, requestedBy: env.REQUESTED_BY, dryRun: env.DRY_RUN });
  const ctx = { input: inp, env, fetch, sleep, now, logg, sammendrag, utdata, grenser: GRENSER, notis: (t) => logg(`::notice::${vask(t)}`) };
  if (steg !== 'input' && !env.GH_TOKEN) throw new Error('GH_TOKEN mangler.');
  ctx.api = lagKlient(ctx, env.GH_TOKEN);
  await STEG[steg](ctx, ...args);
}

async function main() {
  const [steg, ...args] = process.argv.slice(2);
  const env = process.env;
  const skriv = (fil, t) => fil && appendFileSync(fil, t);
  try {
    await kjor(steg ?? '', args, {
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
