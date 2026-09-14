#!/usr/bin/env node
/**
 * Velger ut hvilke e2e-tester en endring faktisk rører, slik at CI kan kjøre dem i stedet for
 * hele suiten.
 *
 * Bakgrunn: å velge testene for hånd er lett å ta feil av i feil retning. Endrer du en spec-fil
 * er svaret åpenbart, men endrer du en helper er det ikke det — `helpers/unleash-helper.ts` sin
 * `resetToDefaults` kjøres før hver eneste test, så en endring der treffer hele suiten selv om
 * diffen er fire linjer. Scriptet regner ut svaret i stedet for å gjette, og sier tydelig fra
 * når utvalget er så bredt at «kun påvirkede tester» ikke lenger sparer noe.
 *
 * Slik virker det:
 *   1. Finner endrede filer: committet mot basen (default origin/main) pluss det som ligger
 *      i arbeidstreet, så det også virker før du committer.
 *   2. Bygger en omvendt importgraf over .ts-filene ved å lese relative import/export-stier.
 *   3. Påvirkede spec-er = endrede spec-er + spec-er som transitivt importerer en endret modul.
 *
 * Utdata på stdout styres av flagg; oppsummeringen går alltid til stderr, så `--grep` kan
 * pipes rett videre uten å dra med seg støy.
 *
 *   --grep    (default) regex-alternativ til `playwright test --grep` og til workflow-inputen
 *             `test_grep`. Playwright matcher mot «<sti fra testDir> › <testtittel>», så stier
 *             fungerer som filter der.
 *   --files   spec-stier, én per linje
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

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const BASE = baseIdx !== -1 ? args[baseIdx + 1] : 'origin/main';
const mode = args.includes('--files') ? 'files' : args.includes('--json') ? 'json' : 'grep';
const changedIdx = args.indexOf('--changed');
const FORCED_CHANGED = changedIdx !== -1 ? args[changedIdx + 1] : null;

const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return '';
  }
};

/** Endrede filer: committet mot basen + alt som ligger ucommittet i arbeidstreet. */
function changedFiles() {
  const committed = git('diff', '--name-only', `${BASE}...HEAD`).split('\n');
  // --porcelain gir «XY <sti>»; ved rename står «XY <fra> -> <til>» og vi vil ha målet.
  const working = git('status', '--porcelain')
    .split('\n')
    .map((l) => l.slice(3).trim())
    .map((p) => (p.includes(' -> ') ? p.split(' -> ')[1] : p));
  return [...new Set([...committed, ...working])].filter((p) => p && p.endsWith('.ts'));
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
  for (const d of ['tests', 'pages', 'helpers', 'fixtures', 'lib', 'utils', 'atdd']) {
    walk(join(ROOT, d));
  }
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

function main() {
  const changed = FORCED_CHANGED ? [FORCED_CHANGED] : changedFiles();
  const files = sourceFiles();
  const specs = affectedSpecs(changed, files);
  const total = files.filter(isSpec).length;

  // Playwright matcher mot stien slik den står under testDir, uten «tests/»-prefikset.
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const grep = specs
    .map((p) => escape(relative(TEST_DIR, join(ROOT, p))))
    .join('|');

  const share = total ? Math.round((specs.length / total) * 100) : 0;
  process.stderr.write(
    `Endrede .ts-filer: ${changed.length}\n` +
      `Påvirkede spec-filer: ${specs.length} av ${total} (${share} %)\n`
  );
  if (share >= 60) {
    process.stderr.write(
      'Utvalget dekker mesteparten av suiten — en endret fellesmodul treffer nesten alt. ' +
        'Vurder å kjøre hele suiten i stedet.\n'
    );
  }
  if (specs.length === 0) {
    process.stderr.write('Ingen spec-filer påvirket. Sjekk at --base peker på riktig ref.\n');
  }

  if (mode === 'files') process.stdout.write(specs.join('\n') + (specs.length ? '\n' : ''));
  else if (mode === 'json')
    process.stdout.write(
      JSON.stringify({ base: BASE, changed, specs, total, sharePercent: share, grep }, null, 2) + '\n'
    );
  else process.stdout.write(grep + '\n');
}

// Kjør bare når scriptet startes direkte, ikke når testen importerer affectedSpecs.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
