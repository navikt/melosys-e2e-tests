import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advarslerOmShards,
  byggBeskrivelse,
  erstattSeksjon,
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
