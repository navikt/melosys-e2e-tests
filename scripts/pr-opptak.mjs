#!/usr/bin/env node
/**
 * Kjører e2e-testene en PR påvirker med video, og legger ett mp4-opptak per test i
 * PR-beskrivelsen, mellom <!-- e2e-opptak:start --> og <!-- e2e-opptak:end -->. En ny kjøring
 * bytter bare ut den seksjonen.
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

const HJELP = `Bruk: node scripts/pr-opptak.mjs <pr> [--run <id>] [--lokal] [--maks <n>] [--torrt]

Kjører e2e-testene PR-en påvirker med video, og legger ett opptak per test i PR-beskrivelsen.

  <pr>          PR-nummeret i melosys-e2e-tests
  --run <id>    bruk opptakene fra en kjøring startet med VIDEO=1, i stedet for å starte en ny
  --lokal       kjør testene mot stacken som kjører lokalt, i stedet for på CI
  --maks <n>    største antall opptak (standard ${MAKS_STANDARD}, høyst ${MAKS_GRENSE})
  --torrt       gjør alt unntatt å endre PR-beskrivelsen, og skriv ut seksjonen

Krever gh ${MINSTE_GH.join('.')} eller nyere med personlig innlogging (gh auth login), og ffmpeg.
Fra make: make pr-opptak PR=<n> [RUN=<id>] [LOKAL=1] [MAKS=<n>] [TORRT=1]`;

// ---------------------------------------------------------------- rene funksjoner

export function lesArgumenter(argv) {
  const a = { pr: null, run: null, lokal: false, maks: MAKS_STANDARD, torrt: false, hjelp: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') a.hjelp = true;
    else if (arg === '--lokal') a.lokal = true;
    else if (arg === '--torrt') a.torrt = true;
    else if (arg === '--run') a.run = argv[++i];
    else if (arg === '--maks') a.maks = argv[++i];
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

/** Opptakene som skal i beskrivelsen; avviser flere enn maks, slik at hele suiten ikke havner der. */
export function velgOpptak(rader, maks) {
  const opptak = sorter(rader.filter((r) => r.video));
  if (opptak.length > maks) {
    throw new Error(
      `${opptak.length} opptak er flere enn grensen på ${maks}. Snevre inn utvalget, for eksempel med ` +
        `make ci-grep GREP=<mønster> VIDEO=1 og så RUN=<id>, eller øk grensen med MAKS=<n> (høyst ${MAKS_GRENSE}).`,
    );
  }
  return opptak;
}

export function oppsummer(rader) {
  const antall = (s) => rader.filter((r) => r.status === s).length;
  const deler = [
    [antall('expected'), 'grønne'],
    [antall('unexpected'), 'feilet'],
    [antall('flaky'), 'flaky'],
  ].filter(([n]) => n > 0).map(([n, t]) => `${n} ${t}`);
  let tekst = deler.length ? deler.join(', ') : 'ingen tester kjørt';
  const hoppet = antall('skipped');
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

export function lagSeksjon({ kilde, runUrl, commit, rader, opptak }) {
  const kort = String(commit).slice(0, 7);
  const hvor = kilde === 'ci' ? `Kjørt i CI ([kjøring](${runUrl}))` : 'Kjørt lokalt mot stacken';
  const linjer = [START, '## Opptak av testene', '', `${hvor} på commit \`${kort}\`: ${oppsummer(rader)}`, ''];
  opptak.forEach((o, i) => {
    const merknad = o.status === 'flaky' ? 'flaky' : o.resultat !== 'passed' ? o.resultat : null;
    const tid = formaterVarighet(o.varighet) + (merknad ? `, ${merknad}` : '');
    linjer.push(`**${formaterTittel(o.tittel)}** (${tid})`, '', `![](./opptak-${i + 1}.mp4)`, '');
  });
  linjer.push(SLUTT);
  return linjer.join('\n');
}

/** Bytter ut seksjonen, eller legger den til sist. Resten av beskrivelsen står urørt. */
export function erstattSeksjon(body, seksjon) {
  const tekst = body ?? '';
  const s = tekst.indexOf(START);
  if (s < 0) {
    const før = tekst.trimEnd();
    return `${før ? `${før}\n\n` : ''}${seksjon}\n`;
  }
  const e = tekst.indexOf(SLUTT, s);
  if (e < 0) throw new Error(`Beskrivelsen har ${START}, men ikke ${SLUTT}. Rett beskrivelsen for hånd og prøv igjen.`);
  return tekst.slice(0, s) + seksjon + tekst.slice(e + SLUTT.length);
}

/** Antall user-attachments-lenker i seksjonen, og om noen relative opptak-stier står igjen. */
export function sjekkOpplastet(body) {
  const tekst = body ?? '';
  const s = tekst.indexOf(START);
  const e = tekst.indexOf(SLUTT, s);
  if (s < 0 || e < 0) return { lenker: 0, ulastet: 0 };
  const seksjon = tekst.slice(s, e);
  const lenker = new Set(seksjon.match(/https:\/\/github\.com\/user-attachments\/assets\/[\w-]+/g) ?? []).size;
  const ulastet = (seksjon.match(/\.\/opptak-\d+\.mp4/g) ?? []).length;
  return { lenker, ulastet };
}

/** `ci-e2e.sh` skriver «run: <url>» når kjøringen er startet. */
export function finnRunId(utdata) {
  const m = /run:\s+(https:\/\/github\.com\/\S+\/actions\/runs\/(\d+))/.exec(utdata ?? '');
  return m ? { url: m[1], id: m[2] } : null;
}

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

async function ventPåKjøring(id) {
  let forrige = '';
  for (;;) {
    const r = ghJson('run', 'view', id, '--json', 'status,conclusion,headSha,url');
    if (r.status === 'completed') return r;
    if (r.status !== forrige) logg(`⏳ Kjøringen er ${r.status}.`);
    forrige = r.status;
    await vent(30_000);
  }
}

/** Utvalget fra affected-tests: exit 3 er ingenting å kjøre, tom utdata er hele suiten. */
function påvirkedeTester(args) {
  const r = spawnSync('node', ['scripts/affected-tests.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });
  process.stderr.write(r.stderr ?? '');
  if (r.status === 3) return { ingenting: true };
  if (r.status !== 0) throw new Error(`affected-tests.mjs feilet med kode ${r.status}.`);
  return { ingenting: false, grep: r.stdout.trim() };
}

async function fraCi(pr, maks, katalog) {
  // Hele suiten er over grensen uansett, så den stoppes før en kjøring på 15 minutter starter.
  const branch = pr.headRefName;
  spawnSync('git', ['fetch', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main', `+refs/heads/${branch}:refs/remotes/origin/${branch}`], { cwd: ROOT });
  const utvalg = påvirkedeTester(['--kun-committet', '--head', `origin/${branch}`]);
  if (utvalg.ingenting) return null;
  if (!utvalg.grep) {
    throw new Error(`Endringen velger hele suiten, som gir flere opptak enn grensen på ${maks}. Kjør et smalere utvalg med make ci-grep GREP=<mønster> VIDEO=1 BRANCH=${branch}, og bruk RUN=<id>.`);
  }
  const { kode, ut } = await strøm('./scripts/ci-e2e.sh', ['--affected', '--branch', branch, '--video', '--no-wait']);
  if (kode !== 0) throw new Error(`ci-e2e.sh feilet med kode ${kode}.`);
  const run = finnRunId(ut);
  if (!run) {
    if (/Ingen endringer påvirker e2e-testene/.test(ut)) return null;
    throw new Error('Fant ikke run-lenken i utdataene fra ci-e2e.sh.');
  }
  return lastNedKjøring(run.id, pr, katalog);
}

async function lastNedKjøring(id, pr, katalog) {
  const run = await ventPåKjøring(id);
  // En rød kjøring har også opptak: workflowen laster dem opp uansett utfall.
  logg(`Kjøringen er ferdig: ${run.conclusion} (${run.url}).`);
  if (run.headSha !== pr.headRefOid) logg(`⚠️  Kjøringen er på commit ${run.headSha.slice(0, 7)}, men PR-en står på ${pr.headRefOid.slice(0, 7)}.`);
  const ned = join(katalog, 'nedlastet');
  try {
    gh('run', 'download', id, '-p', 'playwright-videos*', '-D', ned);
  } catch (e) {
    throw new Error(`Fant ingen playwright-videos-artefakter i kjøringen. Ble den startet med VIDEO=1? (${String(e.stderr ?? e.message).trim()})`);
  }
  return { kilde: 'ci', runUrl: run.url, commit: run.headSha, jsonFiler: finnFiler(ned, 'opptak.json') };
}

function finnFiler(rot, navn) {
  if (!existsSync(rot)) return [];
  return readdirSync(rot, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name === navn)
    .map((d) => join(d.parentPath ?? d.path, d.name));
}

async function lokalt(pr, maks) {
  const head = kjørTekst('git', ['rev-parse', 'HEAD']).trim();
  const branch = kjørTekst('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  if (branch !== pr.headRefName || head !== pr.headRefOid) {
    logg(`⚠️  Du står på ${branch} (${head.slice(0, 7)}), men PR-en er ${pr.headRefName} (${pr.headRefOid.slice(0, 7)}). Testene kjører koden i arbeidstreet.`);
  }
  const utvalg = påvirkedeTester([]);
  if (utvalg.ingenting) return null;
  const grep = utvalg.grep ? ['--grep', utvalg.grep] : [];
  // Teller før kjøringen, så hele suiten ikke kjøres bare for å bli avvist etterpå.
  // --reporter=list overstyrer rapportørene i configen, som ellers skriver over playwright-report/.
  const liste = kjørTekst('npx', ['playwright', 'test', '--project=chromium', '--list', '--reporter=list', ...grep]);
  const antall = Number(/^Total: (\d+) tests?/m.exec(liste)?.[1]);
  if (!Number.isInteger(antall)) throw new Error('Fant ikke antall tester i utdataene fra playwright test --list.');
  if (antall > maks) throw new Error(`Utvalget har ${antall} tester, flere enn grensen på ${maks}. Øk med MAKS=<n> (høyst ${MAKS_GRENSE}) eller kjør et smalere utvalg.`);
  const json = join(ROOT, 'test-results', 'opptak.json');
  rmSync(json, { force: true });
  const { kode } = await strøm('npx', ['playwright', 'test', '--project=chromium', ...grep], { env: { ...process.env, PW_VIDEO: 'on' } });
  if (!existsSync(json)) throw new Error(`Playwright avsluttet med kode ${kode} uten å skrive test-results/opptak.json.`);
  if (kode !== 0) logg(`Noen tester feilet (kode ${kode}). Opptakene legges likevel i beskrivelsen.`);
  return { kilde: 'lokal', runUrl: null, commit: head, jsonFiler: [json] };
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
  const pr = ghJson('pr', 'view', a.pr, '--json', 'headRefName,headRefOid,body,url');
  const katalog = mkdtempSync(join(tmpdir(), 'pr-opptak-'));
  // Mappa beholdes bare når du trenger filene: etter en tørrkjøring og når opplastingen feiler.
  let behold = false;
  try {
    behold = await lagOgLastOpp(a, pr, katalog);
  } catch (e) {
    behold = Boolean(e.behold);
    throw e;
  } finally {
    if (!behold) rmSync(katalog, { recursive: true, force: true });
  }
}

/** Gir true når filene i katalogen skal beholdes. */
async function lagOgLastOpp(a, pr, katalog) {
  const resultat = a.lokal
    ? await lokalt(pr, a.maks)
    : a.run
      ? await lastNedKjøring(a.run, pr, katalog)
      : await fraCi(pr, a.maks, katalog);
  if (!resultat) {
    logg('✅ Ingen endringer påvirker e2e-testene, så det er ingenting å ta opp. Beskrivelsen er ikke endret.');
    return false;
  }
  if (!resultat.jsonFiler.length) throw new Error('Fant ingen opptak.json. Ble kjøringen startet med VIDEO=1?');

  const rader = resultat.jsonFiler.flatMap((f) => lesOpptak(JSON.parse(readFileSync(f, 'utf8')), dirname(f)));
  const opptak = velgOpptak(rader, a.maks);
  const borte = opptak.filter((o) => !existsSync(o.video));
  if (borte.length) throw new Error(`Opptakene mangler på disk:\n${borte.map((o) => `  ${o.video}`).join('\n')}`);

  const ut = join(katalog, 'opptak');
  mkdirSync(ut, { recursive: true });
  logg(`🎬 Konverterer ${opptak.length} opptak til mp4 …`);
  await konverter(opptak, ut);
  const seksjon = lagSeksjon({ ...resultat, rader, opptak });
  // --attach løser stiene relativt til mappa der body-fila ligger.
  const bodyFil = join(ut, 'body.md');
  writeFileSync(bodyFil, erstattSeksjon(pr.body, seksjon));

  if (a.torrt) {
    logg(`\n🧪 Tørrkjøring: beskrivelsen er ikke endret. Filene ligger i ${ut}\n\n${seksjon}`);
    return true;
  }
  const vedlegg = opptak.flatMap((_, i) => ['--attach', join(ut, `opptak-${i + 1}.mp4`)]);
  const edit = spawnSync('gh', ['pr', 'edit', a.pr, '--body-file', bodyFil, ...vedlegg], { cwd: ROOT, stdio: 'inherit' });
  const behold = (melding) => Object.assign(new Error(`${melding} Filene ligger i ${ut}`), { behold: true });
  if (edit.status !== 0) throw behold(`gh pr edit feilet med kode ${edit.status}.`);

  const { body } = ghJson('pr', 'view', a.pr, '--json', 'body');
  const { lenker, ulastet } = sjekkOpplastet(body);
  if (lenker < opptak.length || ulastet) {
    throw behold(`Seksjonen har ${lenker} opplastede opptak av ${opptak.length}, og ${ulastet} som ikke er lastet opp.`);
  }
  logg(`✅ ${opptak.length} opptak lagt i beskrivelsen: ${pr.url}`);
  return false;
}

// Node løser opp symlinker i import.meta.url, men ikke i argv[1], så begge må løses opp.
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`);
    process.exitCode = 1;
  });
}
