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
 *   --changed <sti>  hopp over git og lat som om akkurat denne fila er endret. Nyttig for å
 *             se rekkevidden av en endring før du gjør den, og for å teste grafen.
 *
 * Kjør: node scripts/affected-tests.mjs   (ren node, ingen avhengigheter)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const TEST_DIR = join(ROOT, 'tests');
const GRAPH_DIRS = ['tests', 'pages', 'helpers', 'fixtures', 'lib', 'utils', 'atdd'];
export const FULL_SUITE_TERSKEL = 80;

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Endrede filer: committet mot basen + alt som ligger ucommittet i arbeidstreet. */
function changedFiles(base) {
  const committed = git('diff', '--name-only', `${base}...HEAD`).split('\n');
  // --porcelain gir «XY <sti>»; ved rename står «XY <fra> -> <til>» og vi vil ha målet.
  // --untracked-files=all lister filene i en ny mappe i stedet for bare mappa.
  const working = git('status', '--porcelain', '--untracked-files=all')
    .split('\n')
    .map((l) => l.slice(3).trim())
    .map((p) => (p.includes(' -> ') ? p.split(' -> ')[1] : p));
  return [...new Set([...committed, ...working])].filter(Boolean);
}

/** Alle .ts-filer under de katalogene en spec kan importere fra. */
function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== 'node_modules') walk(p);
      } else if (name.endsWith('.ts')) {
        out.push(relative(ROOT, p));
      }
    }
  };
  for (const d of GRAPH_DIRS) walk(join(ROOT, d));
  return out;
}

/** Løser en relativ importspesifikator til en sti i repoet, eller null for pakker. */
function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(join(ROOT, fromFile)), spec);
  for (const cand of [`${base}.ts`, join(base, 'index.ts'), base]) {
    if (existsSync(cand) && statSync(cand).isFile()) return relative(ROOT, cand);
  }
  return null;
}

const IMPORT_RE = /(?:from|import)\s*['"]([^'"]+)['"]/g;

/** importers.get(modul) = filene som importerer den direkte. */
function reverseGraph(files) {
  const importers = new Map();
  for (const file of files) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      const target = resolveImport(file, m[1]);
      if (!target) continue;
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target).add(file);
    }
  }
  return importers;
}

const isSpec = (p) => p.endsWith('.spec.ts');
const inGraph = (p) => p.endsWith('.ts') && GRAPH_DIRS.includes(p.split('/')[0]);
const isDoc = (p) => p.endsWith('.md');

/**
 * Spec-filene som påvirkes av at `changed` endres, funnet ved å gå oppover importgrafen.
 * Eksportert for regresjonstesten i lib/affected-tests.test.ts.
 */
export function affectedSpecs(changed, files = sourceFiles()) {
  const importers = reverseGraph(files);
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
  return [...affected].filter((p) => existsSync(join(ROOT, p))).sort();
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
  const forced = valueOf('--changed');
  const mode = args.includes('--files') ? 'files' : args.includes('--json') ? 'json' : 'grep';

  let changed;
  if (forced) {
    changed = [relative(ROOT, resolve(forced))];
  } else {
    try {
      changed = changedFiles(base);
    } catch (e) {
      fail(`Fant ikke endrede filer mot ${base}: ${(e.stderr || e.message).toString().trim() || 'ukjent ref'}`);
    }
  }

  const files = sourceFiles();
  const outside = changed.filter((p) => !inGraph(p) && !isDoc(p));
  const specs = affectedSpecs(changed.filter(inGraph), files);
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
        { base, changed, outside, specs, total, fullSuite: Boolean(reason), reason, grep },
        null,
        2
      ) + '\n'
    );
  else process.stdout.write(grep + '\n');
}

// Kjør bare når scriptet startes direkte, ikke når testen importerer affectedSpecs.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
