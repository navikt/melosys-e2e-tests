#!/usr/bin/env node
/**
 * Guardrail mot «grønn-men-meningsløs» e2e-test (jf. e2e-audit 2026-06-08, ftrl-klage).
 *
 * Regel 1 (BLOKKERER): ingen `expect(true).toBe(true)` i en test som FAKTISK kjører i CI.
 *   Tester/describes tagget @manual er unntatt (bevisst stillas som ikke kjører).
 *
 * Regel 2 (RATCHET): ingen NYE «svelge-feil»-catcher i pages/ ** /*.assertions.ts.
 *   `.catch(() => {})` / `=> false|null|undefined|[]|''|0|console...` skjuler assertion-feil.
 *   Eksisterende gjeld er baselinet under (BASELINE) slik at sjekken kun feiler på ØKNING —
 *   senk tallene når du hardner en assertions-fil; aldri hev dem.
 *
 * Kommentarer (// og /* *​/) strippes før deteksjon, så referanser i kommentarer gir ikke utslag.
 *
 * Kjør: npm run check:tests   (ren node, ingen avhengigheter / docker-stack)
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

// Per-fil baseline for svelge-catcher i *.assertions.ts. Mål: ned mot 0. Aldri hev.
const BASELINE = {
  'pages/behandling/lovvalg.assertions.ts': 3,
  'pages/klage/klage.assertions.ts': 5,
  'pages/journalforing/journalforing.assertions.ts': 3,
  'pages/eu-eos/unntak/anmodning-unntak.assertions.ts': 5,
};

// Argløs .catch som svelger feilen (kan umulig bruke feilen → ren undertrykking).
const SWALLOW = /\.catch\(\s*\(\s*\)\s*=>\s*(\{|\[\s*\]|''|""|console|void\s+0|(?:false|null|undefined|0)\b)/;
const EXPECT_TRUE = /expect\(\s*true\s*\)\s*\.toBe\(\s*true\s*\)/;

/**
 * Fjern kommentarer (linje-`//` og blokk-`/* *​/`, også over flere linjer) men behold
 * linjeindeksene. Naiv mot strenger (en `//` inni en streng-literal blir også fjernet),
 * som er akseptabelt for å oppdage expect(true)/svelge-catch i testkode.
 */
function stripComments(lines) {
  const out = [];
  let inBlock = false;
  for (const raw of lines) {
    let s = '';
    let i = 0;
    while (i < raw.length) {
      if (inBlock) {
        const end = raw.indexOf('*/', i);
        if (end === -1) { i = raw.length; } else { inBlock = false; i = end + 2; }
      } else if (raw[i] === '/' && raw[i + 1] === '/') {
        break; // resten av linja er kommentar
      } else if (raw[i] === '/' && raw[i + 1] === '*') {
        inBlock = true; i += 2;
      } else {
        s += raw[i]; i += 1;
      }
    }
    out.push(s);
  }
  return out;
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// @manual kan stå på en flerlinjet test()/describe()-deklarasjon → slå sammen et lite vindu.
const taggedManual = (code, idx) => /@manual/.test((code[idx] || '') + (code[idx + 1] || '') + (code[idx + 2] || ''));

const violations = [];

// --- Regel 1: expect(true).toBe(true) i kjørende (ikke-@manual) tester ---
for (const file of walk(join(ROOT, 'tests')).filter((f) => f.endsWith('.spec.ts'))) {
  const rel = relative(ROOT, file);
  const code = stripComments(readFileSync(file, 'utf8').split('\n'));
  let describeManual = false;
  let testManual = false;
  code.forEach((line, i) => {
    if (/^\}\)/.test(line)) { describeManual = false; testManual = false; } // topp-nivå blokk lukkes
    if (/test\.describe\s*\(/.test(line)) { describeManual = taggedManual(code, i); testManual = false; }
    else if (/(^|\s)test\s*\(/.test(line)) { testManual = taggedManual(code, i); }
    if (EXPECT_TRUE.test(line) && !describeManual && !testManual) {
      violations.push(`${rel}:${i + 1}  expect(true).toBe(true) i en test som kjører i CI (tagg @manual eller skriv en ekte assertion)`);
    }
  });
}

// --- Regel 2: nye svelge-catcher i *.assertions.ts (ratchet mot baseline) ---
for (const file of walk(join(ROOT, 'pages')).filter((f) => f.endsWith('.assertions.ts'))) {
  const rel = relative(ROOT, file);
  const count = stripComments(readFileSync(file, 'utf8').split('\n')).filter((l) => SWALLOW.test(l)).length;
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
