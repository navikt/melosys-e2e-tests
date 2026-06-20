#!/usr/bin/env node
/**
 * Guardrail mot «grønn-men-meningsløs» e2e-test (jf. e2e-audit 2026-06-08 + P0-tillitsherding 2026-06-13).
 *
 * Formål: en grønn CI-kjøring skal bety «trygt å merge + prodsette». Disse reglene
 * blokkerer mønstre der en test passerer uten å bevise noe.
 *
 * HARDE regler (én treff = exit 1):
 *   R1  Tautologi i en kjørende (ikke-@manual) test: expect(true).toBe(true),
 *       expect(true).toBeTruthy(), expect(false).toBeFalsy(), expect(<lit>).toBe(<samme lit>),
 *       expect(1).toBe(1) osv. — asserten kan aldri feile.
 *   R2  «Null-assert»: en kjørende (ikke-@manual) test() uten noe expect(),
 *       .verifiser*-kall eller assertErrors/assertNoErrors — den beviser ingenting.
 *   R3  Svelget assertion: expect(...)…​.catch(<uten throw>) — `.catch` på en expect-kjede
 *       nuller ut hele asserten. Skannes i .spec.ts, *.page.ts OG *.assertions.ts.
 *   R4  try/catch rundt expect der catch ikke re-thrower — expect-feilen svelges av catch.
 *       Skannes i .spec.ts + *.assertions.ts.
 *
 * RATCHET (R5): nye «svelge-catcher» i *.assertions.ts som verken er rene prober
 *   (isVisible()/textContent()/waitFor()… → fanget i variabel) eller re-thrower.
 *   Per-fil baseline under (BASELINE); senk aldri hev. Prober telles IKKE (jf. R3/probe-skille),
 *   så baseline kan ærlig falle mot 0.
 *
 * Kommentarer, streng-/template-/regex-literaler blankes før strukturanalyse, så referanser
 * i kommentarer/strenger gir ikke utslag.
 *
 * Kjør: npm run check:tests   (ren node, ingen avhengigheter / docker-stack)
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

// Per-fil baseline for ekte svelge-catcher (R5) i *.assertions.ts. Mål: 0. Aldri hev.
const BASELINE = {};

const violations = []; // harde brudd (R1–R4)

// Nøkkelord der et påfølgende `/` starter et regex-literal (uttrykkskontekst), ikke divisjon.
const REGEX_PREFIX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'void', 'yield', 'delete',
  'do', 'else', 'case', 'await', 'new', 'throw',
]);

// --- Tokeniser: behold lengde/linjeskift, blank kommentarer + streng/template/regex til mellomrom ---
// Stakk-basert så template-literaler med nøstede `${ ... }` (som igjen kan inneholde strenger,
// templates, objekt-literaler) håndteres korrekt. Resultatet («skjelettet») har balanserte
// {}/()/[] uten streng-/kommentar-/regex-støy → trygt for delimiter-matching.
function skeleton(code) {
  const n = code.length;
  const out = new Array(n);
  for (let k = 0; k < n; k++) out[k] = code[k] === '\n' ? '\n' : ' ';
  let i = 0;
  let prevSig = ''; // siste betydningsfulle (ikke-mellomrom) kode-tegn — for regex-heuristikk
  // Stakk av rammer: 'code' (vanlig kode) eller 'template' (inni `...`, utenfor ${}).
  const stack = [{ type: 'code', brace: 0, fromTemplate: false }];
  const emit = (idx) => { out[idx] = code[idx]; };

  while (i < n) {
    const top = stack[stack.length - 1];
    const c = code[i];
    const c2 = code[i + 1];

    if (top.type === 'template') {
      if (c === '\\') { i += 2; continue; } // escape blankes
      if (c === '`') { i++; stack.pop(); prevSig = '`'; continue; } // slutt på template
      if (c === '$' && c2 === '{') {
        i += 2;
        stack.push({ type: 'code', brace: 0, fromTemplate: true });
        prevSig = ''; // ny uttrykkskontekst → et ledende / inni ${…} er regex, ikke divisjon
        continue;
      }
      i++; // vanlig template-tekst → forblir blank
      continue;
    }

    // --- code-ramme ---
    if (c === '/' && c2 === '/') { // linjekommentar
      while (i < n && code[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && c2 === '*') { // blokkommentar
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i = Math.min(n, i + 2);
      continue;
    }
    if (c === "'" || c === '"') { // streng
      i++;
      while (i < n) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === c) { i++; break; }
        i++;
      }
      prevSig = c; // verdi-tegn → et / rett etter er divisjon
      continue;
    }
    if (c === '`') { // start på template
      i++;
      stack.push({ type: 'template', brace: 0, fromTemplate: false });
      prevSig = '`';
      continue;
    }
    if (c === '}' && top.brace === 0 && top.fromTemplate) { // lukker ${ ... } → tilbake til template
      i++;
      stack.pop();
      continue;
    }
    if (c === '/') { // mulig regex-literal
      const punct = /[(,=:[!&|?{};+\-*%<>~^]/.test(prevSig || '');
      let kw = false;
      if (!punct) { // sjekk om foregående ord er et uttrykks-nøkkelord
        let b = i - 1;
        while (b >= 0 && /\s/.test(code[b])) b--;
        let e = b;
        while (b >= 0 && /[A-Za-z0-9_$]/.test(code[b])) b--;
        // Et `.` rett foran ordet → property-aksess (a.of, x.in), ikke et nøkkelord.
        kw = code[b] !== '.' && REGEX_PREFIX_KEYWORDS.has(code.slice(b + 1, e + 1));
      }
      if (punct || kw || prevSig === '') {
        let j = i + 1;
        let inClass = false;
        let ok = false;
        while (j < n) {
          const d = code[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '\n') break; // regex spenner ikke over linjeskift → var nok divisjon
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) { j++; ok = true; break; }
          j++;
        }
        if (ok) {
          while (j < n && /[a-z]/i.test(code[j])) j++; // hopp forbi flagg
          i = j;
          prevSig = '/';
          continue;
        }
      }
    }
    // vanlig kode-tegn
    emit(i);
    if (c === '{' || c === '}') top.brace += c === '{' ? 1 : -1;
    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return out.join('');
}

// Match delimiter (paren/brace) fra åpningsindeks → indeks for matchende lukking (på skjelett).
function matchDelim(skel, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < skel.length; i++) {
    if (skel[i] === open) depth++;
    else if (skel[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const lineOf = (code, idx) => code.slice(0, idx).split('\n').length;

// Tekst for utsagnet som ender ved `pos` (eksklusiv): skann bakover, hopp over balanserte
// (), [] og {} (så objekt-literaler som `{ timeout: 5000 }` ikke regnes som blokkgrense),
// stopp på `;` eller en uбалansert blokk-/uttrykks-åpner.
function statementBefore(skel, pos) {
  let depth = 0;
  let i = pos - 1;
  for (; i >= 0; i--) {
    const c = skel[i];
    if (c === ')' || c === ']' || c === '}') depth++;
    else if (c === '(' || c === '[' || c === '{') {
      if (depth === 0) break; // uomsluttende åpner → start på vårt uttrykk
      depth--;
    } else if (depth === 0 && c === ';') break;
  }
  return skel.slice(i + 1, pos);
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

const specFiles = walk(join(ROOT, 'tests')).filter((f) => f.endsWith('.spec.ts'));
const pageFiles = walk(join(ROOT, 'pages')).filter((f) => f.endsWith('.page.ts'));
const assertionFiles = walk(join(ROOT, 'pages')).filter((f) => f.endsWith('.assertions.ts'));

// En test regnes som «beviser noe» om kroppen inneholder ett av disse (utenfor strenger/kommentarer):
//  - expect(...)                       — direkte assertion
//  - verifiserX(...) / .verifiserX(...) — POM- eller fri-funksjons-verifikasjon
//  - assertErrors/assertNoErrors/...    — feil-assertion-rammeverket
//  - (a)waitProcessInstances(...)       — poller prosessinstanser til FERDIG (utfallsport)
//  - fattVedtak/klikkFattVedtak(...)    — venter på POST /fatt (reell utfallsport; «røyk, ikke falsk»)
const ASSERTION = /(expect\s*\(|\bverifiser[A-ZÆØÅ]|\bassert(Errors|NoErrors|Error)\s*\(|\b(awaitProcessInstances|waitForProcessInstances)\s*\(|\b(klikk)?[Ff]attVedtak\s*\()/;
// Tautologier som aldri kan feile.
const TAUTOLOGY = [
  /expect\(\s*true\s*\)\s*\.toBe(Truthy)?\(\s*(true\s*)?\)/,
  /expect\(\s*false\s*\)\s*\.toBe(Falsy)?\(\s*(false\s*)?\)/,
];
// expect(<literal>).toBe(<samme literal>)
const LIT = /expect\(\s*(-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|`[^`]*`)\s*\)\s*\.toBe\(\s*(-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|`[^`]*`)\s*\)/;

// Probe-metoder: et .catch på en av disse er en synlighets-/lese-probe, ikke en svelget assertion.
// Kun rene lese-/vente-metoder regnes som prober. Handlinger (click/press/fill/…) er IKKE
// prober — en svelget handlingsfeil er reell gjeld. Probe-kallet må være SISTE ledd før .catch:
// `([^()]|\([^()]*\))*` matcher argumenter med inntil ett nivå nøstede parenteser
// (f.eks. waitFor({ timeout: f() })), men `\)\s*$` krever at probe-kallet avslutter kjeden — så
// en etterfølgende handling (.then(e => e.click())) IKKE feilklassifiseres som probe.
const PROBE_METHOD = /\.(isVisible|isHidden|isChecked|isEnabled|isEditable|isDisabled|textContent|innerText|inputValue|getAttribute|count|title|allTextContents|waitFor|waitForLoadState|waitForResponse|waitForSelector|waitForURL|waitForEvent)\s*\(([^()]|\([^()]*\))*\)\s*$/;

// --- R1 + R2: tautologi og null-assert i kjørende tester (per .spec.ts) ---
for (const file of specFiles) {
  const rel = relative(ROOT, file);
  const code = readFileSync(file, 'utf8');
  const skel = skeleton(code);

  // Finn alle test.*/test( -kall med paren-matching.
  const callRe = /(?<![.\w])test(\.(only|skip|fixme|describe(\.(only|skip|fixme))?))?\s*\(/g;
  const describes = []; // { open, close, manual }
  const tests = []; // { headStart, open, close, running, manual }
  let m;
  while ((m = callRe.exec(skel)) !== null) {
    const kind = m[1] || ''; // '' | '.only' | '.skip' | '.fixme' | '.describe' ...
    const open = m.index + m[0].length - 1; // indeks for '('
    const close = matchDelim(skel, open, '(', ')');
    if (close === -1) continue;
    // @manual finnes i tittel-strengen (eller en { tag } før callbacken) → sjekk ORIGINAL kode
    // (skjelettet har blanket strenger). Vindu = fra test( til callback-start (`=>`), uansett
    // tittellengde, men FØR kroppen (så en @manual-omtale inni kroppen ikke feil-fritar).
    const arrow = skel.indexOf('=>', open);
    const headEnd = arrow !== -1 && arrow < close ? arrow : close;
    const manual = /@manual/.test(code.slice(m.index, headEnd));
    if (kind.startsWith('.describe')) {
      describes.push({ open, close, manual });
    } else if (kind === '' || kind === '.only') {
      tests.push({ headStart: m.index, open, close, running: true, manual });
    }
    // .skip / .fixme: hoppes over → ikke en kjørende test.
  }

  for (const t of tests) {
    const inManualDescribe = describes.some((d) => d.manual && t.open > d.open && t.close <= d.close);
    if (t.manual || inManualDescribe) continue; // @manual-stillas er unntatt
    const body = skel.slice(t.open, t.close + 1);

    // R1: tautologi
    for (const re of TAUTOLOGY) {
      const tm = body.match(re);
      if (tm) {
        violations.push(`${rel}:${lineOf(code, t.open + tm.index)}  R1 tautologi (${tm[0].trim()}) — asserten kan aldri feile (tagg @manual eller skriv en ekte assertion)`);
      }
    }
    const lm = body.match(LIT);
    if (lm && lm[1] === lm[2]) {
      violations.push(`${rel}:${lineOf(code, t.open + lm.index)}  R1 tautologi (${lm[0].trim()}) — literal sammenlignet med seg selv`);
    }

    // R2: null-assert
    if (!ASSERTION.test(body)) {
      violations.push(`${rel}:${lineOf(code, t.headStart)}  R2 null-assert — kjørende test uten expect()/verifiser*/assertErrors (beviser ingenting; tagg @manual eller legg til en assertion)`);
    }
  }
}

// --- R3: svelget assertion — expect(...)….catch(<uten throw>) — i spec/page/assertions ---
for (const file of [...specFiles, ...pageFiles, ...assertionFiles]) {
  const rel = relative(ROOT, file);
  const code = readFileSync(file, 'utf8');
  const skel = skeleton(code);
  const catchRe = /\.catch\s*\(/g;
  let m;
  while ((m = catchRe.exec(skel)) !== null) {
    const argOpen = m.index + m[0].length - 1; // '(' i .catch(
    const argClose = matchDelim(skel, argOpen, '(', ')');
    if (argClose === -1) continue;
    const catchBody = skel.slice(argOpen, argClose + 1);
    if (/\bthrow\b/.test(catchBody)) continue; // re-thrower → ikke svelget
    const stmt = statementBefore(skel, m.index);
    if (/expect\s*\(/.test(stmt)) {
      violations.push(`${rel}:${lineOf(code, m.index)}  R3 svelget assertion (.catch på en expect-kjede uten re-throw nuller ut asserten — bruk en probe (isVisible().catch(()=>false)) eller la asserten feile)`);
    }
  }
}

// --- R4: try/catch rundt expect der catch ikke re-thrower (spec + assertions) ---
for (const file of [...specFiles, ...assertionFiles]) {
  const rel = relative(ROOT, file);
  const code = readFileSync(file, 'utf8');
  const skel = skeleton(code);
  const tryRe = /\btry\s*\{/g;
  let m;
  while ((m = tryRe.exec(skel)) !== null) {
    const tryOpen = m.index + m[0].length - 1; // '{'
    const tryClose = matchDelim(skel, tryOpen, '{', '}');
    if (tryClose === -1) continue;
    const tryBody = skel.slice(tryOpen, tryClose + 1);
    if (!/expect\s*\(/.test(tryBody)) continue;
    // catch rett etter try-blokka?
    const after = skel.slice(tryClose + 1);
    const cm = after.match(/^\s*catch\s*(\([^)]*\))?\s*\{/);
    if (!cm) continue; // try/finally uten catch
    const catchOpen = tryClose + 1 + cm[0].length - 1;
    const catchClose = matchDelim(skel, catchOpen, '{', '}');
    if (catchClose === -1) continue;
    const catchBody = skel.slice(catchOpen, catchClose + 1);
    if (!/\bthrow\b/.test(catchBody)) {
      violations.push(`${rel}:${lineOf(code, m.index)}  R4 try/catch rundt expect uten re-throw — assertion-feilen svelges av catch (re-throw i catch, eller flytt expect ut av try)`);
    }
  }
}

// --- R5: ratchet mot nye ekte svelge-catcher i *.assertions.ts (prober ekskludert) ---
for (const file of assertionFiles) {
  const rel = relative(ROOT, file);
  const code = readFileSync(file, 'utf8');
  const skel = skeleton(code);
  const lines = skel.split('\n');
  let count = 0;
  const catchRe = /\.catch\s*\(/g;
  let m;
  while ((m = catchRe.exec(skel)) !== null) {
    const argOpen = m.index + m[0].length - 1;
    const argClose = matchDelim(skel, argOpen, '(', ')');
    if (argClose === -1) continue;
    const catchBody = skel.slice(argOpen, argClose + 1);
    if (/\bthrow\b/.test(catchBody)) continue; // re-thrower → ikke svelget
    const stmt = statementBefore(skel, m.index);
    if (/expect\s*\(/.test(stmt)) continue; // expect-kjeder fanges hardt av R3 → ikke dobbelttell
    if (PROBE_METHOD.test(stmt)) continue; // .catch rett etter en lese-/synlighetsmetode → probe
    // Fanget fallback (const/let/var/return/x = …) → reservverdien brukes → probe, ikke svelget feil.
    if (/\b(const|let|var|return)\b/.test(stmt) || /[^=!<>]=[^=>]/.test(stmt)) continue;
    count++;
  }
  const allowed = BASELINE[rel] ?? 0;
  if (count > allowed) {
    violations.push(`${rel}  R5: ${count} ekte svelge-catcher (.catch uten throw, ikke probe) > baseline ${allowed} — nye feil-svelgende catcher i assertions er ikke tillatt`);
  }
}

if (violations.length) {
  console.error('\n❌ check:tests fant grønn-men-meningsløs-mønstre:\n');
  for (const v of violations) console.error('   • ' + v);
  console.error(`\n${violations.length} brudd. Se scripts/check-vacuous-tests.mjs for regler (R1–R5).\n`);
  process.exit(1);
}

console.log('✅ check:tests OK — ingen tautologier, null-assert-tester, svelgede assertions eller nye svelge-catcher.');
