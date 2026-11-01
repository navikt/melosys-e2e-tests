import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  advarslerOmShards,
  arbeidstreAdvarsel,
  lagPåvirkedeTester,
  lokalt,
  kjørOpptak,
  sjekkKjøring,
  ciArgumenter,
  planleggUtvalg,
  byggBeskrivelse,
  erstattSeksjon,
  finnSeksjon,
  finnRunId,
  harEldreSeksjon,
  formaterTittel,
  ghVersjonHolder,
  lagSeksjon,
  lesArgumenter,
  lokalEnv,
  lesOpptak,
  oppsummer,
  sjekkOpplastet,
  velgOpptak,
  løsOppVideo,
  START,
  SLUTT,
  tellShards,
  // @ts-expect-error — .mjs uten typedeklarasjon; scriptet er ren node uten avhengigheter.
} from '../scripts/pr-opptak.mjs';
// @ts-expect-error — .mjs uten typedeklarasjon.
import { utenE2eEffekt } from '../scripts/affected-tests.mjs';

const RUNNER = '/home/runner/work/melosys-e2e-tests/melosys-e2e-tests/test-results';
const video = (dir: string) => ({ name: 'video', contentType: 'video/webm', path: `${RUNNER}/${dir}/video.webm` });
const resultat = (status: string, duration: number, vedlegg: any[] = []) => ({ status, duration, attachments: vedlegg });

/** Utdrag av opptak.json fra en CI-shard: fil → describe → nestet describe → test. */
const RAPPORT = {
  suites: [
    {
      title: 'core/sed-mottak.spec.ts',
      file: 'core/sed-mottak.spec.ts',
      specs: [],
      suites: [
        {
          title: 'SED Mottak via melosys-eessi @eessi',
          specs: [{ title: 'skal trigge MOTTAK_SED', tests: [{ status: 'expected', results: [resultat('passed', 4009, [video('a')])] }] }],
          suites: [
            {
              title: 'A003',
              specs: [
                {
                  title: 'gir fagsak',
                  tests: [{ status: 'flaky', results: [resultat('failed', 9000, [video('b')]), resultat('passed', 3000, [video('b-retry1')])] }],
                },
                { title: 'fixme-test', tests: [{ status: 'skipped', results: [resultat('skipped', 0)] }] },
              ],
            },
          ],
        },
      ],
    },
    {
      title: 'aarsavregning/a.spec.ts',
      file: 'aarsavregning/a.spec.ts',
      specs: [{ title: 'uten describe', tests: [{ status: 'unexpected', results: [resultat('timedOut', 61000, [video('c')])] }] }],
    },
  ],
};

// ---------------------------------------------------------------- seksjonen i beskrivelsen

const SEKSJON = `${START}\nny\n${SLUTT}`;

// ---------------------------------------------------------------- opptak.json

test('opptak.json: nestede describes, fila er ikke med i tittelen', () => {
  const rader = lesOpptak(RAPPORT, '/tmp/shard-1');
  assert.deepEqual(
    rader.map((r: any) => r.tittel),
    [
      'SED Mottak via melosys-eessi @eessi › skal trigge MOTTAK_SED',
      'SED Mottak via melosys-eessi @eessi › A003 › gir fagsak',
      'SED Mottak via melosys-eessi @eessi › A003 › fixme-test',
      'uten describe',
    ],
  );
});

test('opptak.json: hoppet over gir ingen video', () => {
  const r = lesOpptak(RAPPORT, '/tmp/shard-1').find((x: any) => x.tittel.endsWith('fixme-test'));
  assert.equal(r.video, null);
  assert.equal(r.status, 'skipped');
});

test('opptak.json: ved retry brukes det siste forsøket med video', () => {
  const r = lesOpptak(RAPPORT, '/tmp/shard-1').find((x: any) => x.tittel.endsWith('gir fagsak'));
  assert.equal(r.video, '/tmp/shard-1/b-retry1/video.webm');
  assert.equal(r.resultat, 'passed');
  assert.equal(r.varighet, 3000);
});

test('videostien fra runneren løses opp mot mappa der opptak.json ligger', () => {
  assert.equal(løsOppVideo(`${RUNNER}/x-chromium/video.webm`, '/dl/playwright-videos-shard-2'), '/dl/playwright-videos-shard-2/x-chromium/video.webm');
  assert.equal(løsOppVideo('x-chromium/video.webm', '/dl/s'), '/dl/s/x-chromium/video.webm');
});

// ---------------------------------------------------------------- oppsummering og grense

test('oppsummeringen teller grønne, feilet, flaky og hoppet over', () => {
  assert.equal(oppsummer(lesOpptak(RAPPORT, '/x')), '1 grønne, 1 feilet, 1 flaky. 1 hoppet over og har ikke opptak.');
  assert.equal(oppsummer([{ status: 'expected', video: '/v' }, { status: 'expected', video: '/v' }]), '2 grønne.');
  assert.equal(oppsummer([{ status: 'expected', video: null }]), '1 grønne. 1 mangler opptak.');
});

test('flere opptak enn maks avvises; maks eller færre gir opptakene sortert etter tittel', () => {
  const rader = lesOpptak(RAPPORT, '/x');
  assert.throws(() => velgOpptak(rader, 2), /3 opptak er flere enn grensen på 2/);
  assert.deepEqual(
    velgOpptak(rader, 3).map((r: any) => r.tittel),
    ['SED Mottak via melosys-eessi @eessi › A003 › gir fagsak', 'SED Mottak via melosys-eessi @eessi › skal trigge MOTTAK_SED', 'uten describe'],
  );
});

test('MAKS over 50 avvises, fordi gh pr edit tar maks 50 vedlegg', () => {
  assert.throws(() => lesArgumenter(['1', '--maks', '51']), /høyst 50/);
  assert.equal(lesArgumenter(['1', '--maks', '50']).maks, 50);
  assert.equal(lesArgumenter(['1']).maks, 20);
  assert.throws(() => lesArgumenter([]), /Mangler PR-nummer/);
  assert.throws(() => lesArgumenter(['1', '--run', '9', '--lokal']), /kan ikke brukes sammen/);
});

// ---------------------------------------------------------------- formatering

test('seksjonen: lenke til kjøringen, kort commit, status ved siden av varigheten', () => {
  const rader = lesOpptak(RAPPORT, '/x');
  const seksjon = lagSeksjon({ kilde: 'ci', runUrl: 'https://github.com/navikt/melosys-e2e-tests/actions/runs/1', commit: '169cac4abcdef', rader, opptak: velgOpptak(rader, 20) });
  assert.ok(seksjon.startsWith(`${START}\n## Opptak av testene\n`));
  assert.ok(seksjon.endsWith(SLUTT));
  assert.match(seksjon, /Kjørt i CI \(\[kjøring\]\(https:\/\/github\.com\/navikt\/melosys-e2e-tests\/actions\/runs\/1\)\) på commit `169cac4`: 1 grønne/);
  assert.match(seksjon, /\*\*uten describe\*\* \(1 min 1 s, timedOut\)\n\n!\[\]\(\.\/opptak-3\.mp4\)/);
  assert.match(seksjon, /› gir fagsak\*\* \(3 s, flaky\)\n\n!\[\]\(\.\/opptak-1\.mp4\)/);
  assert.match(seksjon, /› skal trigge MOTTAK\\_SED\*\* \(4 s\)\n/);
  assert.equal(lagSeksjon({ kilde: 'lokal', commit: 'abcdef12', rader: [], opptak: [] }).split('\n')[3], 'Kjørt lokalt mot stacken på commit `abcdef1`: ingen tester kjørt.');
});

test('tagger i titler blir kodefont, så de ikke nevner GitHub-brukere', () => {
  assert.equal(formaterTittel('SED via eessi @eessi › test'), 'SED via eessi `@eessi` › test');
  assert.equal(formaterTittel('a_b *c*'), 'a\\_b \\*c\\*');
});

// ---------------------------------------------------------------- gh

test('gh-versjon: 2.99 og nyere holder', () => {
  assert.equal(ghVersjonHolder('gh version 2.103.0 (2026-10-21)'), true);
  assert.equal(ghVersjonHolder('gh version 2.99.0'), true);
  assert.equal(ghVersjonHolder('gh version 3.0.0'), true);
  assert.equal(ghVersjonHolder('gh version 2.98.1'), false);
  assert.equal(ghVersjonHolder('gh version 1.150.0'), false);
  assert.equal(ghVersjonHolder(''), false);
});

test('run-lenken leses fra utdataene til ci-e2e.sh', () => {
  const ut = '🚀 Starter E2E Tests\n   run:         https://github.com/navikt/melosys-e2e-tests/actions/runs/40552156995\n';
  assert.deepEqual(finnRunId(ut), { url: 'https://github.com/navikt/melosys-e2e-tests/actions/runs/40552156995', id: '40552156995' });
  assert.equal(finnRunId('✅ Ingen endringer påvirker e2e-testene.'), null);
});

test('etter opplasting: én user-attachments-lenke per opptak og ingen relative stier igjen', () => {
  const url = (id: string) => `https://github.com/user-attachments/assets/${id}`;
  const body = `før ${url('utenfor')}\n${START}\n${url('a-1')}\n${url('b-2')}\n${SLUTT}`;
  assert.deepEqual(sjekkOpplastet(body), { lenker: 2, ulastet: 0 });
  assert.deepEqual(sjekkOpplastet(`${START}\n${url('a')}\n![](./opptak-2.mp4)\n${SLUTT}`), { lenker: 1, ulastet: 1 });
  assert.deepEqual(sjekkOpplastet('ingen seksjon'), { lenker: 0, ulastet: 0 });
});

// ---------------------------------------------------------------- fix-runde 1

test('beskrivelsen hentes på nytt før den skrives, så endringer under kjøringen beholdes', () => {
  const kall: string[][] = [];
  const ghJson = (...args: string[]) => (kall.push(args), { body: 'Endret under kjøringen' });
  assert.equal(byggBeskrivelse('397', SEKSJON, ghJson), `Endret under kjøringen\n\n${SEKSJON}\n`);
  assert.deepEqual(kall, [['pr', 'view', '397', '--json', 'body']]);
});

test('rød kjøring: konklusjonen står i seksjonen', () => {
  const rader = lesOpptak(RAPPORT, '/x');
  const felles = { kilde: 'ci', runUrl: 'u', commit: 'abcdef1', rader, opptak: velgOpptak(rader, 20) };
  assert.match(lagSeksjon({ ...felles, konklusjon: 'failure' }), /\n\nKjøringen endte med failure\.\n/);
  assert.doesNotMatch(lagSeksjon({ ...felles, konklusjon: 'success' }), /endte med/);
});

test('advarsler står i seksjonen', () => {
  const rader = lesOpptak(RAPPORT, '/x');
  const s = lagSeksjon({ kilde: 'ci', runUrl: 'u', commit: 'abcdef1', rader, opptak: [], konklusjon: 'success', advarsler: ['2 av 6 shards mangler opptak.json.'] });
  assert.match(s, /\n\n⚠️ 2 av 6 shards mangler opptak\.json\.\n/);
});

test('antall shards telles fra test-jobbene i kjøringen', () => {
  const jobs = ['Planlegg shards', 'e2e-tests (6)', 'e2e-tests (1)', 'e2e-tests (2)', 'Slå sammen shards', 'Last opp e2e-tests-rapport', 'Notify'].map((name) => ({ name }));
  assert.equal(tellShards(jobs), 3);
  assert.equal(tellShards([{ name: 'e2e-tests' }, { name: 'Notify' }]), 1);
});

test('færre opptak.json enn shards, og artefakter uten opptak.json, gir advarsler', () => {
  assert.deepEqual(advarslerOmShards(2, [{ navn: 'playwright-videos-shard-1', harJson: true }, { navn: 'playwright-videos-shard-2', harJson: true }]), []);
  assert.deepEqual(advarslerOmShards(6, [{ navn: 'playwright-videos-shard-1', harJson: true }, { navn: 'playwright-videos-shard-2', harJson: false }]), [
    'Bare 1 av 6 shards har opptak.json, så opptak kan mangle.',
    'Artefaktet playwright-videos-shard-2 har ikke opptak.json.',
  ]);
});

// ---------------------------------------------------------------- fix-runde 1, batch 2

test('utvalg over maks avvises før kjøringen, også når det ikke er hele suiten', () => {
  const talt: string[] = [];
  const tell = (antall: number) => (grep: string) => (talt.push(grep), antall);
  assert.throws(() => planleggUtvalg({ utvalg: { ingenting: false, grep: 'a|b' }, tellTester: tell(21), maks: 20 }), /21 tester, flere enn grensen på 20/);
  assert.deepEqual(talt, ['a|b']);
  assert.deepEqual(planleggUtvalg({ utvalg: { ingenting: false, grep: 'a|b' }, tellTester: tell(20), maks: 20 }), { grep: 'a|b', antall: 20 });
  assert.equal(planleggUtvalg({ utvalg: { ingenting: true }, tellTester: tell(0), maks: 20 }), null);
  assert.throws(() => planleggUtvalg({ utvalg: { ingenting: false, grep: '' }, tellTester: tell(128), maks: 50 }), /128 tester/);
});

test('CI-kjøringen får det utregnede filteret, ikke --affected, så utvalget regnes én gang', () => {
  assert.deepEqual(ciArgumenter('min-branch', 'a|b'), ['--grep', 'a|b', '--branch', 'min-branch', '--video', '--no-wait']);
  assert.deepEqual(ciArgumenter('min-branch', ''), ['--branch', 'min-branch', '--video', '--no-wait']);
});

test('LOKAL bruker bare SLOWMO fra kommandolinjen, ikke en SLOWMO eksportert i skallet', () => {
  const skall = { PATH: '/bin', SLOWMO: '0' };
  assert.deepEqual(lokalEnv(skall, null), { PATH: '/bin', PW_VIDEO: 'on' });
  assert.deepEqual(lokalEnv(skall, '800'), { PATH: '/bin', PW_VIDEO: 'on', SLOWMO: '800' });
  assert.equal(skall.SLOWMO, '0');
});

test('SLOWMO sendes videre til CI bare når den er satt, og 0 er en gyldig verdi', () => {
  assert.deepEqual(ciArgumenter('b', 'a', '800'), ['--grep', 'a', '--branch', 'b', '--video', '--slowmo', '800', '--no-wait']);
  assert.deepEqual(ciArgumenter('b', 'a', '0'), ['--grep', 'a', '--branch', 'b', '--video', '--slowmo', '0', '--no-wait']);
  assert.equal(lesArgumenter(['1']).slowmo, null);
  assert.equal(lesArgumenter(['1', '--slowmo', '0']).slowmo, '0');
  assert.equal(lesArgumenter(['1', '--slowmo', '800', '--lokal']).slowmo, '800');
  for (const ugyldig of [['--slowmo'], ['--slowmo', '-5'], ['--slowmo', '1.5'], ['--slowmo', 'fort']]) {
    assert.throws(() => lesArgumenter(['1', ...ugyldig]), /antall millisekunder/);
  }
  assert.throws(() => lesArgumenter(['1', '--run', '9', '--slowmo', '800']), /virker ikke med RUN=/);
});

test('pr-opptak starter ikke e2e-suiten', () => {
  assert.equal(utenE2eEffekt('scripts/pr-opptak.mjs'), true);
  assert.equal(utenE2eEffekt('lib/pr-opptak.test.ts'), true);
  assert.equal(utenE2eEffekt('.claude/skills/pr-opptak/SKILL.md'), true);
});

test('en avbrutt test med opptak telles som avbrutt, ikke som hoppet over uten opptak', () => {
  const avbrutt = { status: 'skipped', resultat: 'interrupted', video: '/v' };
  assert.equal(oppsummer([{ status: 'expected', video: '/v' }, avbrutt]), '1 grønne, 1 avbrutt.');
  assert.equal(oppsummer([{ status: 'skipped', resultat: 'skipped', video: '/v' }, { status: 'skipped', video: null }]), '1 hoppet over. 1 hoppet over og har ikke opptak.');
});

// ---------------------------------------------------------------- fix-runde 1, batch 3

const PR = { headRefName: 'min-branch', headRefOid: 'b'.repeat(40) };

test('RUN fra en annen branch avvises', () => {
  assert.throws(() => sjekkKjøring({ headBranch: 'annen-branch', headSha: 'b'.repeat(40) }, PR), /annen-branch, ikke min-branch/);
});

test('RUN på en eldre commit i samme branch gir en advarsel med kjøringens commit', () => {
  assert.deepEqual(sjekkKjøring({ headBranch: 'min-branch', headSha: 'a'.repeat(40) }, PR), [
    'Opptakene er fra commit aaaaaaa. PR-en står nå på bbbbbbb.',
  ]);
  assert.deepEqual(sjekkKjøring({ headBranch: 'min-branch', headSha: 'b'.repeat(40) }, PR), []);
});


test('ucommittede endringer i arbeidstreet gir en advarsel i seksjonen', () => {
  assert.equal(arbeidstreAdvarsel('', 'c'.repeat(40)), null);
  assert.equal(
    arbeidstreAdvarsel(' M pages/a.ts\nM  helpers/b.ts\n', 'c'.repeat(40)),
    'Kjørt med ucommittede endringer i 2 filer, så koden er ikke nøyaktig commit ccccccc.',
  );
});

// ---------------------------------------------------------------- fix-runde 2, batch 1

test('en test som feilet og så ble avbrutt, telles som feilet', () => {
  const rapport = {
    suites: [{ title: 'f.spec.ts', specs: [{ title: 't', tests: [{ status: 'unexpected', results: [resultat('failed', 5000, [video('a')]), resultat('interrupted', 2000, [video('a-retry1')])] }] }] }],
  };
  assert.equal(oppsummer(lesOpptak(rapport, '/x')), '1 feilet.');
  const bareAvbrutt = { suites: [{ title: 'f.spec.ts', specs: [{ title: 't', tests: [{ status: 'skipped', results: [resultat('interrupted', 2000, [video('a')])] }] }] }] };
  assert.equal(oppsummer(lesOpptak(bareAvbrutt, '/x')), '1 avbrutt.');
});

test('én ucommittet fil står i entall', () => {
  assert.equal(arbeidstreAdvarsel(' M pages/a.ts\n', 'c'.repeat(40)), 'Kjørt med ucommittede endringer i 1 fil, så koden er ikke nøyaktig commit ccccccc.');
});

/**
 * Et lite repo med affected-tests.mjs: en committet endring i en helper, og en ny spec som
 * importerer helperen, men ikke er lagt til i git.
 */
function lagRepo() {
  const rot = mkdtempSync(join(tmpdir(), 'pr-opptak-test-'));
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: rot, encoding: 'utf8' });
  const skriv = (sti: string, innhold: string) => (mkdirSync(join(rot, sti, '..'), { recursive: true }), writeFileSync(join(rot, sti), innhold));
  mkdirSync(join(rot, 'scripts'));
  copyFileSync(join(__dirname, '..', 'scripts', 'affected-tests.mjs'), join(rot, 'scripts', 'affected-tests.mjs'));
  skriv('helpers/h.ts', 'export const h = 1;\n');
  skriv('tests/a.spec.ts', "import { h } from '../helpers/h';\n");
  for (const n of ['b', 'c', 'd', 'e']) skriv(`tests/${n}.spec.ts`, 'export {};\n');
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'start');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  skriv('helpers/h.ts', 'export const h = 2;\n');
  git('commit', '-qam', 'endre helper');
  skriv('tests/ny.spec.ts', "import { h } from '../helpers/h';\n");
  return { rot, git, head: git('rev-parse', 'HEAD').trim() };
}

test('LOKAL velger ikke en usporet spec, og seksjonen sier fra om den', async () => {
  const { rot, git, head } = lagRepo();
  try {
    const kall: string[][] = [];
    const ekte = lagPåvirkedeTester(rot);
    const talt: string[] = [];
    const logg: string[] = [];
    // PR-en står på en annen commit, så testen ser at seksjonen bruker commiten som faktisk kjørte.
    const res = await lokalt({ headRefName: 'annen', headRefOid: 'f'.repeat(40) }, 20, {
      git: (args: string[]) => git(...args),
      påvirkedeTester: (args: string[]) => (kall.push(args), ekte(args)),
      tellTester: (grep: string) => (talt.push(grep), 1),
      kjørPlaywright: async () => ({ kode: 0, json: '/x/opptak.json' }),
      logg: (t: string) => logg.push(t),
    });
    assert.deepEqual(talt, ['a\\.spec\\.ts'], 'bare den committede spec-en er valgt');
    assert.deepEqual(kall, [['--kun-committet', '--head', head]]);
    assert.equal(res.commit, head);
    assert.deepEqual(res.advarsler, ['Kjørt med en spec som ikke er lagt til i git: tests/ny.spec.ts. Playwright kjører den hvis filteret treffer den.']);
    assert.ok(logg.some((l) => l.includes('tests/ny.spec.ts')));
  } finally {
    rmSync(rot, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- fix-runde 2, batch 2: hele løpet med RUN=

/**
 * Et falskt gh for kjørOpptak med RUN=: PR-en, kjøringen, nedlastingen og gh pr edit. Nedlastingen
 * lager én artefakt med `antall` tester, hver med et opptak på disk.
 */
function lagLøp({ bodies = ['Forfatterens tekst'], runs = [{ status: 'completed' }], antall = 2, editStatus = 0, utenJson = false, headBranch = 'min-branch' } = {}) {
  const kall: string[][] = [];
  const logg: string[] = [];
  let ventet = 0;
  let katalog = '';
  const pr = { headRefName: 'min-branch', headRefOid: 'b'.repeat(40), url: 'https://github.com/navikt/melosys-e2e-tests/pull/7' };
  const run = (r: any) => ({ conclusion: 'success', headSha: pr.headRefOid, headBranch, url: 'https://github.com/navikt/melosys-e2e-tests/actions/runs/123', ...r });
  const runKø = [...runs];
  const bodyKø = [...bodies];
  const d = {
    ghJson: (...args: string[]) => {
      kall.push(args);
      if (args[0] === 'pr' && args.includes('body')) return { body: bodyKø.shift() };
      if (args[0] === 'pr') return pr;
      if (args[0] === 'run' && args.includes('jobs')) return { jobs: [{ name: 'e2e-tests' }] };
      return run(runKø.length > 1 ? runKø.shift() : runKø[0]);
    },
    gh: (...args: string[]) => {
      kall.push(args);
      const ned = join(args[args.indexOf('-D') + 1], 'playwright-videos');
      mkdirSync(ned, { recursive: true });
      const specs = Array.from({ length: antall }, (_, i) => {
        mkdirSync(join(ned, `t${i}`), { recursive: true });
        writeFileSync(join(ned, `t${i}`, 'video.webm'), 'webm');
        return { title: `test ${i}`, tests: [{ status: 'expected', results: [resultat('passed', 1000, [video(`t${i}`)])] }] };
      });
      if (!utenJson) writeFileSync(join(ned, 'opptak.json'), JSON.stringify({ suites: [{ title: 'f.spec.ts', specs }] }));
      return '';
    },
    ghEdit: (args: string[]) => (kall.push(args), editStatus),
    konverter: async (opptak: any[], ut: string) => opptak.forEach((_, i) => writeFileSync(join(ut, `opptak-${i + 1}.mp4`), 'mp4')),
    lagKatalog: () => (katalog = mkdtempSync(join(tmpdir(), 'pr-opptak-løp-'))),
    vent: async () => void ventet++,
    logg: (t: string) => logg.push(t),
  };
  return { d, kall, logg, katalog: () => katalog, ventet: () => ventet };
}

const argumenter = (felt: Record<string, any> = {}) => ({ pr: '7', run: '123', lokal: false, maks: 20, torrt: true, ...felt });
const rydd = (k: string) => k && rmSync(k, { recursive: true, force: true });

test('beskrivelsen som skrives er den som hentes rett før, med forfatterens nye tekst og én seksjon', async () => {
  const løp = lagLøp({ bodies: ['Ny tekst skrevet mens kjøringen gikk'] });
  try {
    await kjørOpptak(argumenter(), løp.d);
    const body = readFileSync(join(løp.katalog(), 'opptak', 'body.md'), 'utf8');
    assert.ok(body.startsWith('Ny tekst skrevet mens kjøringen gikk\n\n' + START));
    assert.equal(body.split(START).length - 1, 1);
    assert.deepEqual(løp.kall.filter((k) => k[0] === 'pr' && k.includes('body')), [['pr', 'view', '7', '--json', 'body']]);
  } finally {
    rydd(løp.katalog());
  }
});

test('mangler beskrivelsen i svaret, skrives ingenting; en tom beskrivelse er lov', async () => {
  const løp = lagLøp({ bodies: [undefined as any] });
  try {
    await assert.rejects(kjørOpptak(argumenter(), løp.d), /Fikk ikke beskrivelsen til PR-en/);
    assert.equal(existsSync(join(løp.katalog(), 'opptak', 'body.md')), false);
  } finally {
    rydd(løp.katalog());
  }
  const tom = lagLøp({ bodies: [''] });
  try {
    await kjørOpptak(argumenter(), tom.d);
    assert.ok(readFileSync(join(tom.katalog(), 'opptak', 'body.md'), 'utf8').startsWith(START));
  } finally {
    rydd(tom.katalog());
  }
});

test('over MAKS, men under 50: mappa beholdes og meldingen sier RUN og MAKS', async () => {
  const løp = lagLøp({ antall: 3 });
  try {
    await assert.rejects(kjørOpptak(argumenter({ maks: 2, torrt: false }), løp.d), /Bruk RUN=123 MAKS=3 for å prøve igjen uten en ny kjøring\./);
    assert.equal(existsSync(løp.katalog()), true);
  } finally {
    rydd(løp.katalog());
  }
});

test('over 50: mappa slettes, og meldingen foreslår ikke RUN', async () => {
  const løp = lagLøp({ antall: 51 });
  try {
    await assert.rejects(kjørOpptak(argumenter({ maks: 50, torrt: false }), løp.d), (e: any) => !/RUN=123|Filene ligger/.test(e.message) && /51 opptak/.test(e.message));
    assert.equal(existsSync(løp.katalog()), false);
  } finally {
    rydd(løp.katalog());
  }
});

test('uten opptak.json: mappa slettes, og meldingen foreslår ikke RUN', async () => {
  const løp = lagLøp({ utenJson: true });
  try {
    await assert.rejects(kjørOpptak(argumenter({ torrt: false }), løp.d), (e: any) => !/RUN=123|Filene ligger/.test(e.message) && /opptak\.json/.test(e.message));
    assert.equal(existsSync(løp.katalog()), false);
  } finally {
    rydd(løp.katalog());
  }
});

test('gh pr edit feiler: mappa beholdes og meldingen sier RUN', async () => {
  const løp = lagLøp({ editStatus: 1 });
  try {
    await assert.rejects(kjørOpptak(argumenter({ torrt: false }), løp.d), /gh pr edit feilet med kode 1\.\nFilene ligger i .*\. Bruk RUN=123 for å prøve igjen uten en ny kjøring\./);
    assert.equal(existsSync(løp.katalog()), true);
  } finally {
    rydd(løp.katalog());
  }
});

test('RUN fra en annen branch avvises før scriptet venter på kjøringen', async () => {
  const løp = lagLøp({ runs: [{ status: 'in_progress' }, { status: 'completed' }], headBranch: 'annen-branch' });
  try {
    await assert.rejects(kjørOpptak(argumenter(), løp.d), /annen-branch, ikke min-branch/);
    assert.equal(løp.ventet(), 0);
    assert.equal(løp.kall.filter((k) => k[0] === 'run' && k[1] === 'view').length, 1);
    assert.equal(existsSync(løp.katalog()), false);
  } finally {
    rydd(løp.katalog());
  }
});

test('sjekken etter opplasting feiler: mappa beholdes og meldingen sier RUN', async () => {
  const løp = lagLøp({ bodies: ['Tekst', `Tekst\n\n${START}\n![](./opptak-1.mp4)\n${SLUTT}`] });
  try {
    await assert.rejects(kjørOpptak(argumenter({ torrt: false }), løp.d), /Seksjonen har 0 opplastede opptak av 2.*\nFilene ligger i .*\. Bruk RUN=123 for å prøve igjen uten en ny kjøring\./);
    assert.equal(existsSync(løp.katalog()), true);
  } finally {
    rydd(løp.katalog());
  }
});

// ---------------------------------------------------------------- seksjonen står alltid sist

const GAMMEL = `${START}\ngammel\n${SLUTT}`;
const URL = (id: string) => `https://github.com/user-attachments/assets/${id}`;
const KODEBLOKK = `\`\`\`md\n${START}\nforfatterens eksempel\n${SLUTT}\n\`\`\``;

/** Hver tilstand: beskrivelsen før, beskrivelsen etter, og om en eldre seksjon står lenger opp. */
const TILSTANDER: [string, string | null, string, boolean][] = [
  ['1 tom', '', `${SEKSJON}\n`, false],
  ['1 mangler', null, `${SEKSJON}\n`, false],
  ['2 uten markører', 'Intro', `Intro\n\n${SEKSJON}\n`, false],
  ['2 uten markører, avsluttende tomlinjer', 'Intro\n\n\n', `Intro\n\n${SEKSJON}\n`, false],
  ['3 seksjon sist', `Intro\n\n${GAMMEL}`, `Intro\n\n${SEKSJON}\n`, false],
  ['3 seksjon sist, tomlinjer etter', `Intro\n\n${GAMMEL}\n\n`, `Intro\n\n${SEKSJON}\n`, false],
  ['4 CRLF og mellomrom etter slutt', `Intro\r\nlinje\r\n\r\n${START}\r\ngammel\r\n${SLUTT} \t\r\n`, `Intro\r\nlinje\r\n\r\n${SEKSJON}\n`, false],
  ['5 markører i kodefont', `Se \`${START}\` og \`${SLUTT}\`.`, `Se \`${START}\` og \`${SLUTT}\`.\n\n${SEKSJON}\n`, false],
  ['5 markører i en kodeblokk', `Eksempel:\n\n${KODEBLOKK}\n\nSlutt.`, `Eksempel:\n\n${KODEBLOKK}\n\nSlutt.\n\n${SEKSJON}\n`, true],
  ['5 linje med backticks i info-strengen (ingen kodeblokk)', '```js `x` er ikke en kodeblokk\nTekst', `\`\`\`js \`x\` er ikke en kodeblokk\nTekst\n\n${SEKSJON}\n`, false],
  ['5 kodeblokk som ikke lukkes', '```\nkode', `\`\`\`\nkode\n\n${SEKSJON}\n`, false],
  ['5 tekst etter startmarkøren på samme linje', `${START} står først\nx\n${SLUTT}`, `${START} står først\nx\n${SLUTT}\n\n${SEKSJON}\n`, false],
  ['5 tekst etter sluttmarkøren på samme linje', `${START}\nx\n${SLUTT} og mer`, `${START}\nx\n${SLUTT} og mer\n\n${SEKSJON}\n`, true],
  ['5 markører i sitat', `> ${START}\n> x\n> ${SLUTT}`, `> ${START}\n> x\n> ${SLUTT}\n\n${SEKSJON}\n`, false],
  ['6 markører i kodeblokk og seksjon sist', `${KODEBLOKK}\n\n${GAMMEL}`, `${KODEBLOKK}\n\n${SEKSJON}\n`, true],
  ['7 tekst etter en eldre seksjon', `Intro\n\n${GAMMEL}\n\nNy tekst`, `Intro\n\n${GAMMEL}\n\nNy tekst\n\n${SEKSJON}\n`, true],
  ['8 slutt uten start', `Intro\n${SLUTT}`, `Intro\n${SLUTT}\n\n${SEKSJON}\n`, false],
  ['8 slutt mellom start og siste slutt', `${START}\na\n${SLUTT}\nb\n${SLUTT}`, `${START}\na\n${SLUTT}\nb\n${SLUTT}\n\n${SEKSJON}\n`, true],
];

const ANDRE = `${START}\nandre\n${SLUTT}`;

for (const [navn, før, etter, eldre] of TILSTANDER) {
  test(`seksjonen, tilstand ${navn}`, () => {
    assert.equal(erstattSeksjon(før, SEKSJON), etter);
    // En ny kjøring bytter ut seksjonen den forrige la til, og bare den.
    assert.equal(erstattSeksjon(etter, ANDRE), etter.slice(0, -`${SEKSJON}\n`.length) + `${ANDRE}\n`, 'andre kjøring');
    assert.equal(harEldreSeksjon(før), eldre, 'eldre seksjon lenger opp');
  });
}

test('seksjonen, tilstand 9: to kjøringer gir én seksjon sist og uendret tekst over', () => {
  const original = `Intro med \`${START}\`\n\n${KODEBLOKK}\n\nSlutt.`;
  const resultat = erstattSeksjon(erstattSeksjon(original, SEKSJON), ANDRE);
  assert.equal(resultat, `${original}\n\n${ANDRE}\n`);
  assert.equal(erstattSeksjon(resultat, ANDRE), resultat);
});

/** sjekkOpplastet leser beskrivelsen etter opplastingen og teller bare i seksjonen sist. */
const OPPLASTET: [string, string, { lenker: number; ulastet: number }][] = [
  ['tom', '', { lenker: 0, ulastet: 0 }],
  ['seksjon sist', `Intro\n\n${START}\n${URL('a')}\n${URL('b')}\n${SLUTT}`, { lenker: 2, ulastet: 0 }],
  ['seksjon sist med en ulastet', `${START}\n${URL('a')}\n![](./opptak-2.mp4)\n${SLUTT}`, { lenker: 1, ulastet: 1 }],
  ['CRLF', `Intro\r\n${START}\r\n${URL('a')}\r\n${SLUTT}\r\n`, { lenker: 1, ulastet: 0 }],
  ['lenker over seksjonen telles ikke', `${URL('x')}\n\n${START}\n${URL('a')}\n${SLUTT}`, { lenker: 1, ulastet: 0 }],
  ['lenker i en eldre seksjon telles ikke', `${START}\n${URL('x')}\n${URL('y')}\n${SLUTT}\n\n${START}\n![](./opptak-1.mp4)\n${SLUTT}`, { lenker: 0, ulastet: 1 }],
  ['lenker i en kodeblokk med markører telles ikke', `\`\`\`\n${START}\n${URL('x')}\n${SLUTT}\n\`\`\`\n\n${START}\n${URL('a')}\n${SLUTT}`, { lenker: 1, ulastet: 0 }],
  ['tekst etter seksjonen: ingen seksjon', `${START}\n${URL('a')}\n${SLUTT}\nEtter`, { lenker: 0, ulastet: 0 }],
  ['lenke inne i en annen URL telles ikke', `${START}\nhttps://evil.example/?u=${URL('x')}\n${SLUTT}`, { lenker: 0, ulastet: 0 }],
  ['lenke med en annen vert etter telles ikke', `${START}\n${URL('x')}.evil.example/\n${SLUTT}`, { lenker: 0, ulastet: 0 }],
  ['lenke med mellomrom etter telles', `${START}\n${URL('a')} \t\r\n${SLUTT}`, { lenker: 1, ulastet: 0 }],
];

for (const [navn, body, forventet] of OPPLASTET) {
  test(`sjekken etter opplasting, ${navn}`, () => assert.deepEqual(sjekkOpplastet(body), forventet));
}

test('en eldre seksjon lenger opp gir en advarsel i loggen, og ingenting om den i PR-en', async () => {
  const løp = lagLøp({ bodies: [`Intro\n\n${GAMMEL}\n\nNy tekst`] });
  try {
    await kjørOpptak(argumenter(), løp.d);
    const body = readFileSync(join(løp.katalog(), 'opptak', 'body.md'), 'utf8');
    assert.ok(body.startsWith(`Intro\n\n${GAMMEL}\n\nNy tekst\n\n${START}`));
    assert.ok(!body.includes('eldre opptaksseksjon'));
    assert.ok(løp.logg.includes('⚠️  En eldre opptaksseksjon står lenger opp i beskrivelsen; slett den hvis du vil.'));
  } finally {
    rydd(løp.katalog());
  }
});

test('sjekken etter opplasting teller ikke lenker i en eldre seksjon', async () => {
  const lest = `${START}\n${URL('x')}\n${URL('y')}\n${SLUTT}\n\nTekst\n\n${START}\n![](./opptak-1.mp4)\n![](./opptak-2.mp4)\n${SLUTT}`;
  const løp = lagLøp({ bodies: ['Tekst', lest] });
  try {
    await assert.rejects(kjørOpptak(argumenter({ torrt: false }), løp.d), /Seksjonen har 0 opplastede opptak av 2, og 2 som ikke er lastet opp/);
  } finally {
    rydd(løp.katalog());
  }
});

// ---------------------------------------------------------------- SLOWMO fra make til kjøringen

test('SLOWMO når ci-e2e.sh i CI-modus, og sendes ikke når den mangler', async () => {
  for (const [slowmo, forventet] of [['800', ['--slowmo', '800']], [null, []]] as const) {
    const løp = lagLøp();
    let sendt: string[] = [];
    const d = {
      ...løp.d,
      planleggCi: () => ({ grep: 'a', antall: 1 }),
      startCi: async (args: string[]) => ((sendt = args), { kode: 1, ut: '' }),
    };
    try {
      await assert.rejects(kjørOpptak(argumenter({ run: null, slowmo }), d), /ci-e2e\.sh feilet med kode 1/);
      assert.deepEqual(sendt, ['--grep', 'a', '--branch', 'min-branch', '--video', ...forventet, '--no-wait']);
    } finally {
      rydd(løp.katalog());
    }
  }
});

test('SLOWMO når Playwright-miljøet i LOKAL-modus', async () => {
  const løp = lagLøp();
  let fått: unknown;
  const d = { ...løp.d, lokale: (slowmo: unknown) => { fått = slowmo; throw new Error('stopp før kjøringen'); } };
  try {
    await assert.rejects(kjørOpptak(argumenter({ run: null, lokal: true, slowmo: '800' }), d), /stopp før kjøringen/);
    assert.equal(fått, '800');
  } finally {
    rydd(løp.katalog());
  }
});
