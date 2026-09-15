#!/usr/bin/env node
/**
 * Velger ut hvilke e2e-tester en endring faktisk rører, slik at CI kan kjøre dem i stedet for
 * hele suiten.
 *
 * Bakgrunn: å velge testene for hånd er lett å ta feil av i feil retning. Endrer du en spec-fil
 * er svaret åpenbart, men endrer du en helper er det ikke det — `helpers/unleash-helper.ts` sin
 * `resetToDefaults` kjøres før hver eneste test, så en endring der treffer hele suiten selv om
 * diffen er fire linjer. Scriptet regner ut svaret i stedet for å gjette.
 *
 * Slik virker det:
 *   1. Finner endrede filer: committet mot basen (default origin/main) pluss det som ligger
 *      i arbeidstreet, så det også virker før du committer.
 *   2. Bygger en omvendt importgraf over .ts-filene ved å lese relative import/export-stier.
 *   3. Påvirkede spec-er = endrede spec-er + spec-er som transitivt importerer en endret modul.
 *   4. Velger hele suiten i stedet for et filter når en endret fil ligger utenfor grafen (for
 *      eksempel playwright.config.ts eller package.json), når ingen spec er påvirket, eller når
 *      FULL_SUITE_TERSKEL % eller mer av spec-ene er påvirket.
 *
 * Utdata på stdout styres av flagg; oppsummeringen går alltid til stderr.
 *
 *   --grep    (default) filteret som skal sendes til `playwright test --grep` og workflow-inputen
 *             `test_grep`, eller en tom linje når hele suiten skal kjøres. Playwright matcher
 *             mot «<sti fra testDir> › <testtittel>», så stier fungerer som filter der.
 *   --files   påvirkede spec-stier, én per linje
 *   --json    maskinlesbar rapport med både stier og begrunnelse
 *   --base <ref>   sammenlign mot en annen ref enn origin/main
 *   --head <ref>   regn endringene fra en annen ref enn HEAD, for eksempel origin/min-branch
 *   --kun-committet  se bort fra arbeidstreet. CI kjører branchen, så ci-e2e.sh bruker denne.
 *   --changed <sti>  hopp over git og lat som om akkurat denne fila er endret. Nyttig for å
 *             se rekkevidden av en endring før du gjør den, og for å teste grafen.
 *
 * Kjør: node scripts/affected-tests.mjs   (ren node, ingen avhengigheter)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const TEST_DIR = join(ROOT, 'tests');
const GRAPH_DIRS = ['tests', 'pages', 'helpers', 'fixtures', 'lib', 'utils', 'atdd'];
export const FULL_SUITE_TERSKEL = 80;

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * Endrede filer: committet mot basen, og med `arbeidstre` også alt som ligger ucommittet.
 * Eksportert for testen; `run` erstatter git der.
 */
export function changedFiles(base, { arbeidstre = true, head = 'HEAD', run = git } = {}) {
  const committed = run('diff', '--name-only', `${base}...${head}`).split('\n');
  if (!arbeidstre) return [...new Set(committed)].filter(Boolean);
  // --porcelain gir «XY <sti>»; ved rename står «XY <fra> -> <til>» og vi vil ha målet.
  // --untracked-files=all lister filene i en ny mappe i stedet for bare mappa.
  const working = run('status', '--porcelain', '--untracked-files=all')
    .split('\n')
    .map((l) => l.slice(3).trim())
    .map((p) => (p.includes(' -> ') ? p.split(' -> ')[1] : p));
  return [...new Set([...committed, ...working])].filter(Boolean);
}

/**
 * Pakker ut treet til `ref` i en midlertidig mappe, så grafen kan bygges fra en annen branch
 * enn den som ligger i arbeidstreet. Mappa slettes når prosessen avslutter.
 */
function pakkUt(ref) {
  const dir = mkdtempSync(join(tmpdir(), 'affected-tests-'));
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
  const tar = execFileSync('git', ['archive', ref], { cwd: ROOT, maxBuffer: 1024 ** 3 });
  execFileSync('tar', ['-x', '-C', dir], { input: tar });
  return dir;
}

/** Alle .ts-filer under de katalogene en spec kan importere fra. */
function sourceFiles(rot = ROOT) {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== 'node_modules') walk(p);
      } else if (name.endsWith('.ts')) {
        out.push(relative(rot, p));
      }
    }
  };
  for (const d of GRAPH_DIRS) walk(join(rot, d));
  return out;
}

/** Løser en relativ importspesifikator til en sti i repoet, eller null for pakker. */
function resolveImport(fromFile, spec, rot = ROOT) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(join(rot, fromFile)), spec);
  for (const cand of [`${base}.ts`, join(base, 'index.ts'), base]) {
    if (existsSync(cand) && statSync(cand).isFile()) return relative(rot, cand);
  }
  return null;
}

const IMPORT_RE = /(?:from|import)\s*['"]([^'"]+)['"]/g;

/** importers.get(modul) = filene som importerer den direkte. */
function reverseGraph(files, rot) {
  const importers = new Map();
  for (const file of files) {
    const src = readFileSync(join(rot, file), 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      const target = resolveImport(file, m[1], rot);
      if (!target) continue;
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target).add(file);
    }
  }
  return importers;
}

const isSpec = (p) => p.endsWith('.spec.ts');
const inGraph = (p) => p.endsWith('.ts') && GRAPH_DIRS.includes(p.split('/')[0]);
export const isDoc = (p) => p.endsWith('.md') || p.startsWith('docs/');

/**
 * Spec-filene som påvirkes av at `changed` endres, funnet ved å gå oppover importgrafen.
 * Eksportert for regresjonstesten i lib/affected-tests.test.ts.
 */
export function affectedSpecs(changed, files = sourceFiles(), rot = ROOT) {
  const importers = reverseGraph(files, rot);
  const affected = new Set();
  const seen = new Set();
  const queue = [...changed];
  while (queue.length) {
    const cur = queue.shift();
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (isSpec(cur)) affected.add(cur);
    for (const importer of importers.get(cur) ?? []) queue.push(importer);
  }
  return [...affected].filter((p) => existsSync(join(rot, p))).sort();
}

/**
 * Gjør en --changed-sti om til en sti fra repo-roten. En relativ sti leses fra roten hvis fila
 * finnes der, ellers fra mappa du står i. Symlinker løses opp, så en absolutt sti via /var på
 * macOS treffer samme fil som /private/var.
 */
function repoSti(sti) {
  if (!isAbsolute(sti) && existsSync(join(ROOT, sti))) return relative(ROOT, join(ROOT, sti));
  const abs = resolve(sti);
  return relative(realpathSync(ROOT), existsSync(abs) ? realpathSync(abs) : abs);
}

function fail(msg) {
  process.stderr.write(`❌ ${msg}\n`);
  process.exit(2);
}

function main() {
  const args = process.argv.slice(2);
  const valueOf = (flag) => {
    const i = args.indexOf(flag);
    if (i === -1) return undefined;
    const v = args[i + 1];
    if (!v || v.startsWith('--')) fail(`${flag} krever en verdi`);
    return v;
  };
  const base = valueOf('--base') ?? 'origin/main';
  const head = valueOf('--head') ?? 'HEAD';
  const forced = valueOf('--changed');
  const mode = args.includes('--files') ? 'files' : args.includes('--json') ? 'json' : 'grep';

  let changed;
  if (forced) {
    changed = [repoSti(forced)];
  } else {
    try {
      changed = changedFiles(base, { arbeidstre: !args.includes('--kun-committet'), head });
    } catch (e) {
      fail(`Fant ikke endrede filer mellom ${base} og ${head}: ${(e.stderr || e.message).toString().trim() || 'ukjent ref'}`);
    }
  }

  // Med --head bygges grafen fra det treet, så spec-filer som bare finnes der kommer med.
  const rot = head === 'HEAD' ? ROOT : pakkUt(head);
  const files = sourceFiles(rot);
  const outside = changed.filter((p) => !inGraph(p) && !isDoc(p));
  const specs = affectedSpecs(changed.filter(inGraph), files, rot);
  const total = files.filter(isSpec).length;
  const share = total ? (specs.length / total) * 100 : 0;

  let reason = null;
  if (outside.length) reason = `endrede filer utenfor importgrafen: ${outside.join(', ')}`;
  else if (specs.length === 0) reason = 'ingen spec-filer er påvirket';
  else if (share >= FULL_SUITE_TERSKEL) reason = `${Math.floor(share)} % av spec-filene er påvirket`;

  // Playwright matcher mot stien slik den står under testDir, uten «tests/»-prefikset.
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const grep = reason
    ? ''
    : specs.map((p) => escape(relative(TEST_DIR, join(ROOT, p)))).join('|');

  process.stderr.write(
    `Endrede filer: ${changed.length}\n` +
      `Påvirkede spec-filer: ${specs.length} av ${total} (${Math.floor(share)} %)\n` +
      (reason ? `Kjører hele suiten: ${reason}.\n` : '')
  );

  if (mode === 'files') process.stdout.write(specs.join('\n') + (specs.length ? '\n' : ''));
  else if (mode === 'json')
    process.stdout.write(
      JSON.stringify(
        { base, head, changed, outside, specs, total, fullSuite: Boolean(reason), reason, grep },
        null,
        2
      ) + '\n'
    );
  else process.stdout.write(grep + '\n');
}

// Kjør bare når scriptet startes direkte, ikke når testen importerer affectedSpecs.
// Node løser opp symlinker i import.meta.url, men ikke i argv[1], så begge må løses opp.
if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  main();
}
