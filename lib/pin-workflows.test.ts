import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
// @ts-expect-error — .mjs uten typedeklarasjon; scriptet er ren node uten avhengigheter.
import { changedFiles } from '../scripts/affected-tests.mjs';
// @ts-expect-error — .mjs uten typedeklarasjon; fila er ren node uten avhengigheter.
import { TJENESTER, eksplisitteTagger, tjenesterUnderTest } from './e2e-pins.mjs';

/**
 * Stegene i e2e-for-merge.yml og e2e-pins-utlop.yml som avgjør om pin-fila skal valideres,
 * kjørt slik de står i workflowen, mot et ekte git-repo i en midlertidig mappe.
 */

const PIN = '.github/e2e-pins.json';
const ROT = join(__dirname, '..');
const EN_PIN = JSON.stringify({ 'melosys-web': { tag: 'a'.repeat(40), jira: 'MELOSYS-9000', utloper: '2026-11-03' } });

/** Skriptet i steget `navn` i `workflow`, slik det står der. */
function steg(workflow: string, navn: string): string {
  const linjer = readFileSync(join(ROT, '.github/workflows', workflow), 'utf8').split('\n');
  const start = linjer.findIndex((l) => l === `      - name: ${navn}`);
  assert.ok(start !== -1, `fant ikke steget «${navn}» i ${workflow}`);
  const run = linjer.findIndex((l, i) => i > start && l === '        run: |');
  const skript: string[] = [];
  for (const l of linjer.slice(run + 1)) {
    if (l !== '' && !l.startsWith('          ')) break;
    skript.push(l.slice(10));
  }
  return skript.join('\n');
}

/** Kjører `skript` som GitHub Actions gjør (bash -eo pipefail) og gir GITHUB_OUTPUT som objekt. */
function kjørSteg(skript: string, cwd: string, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pin-steg-'));
  const fil = join(dir, 'steg.sh');
  const output = join(dir, 'github-output');
  const temp = join(dir, 'runner-temp');
  mkdirSync(temp);
  writeFileSync(fil, skript);
  writeFileSync(output, '');
  execFileSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', fil], {
    cwd,
    env: { ...process.env, ...gitEnv, RUNNER_TEMP: temp, GITHUB_OUTPUT: output, ...env },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const ut = Object.fromEntries(
    readFileSync(output, 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
  );
  return { ut, temp };
}

// Uten brukerens git-oppsett: diff.renames eller lignende der skal ikke styre testen.
const gitEnv = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};

/** Et ekte git-repo med pin-fila og en testfil på main. */
function lagRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'pin-repo-'));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, env: { ...process.env, ...gitEnv }, encoding: 'utf8' }).trim();
  const skriv = (sti: string, innhold: string) => {
    mkdirSync(dirname(join(dir, sti)), { recursive: true });
    writeFileSync(join(dir, sti), innhold);
  };
  const commit = (melding: string) => {
    git('add', '-A');
    git('commit', '-q', '-m', melding);
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q', '-b', 'main');
  skriv(PIN, EN_PIN);
  skriv('tests/a.spec.ts', 'a');
  const start = commit('start');
  return { dir, git, skriv, commit, start };
}

// ---- «Er pin-fila endret?» i e2e-for-merge.yml ----

const endretSteg = () => steg('e2e-for-merge.yml', 'Er pin-fila endret?');

test('køen: en PR som bare endrer pin-fila, bak en annen PR i køen, regnes som bare pin-fila', () => {
  // Køer som bygger flere oppføringer, lager hver som én squash-commit på oppføringen foran, og
  // base_sha er den oppføringen (melosys-web kjøring 39368635780: base_sha 1d05b2e er pr-3258 i
  // køen). Køen i dette repoet bygger én om gangen, så der er base_sha main.
  const r = lagRepo();
  r.skriv('tests/a.spec.ts', 'endret');
  const forrige = r.commit('forrige oppføring');
  r.skriv(PIN, '{}');
  const denne = r.commit('pin-PR');
  const { ut, temp } = kjørSteg(endretSteg(), r.dir, { BASE_SHA: forrige, HEAD_SHA: denne });
  assert.equal(ut.endret, 'true');
  assert.equal(ut.bare_pinfil, 'true');
  assert.equal(readFileSync(join(temp, 'base-pins.json'), 'utf8'), EN_PIN);
  assert.equal(readFileSync(join(temp, 'head-pins.json'), 'utf8'), '{}');
});

test('køen: en PR bak en PR som bare endrer pin-fila, ser ikke pin-endringen', () => {
  const r = lagRepo();
  r.skriv(PIN, '{}');
  const forrige = r.commit('pin-PR');
  r.skriv('tests/a.spec.ts', 'endret');
  const denne = r.commit('annen PR');
  const { ut } = kjørSteg(endretSteg(), r.dir, { BASE_SHA: forrige, HEAD_SHA: denne });
  assert.equal(ut.endret, 'false');
});

test('PR: bare pin-fila regnes mot merge-basen, også når main har fått andre endringer', () => {
  const r = lagRepo();
  r.git('checkout', '-q', '-b', 'pr');
  r.skriv(PIN, '{}');
  const pr = r.commit('pin-PR');
  r.git('checkout', '-q', 'main');
  r.skriv('tests/a.spec.ts', 'endret på main');
  const main = r.commit('main går videre');
  const { ut } = kjørSteg(endretSteg(), r.dir, { BASE_SHA: main, HEAD_SHA: pr });
  assert.equal(ut.endret, 'true');
  assert.equal(ut.bare_pinfil, 'true');
});

test('pin-fila som flyttes med git mv, regnes som endret og fjernet', () => {
  const r = lagRepo();
  r.git('mv', PIN, 'pins-backup.json');
  const head = r.commit('flytt pin-fila');
  const { ut, temp } = kjørSteg(endretSteg(), r.dir, { BASE_SHA: r.start, HEAD_SHA: head });
  assert.equal(ut.endret, 'true');
  assert.equal(ut.bare_pinfil, 'false', 'den nye fila er også en endring');
  assert.equal(readFileSync(join(temp, 'head-pins.json'), 'utf8'), '');
});

// ---- changedFiles i affected-tests.mjs ----

test('changedFiles: en flyttet pin-fil gir både gammel og ny sti i arbeidstreet', () => {
  const r = lagRepo();
  r.git('mv', PIN, 'pins-backup.json');
  assert.deepEqual([...changedFiles(r.start, { run: (...a: string[]) => r.git(...a) + '\n' })].sort(), [PIN, 'pins-backup.json']);
});

test('changedFiles: en flyttet pin-fil gir både gammel og ny sti i committede endringer', () => {
  const r = lagRepo();
  r.git('mv', PIN, 'pins-backup.json');
  const head = r.commit('flytt pin-fila');
  const run = (...a: string[]) => r.git(...a) + '\n';
  assert.deepEqual([...changedFiles(r.start, { arbeidstre: false, head, run })].sort(), [PIN, 'pins-backup.json']);
});

// ---- «Finnes det pinner?» i e2e-pins-utlop.yml ----

/** Kjører steget mot en sjekket ut kopi av repoet med `innhold` som pin-fil (undefined: ingen fil). */
function finnesPinner(innhold: string | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), 'pin-utlop-'));
  mkdirSync(join(dir, 'lib'));
  mkdirSync(join(dir, '.github'));
  writeFileSync(join(dir, 'lib/e2e-pins.mjs'), readFileSync(join(ROT, 'lib/e2e-pins.mjs')));
  if (innhold !== undefined) writeFileSync(join(dir, PIN), innhold);
  assert.equal(existsSync(join(dir, PIN)), innhold !== undefined);
  return kjørSteg(steg('e2e-pins-utlop.yml', 'Finnes det pinner?'), dir).ut.pinner;
}

test('utløpsjobben: ingen fil, tom fil og {} betyr ingen pinner', () => {
  for (const innhold of [undefined, '', '  \n', '{}', '{ }\n']) {
    assert.equal(finnesPinner(innhold), 'false', JSON.stringify(innhold));
  }
});

test('utløpsjobben: en gyldig pin valideres', () => {
  assert.equal(finnesPinner(EN_PIN), 'true');
});

test('utløpsjobben: krasjer lib/e2e-pins.mjs, valideres fila', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pin-utlop-'));
  mkdirSync(join(dir, 'lib'));
  mkdirSync(join(dir, '.github'));
  writeFileSync(join(dir, 'lib/e2e-pins.mjs'), "throw new Error('krasj');\n");
  writeFileSync(join(dir, PIN), '{}');
  assert.equal(kjørSteg(steg('e2e-pins-utlop.yml', 'Finnes det pinner?'), dir).ut.pinner, 'true');
});

test('utløpsjobben: et steg som feiler, gir også Slack-varsel', () => {
  // Krasjer for eksempel lib/e2e-pins.mjs, stopper «Hvilke repoer trenger tokenen?» jobben før
  // «Valider pin-fila» har satt varsle.
  const yml = readFileSync(join(ROT, '.github/workflows/e2e-pins-utlop.yml'), 'utf8');
  const hvis = (navn: string) => yml.match(new RegExp(`- name: ${navn}\\n(?: {8}.*\\n)*? {8}if: (.*)\\n`))?.[1];
  assert.equal(hvis('Bygg Slack-melding'), "failure() || steps.valider.outputs.varsle == 'true'");
  assert.equal(hvis('Slack Notification'), `"!cancelled() && steps.melding.outcome == 'success'"`);
  // Uten utløpte pinner og valideringsfeil sier meldingen at sjekken ikke ble ferdig.
  assert.match(slackMelding({}), /^\*Sjekken av pin-fila feilet\* før den ble ferdig/);
  assert.doesNotMatch(slackMelding({ UTLOPT: '• melosys-web (MELOSYS-1) utløp 2026-01-01' }), /Sjekken av pin-fila feilet/);
});

// ---- «Hvilke repoer trenger tokenen?» i e2e-for-merge.yml ----

test('pinner: tokenen gjelder repoene til pinnene i både head og base', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pin-repoer-'));
  const temp = join(dir, 'runner-temp');
  mkdirSync(join(dir, 'lib'));
  mkdirSync(temp);
  writeFileSync(join(dir, 'lib/e2e-pins.mjs'), readFileSync(join(ROT, 'lib/e2e-pins.mjs')));
  const repoer = (head: string, base: string) => {
    writeFileSync(join(temp, 'head-pins.json'), head);
    writeFileSync(join(temp, 'base-pins.json'), base);
    return kjørSteg(steg('e2e-for-merge.yml', 'Hvilke repoer trenger tokenen?'), dir, { RUNNER_TEMP: temp }).ut.repoer;
  };
  const koblet = { tag: 'b'.repeat(40), e2e_branch: 'MELOSYS-9000-ny-knapp', service_pr: 3300, jira: 'MELOSYS-9000', utloper: '2026-11-03' };
  // En koblet api-pin som fjernes, slås opp i melosys-api (D14).
  assert.equal(repoer(EN_PIN, JSON.stringify({ 'melosys-api': koblet })), 'melosys-api,melosys-web');
  assert.equal(repoer(EN_PIN, '{'), 'melosys-web', 'ugyldig base regnes som tom');
});

// ---- «Determine image tags from trigger source» i e2e-tests.yml ----

const TJENESTENE = Object.keys(TJENESTER);
/** En karantenepin på hver tjeneste, med hver sin tag. */
const ALLE_PINNET = Object.fromEntries(
  TJENESTENE.map((t, i) => [t, { tag: '0123456789a'[i].repeat(40), jira: 'MELOSYS-9000', utloper: '2026-11-03' }])
);

/**
 * Kjører steget slik det står i workflowen og gir taggen hver tjeneste fikk. Taggene leses fra
 * resolvedTags i trigger-konteksten, som skrives før steget avviser ugyldige tagger; en tom tag
 * står ikke der og blir ''.
 */
function bestemTaggerISteget(env: Record<string, string>, pinner?: object) {
  const dir = mkdtempSync(join(tmpdir(), 'image-tags-'));
  try {
    mkdirSync(join(dir, 'lib'));
    mkdirSync(join(dir, '.github'));
    mkdirSync(join(dir, 'temp'));
    writeFileSync(join(dir, 'lib/e2e-pins.mjs'), readFileSync(join(ROT, 'lib/e2e-pins.mjs')));
    if (pinner) writeFileSync(join(dir, PIN), JSON.stringify(pinner));
    writeFileSync(join(dir, 'steg.sh'), steg('e2e-tests.yml', 'Determine image tags from trigger source'));
    writeFileSync(join(dir, 'output'), '');
    const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', join(dir, 'steg.sh')], {
      cwd: dir,
      env: { ...process.env, RUNNER_TEMP: join(dir, 'temp'), GITHUB_OUTPUT: join(dir, 'output'), ...env },
      encoding: 'utf8',
    });
    const kontekst = join(dir, 'temp', 'trigger-context.json');
    assert.ok(existsSync(kontekst), `steget skrev ingen trigger-kontekst: ${r.stdout}${r.stderr}`);
    const resolved = JSON.parse(readFileSync(kontekst, 'utf8')).resolvedTags;
    return { kode: r.status, logg: r.stdout, tagger: Object.fromEntries(TJENESTENE.map((t) => [t, resolved[t] ?? ''])) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

type Rad = { env: Record<string, string>; tagger: Record<string, string>; underTest: string[] };
const manuell = (environment: string) => ({ EVENT_NAME: 'workflow_dispatch', INPUT_ENVIRONMENT: environment });
const dispatch = (eventType: string, tag: string) => ({ EVENT_NAME: 'repository_dispatch', EVENT_TYPE: eventType, PAYLOAD_IMAGE_TAG: tag });

/**
 * Én tolkning av inputen: de eksplisitte taggene og tjenestene under test. Taggene gjelder før
 * pinnene; tjenester som ikke står i `tagger`, får latest.
 */
const TOLKNING: Rad[] = [
  { env: manuell('latest'), tagger: {}, underTest: [] },
  { env: manuell('melosys-api:latest'), tagger: {}, underTest: [] },
  { env: manuell('e2e-logging'), tagger: { 'melosys-api': 'e2e-logging' }, underTest: ['melosys-api'] },
  { env: manuell('  e2e-logging  '), tagger: { 'melosys-api': 'e2e-logging' }, underTest: ['melosys-api'] },
  { env: manuell(''), tagger: { 'melosys-api': '' }, underTest: ['melosys-api'] },
  { env: manuell("melosys-web:'latest'"), tagger: { 'melosys-web': "'latest'" }, underTest: ['melosys-web'] },
  { env: manuell("'melosys-mock':abc"), tagger: {}, underTest: [] },
  { env: manuell('melosys-api:x,melosys-web'), tagger: { 'melosys-api': 'x' }, underTest: ['melosys-api'] },
  { env: manuell('melosys-web:abc,melosys-web:latest'), tagger: {}, underTest: [] },
  { env: manuell('melosys-web:latest,melosys-web:abc'), tagger: { 'melosys-web': 'abc' }, underTest: ['melosys-web'] },
  { env: manuell('melosys-web:mq-abc, melosys-api:latest,ukjent:x'), tagger: { 'melosys-web': 'mq-abc' }, underTest: ['melosys-web'] },
  { env: manuell(' melosys-web : abc '), tagger: { 'melosys-web': 'abc' }, underTest: ['melosys-web'] },
  { env: manuell('melosys-web:abc,'), tagger: { 'melosys-web': 'abc' }, underTest: ['melosys-web'] },
  { env: manuell('melosys-web:'), tagger: { 'melosys-web': '' }, underTest: ['melosys-web'] },
  { env: dispatch('melosys-web-published', 'abc'), tagger: { 'melosys-web': 'abc' }, underTest: ['melosys-web'] },
  { env: dispatch('melosys-web-published', 'latest'), tagger: {}, underTest: ['melosys-web'] },
  { env: dispatch('noe-annet-published', 'abc'), tagger: {}, underTest: [] },
  // Linjeskift og tab i taggen gjør den ikke til en tag for en annen tjeneste.
  { env: dispatch('melosys-api-published', 'a\nmelosys-web\tb'), tagger: { 'melosys-api': 'a\nmelosys-web\tb' }, underTest: ['melosys-api'] },
];

const gyldigTag = (t: string) => /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(t);

test('«under test»: steget og lib/e2e-pins.mjs tolker inputen likt, med og uten pinner', () => {
  const avvik: string[] = [];
  for (const rad of TOLKNING) {
    const input = {
      hendelse: rad.env.EVENT_NAME,
      eventType: rad.env.EVENT_TYPE ?? '',
      imageTag: rad.env.PAYLOAD_IMAGE_TAG ?? '',
      environment: rad.env.INPUT_ENVIRONMENT ?? '',
    };
    const js = [...tjenesterUnderTest(input)].sort();
    if (JSON.stringify(js) !== JSON.stringify([...rad.underTest].sort())) {
      avvik.push(`JS ${JSON.stringify(rad.env)}: under test ${JSON.stringify(js)}, ventet ${JSON.stringify(rad.underTest)}`);
    }
    const jsTagger = Object.fromEntries(Object.entries(eksplisitteTagger(input).tagger).filter(([, tag]) => tag !== 'latest'));
    if (JSON.stringify(jsTagger) !== JSON.stringify(rad.tagger)) {
      avvik.push(`JS ${JSON.stringify(rad.env)}: tagger ${JSON.stringify(jsTagger)}, ventet ${JSON.stringify(rad.tagger)}`);
    }
    for (const pinner of [undefined, ALLE_PINNET]) {
      const forventet = Object.fromEntries(
        TJENESTENE.map((t) => {
          const pin = pinner && !rad.underTest.includes(t) ? ALLE_PINNET[t].tag : undefined;
          return [t, pin ?? rad.tagger[t] ?? 'latest'];
        })
      );
      const steget = bestemTaggerISteget(rad.env, pinner);
      const navn = `${JSON.stringify(rad.env)}${pinner ? ' med pinner' : ''}`;
      if (JSON.stringify(steget.tagger) !== JSON.stringify(forventet)) {
        const ulike = TJENESTENE.filter((t) => steget.tagger[t] !== forventet[t]).map((t) => `${t}=${JSON.stringify(steget.tagger[t])} (ventet ${JSON.stringify(forventet[t])})`);
        avvik.push(`steget ${navn}: ${ulike.join(', ')}`);
      }
      const ventetKode = Object.values(forventet).every(gyldigTag) ? 0 : 1;
      if (steget.kode !== ventetKode) avvik.push(`steget ${navn}: exit ${steget.kode}, ventet ${ventetKode}`);
    }
  }
  assert.deepEqual(avvik, []);
});

test('«Determine image tags»: hvert par som ignoreres i environment, gir en vasket ::warning::', () => {
  // Paret slik det står i annotasjonen: JSON-tekst, «::» brutt opp og «%» kodet som %25.
  const rader: [string, string[]][] = [
    ['melosys-web:abc', []],
    ["'melosys-mock':abc", [`"'melosys-mock':abc"`]],
    ['"melosys-api:x"', ['"\\"melosys-api:x\\""']],
    ['melosys-api:x,melosys-web', ['"melosys-web"']],
    ['melosys-wbe:abc,melosys-api:x', ['"melosys-wbe:abc"']],
    ['melosys-api:x,::error::falsk,a%0Ab', ['": :error: :falsk"', '"a%250Ab"']],
  ];
  for (const [environment, ignorert] of rader) {
    const { kode, logg } = bestemTaggerISteget(manuell(environment));
    assert.equal(kode, 0, environment);
    const kommandoer = logg.split('\n').filter((l) => l.startsWith('::'));
    const advarsler = kommandoer.filter((l) => l.startsWith('::warning::'));
    assert.deepEqual(kommandoer, advarsler, `bare ::warning:: fra ${environment}`);
    assert.equal(advarsler.length, ignorert.length, `${environment}: ${advarsler.join(' | ')}`);
    ignorert.forEach((par, i) => {
      assert.ok(advarsler[i].includes(par), `${advarsler[i]} nevner ikke ${par}`);
      assert.ok(!advarsler[i].slice('::warning::'.length).includes('::'), advarsler[i]);
    });
  }
});

test('utløpsjobben: en fil lesPins avviser, valideres og varsles, også når jq gir lengde 0', () => {
  // null, [] og "" har lengde 0 i jq, men plan-jobben i E2E Tests avviser dem.
  for (const innhold of ['null', '[]', '""', '{', '"x"', '{"ukjent": {}}']) {
    assert.equal(finnesPinner(innhold), 'true', innhold);
  }
});

// ---- «Bygg Slack-melding» i e2e-pins-utlop.yml ----

/** Kjører steget og gir SLACK_MESSAGE slik action-slack-notify får den. */
function slackMelding(env: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pin-slack-'));
  try {
    const output = join(dir, 'output');
    writeFileSync(output, '');
    writeFileSync(join(dir, 'steg.sh'), steg('e2e-pins-utlop.yml', 'Bygg Slack-melding'));
    execFileSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', join(dir, 'steg.sh')], {
      cwd: dir,
      env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_REPOSITORY: 'navikt/melosys-e2e-tests', GITHUB_RUN_ID: '1', RUN_URL: 'https://github.com/run/1', REF: 'main', UTLOPT: '', FEIL: '', ...env },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const m = readFileSync(output, 'utf8').match(/^SLACK_MESSAGE<<(\S+)\n([\s\S]*?)\n\1$/m);
    assert.ok(m, 'fant ikke SLACK_MESSAGE');
    return m[2];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('Slack: tekst fra pin-fila og branchnavnet blir ikke lenker eller formatering i meldingen', () => {
  const melding = slackMelding({
    UTLOPT: '• melosys-web (MELOSYS-1) utløp 2026-01-01 <!channel>',
    FEIL: '• "<https://x|klikk>": ukjent tjeneste & mer',
    REF: 'b<https://y|z>',
  });
  for (const rå of ['<https://x|klikk>', '<!channel>', '<https://y|z>', ' & ']) assert.ok(!melding.includes(rå), `${rå} står urørt i ${melding}`);
  assert.match(melding, /"&lt;https:\/\/x\|klikk&gt;": ukjent tjeneste &amp; mer/);
  assert.match(melding, /&lt;!channel&gt;/);
  assert.match(melding, /`b&lt;https:\/\/y\|z&gt;`/);
  // Lenkene steget selv lager, er fortsatt lenker.
  assert.match(melding, /<https:\/\/github\.com\/run\/1\|#1>/);
});

test('Slack: lenken til pin-fila beholder / i branchnavnet og koder resten', () => {
  const melding = slackMelding({ UTLOPT: '• melosys-web (MELOSYS-1) utløp 2026-01-01', REF: 'feature/a b#c' });
  assert.ok(
    melding.includes('<https://github.com/navikt/melosys-e2e-tests/blob/feature/a%20b%23c/.github/e2e-pins.json|.github/e2e-pins.json>'),
    melding
  );
});
