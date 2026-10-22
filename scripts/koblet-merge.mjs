#!/usr/bin/env node
/**
 * Fletter en koblet endring: service-PR-er som krever nye e2e-tester, og e2e-PR-en som retter
 * testene. Kalles av .github/workflows/koblet-merge.yml, én underkommando per jobb:
 *
 *   input      validerer inputene og skriver matrisen og repolista for app-tokenet
 *   sjekk      PR-ene er åpne, klare og ikke i kø, og service-køene er tomme
 *   pin        legger pinnen i e2e-PR-ens .github/e2e-pins.json
 *   e2e-ko     setter e2e-PR-en i merge-køen og venter til den er merget
 *   service <repo> <pr>   venter til køen er tom, setter PR-en i kø og venter til den er merget
 *   latest  <repo> <pr>   venter på deploy-kjøringen for merge-commiten
 *   fjern-pin  åpner en PR som fjerner pinnen fra main, og fletter den gjennom køen
 *
 * Inputene leses fra TAG, E2E_PR, TJENESTER, REQUESTED_BY og DRY_RUN, tokenet fra GH_TOKEN.
 * Med APP_CLIENT_ID og APP_PRIVATE_KEY henter scriptet et nytt app-token før det gamle går ut
 * (det varer én time, og køene kan ta lenger). Hver jobb hopper over arbeid som er gjort, så en
 * ny kjøring fortsetter der en avbrutt kjøring slapp. Med DRY_RUN=true skriver scriptet ingenting.
 * Oppskriften står i docs/ci-cd/KOBLEDE-ENDRINGER.md.
 */
import { createSign } from 'node:crypto';
import { appendFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lesPinner, TJENESTER } from './e2e-pins.mjs';

export const EIER = 'navikt';
export const E2E_REPO = 'melosys-e2e-tests';
export const E2E_BASE = 'main';
export const PIN_FIL = '.github/e2e-pins.json';
const API = 'https://api.github.com';
const MIN = 60_000;

/** Ventetider. Køen i melosys-e2e-tests har 120 min svarfrist; 150 gir rom for oppstart. */
export const GRENSER = { klar: 30 * MIN, tomKo: 60 * MIN, ko: 150 * MIN, deploy: 60 * MIN, intervall: 30_000 };

/** Deploy-workflowen som oppdaterer latest. melosys-docker-compose har «Build and Push melosys-mock». */
const DEPLOY_NAVN = /^(deploy|build and push melosys-mock)/i;

// ---------------------------------------------------------------- rene funksjoner

/** Tekst fra GitHub eller inputene skal ikke bli workflow-kommandoer i loggen. */
export const vask = (tekst) =>
  String(tekst).replace(/[\r\n]+/g, ' ').replace(/::/g, ': :').replace(/##\[/g, '# #[');

/** Samme vask som e2e-brancher.yml gjør for requested_by. */
export function vaskBestiller(tekst) {
  // eslint-disable-next-line no-control-regex
  const vasket = String(tekst ?? '').replace(/[\u0000-\u001f\u007f#]/g, '').slice(0, 100).trim();
  return vasket || 'ukjent';
}

/** Pin-nøkkelen for et GitHub-repo, eller null når repoet ikke har en tjeneste i E2E Tests. */
export function pinNokkel(repo) {
  if (repo === 'melosys-docker-compose') return 'melosys-mock';
  if (repo === 'melosys-mock') return null;
  return Object.hasOwn(TJENESTER, repo) ? repo : null;
}

/** Validerer inputene. Kaster med en melding som kan vises i jobbloggen. */
export function lesInput({ tag, e2ePr, tjenester, requestedBy, dryRun }) {
  const feil = [];
  if (!/^br-[0-9]+$/.test(tag ?? '')) feil.push('tag må være br-<run_id> fra «E2E med brancher», for eksempel br-38725776923.');
  if (!/^[1-9][0-9]*$/.test(e2ePr ?? '')) feil.push('e2e_pr må være et PR-nummer i melosys-e2e-tests.');
  if (!['true', 'false', ''].includes(String(dryRun ?? ''))) feil.push('dry_run må være true eller false.');

  const liste = [];
  const elementer = String(tjenester ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (elementer.length === 0) feil.push('tjenester må ha minst én <repo>#<pr>, for eksempel melosys-web#3253.');
  for (const el of elementer) {
    const m = /^([A-Za-z0-9._-]+)#([1-9][0-9]*)$/.exec(el);
    if (!m) {
      feil.push(`«${vask(el)}» er ikke på formen <repo>#<pr>.`);
      continue;
    }
    const [, repo, pr] = m;
    const nokkel = pinNokkel(repo);
    if (!nokkel) {
      const gyldige = Object.keys(TJENESTER).map((t) => (t === 'melosys-mock' ? 'melosys-docker-compose' : t));
      feil.push(`Ukjent repo «${repo}». Gyldige: ${gyldige.join(', ')}.`);
      continue;
    }
    if (liste.some((t) => t.repo === repo)) {
      feil.push(`${repo} står to ganger. Én PR per repo: «E2E med brancher» bygger én branch per repo.`);
      continue;
    }
    liste.push({ repo, pr: Number(pr), nokkel });
  }
  if (feil.length) throw new Error(feil.join(' '));
  return {
    tag,
    e2ePr: Number(e2ePr),
    tjenester: liste,
    bestiller: vaskBestiller(requestedBy),
    dryRun: String(dryRun) === 'true',
  };
}

/** Legger inn pinnene. Andre tjenesters pinner står. `endret` er false når alt står fra før. */
export function leggTilPinner(tekst, nokler, tag) {
  const pinner = lesPinner(tekst ?? '');
  const nye = { ...pinner };
  for (const n of nokler) nye[n] = tag;
  const endret = nokler.some((n) => pinner[n] !== tag);
  const ut = JSON.stringify(nye, null, 2) + '\n';
  lesPinner(ut);
  return { tekst: ut, endret };
}

/**
 * Fjerner pinnene som fortsatt står på `tag`. En pin som er byttet til en annen tag, hører til
 * en annen endring og står. `tekst` er null når fila skal slettes.
 */
export function fjernPinner(tekst, nokler, tag) {
  const pinner = lesPinner(tekst ?? '');
  const fjernet = nokler.filter((n) => Object.hasOwn(pinner, n) && pinner[n] === tag);
  const igjen = Object.fromEntries(Object.entries(pinner).filter(([n]) => !fjernet.includes(n)));
  const tom = Object.keys(igjen).length === 0;
  return { tekst: tom ? null : JSON.stringify(igjen, null, 2) + '\n', endret: fjernet.length > 0, fjernet };
}

/** Pinner fila alle tjenestene til `tag`? */
export function harPinnene(tekst, nokler, tag) {
  try {
    const pinner = lesPinner(tekst ?? '');
    return nokler.every((n) => pinner[n] === tag);
  } catch {
    return false;
  }
}

/**
 * Sjekker en PR før den flettes. Svarer 'åpen' eller 'merget'; alt annet kaster.
 * `base` er branchen PR-en skal inn i, `egetRepo` krever at head-branchen ligger i repoet.
 */
export function sjekkPr(pr, { navn, base, egetRepo }) {
  if (!pr) throw new Error(`Fant ikke ${navn}.`);
  if (pr.state === 'MERGED') return 'merget';
  if (pr.state !== 'OPEN') throw new Error(`${navn} er ${pr.state}, ikke OPEN. Gjenåpne den eller start med en annen PR.`);
  const feil = [];
  if (pr.isDraft) feil.push(`${navn} er et utkast (draft). Gjør den klar for review.`);
  if (pr.baseRefName !== base) feil.push(`${navn} går mot ${vask(pr.baseRefName)}, ikke ${base}.`);
  if (egetRepo && pr.headRepository?.nameWithOwner !== egetRepo) {
    feil.push(`${navn} kommer fra en fork. Branchen må ligge i ${egetRepo}, så workflowen kan committe pinnen.`);
  }
  if (pr.mergeStateStatus === 'DIRTY') feil.push(`${navn} har konflikter mot ${vask(pr.baseRefName)}.`);
  if (pr.isInMergeQueue) feil.push(`${navn} står i merge-køen. Vent til den er merget, eller ta den ut av køen, og start på nytt.`);
  if (pr.reviewDecision === 'CHANGES_REQUESTED' || pr.reviewDecision === 'REVIEW_REQUIRED') {
    feil.push(`${navn} mangler godkjenning (${pr.reviewDecision}).`);
  }
  if (feil.length) throw new Error(feil.join(' '));
  return 'åpen';
}

/** Antall oppføringer i køen som ikke er `prNummer`. null-kø kaster: da kan PR-en ikke settes i kø. */
export function andreIKo(ko, { repo, branch, prNummer }) {
  if (!ko) {
    throw new Error(
      `${repo} har ingen merge-kø på ${branch}. Workflowen setter PR-er i kø og merger ikke forbi køen; bruk den manuelle oppskriften.`,
    );
  }
  return (ko.entries?.nodes ?? []).filter((e) => e.pullRequest?.number !== prNummer).length;
}

/**
 * Hva som skal gjøres for å få PR-en i køen:
 *   'merget' | 'i-ko' | 'auto-merge-på'  ingenting, bare vent
 *   'sett-i-ko'                          enqueuePullRequest
 *   'slå-på-auto-merge'                  enablePullRequestAutoMerge (sjekker står igjen, og repoet tillater det)
 *   'vent-på-sjekker'                    les på nytt senere
 */
export function velgKoHandling(pr, navn) {
  if (pr.state === 'MERGED') return 'merget';
  if (pr.state !== 'OPEN') throw new Error(`${navn} er ${pr.state}.`);
  if (pr.isInMergeQueue) return 'i-ko';
  if (pr.autoMergeRequest) return 'auto-merge-på';
  switch (pr.mergeStateStatus) {
    case 'DIRTY':
      throw new Error(`${navn} har konflikter mot ${vask(pr.baseRefName)}. Løs dem, kjør paret på nytt og start på nytt.`);
    case 'CLEAN':
    case 'HAS_HOOKS':
    case 'UNSTABLE':
    case 'BEHIND':
      return 'sett-i-ko';
    default:
      return pr.viewerCanEnableAutoMerge ? 'slå-på-auto-merge' : 'vent-på-sjekker';
  }
}

/** Status mens PR-en står i køen: 'merget' | 'venter' | 'ute' | 'lukket'. */
export function tolkKoPoll(pr) {
  if (pr.state === 'MERGED') return 'merget';
  if (pr.state !== 'OPEN') return 'lukket';
  if (pr.isInMergeQueue || pr.autoMergeRequest) return 'venter';
  return 'ute';
}

/** Nyeste deploy-kjøring blant kjøringene for en commit, eller null. */
export function velgDeployKjoring(runs) {
  const deploy = (runs ?? []).filter((r) => DEPLOY_NAVN.test(r.name ?? ''));
  deploy.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id);
  return deploy[0] ?? null;
}

/** 'mangler' | 'venter' | 'ok' | 'feilet' */
export function tolkDeploy(run) {
  if (!run) return 'mangler';
  if (run.status !== 'completed') return 'venter';
  return run.conclusion === 'success' ? 'ok' : 'feilet';
}

/** Kaller `sjekk` til den svarer noe annet enn undefined, eller til `grense` ms er gått. */
export async function vent(ctx, { sjekk, grense, tidsavbrudd }) {
  const start = ctx.now();
  for (;;) {
    const svar = await sjekk();
    if (svar !== undefined) return svar;
    if (ctx.now() - start >= grense) throw new Error(tidsavbrudd);
    await ctx.sleep(ctx.grenser.intervall);
  }
}

// ---------------------------------------------------------------- GitHub

class ApiFeil extends Error {
  constructor(status, melding) {
    super(melding);
    this.status = status;
  }
}

async function svar(res, hva) {
  const tekst = await res.text();
  const data = tekst ? JSON.parse(tekst) : null;
  if (!res.ok) throw new ApiFeil(res.status, `${hva} ga HTTP ${res.status}: ${vask(data?.message ?? tekst)}`);
  return data;
}

const hoder = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'melosys-koblet-merge',
});

/**
 * REST- og GraphQL-klient. Med `dryRun` kaster den på alt som skriver; jobbene sjekker dry_run
 * selv før de skriver, så dette er en ekstra sperre.
 */
export function lagKlient({ token, fetch, dryRun }) {
  const hentToken = typeof token === 'function' ? token : async () => token;
  return {
    async rest(metode, sti, body) {
      if (dryRun && metode !== 'GET') throw new Error(`dry_run: stoppet ${metode} ${sti}`);
      const res = await fetch(`${API}${sti}`, {
        method: metode,
        headers: { ...hoder(await hentToken()), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      return svar(res, `${metode} ${sti}`);
    },
    async graphql(query, variables) {
      if (dryRun && /^\s*mutation\b/.test(query)) throw new Error('dry_run: stoppet en GraphQL-mutasjon');
      const res = await fetch(`${API}/graphql`, {
        method: 'POST',
        headers: { ...hoder(await hentToken()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      const data = await svar(res, 'GraphQL');
      if (data.errors?.length) throw new ApiFeil(200, `GraphQL: ${vask(data.errors.map((e) => e.message).join('; '))}`);
      return data.data;
    },
  };
}

const b64url = (b) => Buffer.from(b).toString('base64url');

export function lagJwt(klientId, nokkel, naa) {
  const sek = Math.floor(naa / 1000);
  const data = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({ iat: sek - 60, exp: sek + 540, iss: klientId }),
  )}`;
  return `${data}.${createSign('RSA-SHA256').update(data).sign(nokkel, 'base64url')}`;
}

/**
 * Gir tokenet fra create-github-app-token, og et nytt installasjonstoken når det har levd i
 * `levetid` ms. Uten klient-ID og nøkkel gir den alltid det første tokenet.
 */
export function lagTokenKilde({ token, klientId, nokkel, repoer, rettigheter, fetch, now, levetid = 50 * MIN, logg = () => {} }) {
  let gjeldende = token;
  let hentet = now();
  return async () => {
    if (!klientId || !nokkel || now() - hentet < levetid) return gjeldende;
    const h = hoder(lagJwt(klientId, nokkel, now()));
    const inst = await svar(await fetch(`${API}/repos/${EIER}/${E2E_REPO}/installation`, { headers: h }), 'Oppslag av app-installasjonen');
    const ny = await svar(
      await fetch(`${API}/app/installations/${inst.id}/access_tokens`, {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositories: repoer, ...(rettigheter ? { permissions: rettigheter } : {}) }),
      }),
      'Nytt app-token',
    );
    logg(`::add-mask::${ny.token}`);
    gjeldende = ny.token;
    hentet = now();
    return gjeldende;
  };
}

const PR_FELT = `number url title state isDraft baseRefName headRefName headRefOid
  headRepository { nameWithOwner } isInMergeQueue mergeQueueEntry { state position }
  mergeCommit { oid } mergeStateStatus reviewDecision viewerCanEnableAutoMerge autoMergeRequest { enabledAt }`;

async function hentPr(ctx, repo, nr) {
  const data = await ctx.api.graphql(
    `query Pr($eier: String!, $repo: String!, $nr: Int!) {
      repository(owner: $eier, name: $repo) { defaultBranchRef { name } pullRequest(number: $nr) { id ${PR_FELT} } }
    }`,
    { eier: EIER, repo, nr },
  );
  if (!data.repository) throw new Error(`Fant ikke repoet ${EIER}/${repo}.`);
  return { ...data.repository.pullRequest, defaultBranch: data.repository.defaultBranchRef?.name };
}

async function hentKo(ctx, repo, branch) {
  const data = await ctx.api.graphql(
    `query Ko($eier: String!, $repo: String!, $branch: String!) {
      repository(owner: $eier, name: $repo) {
        mergeQueue(branch: $branch) { entries(first: 100) { totalCount nodes { state position pullRequest { number } } } }
      }
    }`,
    { eier: EIER, repo, branch },
  );
  return data.repository?.mergeQueue ?? null;
}

const refSti = (branch) => branch.split('/').map(encodeURIComponent).join('/');

async function hentFil(ctx, repo, sti, ref) {
  try {
    const data = await ctx.api.rest('GET', `/repos/${EIER}/${repo}/contents/${sti}?ref=${encodeURIComponent(ref)}`);
    return Buffer.from(data.content ?? '', 'base64').toString('utf8');
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function hentRef(ctx, repo, branch) {
  return (await ctx.api.rest('GET', `/repos/${EIER}/${repo}/git/ref/heads/${refSti(branch)}`)).object.sha;
}

/** Lager en commit med `parent` som forelder der `tekst` (null = slett) er pin-fila. */
async function lagPinCommit(ctx, { parent, tekst, melding }) {
  const r = `/repos/${EIER}/${E2E_REPO}`;
  const forelder = await ctx.api.rest('GET', `${r}/git/commits/${parent}`);
  const tre = await ctx.api.rest('POST', `${r}/git/trees`, {
    base_tree: forelder.tree.sha,
    tree: [tekst === null ? { path: PIN_FIL, mode: '100644', type: 'blob', sha: null } : { path: PIN_FIL, mode: '100644', type: 'blob', content: tekst }],
  });
  return (await ctx.api.rest('POST', `${r}/git/commits`, { message: melding, tree: tre.sha, parents: [parent] })).sha;
}

/**
 * Setter PR-en i kø uten køhopp. enqueuePullRequest når PR-en er klar; enablePullRequestAutoMerge
 * bare når sjekker står igjen og repoet tillater auto-merge, eller når enqueue feiler.
 */
async function settIKo(ctx, pr, navn, handling) {
  const inn = { id: pr.id, oid: pr.headRefOid };
  const autoMerge = () =>
    ctx.api.graphql(
      `mutation AutoMerge($id: ID!, $oid: GitObjectID!) {
        enablePullRequestAutoMerge(input: { pullRequestId: $id, expectedHeadOid: $oid }) { clientMutationId }
      }`,
      inn,
    );
  if (handling === 'slå-på-auto-merge') {
    await autoMerge();
    ctx.logg(`${navn}: auto-merge er slått på; GitHub setter PR-en i køen når sjekkene er grønne.`);
    return;
  }
  try {
    await ctx.api.graphql(
      `mutation SettIKo($id: ID!, $oid: GitObjectID!) {
        enqueuePullRequest(input: { pullRequestId: $id, expectedHeadOid: $oid }) { mergeQueueEntry { position } }
      }`,
      inn,
    );
    ctx.logg(`${navn} er satt i køen.`);
  } catch (e) {
    if (!pr.viewerCanEnableAutoMerge) throw new Error(`Fikk ikke satt ${navn} i køen: ${e.message}`);
    ctx.logg(`enqueuePullRequest feilet (${e.message}); prøver auto-merge.`);
    await autoMerge();
  }
}

/** Får PR-en gjennom køen og venter til den er merget. Med dry_run leser den bare. */
async function gjennomKo(ctx, { repo, nr, navn, utMelding }) {
  let pr = await hentPr(ctx, repo, nr);
  const forst = velgKoHandling(pr, navn);
  if (forst === 'merget') {
    ctx.notis(`${navn} er allerede merget.`);
    return pr;
  }
  if (ctx.input.dryRun) {
    ctx.notis(`dry_run: ${navn} har status ${pr.mergeStateStatus}; neste steg ville vært «${forst}». Venter ikke på køen.`);
    return pr;
  }
  await vent(ctx, {
    grense: ctx.grenser.klar,
    tidsavbrudd: `${navn} ble ikke klar for køen på ${ctx.grenser.klar / MIN} min (status ${pr.mergeStateStatus}). Sjekk godkjenning og sjekker, og start på nytt.`,
    sjekk: async () => {
      pr = await hentPr(ctx, repo, nr);
      const h = velgKoHandling(pr, navn);
      if (h === 'sett-i-ko' || h === 'slå-på-auto-merge') await settIKo(ctx, pr, navn, h);
      return h === 'vent-på-sjekker' ? undefined : h;
    },
  });
  let ute = 0;
  return vent(ctx, {
    grense: ctx.grenser.ko,
    tidsavbrudd: `${navn} var ikke merget etter ${ctx.grenser.ko / MIN} min. Se køen og start på nytt.`,
    sjekk: async () => {
      pr = await hentPr(ctx, repo, nr);
      const s = tolkKoPoll(pr);
      if (s === 'merget') return pr;
      if (s === 'lukket') throw new Error(utMelding);
      // To lesinger på rad, så en kø som ikke har rukket å vise oppføringen, ikke gir falsk feil.
      ute = s === 'ute' ? ute + 1 : 0;
      if (ute >= 2) throw new Error(utMelding);
      return undefined;
    },
  });
}

// ---------------------------------------------------------------- jobbene

const nokler = (input) => input.tjenester.map((t) => t.nokkel);
const e2eNavn = (input) => `e2e #${input.e2ePr}`;

export function input(ctx) {
  const { tjenester } = ctx.input;
  ctx.utdata('matrix', JSON.stringify({ include: tjenester }));
  ctx.utdata('repos', [E2E_REPO, ...tjenester.map((t) => t.repo)].join('\n'));
}

export async function sjekk(ctx) {
  const { input: inp } = ctx;
  const feil = [];
  let e2eMerget = false;
  try {
    const e2e = await hentPr(ctx, E2E_REPO, inp.e2ePr);
    if (sjekkPr(e2e, { navn: e2eNavn(inp), base: E2E_BASE, egetRepo: `${EIER}/${E2E_REPO}` }) === 'merget') {
      const fil = await hentFil(ctx, E2E_REPO, PIN_FIL, e2e.mergeCommit.oid);
      if (!harPinnene(fil, nokler(inp), inp.tag)) {
        throw new Error(
          `${e2eNavn(inp)} er MERGED, ikke OPEN. En merget e2e-PR godtas bare når den pinner ${nokler(inp).join(', ')} til ${inp.tag}, slik en tidligere kjøring av denne workflowen gjør.`,
        );
      }
      e2eMerget = true;
      ctx.notis(`${e2eNavn(inp)} er allerede merget med pinnen. Kjøringen fortsetter der forrige slapp.`);
    }
  } catch (e) {
    feil.push(e.message);
  }

  for (const t of inp.tjenester) {
    const navn = `${t.repo} #${t.pr}`;
    try {
      const pr = await hentPr(ctx, t.repo, t.pr);
      const status = sjekkPr(pr, { navn, base: pr?.defaultBranch });
      if (status === 'merget') {
        if (!e2eMerget) throw new Error(`${navn} er merget, men ${e2eNavn(inp)} er ikke merget med pinnen. Paret er ute av rekkefølge; rett opp for hånd.`);
        ctx.notis(`${navn} er allerede merget.`);
        continue;
      }
      const ko = await hentKo(ctx, t.repo, pr.defaultBranch);
      const n = andreIKo(ko, { repo: t.repo, branch: pr.defaultBranch, prNummer: t.pr });
      if (n > 0) throw new Error(`${t.repo} har ${n} PR-er i køen. Vent til køen er tom og start på nytt.`);
    } catch (e) {
      feil.push(e.message);
    }
  }
  if (feil.length) throw new Error(feil.join('\n'));
  ctx.sammendrag(`✅ Paret er klart: ${e2eNavn(inp)} og ${inp.tjenester.map((t) => `${t.repo} #${t.pr}`).join(', ')} (${inp.tag}).`);
}

export async function pin(ctx) {
  const { input: inp } = ctx;
  const pr = await hentPr(ctx, E2E_REPO, inp.e2ePr);
  if (sjekkPr(pr, { navn: e2eNavn(inp), base: E2E_BASE, egetRepo: `${EIER}/${E2E_REPO}` }) === 'merget') {
    ctx.notis(`${e2eNavn(inp)} er merget; pinnen ligger i main.`);
    ctx.sammendrag(`📌 ${e2eNavn(inp)} er allerede merget.`);
    return;
  }
  const branch = pr.headRefName;
  const head = await hentRef(ctx, E2E_REPO, branch);
  const { tekst, endret } = leggTilPinner(await hentFil(ctx, E2E_REPO, PIN_FIL, head), nokler(inp), inp.tag);
  if (!endret) {
    ctx.notis(`${PIN_FIL} på ${vask(branch)} pinner allerede ${nokler(inp).join(', ')} til ${inp.tag}.`);
    ctx.sammendrag(`📌 Pinnen sto allerede i ${e2eNavn(inp)}.`);
    return;
  }
  const melding = `TEK Pin ${nokler(inp).join(', ')} til ${inp.tag}`;
  if (inp.dryRun) {
    ctx.notis(`dry_run: ville committet «${melding}» til ${vask(branch)} oppå ${head}:\n${tekst}`);
    ctx.sammendrag(`📌 dry_run: ville lagt pinnen i ${e2eNavn(inp)}.`);
    return;
  }
  const commit = await lagPinCommit(ctx, { parent: head, tekst, melding });
  try {
    await ctx.api.rest('PATCH', `/repos/${EIER}/${E2E_REPO}/git/refs/heads/${refSti(branch)}`, { sha: commit, force: false });
  } catch (e) {
    if (e.status === 422) {
      throw new Error(`${vask(branch)} er endret siden jobben leste den (${head}). Kjør paret på nytt hvis endringen er vesentlig, og start på nytt.`);
    }
    throw e;
  }
  ctx.sammendrag(`📌 Pinnen er lagt i ${e2eNavn(inp)} (${commit.slice(0, 7)}).`);
}

export async function e2eKo(ctx) {
  const { input: inp } = ctx;
  const navn = e2eNavn(inp);
  const pr = await hentPr(ctx, E2E_REPO, inp.e2ePr);
  if (pr.state === 'OPEN' && !harPinnene(await hentFil(ctx, E2E_REPO, PIN_FIL, pr.headRefOid), nokler(inp), inp.tag)) {
    const melding = `${navn} pinner ikke ${nokler(inp).join(', ')} til ${inp.tag} på ${pr.headRefOid.slice(0, 7)}.`;
    if (!inp.dryRun) throw new Error(`${melding} Start på nytt, så legger pin-jobben den inn.`);
    ctx.notis(`dry_run: ${melding} Pin-jobben ville lagt den inn.`);
  }
  const ferdig = await gjennomKo(ctx, {
    repo: E2E_REPO,
    nr: inp.e2ePr,
    navn,
    utMelding: 'e2e-PR-en ble tatt ut av køen. Se kjøringen i køen, rett og start på nytt.',
  });
  ctx.sammendrag(ferdig.state === 'MERGED' ? `🚦 ${navn} er merget.` : `🚦 dry_run: ${navn} ble ikke satt i kø.`);
}

function finnTjeneste(inp, repo, nr) {
  const i = inp.tjenester.findIndex((t) => t.repo === repo && t.pr === Number(nr));
  if (i === -1) throw new Error(`${vask(repo)} #${vask(nr)} er ikke i tjenester.`);
  return i;
}

export async function service(ctx, repo, nr) {
  const { input: inp } = ctx;
  const i = finnTjeneste(inp, repo, nr);
  const t = inp.tjenester[i];
  const navn = `${t.repo} #${t.pr}`;
  const pr = await hentPr(ctx, t.repo, t.pr);
  if (pr.state === 'MERGED') {
    ctx.notis(`${navn} er allerede merget.`);
    ctx.sammendrag(`🚦 ${navn} er allerede merget.`);
    return;
  }
  // Rekkefølgen er en garanti, ikke bare matrisens kjørerekkefølge.
  const forran = [{ repo: E2E_REPO, pr: inp.e2ePr, navn: e2eNavn(inp) }, ...inp.tjenester.slice(0, i)];
  for (const f of forran) {
    const s = (await hentPr(ctx, f.repo, f.pr)).state;
    if (s !== 'MERGED') {
      const melding = `${f.navn ?? `${f.repo} #${f.pr}`} er ikke merget ennå, og ${navn} skal inn etter den.`;
      if (!inp.dryRun) throw new Error(melding);
      ctx.notis(`dry_run: ${melding}`);
    }
  }

  const ko = async () => andreIKo(await hentKo(ctx, t.repo, pr.defaultBranch), { repo: t.repo, branch: pr.defaultBranch, prNummer: t.pr });
  if (inp.dryRun) {
    const n = await ko();
    ctx.notis(`dry_run: ${t.repo} har ${n} PR-er i køen; ${n ? 'ville ventet til den er tom' : 'ville satt PR-en i kø med én gang'}.`);
  } else {
    let sist = 0;
    await vent(ctx, {
      grense: ctx.grenser.tomKo,
      tidsavbrudd: `${t.repo}-køen var ikke tom etter ${ctx.grenser.tomKo / MIN} min. Start på nytt når den er tom.`,
      sjekk: async () => {
        const n = await ko();
        if (n === 0) return true;
        if (n !== sist) ctx.logg(`${t.repo} har ${n} PR-er i køen; venter til den er tom.`);
        sist = n;
        return undefined;
      },
    });
  }
  const ferdig = await gjennomKo(ctx, {
    repo: t.repo,
    nr: t.pr,
    navn,
    utMelding: `${navn} ble tatt ut av køen uten merge. Se kjøringen i køen, rett og start på nytt.`,
  });
  ctx.sammendrag(ferdig.state === 'MERGED' ? `🚦 ${navn} er merget.` : `🚦 dry_run: ${navn} ble ikke satt i kø.`);
}

export async function latest(ctx, repo, nr) {
  const { input: inp } = ctx;
  const t = inp.tjenester[finnTjeneste(inp, repo, nr)];
  const navn = `${t.repo} #${t.pr}`;
  const pr = await hentPr(ctx, t.repo, t.pr);
  if (pr.state !== 'MERGED') {
    if (!inp.dryRun) throw new Error(`${navn} er ikke merget.`);
    ctx.notis(`dry_run: ${navn} er ikke merget; venter ikke på deploy.`);
    ctx.sammendrag(`🚀 dry_run: ${t.repo} latest ble ikke sjekket.`);
    return;
  }
  const sha = pr.mergeCommit.oid;
  const les = async () =>
    velgDeployKjoring(
      (await ctx.api.rest('GET', `/repos/${EIER}/${t.repo}/actions/runs?head_sha=${sha}&event=push&per_page=100`)).workflow_runs,
    );
  const sjekkKjoring = (run) => {
    const s = tolkDeploy(run);
    if (s === 'feilet') throw new Error(`«${vask(run.name)}» for ${sha.slice(0, 7)} i ${t.repo} endte med ${run.conclusion}: ${run.html_url}`);
    return s === 'ok' ? run : undefined;
  };
  if (inp.dryRun) {
    const run = await les();
    ctx.notis(`dry_run: deploy-kjøringen for ${sha.slice(0, 7)} har status ${tolkDeploy(run)}${run ? ` (${run.html_url})` : ''}.`);
    ctx.sammendrag(`🚀 dry_run: ${t.repo}: deploy-kjøringen har status ${tolkDeploy(run)}.`);
    return;
  }
  const run = await vent(ctx, {
    grense: ctx.grenser.deploy,
    tidsavbrudd: `Fant ingen fullført deploy-kjøring for ${sha.slice(0, 7)} i ${t.repo} etter ${ctx.grenser.deploy / MIN} min.`,
    sjekk: async () => sjekkKjoring(await les()),
  });
  ctx.sammendrag(`🚀 ${t.repo} latest har ${navn}: ${run.html_url}`);
}

export async function fjernPin(ctx) {
  const { input: inp } = ctx;
  const r = `/repos/${EIER}/${E2E_REPO}`;
  const gren = `fjern-pin-${inp.tag}`;
  const tittel = `TEK Fjern pinnen for ${nokler(inp).join(', ')} (${inp.tag})`;
  const navn = `PR-en som fjerner pinnen`;
  const utMelding = `${navn} ble tatt ut av køen. Se kjøringen i køen, rett og start på nytt.`;

  const apen = await ctx.api.rest('GET', `${r}/pulls?state=open&head=${EIER}:${encodeURIComponent(gren)}`);
  if (apen.length) {
    ctx.logg(`Fortsetter med ${apen[0].html_url}.`);
    const ferdig = await gjennomKo(ctx, { repo: E2E_REPO, nr: apen[0].number, navn, utMelding });
    ctx.sammendrag(ferdig.state === 'MERGED' ? `🧹 Pinnen er fjernet: ${apen[0].html_url}` : `🧹 dry_run: ${apen[0].html_url} ble ikke satt i kø.`);
    return;
  }

  const main = await hentRef(ctx, E2E_REPO, E2E_BASE);
  const { tekst, endret, fjernet } = fjernPinner(await hentFil(ctx, E2E_REPO, PIN_FIL, main), nokler(inp), inp.tag);
  if (!endret) {
    ctx.notis(`main pinner ikke ${nokler(inp).join(', ')} til ${inp.tag}; ingenting å fjerne.`);
    ctx.sammendrag(`🧹 main har ikke pinnen for ${inp.tag}.`);
    return;
  }
  if (inp.dryRun) {
    ctx.notis(`dry_run: ville fjernet ${fjernet.join(', ')} fra ${PIN_FIL} på ${gren} og åpnet «${tittel}». ${tekst === null ? 'Fila slettes.' : `Igjen:\n${tekst}`}`);
    ctx.sammendrag(`🧹 dry_run: ville fjernet pinnen for ${fjernet.join(', ')}.`);
    return;
  }
  const commit = await lagPinCommit(ctx, { parent: main, tekst, melding: tittel });
  try {
    await ctx.api.rest('POST', `${r}/git/refs`, { ref: `refs/heads/${gren}`, sha: commit });
  } catch (e) {
    if (e.status === 422) throw new Error(`Branchen ${gren} finnes fra før uten åpen PR. Slett den og start på nytt.`);
    throw e;
  }
  const par = [`#${inp.e2ePr}`, ...inp.tjenester.map((t) => `${EIER}/${t.repo}#${t.pr}`)].join(', ');
  const ny = await ctx.api.rest('POST', `${r}/pulls`, {
    title: tittel,
    head: gren,
    base: E2E_BASE,
    body: [
      `Fjerner pinnen til \`${inp.tag}\` for ${fjernet.join(', ')} nå som latest har endringen.`,
      '',
      `Paret: ${par}. Bestilt av ${inp.bestiller}.`,
      `Laget av [Koblet merge](${ctx.kjoringUrl}).`,
    ].join('\n'),
  });
  ctx.logg(`Åpnet ${ny.html_url}.`);
  await gjennomKo(ctx, { repo: E2E_REPO, nr: ny.number, navn, utMelding });
  ctx.sammendrag(`🧹 Pinnen er fjernet: ${ny.html_url}`);
}

// ---------------------------------------------------------------- CLI

export const JOBBER = { input, sjekk, pin, 'e2e-ko': e2eKo, service, latest, 'fjern-pin': fjernPin };

/** Kjører en jobb. Brukes av CLI-et og av testene, som sender inn fetch, sleep og klokke. */
export async function kjor(jobb, args, { env, fetch, sleep, now, logg, sammendrag, utdata }) {
  const inp = lesInput({ tag: env.TAG, e2ePr: env.E2E_PR, tjenester: env.TJENESTER, requestedBy: env.REQUESTED_BY, dryRun: env.DRY_RUN });
  const token = lagTokenKilde({
    token: env.GH_TOKEN,
    klientId: inp.dryRun ? undefined : env.APP_CLIENT_ID,
    nokkel: inp.dryRun ? undefined : env.APP_PRIVATE_KEY,
    repoer: (env.APP_REPOS ?? E2E_REPO).split(/[\s,]+/).filter(Boolean),
    rettigheter: env.APP_PERMISSIONS ? JSON.parse(env.APP_PERMISSIONS) : undefined,
    fetch,
    now,
    logg,
  });
  const ctx = {
    input: inp,
    api: lagKlient({ token, fetch, dryRun: inp.dryRun }),
    sleep,
    now,
    grenser: GRENSER,
    logg,
    notis: (t) => logg(`::notice::${vask(t)}`),
    sammendrag,
    utdata,
    kjoringUrl: env.RUN_URL ?? '',
  };
  if (!Object.hasOwn(JOBBER, jobb)) throw new Error(`Ukjent jobb «${vask(jobb)}». Gyldige: ${Object.keys(JOBBER).join(', ')}.`);
  if (jobb !== 'input' && !env.GH_TOKEN) throw new Error('GH_TOKEN mangler.');
  await JOBBER[jobb](ctx, ...args);
}

async function main() {
  const [jobb, ...args] = process.argv.slice(2);
  const env = process.env;
  try {
    await kjor(jobb ?? '', args, {
      env,
      fetch: globalThis.fetch,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: () => Date.now(),
      logg: (t) => console.log(t),
      sammendrag: (t) => {
        console.log(t);
        if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${vask(t)}\n`);
      },
      utdata: (navn, verdi) => {
        console.log(`${navn}=${verdi}`);
        if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${navn}<<KOBLET_EOF\n${verdi}\nKOBLET_EOF\n`);
      },
    });
  } catch (e) {
    for (const linje of String(e.message).split('\n')) console.log(`::error::${vask(linje)}`);
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `❌ ${vask(e.message)}\n`);
    process.exitCode = 1;
  }
}

// Kjør bare når scriptet startes direkte, ikke når testen importerer funksjonene.
if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  main();
}
