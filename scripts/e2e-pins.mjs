#!/usr/bin/env node
/**
 * Pinner for E2E Tests: hvilke image-tagger en kjøring bytter ut. Det er to kilder til fila er
 * fjernet:
 *
 * - `.github/e2e-pins.json`: et objekt fra tjeneste til tag, for eksempel
 *   `{ "melosys-web": "br-39400000000" }`. En pin i fila gjelder alltid.
 * - Actions-variabelen `E2E_PINS`, eller input `e2e_pins` i én kjøring: et objekt fra tjeneste til
 *   `{ tag, e2e_pr, service_pr, satt }`. En pin der gjelder fra testene har e2e-PR-en (start) til
 *   `latest` har service-PR-en (utløp), og slår seg dermed av selv.
 *
 * Bare tjenester som har `latest` i kjøringen, får en pin. En tjeneste under test (eksplisitt tag
 * fra gaten, dispatch eller «E2E med brancher») beholder sin egen tag.
 *
 * Bruk:
 *   e2e-pins.mjs velg <pin-fil> <ut-fil>
 *       «Determine image tags»: skriver «<variabel> <tjeneste> <tag>» per pin som brukes, og
 *       statusen per pin i variabelen til <ut-fil> (feltene pinner og pinnerFeil i
 *       trigger-context.json). Ugyldig fil gir exit 1; ugyldig variabel gir ingen pinner.
 *   e2e-pins.mjs set <tjeneste> <tag> <e2e_pr> <service_pr> [--erstatt] [--tving] [--dry-run]
 *   e2e-pins.mjs fjern <tjeneste> [--dry-run]
 *       Skriver variabelen. Krever GH_TOKEN med Variables: write i melosys-e2e-tests, og docker
 *       logget inn i GAR for å se om eksisterende pinner er utløpt.
 * Oppskriften for koblede endringer står i docs/ci-cd/KOBLEDE-ENDRINGER.md.
 */
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

/** Tjenestenavnene `environment`-inputen bruker, og variabelen «Determine image tags» setter. */
export const TJENESTER = {
  'melosys-api': 'MELOSYS_API_TAG',
  'melosys-web': 'MELOSYS_WEB_TAG',
  faktureringskomponenten: 'FAKTURERINGSKOMPONENTEN_TAG',
  'melosys-trygdeavgift-beregning': 'MELOSYS_TRYGDEAVGIFT_TAG',
  'melosys-trygdeavtale': 'MELOSYS_TRYGDEAVTALE_TAG',
  'melosys-inngangsvilkar': 'MELOSYS_INNGANGSVILKAR_TAG',
  'melosys-eessi': 'MELOSYS_EESSI_TAG',
  'melosys-mock': 'MELOSYS_MOCK_TAG',
  'melosys-dokgen': 'MELOSYS_DOKGEN_TAG',
  'melosys-skjema-api': 'MELOSYS_SKJEMA_API_TAG',
  'melosys-skjema-web': 'MELOSYS_SKJEMA_WEB_TAG',
};

/**
 * Repoene med merge-kø. Bare de kan ha en pin i variabelen: de er offentlige, så github.token kan
 * lese service-PR-en, og repo-, image- og tjenestenavn er like.
 */
export const TJENESTER_MED_KO = ['melosys-api', 'melosys-web', 'melosys-skjema-api', 'melosys-skjema-web', 'melosys-eessi', 'faktureringskomponenten'];

const EIER = 'navikt';
const E2E_REPO = 'melosys-e2e-tests';
const VARIABEL = 'E2E_PINS';
const GAR = 'europe-north1-docker.pkg.dev/nais-management-233d/teammelosys';
const REVISJON = 'org.opencontainers.image.revision';
const DØGN = 24 * 60 * 60 * 1000;
const TRE_DAGER = 3 * DØGN;

/** Samme regel som tag-sjekken i «Determine image tags». */
const DOCKER_TAG = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const SHA = /^[0-9a-f]{40}$/;
const TIDSPUNKT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Tekst utenfra skal ikke bli workflow-kommandoer i loggen. */
export const vask = (t) => String(t).replace(/[\r\n]+/g, ' ').replace(/::/g, ': :').replace(/##\[/g, '# #[');
const kort = (sha) => sha.slice(0, 7);
const erObjekt = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------- fila

/** Tom tekst betyr ingen pinner. Kaster med en melding som kan vises i jobbloggen. */
export function lesPinner(tekst) {
  if (tekst.trim() === '') return {};
  let pinner;
  try {
    pinner = JSON.parse(tekst);
  } catch {
    throw new Error('er ikke gyldig JSON');
  }
  if (!erObjekt(pinner)) {
    throw new Error('skal være et objekt fra tjeneste til tag, for eksempel {"melosys-web": "br-123"}');
  }
  for (const [tjeneste, tag] of Object.entries(pinner)) {
    if (!Object.hasOwn(TJENESTER, tjeneste)) {
      throw new Error(`ukjent tjeneste «${vask(tjeneste)}». Gyldige: ${Object.keys(TJENESTER).join(', ')}`);
    }
    if (typeof tag !== 'string' || !DOCKER_TAG.test(tag)) {
      throw new Error(`taggen for ${tjeneste} er ikke en gyldig docker-tag`);
    }
    if (tag === 'latest') {
      throw new Error(`${tjeneste} er pinnet til latest, som ikke endrer noe. Fjern linja`);
    }
  }
  return pinner;
}

/** Pinnene som gjelder: bare tjenester som har `latest` i `tagger` (variabel → tag). */
export function brukPinner(pinner, tagger) {
  return Object.entries(pinner)
    .filter(([tjeneste]) => tagger[TJENESTER[tjeneste]] === 'latest')
    .map(([tjeneste, tag]) => ({ variabel: TJENESTER[tjeneste], tjeneste, tag }));
}

// ---------------------------------------------------------------- variabelen

/** Tom tekst betyr ingen pinner. Kaster med en melding uten verdiene fra variabelen. */
export function lesVariabel(tekst) {
  if ((tekst ?? '').trim() === '') return {};
  let pinner;
  try {
    pinner = JSON.parse(tekst);
  } catch {
    throw new Error('er ikke gyldig JSON');
  }
  if (!erObjekt(pinner)) throw new Error('skal være et objekt fra tjeneste til pin');
  for (const [tjeneste, pin] of Object.entries(pinner)) {
    if (!TJENESTER_MED_KO.includes(tjeneste)) {
      throw new Error(`ukjent tjeneste «${vask(tjeneste)}». Gyldige: ${TJENESTER_MED_KO.join(', ')}`);
    }
    if (!erObjekt(pin)) throw new Error(`pinnen for ${tjeneste} skal være et objekt med tag, e2e_pr og service_pr`);
    if (Object.keys(pin).some((k) => !['tag', 'e2e_pr', 'service_pr', 'satt'].includes(k))) {
      throw new Error(`pinnen for ${tjeneste} har ukjente felt`);
    }
    if (typeof pin.tag !== 'string' || !DOCKER_TAG.test(pin.tag)) throw new Error(`taggen for ${tjeneste} er ikke en gyldig docker-tag`);
    if (pin.tag === 'latest') throw new Error(`${tjeneste} er pinnet til latest, som ikke endrer noe`);
    for (const felt of ['e2e_pr', 'service_pr']) {
      if (!Number.isSafeInteger(pin[felt]) || pin[felt] < 1) throw new Error(`${felt} for ${tjeneste} er ikke et positivt heltall`);
    }
    if (pin.satt !== undefined && (typeof pin.satt !== 'string' || !TIDSPUNKT.test(pin.satt) || Number.isNaN(Date.parse(pin.satt)))) {
      throw new Error(`satt for ${tjeneste} er ikke et tidspunkt som 2026-10-22T14:00:00Z`);
    }
  }
  return pinner;
}

/**
 * Startregelen. `emner` er emnene i historikken til checkouten, nyeste først. Pinnen starter når
 * en commit har emne som slutter på «(#<e2e_pr>)» (squash-merge på main og commiten i merge-køen),
 * og ingen senere commit er en revert av den. GitHubs revert-knapp gir «Revert "<PR-tittel>" (#M)»
 * uten det opprinnelige nummeret (melosys-api #3413 for #3409), så begge formene gjenkjennes.
 */
export function startStatus(emner, e2ePr) {
  const merke = `(#${e2ePr})`;
  const i = emner.findLastIndex((e) => e.trimEnd().endsWith(merke));
  if (i === -1) return { startet: false, grunn: `testene har ikke e2e #${e2ePr}` };
  const tittel = emner[i].trimEnd().slice(0, -merke.length).trimEnd();
  const nummer = new RegExp(`#${e2ePr}(?!\\d)`);
  const revert = emner.slice(0, i).find((e) => e.startsWith(`Revert "${tittel}"`) || (/revert/i.test(e) && nummer.test(e)));
  if (revert) return { startet: false, grunn: `e2e #${e2ePr} er revertert («${vask(revert)}»)` };
  return { startet: true, grunn: `testene har e2e #${e2ePr}` };
}

/**
 * Revisjonen fra `docker buildx imagetools inspect --format '{{json .Image}}'`. Et multi-arch-image
 * gir ett objekt per plattform; et image med én plattform har `config` på toppnivå.
 */
export function revisjonFraImage(image) {
  const config = erObjekt(image) ? (image.config ?? image['linux/amd64']?.config) : undefined;
  const revisjon = config?.Labels?.[REVISJON];
  return typeof revisjon === 'string' && SHA.test(revisjon) ? revisjon : null;
}

const beholdes = (grunn, advarsel) => ({ status: 'aktiv', grunn, advarsel: `${advarsel}; pinnen beholdes.` });
const innenfor = (nå, tidspunkt, grense) => nå - Date.parse(tidspunkt) <= grense;

/**
 * Utløpsregelen for en pin som har startet: 'aktiv', 'utløpt' eller 'forlatt'. Feiler et kall mot
 * GitHub eller docker, beholdes pinnen med en advarsel, men bare i en kort periode: en utløpt pin
 * kan stå igjen i variabelen, og et feilet oppslag dager senere skal ikke gi en gate et gammelt
 * br-image. Etter mergen beholdes den et døgn fra merged_at (latest bygges vanligvis innen en
 * time); feiler selve PR-oppslaget, beholdes den bare når den ble satt de siste tre dagene.
 * Etter den perioden er pinnen 'utløpt' med `feil: true`: kjøringen bruker den ikke, men skriveren
 * sletter den ikke, fordi den kan gjelde igjen når oppslaget virker.
 */
export async function vurderService(tjeneste, servicePr, hent, { nå, satt }) {
  const navn = `${tjeneste} #${servicePr}`;
  let pr;
  try {
    pr = await hent.pr(tjeneste, servicePr);
  } catch (e) {
    const feil = `Fikk ikke lest ${navn} (${vask(e.message)})`;
    if (satt && innenfor(nå, satt, TRE_DAGER)) return beholdes(`fikk ikke lest ${navn}`, feil);
    return { status: 'utløpt', feil: true, grunn: `fikk ikke lest ${navn}`, advarsel: `${feil}, og pinnen ble ikke satt de siste tre dagene; pinnen brukes ikke.` };
  }
  if (!pr.merged) {
    if (pr.state === 'closed') {
      return {
        status: 'forlatt',
        grunn: `${navn} er lukket uten merge`,
        advarsel: `${navn} er lukket uten merge, så pinnen gjelder ikke. Revert e2e-PR-en, eller sett pinnen på nytt med den nye service-PR-en (docs/ci-cd/KOBLEDE-ENDRINGER.md).`,
      };
    }
    return { status: 'aktiv', grunn: `${navn} er ikke merget` };
  }
  // Mangler merged_at, regnes mergen som gammel, så feilen ikke holder pinnen i live.
  const nyMerge = innenfor(nå, pr.merged_at, DØGN);
  const feiletEtterMerge = (grunn, advarsel) =>
    nyMerge ? beholdes(grunn, advarsel) : { status: 'utløpt', feil: true, grunn, advarsel: `${advarsel}, og ${navn} ble merget for mer enn et døgn siden; pinnen regnes som utløpt.` };
  const merge = pr.merge_commit_sha;
  if (typeof merge !== 'string' || !SHA.test(merge)) return feiletEtterMerge(`${navn} mangler merge-commit`, `${navn} er merget, men GitHub oppgir ingen merge-commit`);
  let revisjon;
  try {
    revisjon = await hent.revisjon(tjeneste);
  } catch (e) {
    return feiletEtterMerge(`fikk ikke lest ${tjeneste}:latest`, `Fikk ikke lest ${tjeneste}:latest (${vask(e.message)})`);
  }
  if (!revisjon) return feiletEtterMerge(`${tjeneste}:latest mangler revisjon`, `${tjeneste}:latest mangler labelen ${REVISJON}`);
  let status;
  try {
    status = await hent.compare(tjeneste, merge, revisjon);
  } catch (e) {
    return feiletEtterMerge(`fikk ikke sammenlignet latest med ${navn}`, `Fikk ikke sammenlignet ${tjeneste}:latest med ${navn} (${vask(e.message)})`);
  }
  const par = `latest (${kort(revisjon)}) og ${navn} (${kort(merge)})`;
  if (status === 'identical' || status === 'ahead') return { status: 'utløpt', grunn: `latest (${kort(revisjon)}) har ${navn} (${kort(merge)})` };
  if (status === 'behind') return { status: 'aktiv', grunn: `latest (${kort(revisjon)}) er bygd før ${navn} (${kort(merge)})` };
  return beholdes(`${par} har gått hver sin vei`, `${par} har gått hver sin vei (compare: ${vask(status)})`);
}

/** Status for én pin i variabelen: 'under test', 'ikke startet', 'aktiv', 'utløpt' eller 'forlatt'. */
export async function vurderPin(tjeneste, pin, { tagger, emner, hent, nå }) {
  const felt = { tjeneste, tag: pin.tag, e2ePr: pin.e2e_pr, servicePr: pin.service_pr, satt: pin.satt ?? null };
  const egen = tagger[TJENESTER[tjeneste]] ?? '';
  if (egen !== 'latest') return { ...felt, status: 'under test', grunn: `kjøringen har taggen «${vask(egen)}» for ${tjeneste}`, advarsel: null };
  const start = startStatus(emner, pin.e2e_pr);
  if (!start.startet) return { ...felt, status: 'ikke startet', grunn: start.grunn, advarsel: null };
  const service = await vurderService(tjeneste, pin.service_pr, hent, { nå, satt: pin.satt });
  let advarsel = service.advarsel ?? null;
  if (service.status === 'aktiv' && pin.satt && nå - Date.parse(pin.satt) > TRE_DAGER) {
    const gammel = `Pinnen for ${tjeneste} ble satt ${pin.satt.slice(0, 10)}, for mer enn tre dager siden. Sjekk om ${tjeneste} #${pin.service_pr} står fast.`;
    advarsel = advarsel ? `${advarsel} ${gammel}` : gammel;
  }
  return { ...felt, status: service.status, grunn: service.grunn, advarsel };
}

/**
 * Avgjørelsen i «Determine image tags». `logg` har nivåene info, warning og error. En aktiv pin i
 * variabelen vinner over fila; en ugyldig variabel gir ingen pinner fra variabelen og en melding i
 * `pinnerFeil`, fordi variabelen gjelder alle køer med en gang.
 */
export async function velgPinner({ tekst, kilde, filPinner = {}, tagger, emner, hent, nå }) {
  const logg = [];
  let variabel = {};
  let pinnerFeil = null;
  try {
    variabel = lesVariabel(tekst);
  } catch (e) {
    pinnerFeil = `${kilde} ${e.message}`;
    logg.push({ nivå: 'error', tekst: `${pinnerFeil}. Kjøringen bruker ingen pinner fra ${kilde}.` });
  }
  const pinner = [];
  for (const [tjeneste, pin] of Object.entries(variabel)) {
    const vurdert = await vurderPin(tjeneste, pin, { tagger, emner, hent, nå });
    pinner.push(vurdert);
    logg.push({ nivå: 'info', tekst: `📌 ${tjeneste} → ${pin.tag} (e2e #${pin.e2e_pr}, ${tjeneste} #${pin.service_pr}): ${vurdert.status}, ${vurdert.grunn}.` });
    if (vurdert.advarsel) logg.push({ nivå: 'warning', tekst: `📌 ${vurdert.advarsel}` });
  }
  const bruk = pinner
    .filter((p) => p.status === 'aktiv')
    .map((p) => ({ variabel: TJENESTER[p.tjeneste], tjeneste: p.tjeneste, tag: p.tag }));
  for (const p of bruk) {
    const pin = variabel[p.tjeneste];
    logg.push({ nivå: 'warning', tekst: `📌 ${p.tjeneste} er pinnet til ${p.tag} i ${kilde} (e2e #${pin.e2e_pr}). Pinnen slutter å gjelde når ${p.tjeneste}:latest har ${p.tjeneste} #${pin.service_pr}.` });
  }
  for (const p of brukPinner(filPinner, tagger)) {
    const fraVariabel = bruk.find((b) => b.tjeneste === p.tjeneste);
    if (fraVariabel) {
      logg.push({ nivå: 'warning', tekst: `📌 ${p.tjeneste} er pinnet både i .github/e2e-pins.json (${p.tag}) og i ${kilde} (${fraVariabel.tag}); pinnen i ${kilde} gjelder.` });
      continue;
    }
    bruk.push(p);
    logg.push({ nivå: 'warning', tekst: `📌 ${p.tjeneste} er pinnet til ${p.tag} i .github/e2e-pins.json. Fjern pinnen når ${p.tjeneste} latest har endringen.` });
  }
  for (const [tjeneste, tag] of Object.entries(filPinner)) {
    const egen = tagger[TJENESTER[tjeneste]] ?? '';
    if (egen === 'latest') continue;
    logg.push({ nivå: 'info', tekst: `📌 ${tjeneste} er pinnet til ${tag}, men kjøringen har taggen «${vask(egen)}»; pinnen gjelder ikke.` });
  }
  return { bruk, pinner, pinnerFeil, logg };
}

// ---------------------------------------------------------------- skriveren

/** Argumentene til set og fjern. */
export function lesArgumenter(argv) {
  const flagg = argv.filter((a) => a.startsWith('--'));
  const [kommando, ...rest] = argv.filter((a) => !a.startsWith('--'));
  const ukjente = flagg.filter((f) => !['--erstatt', '--tving', '--dry-run'].includes(f));
  if (ukjente.length) throw new Error(`ukjent flagg ${vask(ukjente.join(' '))}`);
  const dryRun = flagg.includes('--dry-run');
  if (kommando === 'fjern') {
    if (rest.length !== 1 || flagg.some((f) => f !== '--dry-run')) throw new Error('bruk: fjern <tjeneste> [--dry-run]');
  } else if (kommando !== 'set' || rest.length !== 4) {
    throw new Error('bruk: set <tjeneste> <tag> <e2e_pr> <service_pr> [--erstatt] [--tving] [--dry-run]');
  }
  const tjeneste = rest[0];
  if (!TJENESTER_MED_KO.includes(tjeneste)) throw new Error(`tjenesten må være en av ${TJENESTER_MED_KO.join(', ')}`);
  if (kommando === 'fjern') return { kommando, tjeneste, dryRun };
  const [, tag, e2ePr, servicePr] = rest;
  if (!/^br-[1-9][0-9]{0,19}$/.test(tag)) throw new Error('taggen må være br-<run_id> fra «E2E med brancher»');
  for (const [navn, nr] of [['e2e_pr', e2ePr], ['service_pr', servicePr]]) {
    if (!/^[1-9][0-9]{0,9}$/.test(nr)) throw new Error(`${navn} må være et PR-nummer`);
  }
  return { kommando, tjeneste, tag, e2ePr: Number(e2ePr), servicePr: Number(servicePr), erstatt: flagg.includes('--erstatt'), tving: flagg.includes('--tving'), dryRun };
}

/** 'åpen' | 'merget' | 'lukket' fra REST-svaret for en PR. */
export const prStatus = (pr) => (pr.merged ? 'merget' : pr.state === 'open' ? 'åpen' : 'lukket');

/**
 * Den nye variabelen for `set`. `vurdering` har status per eksisterende pin (vurderPar); utløpte
 * og forlatte pinner ryddes bort. En pin fra et annet par overskrives bare med `tving`, og samme
 * par (samme e2e_pr) får ny tag eller service-PR bare med `erstatt`.
 */
export function planleggSet({ pinner, vurdering, args, e2e, service, nå }) {
  const { tjeneste, tag, e2ePr, servicePr, erstatt, tving } = args;
  const feil = [];
  const gammel = pinner[tjeneste];
  const sammePar = gammel?.e2e_pr === e2ePr;
  const ryddet = Object.keys(pinner).filter((t) => ['utløpt', 'forlatt'].includes(vurdering[t]?.status) && !vurdering[t].feil);
  if (e2e === 'lukket') feil.push(`e2e #${e2ePr} er lukket uten merge.`);
  if (e2e === 'merget' && !(erstatt && sammePar)) feil.push(`e2e #${e2ePr} er merget. En merget e2e-PR godtas bare med --erstatt for en pin fra samme e2e-PR.`);
  if (service !== 'åpen') feil.push(`${tjeneste} #${servicePr} er ${service}; pinnen trengs bare mens service-PR-en er åpen.`);
  if (erstatt && !sammePar) feil.push(`--erstatt: ${tjeneste} har ingen pin fra e2e #${e2ePr}.`);
  if (gammel && sammePar && !erstatt && (gammel.tag !== tag || gammel.service_pr !== servicePr)) {
    feil.push(`${tjeneste} er allerede pinnet til ${gammel.tag} for e2e #${e2ePr} og ${tjeneste} #${gammel.service_pr}. Bruk --erstatt for å bytte tag og service-PR.`);
  }
  if (gammel && !sammePar && !ryddet.includes(tjeneste) && !tving) {
    const v = vurdering[tjeneste];
    feil.push(`${tjeneste} er pinnet for e2e #${gammel.e2e_pr} og ${tjeneste} #${gammel.service_pr} (${v?.status ?? 'ukjent'}: ${v?.grunn ?? 'ikke vurdert'}). Vent til pinnen er utløpt, eller bruk --tving etter at en kjøring har vist den som utløpt.`);
  }
  if (feil.length) throw new Error(feil.join('\n'));
  const nye = Object.fromEntries(Object.entries(pinner).filter(([t]) => !ryddet.includes(t)));
  const uendret = Boolean(gammel && sammePar && gammel.tag === tag && gammel.service_pr === servicePr && !ryddet.includes(tjeneste));
  const tvunget = Boolean(gammel && !sammePar && !ryddet.includes(tjeneste));
  if (!uendret) nye[tjeneste] = { tag, e2e_pr: e2ePr, service_pr: servicePr, satt: new Date(nå).toISOString().replace(/\.\d{3}Z$/, 'Z') };
  return { pinner: nye, ryddet, uendret, tvunget };
}

/** Status for en eksisterende pin i skriveren: som utløpsregelen, og forlatt når e2e-PR-en er lukket. */
export async function vurderPar(tjeneste, pin, hent, nå) {
  try {
    if (prStatus(await hent.pr(E2E_REPO, pin.e2e_pr)) === 'lukket') return { status: 'forlatt', grunn: `e2e #${pin.e2e_pr} er lukket uten merge` };
  } catch (e) {
    return { status: 'aktiv', grunn: `fikk ikke lest e2e #${pin.e2e_pr} (${vask(e.message)})` };
  }
  return vurderService(tjeneste, pin.service_pr, hent, { nå, satt: pin.satt });
}

/**
 * Sjekker at br-<run_id> er en grønn kjøring av «E2E med brancher» med hele suiten, mot head-
 * commitene PR-ene har nå. `kontekst` er trigger-context.json fra E2E Tests-kjøringen den startet.
 * For en merget e2e-PR (--erstatt) godtas også en kjøring på main etter mergen.
 */
export function sjekkBrancherKjøring({ runId, orkestrator, e2eKjøring, kontekst, tjeneste, serviceHead, e2e }) {
  const feil = [];
  const br = `br-${runId}`;
  if (!orkestrator?.path?.endsWith('/e2e-brancher.yml')) throw new Error(`${br} er ikke en kjøring av «E2E med brancher».`);
  if (orkestrator.conclusion !== 'success') feil.push(`«E2E med brancher» ${br} er ${orkestrator.conclusion ?? orkestrator.status ?? 'ukjent'}, ikke grønn.`);
  if (!e2eKjøring) throw new Error([...feil, `Fant ikke E2E Tests-kjøringen til ${br}.`].join('\n'));
  if (e2eKjøring.conclusion !== 'success') feil.push(`E2E Tests for ${br} er ${e2eKjøring.conclusion ?? 'ukjent'}, ikke grønn.`);
  if (!kontekst) throw new Error([...feil, `Fant ikke trigger-context.json for ${br}.`].join('\n'));
  if ((kontekst.inputs?.test_grep ?? '') !== '') feil.push(`${br} kjørte med test_grep «${vask(kontekst.inputs.test_grep)}». Pinnen krever en kjøring av hele suiten.`);
  const branches = kontekst.branchContext?.branches ?? [];
  const service = branches.find((b) => b.repo === tjeneste);
  if (!service) feil.push(`${br} testet ikke en branch i ${tjeneste}.`);
  else if (service.sha !== serviceHead) feil.push(`${br} testet ${tjeneste} på ${kort(service.sha)}, men service-PR-en har ${kort(serviceHead)} nå. Kjør «E2E med brancher» på nytt.`);
  const tester = branches.find((b) => b.repo === E2E_REPO);
  if (tester) {
    if (tester.sha !== e2e.head) feil.push(`${br} testet ${E2E_REPO} på ${kort(tester.sha)}, men e2e-PR-en har ${kort(e2e.head)} nå. Kjør «E2E med brancher» på nytt.`);
  } else if (!e2e.merget || kontekst.headBranch !== 'main' || !(Date.parse(e2eKjøring.created_at) >= Date.parse(e2e.mergedAt))) {
    feil.push(`${br} testet ikke e2e-PR-en: kjøringen hadde ingen branch i ${E2E_REPO}.`);
  }
  if (feil.length) throw new Error(feil.join('\n'));
}

// ---------------------------------------------------------------- I/O

const sov = (ms) => new Promise((r) => setTimeout(r, ms));
const kjørProsess = promisify(execFile);

/** REST mot GitHub med to nye forsøk ved nettfeil og 5xx. Gir { status, data }. */
export function lagGitHub({ token, fetch = globalThis.fetch, vent = sov }) {
  return async (metode, sti, body) => {
    for (let forsøk = 0; ; forsøk++) {
      let res;
      try {
        res = await fetch(`https://api.github.com${sti}`, {
          method: metode,
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'melosys-e2e-pins',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(20_000),
        });
      } catch (e) {
        if (forsøk >= 2) throw new Error(`${metode} ${sti.split('?')[0]} feilet: ${e.cause?.code ?? e.message}`);
        await vent(2000 * 2 ** forsøk);
        continue;
      }
      if (res.status >= 500 && forsøk < 2) {
        await vent(2000 * 2 ** forsøk);
        continue;
      }
      const tekst = await res.text();
      let data = null;
      try {
        data = tekst ? JSON.parse(tekst) : null;
      } catch {}
      return { status: res.status, data };
    }
  };
}

const krev = (svar, hva) => {
  if (svar.status >= 200 && svar.status < 300) return svar.data;
  throw new Error(`${hva} ga HTTP ${svar.status}${svar.data?.message ? `: ${vask(svar.data.message)}` : ''}`);
};

/** Oppslagene reglene trenger: PR, revisjon på latest og compare. */
export function lagHenter(github, { docker = kjørProsess } = {}) {
  return {
    pr: async (repo, nr) => krev(await github('GET', `/repos/${EIER}/${repo}/pulls/${nr}`), `${repo} #${nr}`),
    compare: async (repo, base, head) => krev(await github('GET', `/repos/${EIER}/${repo}/compare/${base}...${head}?per_page=1`), `compare i ${repo}`).status,
    revisjon: async (repo) => {
      const { stdout } = await docker('docker', ['buildx', 'imagetools', 'inspect', `${GAR}/${repo}:latest`, '--format', '{{json .Image}}'], { timeout: 60_000 });
      return revisjonFraImage(JSON.parse(stdout));
    },
  };
}

const VARIABEL_STI = `/repos/${EIER}/${E2E_REPO}/actions/variables/${VARIABEL}`;

async function lesLagret(github) {
  const svar = await github('GET', VARIABEL_STI);
  if (svar.status === 404) return { finnes: false, tekst: '' };
  return { finnes: true, tekst: krev(svar, `GET ${VARIABEL}`).value ?? '' };
}

async function skrivLagret(github, finnes, verdi) {
  if (finnes) krev(await github('PATCH', VARIABEL_STI, { name: VARIABEL, value: verdi }), `PATCH ${VARIABEL}`);
  else krev(await github('POST', `/repos/${EIER}/${E2E_REPO}/actions/variables`, { name: VARIABEL, value: verdi }), `POST ${VARIABEL}`);
}

/** E2E Tests-kjøringen «E2E med brancher» startet, med trigger-context.json fra test-summary. */
async function hentBrancherKjøring(github, runId, lastNed) {
  const orkestrator = krev(await github('GET', `/repos/${EIER}/${E2E_REPO}/actions/runs/${runId}`), `kjøring ${runId}`);
  const tittel = `E2E Tests · br-${runId}-${orkestrator.run_attempt}`;
  // Gatene starter også E2E Tests med workflow_dispatch, så kjøringen kan ligge bak flere sider.
  // Uten øvre grense: et nytt forsøk kan starte dager etter created_at, som gjelder det første.
  const vindu = encodeURIComponent(`>=${orkestrator.created_at}`);
  let e2eKjøring = null;
  for (let side = 1; side <= 10 && !e2eKjøring; side++) {
    const { workflow_runs: kjøringer } = krev(
      await github('GET', `/repos/${EIER}/${E2E_REPO}/actions/workflows/e2e-tests.yml/runs?event=workflow_dispatch&created=${vindu}&per_page=100&page=${side}`),
      'E2E Tests-kjøringer',
    );
    e2eKjøring = kjøringer.find((r) => r.display_title === tittel) ?? null;
    if (kjøringer.length < 100) break;
  }
  const kontekst = e2eKjøring ? await lastNed(e2eKjøring.id) : null;
  return { orkestrator, e2eKjøring, kontekst };
}

/** Laster ned test-summary med gh og leser trigger-context.json. null når den mangler. */
function lastNedTriggerKontekst(id) {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-pins-'));
  try {
    execFileSync('gh', ['run', 'download', String(id), '-R', `${EIER}/${E2E_REPO}`, '-n', 'test-summary', '-D', dir], { stdio: ['ignore', 'ignore', 'pipe'] });
    const fil = join(dir, 'trigger-context.json');
    return existsSync(fil) ? JSON.parse(readFileSync(fil, 'utf8')) : null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** set og fjern. `io` har github, hent, lastNed, nå og logg; testene sender inn sine egne. */
export async function skriv(args, io) {
  const { github, logg } = io;
  const lagret = await lesLagret(github);
  let pinner;
  try {
    pinner = lesVariabel(lagret.tekst);
  } catch (e) {
    throw new Error(`${VARIABEL} ${e.message}. Rett den med «gh variable set ${VARIABEL} -R ${EIER}/${E2E_REPO}» først.`);
  }

  let nye;
  if (args.kommando === 'fjern') {
    if (!Object.hasOwn(pinner, args.tjeneste)) return logg(`${args.tjeneste} har ingen pin i ${VARIABEL}; ingenting å fjerne.`);
    nye = Object.fromEntries(Object.entries(pinner).filter(([t]) => t !== args.tjeneste));
  } else {
    const [e2ePr, servicePr] = await Promise.all([io.hent.pr(E2E_REPO, args.e2ePr), io.hent.pr(args.tjeneste, args.servicePr)]);
    const vurdering = {};
    for (const [t, pin] of Object.entries(pinner)) {
      vurdering[t] = await vurderPar(t, pin, io.hent, io.nå());
      if (vurdering[t].advarsel) logg(`${t}: ${vurdering[t].advarsel}`);
    }
    const plan = planleggSet({ pinner, vurdering, args, e2e: prStatus(e2ePr), service: prStatus(servicePr), nå: io.nå() });
    // Også en lik pin sjekkes: har PR-ene fått nye commits siden br-kjøringen, er imaget utdatert.
    const runId = args.tag.slice('br-'.length);
    sjekkBrancherKjøring({
      runId,
      ...(await hentBrancherKjøring(github, runId, io.lastNed)),
      tjeneste: args.tjeneste,
      serviceHead: servicePr.head.sha,
      e2e: { head: e2ePr.head.sha, merget: Boolean(e2ePr.merged), mergedAt: e2ePr.merged_at },
    });
    for (const t of plan.ryddet) logg(`Rydder bort pinnen for ${t}: ${vurdering[t].status}, ${vurdering[t].grunn}.`);
    if (plan.uendret && !plan.ryddet.length) return logg(`${args.tjeneste} er allerede pinnet til ${args.tag} for e2e #${args.e2ePr}; ingenting å skrive.`);
    if (plan.tvunget) logg(`--tving: overskriver pinnen for ${args.tjeneste} fra e2e #${pinner[args.tjeneste].e2e_pr}.`);
    nye = plan.pinner;
  }

  const verdi = JSON.stringify(nye, null, 2);
  if (args.dryRun) return logg(`--dry-run: ville skrevet ${VARIABEL}:\n${verdi}`);
  // API-et har ingen sammenlign-og-skriv. Lesingen rett før skrivingen stopper en skriving gjort
  // mens denne sjekket PR-ene og kjøringen; tilbakelesingen ser bare om vår pin står. En skriving
  // som bygger på en lesing gjort før vår skriving, kan fortsatt fjerne pinnen uten at noen ser det.
  if ((await lesLagret(github)).tekst !== lagret.tekst) {
    throw new Error(`${VARIABEL} er endret mens skriveren jobbet. Se på den nye verdien og kjør på nytt.`);
  }
  await skrivLagret(github, lagret.finnes, verdi);
  const tilbake = lesVariabel((await lesLagret(github)).tekst);
  if (JSON.stringify(tilbake[args.tjeneste]) !== JSON.stringify(nye[args.tjeneste])) {
    throw new Error(`${VARIABEL} har ikke ${args.kommando === 'fjern' ? 'mistet' : 'fått'} pinnen for ${args.tjeneste} etter skrivingen. En annen skriving kan ha overskrevet den; kjør på nytt.`);
  }
  logg(`${VARIABEL} er skrevet:\n${verdi}`);
}

// ---------------------------------------------------------------- CLI

function historikk() {
  const grunn = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim() === 'true';
  const emner = execFileSync('git', ['log', '--topo-order', '--format=%s', 'HEAD'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean);
  return { grunn, emner };
}

async function velg(fil, utFil, env) {
  let filPinner = {};
  if (existsSync(fil)) {
    try {
      filPinner = lesPinner(readFileSync(fil, 'utf8'));
    } catch (e) {
      console.error(`::error::${fil} ${e.message}`);
      return 1;
    }
  }
  const fraInput = (env.E2E_PINS_INPUT ?? '').trim() !== '';
  const kilde = fraInput ? 'input e2e_pins' : VARIABEL;
  const tekst = fraInput ? env.E2E_PINS_INPUT : (env.E2E_PINS_VAR ?? '');
  const felles = { kilde, filPinner, tagger: env, hent: lagHenter(lagGitHub({ token: env.GH_TOKEN })), nå: Date.now() };
  if (fraInput) console.error(`📌 Input e2e_pins erstatter ${VARIABEL} i denne kjøringen.`);
  let resultat;
  try {
    let emner = [];
    if (tekst.trim() !== '') {
      const h = historikk();
      if (h.grunn) console.error('::warning::📌 Checkouten har ikke hele historikken (fetch-depth: 0 mangler), så startregelen ser bare en del av den.');
      emner = h.emner;
    }
    resultat = await velgPinner({ ...felles, tekst, emner });
  } catch (e) {
    // En feil her skal ikke stoppe alle gates; kjøringen fortsetter med pinnene i fila.
    resultat = await velgPinner({ ...felles, tekst: '', emner: [] });
    resultat.pinnerFeil = `pinvalget feilet: ${vask(e.message)}`;
    resultat.logg.unshift({ nivå: 'error', tekst: `${resultat.pinnerFeil}. Kjøringen bruker ingen pinner fra ${kilde}.` });
  }
  for (const { nivå, tekst: t } of resultat.logg) console.error(nivå === 'info' ? vask(t) : `::${nivå}::${vask(t)}`);
  writeFileSync(utFil, JSON.stringify({ pinner: resultat.pinner, pinnerFeil: resultat.pinnerFeil }) + '\n');
  for (const { variabel, tjeneste, tag } of resultat.bruk) console.log(`${variabel} ${tjeneste} ${tag}`);
  return 0;
}

async function main() {
  const [kommando, ...rest] = process.argv.slice(2);
  if (kommando === 'velg') {
    if (rest.length !== 2) {
      console.error('Bruk: e2e-pins.mjs velg <pin-fil> <ut-fil>');
      process.exit(2);
    }
    process.exitCode = await velg(rest[0], rest[1], process.env);
    return;
  }
  const iActions = process.env.GITHUB_ACTIONS === 'true';
  try {
    const args = lesArgumenter(process.argv.slice(2));
    const github = lagGitHub({ token: process.env.GH_TOKEN });
    await skriv(args, { github, hent: lagHenter(github), lastNed: lastNedTriggerKontekst, nå: () => Date.now(), logg: (t) => console.log(t) });
  } catch (e) {
    for (const linje of String(e.message).split('\n')) console.error(iActions ? `::error::${vask(linje)}` : linje);
    process.exitCode = 1;
  }
}

// Kjør bare når scriptet startes direkte, ikke når testen importerer funksjonene.
if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  main();
}
