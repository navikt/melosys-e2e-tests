#!/usr/bin/env node
/**
 * Kjører e2e-testene en PR påvirker med video, og legger ett mp4-opptak per test i
 * PR-beskrivelsen, i en seksjon sist mellom <!-- e2e-opptak:start --> og <!-- e2e-opptak:end -->.
 * En ny kjøring bytter bare ut seksjonen sist; teksten over står urørt.
 *
 * GitHub spiller bare av video fra user-attachments-lenker, og de lager bare `gh pr edit --attach`
 * med en personlig innlogging. GITHUB_TOKEN, GH_TOKEN og app-tokens avvises. Derfor kjører dette
 * fra maskinen din, ikke fra en workflow.
 * Oppskriften står i docs/ci-cd/KJOR-E2E-PA-CI.md.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const START = '<!-- e2e-opptak:start -->';
export const SLUTT = '<!-- e2e-opptak:end -->';
/** `gh pr edit` tar maks 50 vedlegg per kall. Flere ville krevd flere kall med halvferdig beskrivelse. */
export const MAKS_GRENSE = 50;
export const MAKS_STANDARD = 20;
const MINSTE_GH = [2, 99];

const HJELP = `Bruk: node scripts/pr-opptak.mjs <pr> [--run <id>] [--lokal] [--maks <n>] [--slowmo <ms>] [--torrt]

Kjører e2e-testene PR-en påvirker med video, og legger ett opptak per test i PR-beskrivelsen.

  <pr>          PR-nummeret i melosys-e2e-tests
  --run <id>    bruk opptakene fra en kjøring startet med VIDEO=1, i stedet for å starte en ny
  --lokal       kjør testene mot stacken som kjører lokalt, i stedet for på CI
  --maks <n>    største antall opptak (standard ${MAKS_STANDARD}, høyst ${MAKS_GRENSE})
  --slowmo <ms> pause etter hver handling i nettleseren (standard 400)
  --torrt       gjør alt unntatt å endre PR-beskrivelsen, og skriv ut seksjonen

Krever gh ${MINSTE_GH.join('.')} eller nyere med personlig innlogging (gh auth login), og ffmpeg.
Fra make: make pr-opptak PR=<n> [RUN=<id>] [LOKAL=1] [MAKS=<n>] [SLOWMO=<ms>] [TORRT=1]`;

// ---------------------------------------------------------------- rene funksjoner

export function lesArgumenter(argv) {
  const a = { pr: null, run: null, lokal: false, maks: MAKS_STANDARD, slowmo: null, torrt: false, hjelp: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') a.hjelp = true;
    else if (arg === '--lokal') a.lokal = true;
    else if (arg === '--torrt') a.torrt = true;
    else if (arg === '--run') a.run = argv[++i];
    else if (arg === '--maks') a.maks = argv[++i];
    else if (arg === '--slowmo') a.slowmo = argv[++i];
    else if (!arg.startsWith('-') && a.pr === null) a.pr = arg;
    else throw new Error(`Ukjent argument «${arg}». Se --help.`);
  }
  if (a.hjelp) return a;
  if (!/^[1-9][0-9]*$/.test(a.pr ?? '')) throw new Error('Mangler PR-nummer: make pr-opptak PR=<n>.');
  if (a.run !== null && !/^[1-9][0-9]*$/.test(a.run ?? '')) throw new Error('--run (RUN=) må være id-en til en kjøring av E2E Tests.');
  if (a.run !== null && a.lokal) throw new Error('RUN= og LOKAL=1 kan ikke brukes sammen.');
  if (!/^[1-9][0-9]*$/.test(String(a.maks))) throw new Error('--maks (MAKS=) må være et positivt heltall.');
  a.maks = Number(a.maks);
  if (a.maks > MAKS_GRENSE) throw new Error(`MAKS kan være høyst ${MAKS_GRENSE}, fordi gh pr edit tar maks ${MAKS_GRENSE} vedlegg per kall.`);
  if (a.slowmo !== null && !/^[0-9]+$/.test(a.slowmo ?? '')) throw new Error('--slowmo (SLOWMO=) må være et antall millisekunder, for eksempel 800.');
  if (a.slowmo !== null && a.run !== null) throw new Error('SLOWMO= virker ikke med RUN=, fordi opptakene i kjøringen allerede er tatt.');
  return a;
}

/** Krever gh ≥ 2.99: eldre versjoner har ikke --attach. */
export function ghVersjonHolder(tekst) {
  const m = /gh version (\d+)\.(\d+)/.exec(tekst ?? '');
  if (!m) return false;
  const [hoved, minor] = [Number(m[1]), Number(m[2])];
  return hoved > MINSTE_GH[0] || (hoved === MINSTE_GH[0] && minor >= MINSTE_GH[1]);
}

/**
 * Stien i opptak.json er absolutt på maskinen som kjørte testene. opptak.json ligger i roten av
 * test-results, både i artefaktet og lokalt, så resten av stien etter /test-results/ gjelder fra
 * mappa til fila.
 */
export function løsOppVideo(sti, jsonMappe) {
  const s = String(sti).replace(/\\/g, '/');
  const i = s.lastIndexOf('/test-results/');
  if (i >= 0) return join(jsonMappe, s.slice(i + '/test-results/'.length));
  return resolve(jsonMappe, s);
}

/**
 * Flater ut Playwrights JSON-rapport til én rad per test. Toppnivået er fila, og tittelen dens
 * er ikke med i navnet. Opptaket er fra det siste forsøket som har video, så en flaky test viser
 * forsøket som ble grønt.
 */
export function lesOpptak(rapport, jsonMappe) {
  const rader = [];
  const gå = (suite, sti) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const video = (r) => (r.attachments ?? []).find((v) => v.name === 'video' && v.path);
        const r = (t.results ?? []).filter(video).at(-1);
        rader.push({
          tittel: [...sti, spec.title].join(' › '),
          status: t.status,
          resultat: r?.status ?? null,
          varighet: r?.duration ?? null,
          video: r ? løsOppVideo(video(r).path, jsonMappe) : null,
        });
      }
    }
    for (const barn of suite.suites ?? []) gå(barn, [...sti, barn.title]);
  };
  for (const fil of rapport.suites ?? []) gå(fil, []);
  return rader;
}

export const sorter = (rader) => [...rader].sort((a, b) => a.tittel.localeCompare(b.tittel, 'nb'));

/**
 * En feil som et nytt forsøk med RUN=<id> kan rette: `gjenbruk` er det som må legges til
 * (tom streng for ingenting). Uten feltet hjelper ikke et nytt forsøk, og mappa slettes.
 */
const gjenbrukbar = (gjenbruk, melding) => Object.assign(new Error(melding), gjenbruk === undefined ? {} : { gjenbruk });

/** Opptakene som skal i beskrivelsen; avviser flere enn maks, slik at hele suiten ikke havner der. */
export function velgOpptak(rader, maks) {
  const opptak = sorter(rader.filter((r) => r.video));
  if (opptak.length > maks) {
    throw gjenbrukbar(opptak.length <= MAKS_GRENSE ? `MAKS=${opptak.length}` : undefined,
      `${opptak.length} opptak er flere enn grensen på ${maks}. Snevre inn utvalget, for eksempel med ` +
        `make ci-grep GREP=<mønster> VIDEO=1 og så RUN=<id>, eller øk grensen med MAKS=<n> (høyst ${MAKS_GRENSE}).`,
    );
  }
  return opptak;
}

/**
 * Playwright gir en test som bare ble avbrutt utfallet skipped, men den har opptak og står i
 * lista. Oppsummeringen teller derfor etter det lista viser.
 */
const utfall = (r) => {
  // En test med et rødt forsøk før avbruddet er unexpected og telles som feilet.
  if (r.status === 'skipped' && r.resultat === 'interrupted') return 'avbrutt';
  if (r.status === 'skipped') return r.video ? 'hoppet over' : 'uten opptak';
  return { expected: 'grønne', unexpected: 'feilet', flaky: 'flaky' }[r.status] ?? r.status;
};

export function oppsummer(rader) {
  const antall = (u) => rader.filter((r) => utfall(r) === u).length;
  const deler = ['grønne', 'feilet', 'flaky', 'avbrutt', 'hoppet over']
    .map((u) => [antall(u), u])
    .filter(([n]) => n > 0)
    .map(([n, u]) => `${n} ${u}`);
  let tekst = deler.length ? deler.join(', ') : 'ingen tester kjørt';
  const hoppet = antall('uten opptak');
  if (hoppet) tekst += `. ${hoppet} hoppet over og har ikke opptak`;
  const utenVideo = rader.filter((r) => r.status !== 'skipped' && !r.video).length;
  if (utenVideo) tekst += `. ${utenVideo} mangler opptak`;
  return `${tekst}.`;
}

export function formaterVarighet(ms) {
  const sek = Math.round((ms ?? 0) / 1000);
  return sek < 60 ? `${sek} s` : `${Math.floor(sek / 60)} min ${sek % 60} s`;
}

/**
 * Testtitler i fet skrift. Tagger som @eessi settes i kodefont, ellers blir de nevninger av
 * GitHub-brukere.
 */
export function formaterTittel(tittel) {
  const deler = String(tittel).split(/(@[\w-]+)/);
  return deler
    .map((d, i) => (i % 2 ? `\`${d}\`` : d.replace(/[\\`*_[\]<>#|~]/g, '\\$&')))
    .join('');
}

export function lagSeksjon({ kilde, runUrl, commit, rader, opptak, konklusjon = null, advarsler = [] }) {
  const kort = String(commit).slice(0, 7);
  const hvor = kilde === 'ci' ? `Kjørt i CI ([kjøring](${runUrl}))` : 'Kjørt lokalt mot stacken';
  const linjer = [START, '## Opptak av testene', '', `${hvor} på commit \`${kort}\`: ${oppsummer(rader)}`, ''];
  if (konklusjon && konklusjon !== 'success') linjer.push(`Kjøringen endte med ${konklusjon}.`, '');
  for (const a of advarsler) linjer.push(`⚠️ ${a}`, '');
  opptak.forEach((o, i) => {
    const merknad = o.status === 'flaky' ? 'flaky' : o.resultat !== 'passed' ? o.resultat : null;
    const tid = formaterVarighet(o.varighet) + (merknad ? `, ${merknad}` : '');
    linjer.push(`**${formaterTittel(o.tittel)}** (${tid})`, '', `![](./opptak-${i + 1}.mp4)`, '');
  });
  linjer.push(SLUTT);
  return linjer.join('\n');
}

/** Linja er markøren alene, med mellomrom, tab eller \r etter. */
const erMarkør = (linje, m) => new RegExp(`^${m}[ \\t\\r]*$`).test(linje);

/**
 * Seksjonen står alltid sist i beskrivelsen: { fra } når siste linje (etter at avsluttende
 * blanktegn er fjernet) er sluttmarkøren og nærmeste markørlinje over den er startmarkøren.
 * Ellers finnes ingen seksjon. Markører andre steder (kodefont, kodeblokker, sitater, en eldre
 * seksjon med tekst etter) røres aldri. Tilstandene:
 *   tom eller uten seksjon sist → seksjonen legges til sist;
 *   seksjon sist (også med CRLF og blanktegn etter) → bare den byttes ut;
 *   slutt sist uten start rett over, eller en eldre seksjon med tekst etter → ny seksjon sist.
 */
export function finnSeksjon(body) {
  const tekst = body ?? '';
  const linjer = tekst.replace(/\s+$/, '').split('\n');
  if (!erMarkør(linjer.at(-1), SLUTT)) return null;
  let index = tekst.replace(/\s+$/, '').length - linjer.at(-1).length;
  for (let i = linjer.length - 2; i >= 0; i--) {
    index -= linjer[i].length + 1;
    if (erMarkør(linjer[i], SLUTT)) return null;
    if (erMarkør(linjer[i], START)) return { fra: index };
  }
  return null;
}

/** En startmarkør over seksjonen sist, eller i en beskrivelse uten seksjon sist. */
export function harEldreSeksjon(body) {
  const tekst = body ?? '';
  const over = tekst.slice(0, finnSeksjon(tekst)?.fra ?? tekst.length);
  return over.split('\n').some((l) => erMarkør(l, START));
}

/** Bytter ut seksjonen sist, eller legger den til sist. Teksten over står urørt. */
export function erstattSeksjon(body, seksjon) {
  const tekst = body ?? '';
  const funnet = finnSeksjon(tekst);
  if (funnet) return `${tekst.slice(0, funnet.fra)}${seksjon}\n`;
  const før = tekst.replace(/\s+$/, '');
  return `${før ? `${før}\n\n` : ''}${seksjon}\n`;
}

/** Antall user-attachments-lenker i seksjonen sist, og om noen relative opptak-stier står igjen. */
export function sjekkOpplastet(body) {
  const funnet = finnSeksjon(body);
  if (!funnet) return { lenker: 0, ulastet: 0 };
  const seksjon = body.slice(funnet.fra);
  // gh setter hver opplastede URL på en egen linje. Ankeret hindrer at en URL inne i en annen lenke telles.
  const lenker = new Set(seksjon.match(/^https:\/\/github\.com\/user-attachments\/assets\/[\w-]+(?=[ \t]*\r?$)/gm) ?? []).size;
  const ulastet = (seksjon.match(/\.\/opptak-\d+\.mp4/g) ?? []).length;
  return { lenker, ulastet };
}

/**
 * Henter beskrivelsen rett før den skrives. Kjøringen tar ofte et kvarter, og en endring gjort
 * i mellomtiden skal ikke overskrives av beskrivelsen slik den var da scriptet startet.
 */
export function byggBeskrivelse(pr, seksjon, ghJson, logg = () => {}) {
  const { body } = ghJson('pr', 'view', pr, '--json', 'body');
  // En tom beskrivelse er lov. Mangler feltet, ville beskrivelsen blitt bare seksjonen.
  if (typeof body !== 'string') throw new Error('Fikk ikke beskrivelsen til PR-en fra gh pr view. Beskrivelsen er ikke endret.');
  if (harEldreSeksjon(body)) logg('⚠️  En eldre opptaksseksjon står lenger opp i beskrivelsen; slett den hvis du vil.');
  return erstattSeksjon(body, seksjon);
}

/** Test-shardene heter «e2e-tests (<n>)» i en kjøring av E2E Tests. */
export const tellShards = (jobs) => jobs.filter((j) => /^e2e-tests( \(\d+\))?$/.test(j.name)).length;

/** En shard uten opptak.json gir en seksjon som ser komplett ut, men mangler testene den kjørte. */
export function advarslerOmShards(shards, artefakter) {
  const advarsler = [];
  const medJson = artefakter.filter((a) => a.harJson).length;
  if (medJson < shards) advarsler.push(`Bare ${medJson} av ${shards} shards har opptak.json, så opptak kan mangle.`);
  for (const a of artefakter.filter((x) => !x.harJson)) advarsler.push(`Artefaktet ${a.navn} har ikke opptak.json.`);
  return advarsler;
}

/** `ci-e2e.sh` skriver «run: <url>» når kjøringen er startet. */
export function finnRunId(utdata) {
  const m = /run:\s+(https:\/\/github\.com\/\S+\/actions\/runs\/(\d+))/.exec(utdata ?? '');
  return m ? { url: m[1], id: m[2] } : null;
}

/**
 * Teller testene i utvalget og avviser flere enn maks før noe kjøres. Tom grep er hele suiten;
 * null betyr at endringen ikke påvirker noen test.
 */
export function planleggUtvalg({ utvalg, tellTester, maks }) {
  if (utvalg.ingenting) return null;
  const antall = tellTester(utvalg.grep);
  if (antall > maks) {
    throw new Error(`Utvalget har ${antall} tester, flere enn grensen på ${maks}. Øk med MAKS=<n> (høyst ${MAKS_GRENSE}), eller kjør et smalere utvalg med make ci-grep GREP=<mønster> VIDEO=1 og bruk RUN=<id>.`);
  }
  return { grep: utvalg.grep, antall };
}

/** Filteret sendes ferdig utregnet, så CI kjører det samme utvalget som ble talt. */
export const ciArgumenter = (branch, grep, slowmo = null) =>
  [...(grep ? ['--grep', grep] : []), '--branch', branch, '--video', ...(slowmo != null ? ['--slowmo', slowmo] : []), '--no-wait'];

/**
 * En kjøring fra en annen branch viser en annen endring, så den avvises. Samme branch på en eldre
 * commit er greit, for eksempel etter en push med bare dokumentasjon, men seksjonen sier det.
 */
export function sjekkKjøring(run, pr) {
  if (run.headBranch !== pr.headRefName) {
    throw new Error(`Kjøringen er fra branchen ${run.headBranch}, ikke ${pr.headRefName}. Bruk en kjøring av PR-ens branch.`);
  }
  return run.headSha === pr.headRefOid ? [] : [`Opptakene er fra commit ${run.headSha.slice(0, 7)}. PR-en står nå på ${pr.headRefOid.slice(0, 7)}.`];
}

/**
 * Lokalt regnes utvalget fra committet kode, som i CI. Uten --head bygger affected-tests grafen
 * fra arbeidstreet, og da velges en usporet spec som importerer en endret helper.
 */
const lokaltUtvalg = (head) => ['--kun-committet', '--head', head];

/** Playwright kjører arbeidstreet, så ucommittede endringer i sporede filer sies fra om i seksjonen. */
export function arbeidstreAdvarsel(porcelain, head) {
  const filer = String(porcelain).split('\n').filter((l) => l.trim()).length;
  return filer ? `Kjørt med ucommittede endringer i ${filer} ${filer === 1 ? 'fil' : 'filer'}, så koden er ikke nøyaktig commit ${head.slice(0, 7)}.` : null;
}

/** Playwright kjører arbeidstreet, så en usporet spec under tests/ kan komme med i kjøringen. */
export function usporetAdvarsel(lsFiles) {
  const specs = String(lsFiles).split('\n').map((l) => l.trim()).filter((l) => l.endsWith('.spec.ts'));
  if (!specs.length) return null;
  return specs.length === 1
    ? `Kjørt med en spec som ikke er lagt til i git: ${specs[0]}. Playwright kjører den hvis filteret treffer den.`
    : `Kjørt med ${specs.length} spec-er som ikke er lagt til i git: ${specs.join(', ')}. Playwright kjører dem hvis filteret treffer dem.`;
}

/** Mappa beholdes etter en tørrkjøring, og ved feil som et nytt forsøk med RUN=<id> kan rette. */
const skalBeholde = ({ ok, torrt, harFiler, kanGjenbrukes }) => harFiler && (ok ? torrt : kanGjenbrukes);

const meldingVedFeil = (melding, katalog, runId, gjenbruk) =>
  `${melding}\nFilene ligger i ${katalog}. Bruk RUN=${runId}${gjenbruk ? ` ${gjenbruk}` : ''} for å prøve igjen uten en ny kjøring.`;

// ---------------------------------------------------------------- GitHub, git og ffmpeg

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const logg = (t) => console.log(t);

function kjørTekst(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 ** 2, ...opts });
}

const gh = (...args) => kjørTekst('gh', args);
const ghJson = (...args) => JSON.parse(gh(...args));

function forhåndssjekk() {
  const mangler = [];
  for (const v of ['GH_TOKEN', 'GITHUB_TOKEN']) {
    if (process.env[v]) mangler.push(`${v} er satt. gh pr edit --attach avviser tokens; kjør med unset ${v}, så gh bruker innloggingen din.`);
  }
  const v = spawnSync('gh', ['--version'], { encoding: 'utf8' });
  if (v.error) mangler.push('gh finnes ikke i PATH. Installer GitHub CLI.');
  else if (!ghVersjonHolder(v.stdout)) mangler.push(`gh ${MINSTE_GH.join('.')} eller nyere trengs for --attach; du har «${v.stdout.split('\n')[0]}».`);
  // Med et token satt sjekker gh auth status tokenet, ikke innloggingen; feilen over dekker det.
  if (!v.error && !mangler.length && spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' }).status !== 0) mangler.push('gh er ikke logget inn. Kjør gh auth login.');
  if (spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).error) mangler.push('ffmpeg finnes ikke i PATH. Installer det, for eksempel med brew install ffmpeg.');
  if (mangler.length) throw new Error(mangler.join('\n'));
}

/** Kjører en kommando, viser utdataene mens den går, og gir dem tilbake. */
function strøm(cmd, args, opts = {}) {
  return new Promise((ok, feil) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], ...opts });
    let ut = '';
    p.stdout.on('data', (d) => {
      ut += d;
      process.stdout.write(d);
    });
    p.on('error', feil);
    p.on('close', (kode) => ok({ kode, ut }));
  });
}

const vent = (ms) => new Promise((r) => setTimeout(r, ms));

async function ventPåKjøring(id, d) {
  let forrige = '';
  for (;;) {
    const r = d.ghJson('run', 'view', id, '--json', 'status,conclusion,headSha,headBranch,url');
    if (r.status === 'completed') return r;
    if (r.status !== forrige) d.logg(`⏳ Kjøringen er ${r.status}.`);
    forrige = r.status;
    await d.vent(30_000);
  }
}

/** Utvalget fra affected-tests: exit 3 er ingenting å kjøre, tom utdata er hele suiten. */
export const lagPåvirkedeTester = (rot) => (args) => {
  const r = spawnSync('node', ['scripts/affected-tests.mjs', ...args], { cwd: rot, encoding: 'utf8' });
  process.stderr.write(r.stderr ?? '');
  if (r.status === 3) return { ingenting: true };
  if (r.status !== 0) throw new Error(`affected-tests.mjs feilet med kode ${r.status}.`);
  return { ingenting: false, grep: r.stdout.trim() };
};
const påvirkedeTester = lagPåvirkedeTester(ROOT);

/** Utvalget telles i arbeidstreet før kjøringen startes, så det må være PR-ens kode. */
function planleggCi(pr, maks) {
  const head = kjørTekst('git', ['rev-parse', 'HEAD']).trim();
  if (head !== pr.headRefOid) {
    throw new Error(`Du står på ${head.slice(0, 7)}, men PR-en står på ${pr.headRefOid.slice(0, 7)} (${pr.headRefName}). Testene telles fra koden du står på: kjør git switch ${pr.headRefName} && git pull, eller bruk RUN=<id>.`);
  }
  if (spawnSync('git', ['diff', '--quiet', 'HEAD'], { cwd: ROOT }).status !== 0) {
    logg('⚠️  Du har ucommittede endringer. Testene telles med dem, men CI kjører det som er pushet.');
  }
  spawnSync('git', ['fetch', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main'], { cwd: ROOT });
  return planleggUtvalg({ utvalg: påvirkedeTester(['--kun-committet', '--head', pr.headRefOid]), tellTester, maks });
}

async function fraCi(pr, maks, slowmo, katalog, tilstand, d) {
  const plan = d.planleggCi(pr, maks);
  if (!plan) return null;
  logg(`${plan.antall} tester i utvalget.`);
  const { kode, ut } = await d.startCi(ciArgumenter(pr.headRefName, plan.grep, slowmo));
  if (kode !== 0) throw new Error(`ci-e2e.sh feilet med kode ${kode}.`);
  const run = finnRunId(ut);
  if (!run) throw new Error('Fant ikke run-lenken i utdataene fra ci-e2e.sh.');
  return lastNedKjøring(run.id, pr, katalog, tilstand, d);
}

async function lastNedKjøring(id, pr, katalog, tilstand, d) {
  // Branchen sjekkes før ventingen, så en feil kjøring ikke venter et kvarter for å bli avvist.
  const første = d.ghJson('run', 'view', id, '--json', 'status,conclusion,headSha,headBranch,url');
  const commitAdvarsler = sjekkKjøring(første, pr);
  tilstand.runId = id;
  const run = første.status === 'completed' ? første : await ventPåKjøring(id, d);
  // En rød kjøring har også opptak: workflowen laster dem opp uansett utfall.
  d.logg(`Kjøringen er ferdig: ${run.conclusion} (${run.url}).`);
  const ned = join(katalog, 'nedlastet');
  try {
    d.gh('run', 'download', id, '-p', 'playwright-videos*', '-D', ned);
  } catch (e) {
    throw new Error(`Fant ingen playwright-videos-artefakter i kjøringen. Ble den startet med VIDEO=1? (${String(e.stderr ?? e.message).trim()})`);
  }
  const { jobs } = d.ghJson('run', 'view', id, '--json', 'jobs');
  // Med én artefakt kan gh legge filene rett i mappa i stedet for i en undermappe.
  const artefakter = existsSync(join(ned, 'opptak.json'))
    ? [{ navn: 'playwright-videos', harJson: true }]
    : readdirSync(ned, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => ({ navn: d.name, harJson: existsSync(join(ned, d.name, 'opptak.json')) }));
  const advarsler = [...commitAdvarsler, ...advarslerOmShards(tellShards(jobs), artefakter)];
  for (const a of advarsler) d.logg(`⚠️  ${a}`);
  return { kilde: 'ci', runUrl: run.url, commit: run.headSha, konklusjon: run.conclusion, advarsler, jsonFiler: finnFiler(ned, 'opptak.json') };
}

function finnFiler(rot, navn) {
  if (!existsSync(rot)) return [];
  return readdirSync(rot, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name === navn)
    .map((d) => join(d.parentPath ?? d.path, d.name));
}

/** Antall tester i utvalget, fra playwright test --list. Trenger ikke stacken. */
function tellTester(grep) {
  // --reporter=list overstyrer rapportørene i configen, som ellers skriver over playwright-report/.
  const liste = kjørTekst('npx', ['playwright', 'test', '--project=chromium', '--list', '--reporter=list', ...(grep ? ['--grep', grep] : [])]);
  const antall = Number(/^Total: (\d+) tests?/m.exec(liste)?.[1]);
  if (!Number.isInteger(antall)) throw new Error('Fant ikke antall tester i utdataene fra playwright test --list.');
  return antall;
}

/** Miljøet Playwright kjøres med i LOKAL. En SLOWMO eksportert i skallet styrer ikke opptaket. */
export function lokalEnv(base, slowmo) {
  const { SLOWMO: _skall, ...env } = base;
  return { ...env, PW_VIDEO: 'on', ...(slowmo != null ? { SLOWMO: slowmo } : {}) };
}

/** git, utvalget og Playwright for LOKAL; testene bytter dem ut. */
const lokaleAvhengigheter = (slowmo = null) => ({
  git: (args) => kjørTekst('git', args),
  påvirkedeTester,
  tellTester,
  logg,
  kjørPlaywright: async (grep) => {
    const json = join(ROOT, 'test-results', 'opptak.json');
    rmSync(json, { force: true });
    const { kode } = await strøm('npx', ['playwright', 'test', '--project=chromium', ...(grep ? ['--grep', grep] : [])], { env: lokalEnv(process.env, slowmo) });
    return { kode, json: existsSync(json) ? json : null };
  },
});

export async function lokalt(pr, maks, d = lokaleAvhengigheter()) {
  const head = d.git(['rev-parse', 'HEAD']).trim();
  const branch = d.git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  if (branch !== pr.headRefName || head !== pr.headRefOid) {
    d.logg(`⚠️  Du står på ${branch} (${head.slice(0, 7)}), men PR-en er ${pr.headRefName} (${pr.headRefOid.slice(0, 7)}). Testene kjører koden i arbeidstreet.`);
  }
  // Teller før kjøringen, så hele suiten ikke kjøres bare for å bli avvist etterpå.
  const plan = planleggUtvalg({ utvalg: d.påvirkedeTester(lokaltUtvalg(head)), tellTester: d.tellTester, maks });
  if (!plan) return null;
  const advarsler = [
    arbeidstreAdvarsel(d.git(['status', '--porcelain', '--untracked-files=no']), head),
    usporetAdvarsel(d.git(['ls-files', '--others', '--exclude-standard', 'tests'])),
  ].filter(Boolean);
  for (const a of advarsler) d.logg(`⚠️  ${a}`);
  const { kode, json } = await d.kjørPlaywright(plan.grep);
  if (!json) throw new Error(`Playwright avsluttet med kode ${kode} uten å skrive test-results/opptak.json.`);
  if (kode !== 0) d.logg(`Noen tester feilet (kode ${kode}). Opptakene legges likevel i beskrivelsen.`);
  return { kilde: 'lokal', runUrl: null, commit: head, advarsler, jsonFiler: [json] };
}

export async function konverter(opptak, katalog) {
  let neste = 0;
  const arbeider = async () => {
    while (neste < opptak.length) {
      const i = neste++;
      const ut = join(katalog, `opptak-${i + 1}.mp4`);
      const args = ['-y', '-loglevel', 'error', '-i', opptak[i].video, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', ut];
      const { kode } = await new Promise((ok, feil) => {
        const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] });
        p.on('error', feil);
        p.on('close', (k) => ok({ kode: k }));
      });
      if (kode !== 0) throw new Error(`ffmpeg feilet på ${opptak[i].video}.`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, opptak.length) }, arbeider));
}

/** gh, ffmpeg, CI-kjøringen, ventingen og den midlertidige mappa; testene bytter dem ut. */
const standardAvhengigheter = () => ({
  planleggCi,
  startCi: (args) => strøm('./scripts/ci-e2e.sh', args),
  lokale: lokaleAvhengigheter,
  gh,
  ghJson,
  ghEdit: (args) => spawnSync('gh', args, { cwd: ROOT, stdio: 'inherit' }).status,
  konverter,
  lagKatalog: () => mkdtempSync(join(tmpdir(), 'pr-opptak-')),
  vent,
  logg,
});

async function main() {
  let a;
  try {
    a = lesArgumenter(process.argv.slice(2));
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(2);
  }
  if (a.hjelp) return logg(HJELP);
  forhåndssjekk();
  await kjørOpptak(a);
}

export async function kjørOpptak(a, d = standardAvhengigheter()) {
  const pr = d.ghJson('pr', 'view', a.pr, '--json', 'headRefName,headRefOid,url');
  const katalog = d.lagKatalog();
  const tilstand = { runId: null };
  let ok = false;
  let kanGjenbrukes = false;
  try {
    await lagOgLastOpp(a, pr, katalog, tilstand, d);
    ok = true;
  } catch (e) {
    kanGjenbrukes = Boolean(tilstand.runId) && e.gjenbruk !== undefined;
    if (kanGjenbrukes && readdirSync(katalog).length) e.message = meldingVedFeil(e.message, katalog, tilstand.runId, e.gjenbruk);
    throw e;
  } finally {
    if (!skalBeholde({ ok, torrt: a.torrt, harFiler: readdirSync(katalog).length > 0, kanGjenbrukes })) rmSync(katalog, { recursive: true, force: true });
  }
}

async function lagOgLastOpp(a, pr, katalog, tilstand, d) {
  const resultat = a.lokal
    ? await lokalt(pr, a.maks, d.lokale(a.slowmo))
    : a.run
      ? await lastNedKjøring(a.run, pr, katalog, tilstand, d)
      : await fraCi(pr, a.maks, a.slowmo, katalog, tilstand, d);
  if (!resultat) {
    d.logg('✅ Ingen endringer påvirker e2e-testene, så det er ingenting å ta opp. Beskrivelsen er ikke endret.');
    return;
  }
  if (!resultat.jsonFiler.length) throw new Error('Fant ingen opptak.json. Ble kjøringen startet med VIDEO=1?');

  const rader = resultat.jsonFiler.flatMap((f) => lesOpptak(JSON.parse(readFileSync(f, 'utf8')), dirname(f)));
  const opptak = velgOpptak(rader, a.maks);
  const borte = opptak.filter((o) => !existsSync(o.video));
  if (borte.length) throw new Error(`Opptakene mangler på disk:\n${borte.map((o) => `  ${o.video}`).join('\n')}`);

  const ut = join(katalog, 'opptak');
  mkdirSync(ut, { recursive: true });
  d.logg(`🎬 Konverterer ${opptak.length} opptak til mp4 …`);
  await d.konverter(opptak, ut);
  const seksjon = lagSeksjon({ ...resultat, rader, opptak });
  // --attach løser stiene relativt til mappa der body-fila ligger.
  const bodyFil = join(ut, 'body.md');
  writeFileSync(bodyFil, byggBeskrivelse(a.pr, seksjon, d.ghJson, d.logg));

  if (a.torrt) {
    d.logg(`\n🧪 Tørrkjøring: beskrivelsen er ikke endret. Filene ligger i ${ut}\n\n${seksjon}`);
    return;
  }
  const vedlegg = opptak.flatMap((_, i) => ['--attach', join(ut, `opptak-${i + 1}.mp4`)]);
  const status = d.ghEdit(['pr', 'edit', a.pr, '--body-file', bodyFil, ...vedlegg]);
  if (status !== 0) throw gjenbrukbar('', `gh pr edit feilet med kode ${status}.`);

  const { body } = d.ghJson('pr', 'view', a.pr, '--json', 'body');
  const { lenker, ulastet } = sjekkOpplastet(body);
  if (lenker < opptak.length || ulastet) {
    throw gjenbrukbar('', `Seksjonen har ${lenker} opplastede opptak av ${opptak.length}, og ${ulastet} som ikke er lastet opp.`);
  }
  d.logg(`✅ ${opptak.length} opptak lagt i beskrivelsen: ${pr.url}`);
}

// Node løser opp symlinker i import.meta.url, men ikke i argv[1], så begge må løses opp.
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`);
    process.exitCode = 1;
  });
}
