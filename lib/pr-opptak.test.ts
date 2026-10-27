import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  advarslerOmShards,
  arbeidstreAdvarsel,
  lagPåvirkedeTester,
  lokalt,
  meldingVedFeil,
  sjekkKjøring,
  skalBeholde,
  ciArgumenter,
  planleggUtvalg,
  byggBeskrivelse,
  erstattSeksjon,
  finnSeksjon,
  finnRunId,
  formaterTittel,
  ghVersjonHolder,
  lagSeksjon,
  lesArgumenter,
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

test('seksjonen byttes ut, og teksten før og etter står urørt', () => {
  const body = `Intro\n\n${START}\ngammel\n${SLUTT}\n\nEtter seksjonen`;
  assert.equal(erstattSeksjon(body, SEKSJON), `Intro\n\n${SEKSJON}\n\nEtter seksjonen`);
});

test('uten markører legges seksjonen til sist', () => {
  assert.equal(erstattSeksjon('Intro\n\n', SEKSJON), `Intro\n\n${SEKSJON}\n`);
});

test('tom eller manglende beskrivelse gir bare seksjonen', () => {
  assert.equal(erstattSeksjon('', SEKSJON), `${SEKSJON}\n`);
  assert.equal(erstattSeksjon(null, SEKSJON), `${SEKSJON}\n`);
});

test('startmarkør uten sluttmarkør avvises i stedet for å slette resten av beskrivelsen', () => {
  assert.throws(() => erstattSeksjon(`Intro\n${START}\nresten`, SEKSJON), /ikke <!-- e2e-opptak:end -->/);
});

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

test('markører nevnt i løpende tekst er ikke seksjonen', () => {
  const prosa = `Opptakene står mellom \`${START}\` og \`${SLUTT}\` i beskrivelsen.`;
  const body = `${prosa}\n\nMer tekst`;
  assert.equal(erstattSeksjon(body, SEKSJON), `${body}\n\n${SEKSJON}\n`);
  const medSeksjon = `${prosa}\n\n${START}\ngammel\n${SLUTT}\nEtter`;
  assert.equal(erstattSeksjon(medSeksjon, SEKSJON), `${prosa}\n\n${SEKSJON}\nEtter`);
  const linjestart = `${START} står først i denne linja\nog ${SLUTT}`;
  assert.equal(erstattSeksjon(linjestart, SEKSJON), `${linjestart}\n\n${SEKSJON}\n`);
});

test('markører på egen linje med CRLF og etterfølgende mellomrom gjelder', () => {
  const body = `Intro\r\n${START}  \r\ngammel\r\n${SLUTT}\r\nEtter`;
  assert.equal(erstattSeksjon(body, SEKSJON), `Intro\r\n${SEKSJON}\r\nEtter`);
});

test('to seksjoner avvises', () => {
  const body = `${START}\na\n${SLUTT}\n\n${START}\nb\n${SLUTT}`;
  assert.throws(() => erstattSeksjon(body, SEKSJON), /2 opptak-seksjoner/);
});

test('sjekken etter opplasting teller bare i seksjonen på egne linjer', () => {
  const url = 'https://github.com/user-attachments/assets/a-1';
  const body = `Se \`${START}\` ${url} \`${SLUTT}\`\n${START}\n${SLUTT}`;
  assert.deepEqual(sjekkOpplastet(body), { lenker: 0, ulastet: 0 });
});

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

test('mappa beholdes ved feil når den har filer, og etter en tørrkjøring', () => {
  assert.equal(skalBeholde({ ok: false, torrt: false, harFiler: true }), true);
  assert.equal(skalBeholde({ ok: false, torrt: false, harFiler: false }), false);
  assert.equal(skalBeholde({ ok: true, torrt: false, harFiler: true }), false);
  assert.equal(skalBeholde({ ok: true, torrt: true, harFiler: true }), true);
  assert.equal(skalBeholde({ ok: true, torrt: true, harFiler: false }), false);
});

test('feilmeldingen sier hvor filene ligger og hvordan kjøringen brukes på nytt', () => {
  assert.equal(meldingVedFeil('122 opptak er for mange.', '/tmp/pr-opptak-x', '40552156995'), '122 opptak er for mange.\nFilene ligger i /tmp/pr-opptak-x. Bruk RUN=40552156995 for å prøve igjen uten en ny kjøring.');
  assert.equal(meldingVedFeil('ffmpeg feilet.', '/tmp/p', null), 'ffmpeg feilet.\nFilene ligger i /tmp/p.');
});

// ---------------------------------------------------------------- fix-runde 2, batch 1

test('markører i en kodeblokk er ikke seksjonen, og blokken står urørt', () => {
  for (const gjerde of ['```', '~~~', '````']) {
    const body = `Slik ser seksjonen ut:\n\n${gjerde}md\n${START}\nforfatterens tekst\n${SLUTT}\n${gjerde}\n\nSlutt.`;
    assert.equal(erstattSeksjon(body, SEKSJON), `${body}\n\n${SEKSJON}\n`, gjerde);
    assert.equal(finnSeksjon(body), null, gjerde);
  }
});

test('en kodeblokk lukkes bare av samme tegn og minst like lang rekke', () => {
  // ~~~ lukker ikke en ```-blokk, og ``` lukker ikke en ````-blokk: markørene står fortsatt i blokken.
  const body = `\`\`\`\`\n~~~\n\`\`\`\n${START}\nx\n${SLUTT}\n\`\`\`\`\nEtter`;
  assert.equal(finnSeksjon(body), null);
  assert.equal(finnSeksjon(`\`\`\`\n~~~~\n${START}\nx\n${SLUTT}\n\`\`\``), null, '~~~~ lukker ikke en ```-blokk');
  const etterBlokk = `\`\`\`\n${START}\n\`\`\`\n${START}\nny\n${SLUTT}`;
  assert.deepEqual(erstattSeksjon(etterBlokk, SEKSJON), `\`\`\`\n${START}\n\`\`\`\n${SEKSJON}`);
});

test('sjekken etter opplasting ser bort fra markører i en kodeblokk', () => {
  const url = 'https://github.com/user-attachments/assets/a-1';
  assert.deepEqual(sjekkOpplastet(`\`\`\`\n${START}\n${url}\n${SLUTT}\n\`\`\``), { lenker: 0, ulastet: 0 });
});

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
