#!/usr/bin/env node
/**
 * Pin-fila `.github/e2e-pins.json`: hvilke tjenester E2E Tests holder tilbake på et bestemt image
 * i stedet for `latest`, og hvilken e2e-branch som har testene til en koblet endring.
 * Oppskriften står i docs/ci-cd/KOBLEDE-ENDRINGER.md.
 *
 *   {
 *     "melosys-web": {
 *       "tag": "<40-hex sha på default-branchen>",
 *       "e2e_branch": "MELOSYS-9000-ny-knapp",   // valgfri, sammen med service_pr
 *       "service_pr": 3300,                       // valgfri, sammen med e2e_branch
 *       "jira": "MELOSYS-9000",
 *       "utloper": "2026-11-03"
 *     }
 *   }
 *
 * Ren node uten avhengigheter: plan-jobben i e2e-tests.yml kjører den før `npm ci`. Funksjonene
 * som slår opp i GitHub og GAR, får oppslagene som parameter (`kilder`), så unit-testene i
 * lib/e2e-pins.test.ts kan sende inn svarene. CLI-en nederst bruker de ekte oppslagene.
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

export const PIN_FIL = '.github/e2e-pins.json';
export const GAR = 'europe-north1-docker.pkg.dev/nais-management-233d/teammelosys';

/**
 * Tjenestene E2E Tests kjenner, med GitHub-repo og imagenavn. `gate` er tjenestene med
 * e2e-gate.yml og merge queue; bare de kan ha `e2e_branch` og `service_pr` (D13). Lista skal
 * være lik case-en i e2e-gate.yml, se testen i lib/e2e-pins.test.ts.
 */
export const TJENESTER = {
  'melosys-api': { repo: 'melosys-api', image: 'melosys-api', gate: true },
  'melosys-web': { repo: 'melosys-web', image: 'melosys-web', gate: true },
  faktureringskomponenten: { repo: 'faktureringskomponenten', image: 'faktureringskomponenten', gate: true },
  'melosys-trygdeavgift-beregning': { repo: 'melosys-trygdeavgift-beregning', image: 'melosys-trygdeavgift-beregning', gate: false },
  'melosys-trygdeavtale': { repo: 'melosys-trygdeavtale', image: 'melosys-trygdeavtale', gate: false },
  'melosys-inngangsvilkar': { repo: 'melosys-inngangsvilkar', image: 'melosys-inngangsvilkar', gate: false },
  'melosys-eessi': { repo: 'melosys-eessi', image: 'melosys-eessi', gate: true },
  'melosys-mock': { repo: 'melosys-docker-compose', image: 'melosys-docker-compose-mock', gate: false },
  'melosys-dokgen': { repo: 'melosys-dokgen', image: 'melosys-dokgen', gate: false },
  'melosys-skjema-api': { repo: 'melosys-skjema-api', image: 'melosys-skjema-api', gate: true },
  'melosys-skjema-web': { repo: 'melosys-skjema-web', image: 'melosys-skjema-web', gate: true },
};

const FELT = ['tag', 'e2e_branch', 'service_pr', 'jira', 'utloper'];
const SHA = /^[0-9a-f]{40}$/;

/** Fjerner tegn som kan gjøre en loggmelding til en workflow-kommando. */
export const vask = (s) => String(s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/##\[/g, '# #[').replace(/::/g, ': :');
const navn = (s) => vask(JSON.stringify(s));

/** Samme regler som `git check-ref-format --branch`, uten `@`-forkortelsene. */
export function gyldigBranchnavn(b) {
  if (typeof b !== 'string' || b.length === 0 || b.length > 255) return false;
  if (b === '@' || b === 'HEAD' || b.startsWith('-')) return false;
  if (/[\u0000-\u0020\u007f~^:?*[\\]/.test(b)) return false;
  if (b.includes('..') || b.includes('@{') || b.includes('//')) return false;
  if (b.startsWith('/') || b.endsWith('/') || b.endsWith('.')) return false;
  return b.split('/').every((del) => !del.startsWith('.') && !del.endsWith('.lock'));
}

function gyldigDato(d) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/**
 * Leser og validerer pin-fila uten nettverk. Tom tekst eller `{}` betyr ingen pinner.
 * Gir `{ pins, feil }`; `pins` har bare feltene som står i fila, i fast rekkefølge.
 */
export function lesPins(tekst) {
  if (tekst == null || tekst.trim() === '') return { pins: {}, feil: [] };
  let data;
  try {
    data = JSON.parse(tekst);
  } catch (e) {
    return { pins: {}, feil: [`${PIN_FIL} er ikke gyldig JSON: ${vask(e.message)}`] };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { pins: {}, feil: [`${PIN_FIL} skal være et JSON-objekt med tjenestenavn som nøkler`] };
  }
  const pins = {};
  const feil = [];
  for (const [tjeneste, pin] of Object.entries(data)) {
    const f = (melding) => feil.push(`${navn(tjeneste)}: ${melding}`);
    const info = Object.hasOwn(TJENESTER, tjeneste) ? TJENESTER[tjeneste] : undefined;
    if (!info) {
      f(`ukjent tjeneste. Kjente: ${Object.keys(TJENESTER).join(', ')}`);
      continue;
    }
    if (pin === null || typeof pin !== 'object' || Array.isArray(pin)) {
      f('pinnen skal være et objekt');
      continue;
    }
    const ukjente = Object.keys(pin).filter((k) => !FELT.includes(k));
    if (ukjente.length) f(`ukjente felt: ${ukjente.map(navn).join(', ')}`);
    if (!SHA.test(pin.tag ?? '')) f('tag skal være en commit-sha med 40 hex-tegn (finn den med scripts/pin-sha.sh)');
    if (!/^MELOSYS-[1-9][0-9]{0,6}$/.test(pin.jira ?? '')) f('jira skal være en MELOSYS-nøkkel, for eksempel MELOSYS-9000');
    if (!gyldigDato(pin.utloper)) f('utloper skal være en dato på formen ÅÅÅÅ-MM-DD');
    const harBranch = pin.e2e_branch !== undefined;
    const harPr = pin.service_pr !== undefined;
    if (harBranch !== harPr) f('e2e_branch og service_pr skal stå sammen, eller ingen av dem (karantenepin)');
    if (harBranch && !gyldigBranchnavn(pin.e2e_branch)) f('e2e_branch er ikke et gyldig branchnavn');
    if (harPr && !(Number.isInteger(pin.service_pr) && pin.service_pr > 0 && pin.service_pr < 1e10)) {
      f('service_pr skal være et positivt heltall');
    }
    if ((harBranch || harPr) && !info.gate) {
      f('kan bare ha karantenepin (tag, jira, utloper): e2e_branch og service_pr gjelder bare tjenestene med e2e-gate');
    }
    pins[tjeneste] = Object.fromEntries(FELT.filter((k) => pin[k] !== undefined).map((k) => [k, pin[k]]));
  }
  return { pins: feil.length ? {} : pins, feil };
}

/** En koblet pin har e2e_branch og service_pr; uten dem er pinnen en karantene. */
export const erKoblet = (pin) => pin?.service_pr !== undefined;

/**
 * Tjenestene som er under test i en kjøring: de har en eksplisitt tag som ikke er `latest`.
 * - repository_dispatch: tjenesten i event-typen («<tjeneste>-published»).
 * - environment «tjeneste:tag,…»: hver tjeneste med tag ≠ latest (gaten, «E2E med brancher»).
 * - environment med bare en tag: melosys-api, når taggen ≠ latest.
 * Samme tolkning som «Determine image tags» i e2e-tests.yml.
 */
export function tjenesterUnderTest({ hendelse, eventType = '', environment = '' }) {
  const under = new Set();
  if (hendelse === 'repository_dispatch') {
    const tjeneste = eventType.replace(/-published$/, '');
    if (eventType.endsWith('-published') && Object.hasOwn(TJENESTER, tjeneste)) under.add(tjeneste);
    return under;
  }
  const env = environment.trim();
  if (env.includes(':')) {
    for (const par of env.split(',')) {
      const p = par.trim();
      const i = p.indexOf(':');
      if (i === -1) continue;
      const tjeneste = p.slice(0, i);
      if (Object.hasOwn(TJENESTER, tjeneste) && p.slice(i + 1) !== 'latest') under.add(tjeneste);
    }
  } else if (env !== 'latest') {
    under.add('melosys-api');
  }
  return under;
}

/**
 * Regel 1 og 2: tjenester som står i fila og ikke er under test, får taggen i pinnen.
 * Gir `{ anvendt: { tjeneste: tag }, underTest: [tjenester med pin som ikke ble brukt] }`.
 */
export function anvendPins(pins, underTest) {
  const anvendt = {};
  const ikkeBrukt = [];
  for (const [tjeneste, pin] of Object.entries(pins)) {
    if (underTest.has(tjeneste)) ikkeBrukt.push(tjeneste);
    else anvendt[tjeneste] = pin.tag;
  }
  return { anvendt, underTest: ikkeBrukt };
}

/** Regel 7: pinner der `utloper` er passert. `utloper` er siste dag pinnen kan stå. */
export function utloptePins(pins, idag) {
  return Object.entries(pins)
    .filter(([, pin]) => pin.utloper < idag)
    .map(([tjeneste, pin]) => ({ tjeneste, utloper: pin.utloper, jira: pin.jira }));
}

/** Er `forfar` lik eller forfar til `etterkommer` i repoet? */
async function erForfarAv(kilder, repo, forfar, etterkommer) {
  return (await kilder.sammenlign(repo, forfar, etterkommer)) === true;
}

/**
 * Regel 6: dispatch etter merge fra en tjeneste med koblet pin hoppes over, men bare når
 * `service_pr` er merget og merge-commiten er forfar til sha-en i dispatchen. Feiler et
 * oppslag, kjøres testene. Gir `{ hopp, grunn }`.
 */
export async function regel6({ pins, hendelse, eventType = '', sha = '', kilder }) {
  if (hendelse !== 'repository_dispatch') return { hopp: false, grunn: 'ikke repository_dispatch' };
  const tjeneste = eventType.replace(/-published$/, '');
  const pin = Object.hasOwn(pins, tjeneste) ? pins[tjeneste] : undefined;
  if (!pin) return { hopp: false, grunn: `${tjeneste} er ikke pinnet` };
  if (!erKoblet(pin)) return { hopp: false, grunn: `${tjeneste} har karantenepin, testene kjøres` };
  if (!SHA.test(sha)) return { hopp: false, grunn: 'dispatchen har ingen commit-sha, testene kjøres' };
  const repo = TJENESTER[tjeneste].repo;
  try {
    const pr = await kilder.hentPr(repo, pin.service_pr);
    if (!pr || pr.merged !== true) {
      return { hopp: false, grunn: `${repo}#${pin.service_pr} er ikke merget, testene kjøres` };
    }
    if (!SHA.test(pr.merge_commit_sha ?? '')) {
      return { hopp: false, grunn: `${repo}#${pin.service_pr} mangler merge-commit, testene kjøres` };
    }
    if (!(await erForfarAv(kilder, repo, pr.merge_commit_sha, sha))) {
      return { hopp: false, grunn: `${sha.slice(0, 7)} inneholder ikke ${repo}#${pin.service_pr}, testene kjøres` };
    }
  } catch (e) {
    return { hopp: false, grunn: `oppslaget mot GitHub feilet (${vask(e.message)}), testene kjøres` };
  }
  return {
    hopp: true,
    grunn: `${tjeneste} er pinnet, og ${sha.slice(0, 7)} inneholder ${repo}#${pin.service_pr}. Køen testet den fra e2e-branchen ${pin.e2e_branch}.`,
  };
}

/** Tjenester der pinnen er lagt til, fjernet eller endret mellom base og head. */
export function pinEndringer(basePins, headPins) {
  const alle = new Set([...Object.keys(basePins), ...Object.keys(headPins)]);
  return [...alle]
    .filter((t) => JSON.stringify(basePins[t] ?? null) !== JSON.stringify(headPins[t] ?? null))
    .sort()
    .map((tjeneste) => ({ tjeneste, før: basePins[tjeneste] ?? null, etter: headPins[tjeneste] ?? null }));
}

/**
 * Finnes taggen i GAR, og ligger den på default-branchen? Gjelder alle pinner i fila.
 * `compare/<tag>...<default>` er ahead eller identical når taggen ligger på branchen.
 */
export async function validerMotKilder(pins, kilder) {
  const feil = [];
  for (const [tjeneste, pin] of Object.entries(pins)) {
    const { repo, image } = TJENESTER[tjeneste];
    try {
      if (!(await kilder.digest(image, pin.tag))) {
        feil.push(`${tjeneste}: ${image}:${pin.tag} finnes ikke i GAR`);
        continue;
      }
      const branch = await kilder.standardBranch(repo);
      if (!(await erForfarAv(kilder, repo, pin.tag, branch))) {
        feil.push(`${tjeneste}: ${pin.tag} ligger ikke på ${branch} i ${repo}. Pinnen skal peke på et image fra default-branchen.`);
      }
    } catch (e) {
      feil.push(`${tjeneste}: oppslaget feilet: ${vask(e.message)}`);
    }
  }
  return feil;
}

/**
 * Sha-taggen på default-branchen som har samme digest som `latest`. Leter i de siste 100
 * commitene på branchen; en commit som bare endrer dokumentasjon har ikke image.
 */
export async function shaBakLatest(tjeneste, kilder) {
  const { repo, image } = TJENESTER[tjeneste];
  const latest = await kilder.digest(image, 'latest');
  if (!latest) throw new Error(`${image}:latest finnes ikke i GAR`);
  const branch = await kilder.standardBranch(repo);
  for (const sha of await kilder.sisteCommits(repo, branch)) {
    if ((await kilder.digest(image, sha)) === latest) return sha;
  }
  throw new Error(
    `fant ingen commit blant de siste 100 på ${branch} i ${repo} med samme image som latest. ` +
      'latest kan være bygget fra en annen branch (deploy-manuelt).'
  );
}

/**
 * D14: en koblet pin som fjernes, eller der service_pr eller e2e_branch endres eller fjernes,
 * godtas når service_pr er merget og ligger i latest, når service_pr er lukket uten merge, eller
 * når PR-en bare endrer pin-fila.
 */
export async function validerFjerning(basePins, headPins, { barePinfil, kilder }) {
  const feil = [];
  for (const { tjeneste, før, etter } of pinEndringer(basePins, headPins)) {
    if (!erKoblet(før)) continue;
    if (etter && etter.service_pr === før.service_pr && etter.e2e_branch === før.e2e_branch) continue;
    if (barePinfil) continue;
    const repo = TJENESTER[tjeneste].repo;
    const pr = `${repo}#${før.service_pr}`;
    try {
      const svar = await kilder.hentPr(repo, før.service_pr);
      if (!svar) {
        feil.push(`${tjeneste}: fant ikke ${pr}`);
        continue;
      }
      if (svar.state === 'closed' && svar.merged !== true) continue;
      if (svar.merged === true && SHA.test(svar.merge_commit_sha ?? '')) {
        const latest = await shaBakLatest(tjeneste, kilder);
        if (await erForfarAv(kilder, repo, svar.merge_commit_sha, latest)) continue;
        feil.push(
          `${tjeneste}: ${pr} er merget, men ${tjeneste} latest (${latest.slice(0, 7)}) har den ikke ennå. ` +
            'Vent til deploy-dev har bygget latest, og prøv igjen.'
        );
        continue;
      }
      feil.push(
        `${tjeneste}: den koblede pinnen kan ikke fjernes eller kobles om mens ${pr} er åpen. ` +
          'Merge service-PR-en og vent til den er i latest, lukk den, eller fjern pinnen i en PR som bare endrer pin-fila.'
      );
    } catch (e) {
      feil.push(`${tjeneste}: oppslaget for ${pr} feilet: ${vask(e.message)}`);
    }
  }
  return feil;
}

/**
 * Utvalget i e2e-køen: endringen i pin-fila har ingen virkning når hver tag i pinnene som er
 * lagt til, fjernet eller endret, har samme digest som `latest` nå, både før og etter.
 */
export async function utenVirkning(basePins, headPins, kilder) {
  const latest = new Map();
  for (const { tjeneste, før, etter } of pinEndringer(basePins, headPins)) {
    const { image } = TJENESTER[tjeneste];
    if (!latest.has(image)) latest.set(image, await kilder.digest(image, 'latest'));
    const mål = latest.get(image);
    if (!mål) return false;
    for (const pin of [før, etter]) {
      if (pin && (await kilder.digest(image, pin.tag)) !== mål) return false;
    }
  }
  return true;
}

/**
 * Hele valideringen i `pinner` (e2e-for-merge.yml) og e2e-pins-utlop.yml. Uten `baseTekst`
 * hoppes sjekken av fjerning og utvalget over.
 */
export async function valider({ headTekst, baseTekst, barePinfil = false, idag, kilder }) {
  const head = lesPins(headTekst);
  if (head.feil.length) return { feil: head.feil, utenVirkning: false, utlopt: [] };
  const feil = await validerMotKilder(head.pins, kilder);
  const utlopt = idag ? utloptePins(head.pins, idag) : [];
  if (baseTekst === undefined) return { feil, utenVirkning: false, utlopt };
  // Basen er main, som pinner alt har validert. Er den likevel ugyldig, regnes den som tom.
  const base = lesPins(baseTekst);
  const basePins = base.feil.length ? {} : base.pins;
  feil.push(...(await validerFjerning(basePins, head.pins, { barePinfil, kilder })));
  const uten = feil.length === 0 && (await utenVirkning(basePins, head.pins, kilder));
  return { feil, utenVirkning: uten, utlopt };
}

// ---- Ekte oppslag for CLI-en ----

const kjør = promisify(execFile);

/** Oppslag mot GitHub (fetch med GH_TOKEN) og GAR (docker buildx imagetools). */
export function ekteKilder({ token = process.env.GH_TOKEN, eier = 'navikt' } = {}) {
  const api = async (sti, { tillat404 = false } = {}) => {
    const res = await fetch(`https://api.github.com/${sti}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'melosys-e2e-pins',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.status === 404 && tillat404) return null;
    if (!res.ok) throw new Error(`GitHub svarte ${res.status} på ${sti.split('?')[0]}`);
    return res.json();
  };
  const digester = new Map();
  return {
    async digest(image, tag) {
      const nøkkel = `${image}:${tag}`;
      if (!digester.has(nøkkel)) {
        // «not found» betyr at taggen mangler. Annen feil (innlogging, nettverk) prøves én gang
        // til og stopper så oppslaget, så en manglende innlogging ikke ser ut som en manglende tag.
        let svar;
        for (let forsøk = 0; forsøk < 2 && svar === undefined; forsøk++) {
          if (forsøk) await new Promise((r) => setTimeout(r, 5000));
          try {
            const { stdout } = await kjør('docker', ['buildx', 'imagetools', 'inspect', `${GAR}/${nøkkel}`, '--format', '{{json .Manifest}}']);
            const d = JSON.parse(stdout).digest;
            if (/^sha256:[0-9a-f]{64}$/.test(d)) svar = d;
          } catch (e) {
            const melding = String(e.stderr ?? e.message);
            if (/not found|manifest unknown/i.test(melding)) svar = null;
            else if (forsøk === 1) {
              throw new Error(`GAR-oppslaget for ${nøkkel} feilet: ${melding.trim().split('\n').pop()}. Er docker logget inn i GAR?`);
            }
          }
        }
        digester.set(nøkkel, svar ?? null);
      }
      return digester.get(nøkkel);
    },
    async standardBranch(repo) {
      return (await api(`repos/${eier}/${repo}`)).default_branch;
    },
    async sammenlign(repo, forfar, etterkommer) {
      const svar = await api(`repos/${eier}/${repo}/compare/${forfar}...${encodeURIComponent(etterkommer)}?per_page=1`, { tillat404: true });
      return svar !== null && (svar.status === 'ahead' || svar.status === 'identical');
    },
    async hentPr(repo, nummer) {
      return api(`repos/${eier}/${repo}/pulls/${nummer}`, { tillat404: true });
    },
    async sisteCommits(repo, branch) {
      const svar = await api(`repos/${eier}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=100`);
      return svar.map((c) => c.sha);
    },
  };
}

// ---- CLI ----

const BRUK = `Bruk:
  node lib/e2e-pins.mjs anvend --fil F --hendelse E [--event-type T] [--environment ENV] [--idag D]
      Pinnene kjøringen bruker (regel 1, 2 og 7), som JSON. Ugyldig fil gir exit 1.
  node lib/e2e-pins.mjs regel6 --fil F --hendelse E --event-type T --sha S
      Om dispatchen skal hoppes over, som JSON. Exit 0 også når oppslaget feiler. Leser GH_TOKEN.
  node lib/e2e-pins.mjs sjekk-gar --fil F
      Exit 1 hvis en pinnet tag mangler i GAR.
  node lib/e2e-pins.mjs valider --fil F [--base-fil B] [--bare-pinfil] [--idag D]
      Hele valideringen, med fjerning og utvalg når --base-fil er gitt. Leser GH_TOKEN.
  node lib/e2e-pins.mjs sha-bak-latest <tjeneste>
      Commit-sha-en på default-branchen som har samme image som latest. Leser GH_TOKEN.`;

function les(fil) {
  return fil && existsSync(fil) ? readFileSync(fil, 'utf8') : '';
}

async function main(args) {
  const verdi = (flagg) => {
    const i = args.indexOf(flagg);
    return i === -1 ? undefined : args[i + 1];
  };
  const idag = verdi('--idag') ?? new Date().toISOString().slice(0, 10);
  const ut = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
  const feilOgStopp = (feil) => {
    for (const f of feil) process.stderr.write(vask(f) + '\n');
    process.exit(1);
  };

  switch (args[0]) {
    case 'anvend': {
      const { pins, feil } = lesPins(les(verdi('--fil')));
      if (feil.length) feilOgStopp(feil);
      const under = tjenesterUnderTest({
        hendelse: verdi('--hendelse') ?? '',
        eventType: verdi('--event-type') ?? '',
        environment: verdi('--environment') ?? '',
      });
      ut({ pins, ...anvendPins(pins, under), utlopt: utloptePins(pins, idag) });
      return;
    }
    case 'regel6': {
      const { pins, feil } = lesPins(les(verdi('--fil')));
      if (feil.length) {
        ut({ hopp: false, grunn: 'pin-fila er ugyldig, testene kjøres' });
        return;
      }
      ut(
        await regel6({
          pins,
          hendelse: verdi('--hendelse') ?? '',
          eventType: verdi('--event-type') ?? '',
          sha: verdi('--sha') ?? '',
          kilder: ekteKilder(),
        })
      );
      return;
    }
    case 'sjekk-gar': {
      const { pins, feil } = lesPins(les(verdi('--fil')));
      if (feil.length) feilOgStopp(feil);
      const kilder = ekteKilder();
      const mangler = [];
      // Parallelt: plan-jobben kjører dette i hver kjøring, og hvert oppslag tar noen sekunder.
      const digester = await Promise.all(Object.entries(pins).map(([t, pin]) => kilder.digest(TJENESTER[t].image, pin.tag)));
      Object.entries(pins).forEach(([tjeneste, pin], i) => {
        const { image } = TJENESTER[tjeneste];
        if (!digester[i]) mangler.push(`${tjeneste}: ${image}:${pin.tag} finnes ikke i GAR`);
        else process.stdout.write(`📌 ${tjeneste}: ${image}:${pin.tag} finnes i GAR\n`);
      });
      if (mangler.length) feilOgStopp(mangler);
      return;
    }
    case 'valider': {
      const baseFil = verdi('--base-fil');
      const svar = await valider({
        headTekst: les(verdi('--fil')),
        baseTekst: baseFil === undefined ? undefined : les(baseFil),
        barePinfil: args.includes('--bare-pinfil'),
        idag,
        kilder: ekteKilder(),
      });
      ut(svar);
      if (svar.feil.length) feilOgStopp(svar.feil);
      return;
    }
    case 'sha-bak-latest': {
      const tjeneste = args[1];
      if (!Object.hasOwn(TJENESTER, tjeneste ?? '')) feilOgStopp([`ukjent tjeneste ${navn(tjeneste)}. Kjente: ${Object.keys(TJENESTER).join(', ')}`]);
      try {
        process.stdout.write((await shaBakLatest(tjeneste, ekteKilder())) + '\n');
      } catch (e) {
        feilOgStopp([e.message]);
      }
      return;
    }
    default:
      process.stderr.write(BRUK + '\n');
      process.exit(2);
  }
}

// Kjør bare når fila startes direkte, ikke når testen importerer den. Ingen top-level await:
// unit-testene laster fila med require.
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((e) => {
    process.stderr.write(`${vask(e.message)}\n`);
    process.exit(1);
  });
}
