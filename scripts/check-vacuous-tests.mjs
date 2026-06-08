#!/usr/bin/env node
/**
 * Guardrail mot «grønn-men-meningsløs» e2e-test (jf. e2e-audit 2026-06-08, ftrl-klage).
 *
 * Regel 1 (BLOKKERER): ingen `expect(true).toBe(true)` i en test som FAKTISK kjører i CI.
 *   Tester/describes tagget @manual er unntatt (bevisst stillas som ikke kjører).
 *
 * Regel 2 (RATCHET): ingen NYE «svelge-feil»-catcher i pages/ ** /*.assertions.ts.
 *   `.catch(() => {})` / `=> false` / `=> null` / `=> console...` skjuler assertion-feil.
 *   Eksisterende gjeld er baselinet under (BASELINE) slik at sjekken kun feiler på ØKNING —
 *   senk tallene når du hardner en assertions-fil; aldri hev dem.
 *
 * Kjør: npm run check:tests   (ren node, ingen avhengigheter / docker-stack)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

// Per-fil baseline for svelge-catcher i *.assertions.ts. Mål: ned mot 0.
const BASELINE = {
  'pages/behandling/lovvalg.assertions.ts': 3,
  'pages/klage/klage.assertions.ts': 5,
  'pages/journalforing/journalforing.assertions.ts': 3,
  'pages/eu-eos/unntak/anmodning-unntak.assertions.ts': 5,
};

const SWALLOW = /\.catch\(\s*\(\s*\)\s*=>\s*(\{\s*\}?|false|null|console)/;
const isCommentLine = (l) => {
  const t = l.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const violations = [];

// --- Regel 1: expect(true).toBe(true) i kjørende tester ---
const specFiles = walk(join(ROOT, 'tests')).filter((f) => f.endsWith('.spec.ts'));
for (const file of specFiles) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  let describeManual = false;
  let testManual = false;
  lines.forEach((line, i) => {
    if (/test\.describe\s*\(/.test(line)) describeManual = /@manual/.test(line);
    if (/(^|\s)test\s*\(/.test(line)) testManual = /@manual/.test(line);
    if (!isCommentLine(line) && /expect\(\s*true\s*\)\s*\.toBe\(\s*true\s*\)/.test(line)) {
      if (!describeManual && !testManual) {
        violations.push(`${rel}:${i + 1}  expect(true).toBe(true) i en test som kjører i CI (tagg @manual eller skriv en ekte assertion)`);
      }
    }
  });
}

// --- Regel 2: nye svelge-catcher i *.assertions.ts (ratchet mot baseline) ---
const assertionFiles = walk(join(ROOT, 'pages')).filter((f) => f.endsWith('.assertions.ts'));
for (const file of assertionFiles) {
  const rel = relative(ROOT, file);
  const count = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => !isCommentLine(l) && SWALLOW.test(l)).length;
  const allowed = BASELINE[rel] ?? 0;
  if (count > allowed) {
    violations.push(`${rel}  ${count} svelge-catcher (.catch(()=>...)) > baseline ${allowed} — nye feil-svelgende catcher i assertions er ikke tillatt`);
  }
}

if (violations.length) {
  console.error('\n❌ check:tests fant grønn-men-meningsløs-mønstre:\n');
  for (const v of violations) console.error('   • ' + v);
  console.error(`\n${violations.length} brudd. Se scripts/check-vacuous-tests.mjs for regler.\n`);
  process.exit(1);
}

console.log('✅ check:tests OK — ingen expect(true) i kjørende tester, ingen nye svelge-catcher i assertions.');
