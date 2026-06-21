/* ------------------------------------------------------------------ *
 * E2E report layout ideas — renderers
 *
 * Every renderer below emits ONLY the HTML subset that GitHub Actions
 * job summaries actually allow: <details>/<summary>, <table>, <strong>,
 * <code>, <br>, <sub>, emoji. No style/class/color/JS. So what you see
 * in the frame is what you'll get in the real PR job summary.
 *
 * The page chrome (tabs, notes) uses normal CSS — that's the doc, not
 * the report.
 * ------------------------------------------------------------------ */

// ---- helpers --------------------------------------------------------

function fmtDur(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

const EMOJI = {
  passed: '✅', failed: '❌', flaky: '🔄', skipped: '⏭️',
  'known-error-failed': '⚠️', 'known-error-passed': '✨',
};
const emoji = (s) => EMOJI[s] || '❓';

// Domain consolidation preview (no files are moved — this only re-groups for
// the report). Verified faglig: "ftrl" == sakstema "Utenfor avtaleland (ftrl)".
// Set by render() from the "Domain mapping" toggle.
let DOMAIN_ALIAS = {};
const CONSOLIDATE = { ftrl: 'utenfor-avtaleland' };

// tests/eu-eos/unntak/eu-eos-foo.spec.ts -> {domain, sub, base, label}
function parsePath(file) {
  const parts = file.split('/');         // ['tests','eu-eos','unntak','eu-eos-foo.spec.ts']
  const i = parts.indexOf('tests');
  const after = parts.slice(i + 1);
  const base = after[after.length - 1];
  const rawDomain = after[0];
  const domain = DOMAIN_ALIAS[rawDomain] || rawDomain; // consolidation preview
  const sub = after.slice(1, -1).join('/'); // 'unntak' or ''
  // strip ".spec.ts" and a redundant leading "<domain>-" so the file label
  // does not repeat the domain folder name. Uses the (consolidated) domain, so
  // a moved "ftrl-…" file keeps its prefix under utenfor-avtaleland.
  let label = base.replace(/\.spec\.ts$/, '');
  if (label.startsWith(domain + '-')) label = label.slice(domain.length + 1);
  if (sub) label = sub + '/' + label;
  return { domain, rawDomain, sub, base, label };
}

function enrich(tests) {
  return tests.map((t) => ({ ...t, ...parsePath(t.file) }));
}

// group -> {name, tests, passed, failed, flaky, skipped, dur, hasFail}
function groupByDomain(tests) {
  const map = new Map();
  for (const t of tests) {
    if (!map.has(t.domain)) map.set(t.domain, []);
    map.get(t.domain).push(t);
  }
  const groups = [...map.entries()].map(([name, ts]) => {
    const count = (s) => ts.filter((t) => t.status === s).length;
    const failed = count('failed');
    const flaky = count('flaky');
    return {
      name, tests: ts,
      passed: count('passed'), failed, flaky, skipped: count('skipped'),
      dur: ts.reduce((a, t) => a + t.duration, 0),
      hasFail: failed > 0 || flaky > 0,
    };
  });
  // failing groups first, then alphabetical
  groups.sort((a, b) => (b.hasFail - a.hasFail) || a.name.localeCompare(b.name));
  return groups;
}

function groupByFile(tests) {
  const map = new Map();
  for (const t of tests) {
    if (!map.has(t.label)) map.set(t.label, []);
    map.get(t.label).push(t);
  }
  const files = [...map.entries()].map(([label, ts]) => ({
    label, tests: ts,
    dur: ts.reduce((a, t) => a + t.duration, 0),
    hasFail: ts.some((t) => t.status === 'failed' || t.status === 'flaky'),
  }));
  files.sort((a, b) => (b.hasFail - a.hasFail) || a.label.localeCompare(b.label));
  return files;
}

function totals(tests) {
  const c = (s) => tests.filter((t) => t.status === s).length;
  return {
    passed: c('passed'), failed: c('failed'), flaky: c('flaky'),
    skipped: c('skipped'), total: tests.length,
  };
}

// Top-of-report banner shared by the idea variants.
function banner(data, tests) {
  const t = totals(tests);
  const ok = t.failed === 0 && t.flaky === 0;
  const head = ok ? '✅ All green' : `❌ ${t.failed + t.flaky} failing`;
  const bits = [
    `${t.passed} passed`,
    t.failed ? `${t.failed} failed` : null,
    t.flaky ? `${t.flaky} flaky` : null,
    t.skipped ? `${t.skipped} skipped` : null,
  ].filter(Boolean).join(' · ');
  return `<h2>${head} — ${bits}</h2>\n` +
         `<p><strong>${t.total} tests</strong> · ⏱️ ${fmtDur(data.duration)} total</p>\n`;
}

// Flat "needs attention" list, always above the fold, only when red.
function needsAttention(tests) {
  const bad = tests.filter((t) => t.status === 'failed' || t.status === 'flaky');
  if (!bad.length) return '';
  let h = `<h3>❌ Needs attention (${bad.length})</h3>\n<table>\n<thead><tr><th>Test</th><th>Where</th><th>Why</th><th>⏱️</th></tr></thead>\n<tbody>\n`;
  for (const t of bad) {
    const why = t.status === 'flaky'
      ? `🔄 flaky (${t.failedAttempts}/${t.totalAttempts} failed)`
      : (t.error ? `<code>${esc(firstLine(t.error))}</code>` : 'failed');
    h += `<tr><td>${emoji(t.status)} ${esc(t.title)}</td><td><code>${t.domain}/${esc(t.label)}</code></td><td>${why}</td><td>${fmtDur(t.duration)}</td></tr>\n`;
  }
  h += '</tbody>\n</table>\n';
  return h;
}

function firstLine(s) { return (s || '').split('\n').find((l) => l.trim()) || ''; }
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function dockerBadge(t) {
  if (!t.dockerErrors || !t.dockerErrors.length) return '';
  const n = t.dockerErrors.reduce((a, d) => a + d.errors.length, 0);
  return ` <sub>🐳 ${t.dockerErrors.map((d) => d.service).join(', ')} (${n})</sub>`;
}

// ====================================================================
// VARIANT: CURRENT (baseline) — one flat table, folder + file repeated
// ====================================================================
function renderCurrent(data) {
  const tests = enrich(data.tests);
  const files = [];
  for (const g of groupByDomain(tests))
    for (const f of groupByFile(g.tests))
      files.push({ folder: g.name, ...f });
  files.sort((a, b) => (b.hasFail - a.hasFail) ||
    `${a.folder}/${a.label}`.localeCompare(`${b.folder}/${b.label}`));

  let h = banner(data, tests);
  h += '<h3>📊 Test Results</h3>\n<table>\n<thead><tr><th>Test</th><th>Status</th><th>Attempts</th><th>Docker</th><th>Duration</th></tr></thead>\n<tbody>\n';
  for (const f of files) {
    // NOTE: this row repeats the domain in both folder and file — the duplication.
    const orig = f.tests[0].base; // original filename WITH redundant prefix
    const failN = f.tests.filter((t) => t.status === 'failed').length;
    const info = failN ? ` (${failN}/${f.tests.length} failed)` : '';
    h += `<tr><td colspan="5"><strong>📁 ${f.folder} / <code>${orig}</code>${info}</strong></td></tr>\n`;
    for (const t of f.tests) {
      const att = t.totalAttempts > 1 ? `${t.totalAttempts} (${t.failedAttempts} failed)` : '1';
      const dck = t.dockerErrors ? '⚠️ ' + t.dockerErrors.map((d) => d.service).join(', ') : '✅';
      h += `<tr><td>${esc(t.title)}</td><td>${emoji(t.status)}</td><td>${att}</td><td>${dck}</td><td>${fmtDur(t.duration)}</td></tr>\n`;
    }
  }
  h += '</tbody>\n</table>\n';
  return h;
}

// ====================================================================
// VARIANT A: Domain groups · collapsible · duration rollup  (RECOMMENDED)
//  - failures hoisted into a panel on top
//  - one <details> per DOMAIN (failing = open, passing = collapsed)
//  - summary line carries counts + summed duration
//  - file labels de-duplicated (domain prefix stripped)
// ====================================================================
function renderA(data) {
  const tests = enrich(data.tests);
  let h = banner(data, tests);
  h += needsAttention(tests);
  h += '<h3>📊 By domain</h3>\n';
  for (const g of groupByDomain(tests)) {
    const open = g.hasFail ? ' open' : '';
    const counts = [
      `${g.passed} ✅`,
      g.failed ? `${g.failed} ❌` : null,
      g.flaky ? `${g.flaky} 🔄` : null,
      g.skipped ? `${g.skipped} ⏭️` : null,
    ].filter(Boolean).join(' · ');
    const ico = g.hasFail ? '❌' : '✅';
    h += `<details${open}>\n<summary>${ico} <strong>${g.name}</strong> — ${counts} · ⏱️ ${fmtDur(g.dur)}</summary>\n\n`;
    h += '<table>\n<thead><tr><th>Test</th><th></th><th>⏱️</th></tr></thead>\n<tbody>\n';
    for (const f of groupByFile(g.tests)) {
      h += `<tr><td colspan="3"><sub>📄 ${esc(f.label)} · ${fmtDur(f.dur)}</sub></td></tr>\n`;
      for (const t of f.tests) {
        const att = t.totalAttempts > 1 ? ` <sub>(${t.failedAttempts}/${t.totalAttempts} failed)</sub>` : '';
        h += `<tr><td>${esc(t.title)}${att}${dockerBadge(t)}</td><td>${emoji(t.status)}</td><td>${fmtDur(t.duration)}</td></tr>\n`;
      }
    }
    h += '</tbody>\n</table>\n</details>\n\n';
  }
  return h;
}

// ====================================================================
// VARIANT B: Scoreboard first · detail on demand
//  - one compact rollup table: a row per domain (counts + duration)
//  - the green case stays TINY; click a domain to expand its tests
// ====================================================================
function renderB(data) {
  const tests = enrich(data.tests);
  let h = banner(data, tests);
  h += needsAttention(tests);
  const groups = groupByDomain(tests);
  h += '<h3>📊 Scoreboard</h3>\n<table>\n<thead><tr><th>Domain</th><th>✅</th><th>❌</th><th>🔄</th><th>⏭️</th><th>⏱️</th></tr></thead>\n<tbody>\n';
  for (const g of groups) {
    const ico = g.hasFail ? '❌' : '✅';
    h += `<tr><td>${ico} <strong>${g.name}</strong></td><td>${g.passed}</td><td>${g.failed || ''}</td><td>${g.flaky || ''}</td><td>${g.skipped || ''}</td><td>${fmtDur(g.dur)}</td></tr>\n`;
  }
  const t = totals(tests);
  h += `<tr><td><strong>Total</strong></td><td>${t.passed}</td><td>${t.failed || ''}</td><td>${t.flaky || ''}</td><td>${t.skipped || ''}</td><td><strong>${fmtDur(data.duration)}</strong></td></tr>\n`;
  h += '</tbody>\n</table>\n\n<h3>📂 Details</h3>\n';
  for (const g of groups) {
    const open = g.hasFail ? ' open' : '';
    h += `<details${open}>\n<summary>${g.hasFail ? '❌' : '✅'} <strong>${g.name}</strong> · ⏱️ ${fmtDur(g.dur)}</summary>\n\n<ul>\n`;
    for (const f of groupByFile(g.tests)) {
      h += `<li><strong>${esc(f.label)}</strong> <sub>${fmtDur(f.dur)}</sub><ul>\n`;
      for (const t2 of f.tests)
        h += `<li>${emoji(t2.status)} ${esc(t2.title)} <sub>${fmtDur(t2.duration)}</sub>${dockerBadge(t2)}</li>\n`;
      h += '</ul></li>\n';
    }
    h += '</ul>\n</details>\n\n';
  }
  return h;
}

// ====================================================================
// VARIANT C: Flat per-domain · no file layer
//  - drops the file grouping entirely (titles already describe the case)
//  - file shown only as a dim suffix → zero folder/file duplication
// ====================================================================
function renderC(data) {
  const tests = enrich(data.tests);
  let h = banner(data, tests);
  h += needsAttention(tests);
  h += '<h3>📊 By domain</h3>\n';
  for (const g of groupByDomain(tests)) {
    const open = g.hasFail ? ' open' : '';
    const counts = `${g.passed}/${g.tests.length} ✅`;
    h += `<details${open}>\n<summary>${g.hasFail ? '❌' : '✅'} <strong>${g.name}</strong> — ${counts} · ⏱️ ${fmtDur(g.dur)}</summary>\n\n`;
    const sorted = [...g.tests].sort((a, b) =>
      ((b.status !== 'passed') - (a.status !== 'passed')) || b.duration - a.duration);
    h += '<table>\n<tbody>\n';
    for (const t of sorted)
      h += `<tr><td>${emoji(t.status)}</td><td>${esc(t.title)} <sub>${esc(t.label)}</sub>${dockerBadge(t)}</td><td>${fmtDur(t.duration)}</td></tr>\n`;
    h += '</tbody>\n</table>\n</details>\n\n';
  }
  return h;
}

// ---- wiring ---------------------------------------------------------

const VARIANTS = {
  current: { fn: renderCurrent, name: 'Current (baseline)', note: 'Today’s report: one flat table, the domain repeated in folder <em>and</em> filename, no collapsing, no per-group duration.' },
  A: { fn: renderA, name: 'A · Domain groups + rollup', note: '<strong>Recommended.</strong> Failures hoisted to a top panel; one collapsible <code>&lt;details&gt;</code> per domain (failing open, passing collapsed); summary line shows counts + summed duration; file labels de-duplicated.' },
  B: { fn: renderB, name: 'B · Scoreboard first', note: 'A one-row-per-domain scoreboard (counts + duration) up top — the all-green case stays tiny. Tests live in collapsed lists below.' },
  C: { fn: renderC, name: 'C · Flat per-domain', note: 'Drops the file grouping entirely — test titles already describe the case; the file is a dim suffix. Zero folder/file duplication.' },
};

let state = { variant: 'A', dataset: 'green', mapping: 'asis' };

function render() {
  DOMAIN_ALIAS = state.mapping === 'consolidated' ? CONSOLIDATE : {};
  const data = window.DATASETS[state.dataset];
  const v = VARIANTS[state.variant];
  const consolidatedNote = state.mapping === 'consolidated'
    ? ' <strong>· Consolidation ON:</strong> <code>ftrl</code> folded into <code>utenfor-avtaleland</code> (sakstema «Utenfor avtaleland (ftrl)»). No files moved — grouping preview only.'
    : '';
  document.getElementById('note').innerHTML = v.note + consolidatedNote;
  document.getElementById('frame').innerHTML = v.fn(data);
  document.querySelectorAll('[data-variant]').forEach((b) =>
    b.classList.toggle('active', b.dataset.variant === state.variant));
  document.querySelectorAll('[data-dataset]').forEach((b) =>
    b.classList.toggle('active', b.dataset.dataset === state.dataset));
  document.querySelectorAll('[data-mapping]').forEach((b) =>
    b.classList.toggle('active', b.dataset.mapping === state.mapping));
}

document.addEventListener('click', (e) => {
  const vb = e.target.closest('[data-variant]');
  const db = e.target.closest('[data-dataset]');
  const mb = e.target.closest('[data-mapping]');
  if (vb) { state.variant = vb.dataset.variant; render(); }
  if (db) { state.dataset = db.dataset.dataset; render(); }
  if (mb) { state.mapping = mb.dataset.mapping; render(); }
});

document.addEventListener('DOMContentLoaded', render);
