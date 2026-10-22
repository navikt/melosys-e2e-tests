#!/usr/bin/env node
/**
 * Leser `.github/e2e-pins.json` og sier hvilke image-tagger E2E Tests skal bytte ut.
 *
 * Fila er et objekt fra tjeneste til tag, for eksempel `{ "melosys-web": "br-39400000000" }`.
 * En tjeneste som fortsatt har `latest` i kjøringen, får taggen i fila. En tjeneste under test
 * (eksplisitt tag fra gaten, dispatch eller «E2E med brancher») beholder sin egen tag.
 *
 * Bruk: e2e-pins.mjs <pin-fil>. Gjeldende tagger leses fra miljøvariablene i TJENESTER. Skriver
 * én linje «<variabel> <tjeneste> <tag>» per pin som brukes. Ugyldig fil gir exit 1.
 * Oppskriften for koblede endringer står i docs/ci-cd/KOBLEDE-ENDRINGER.md.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

/** Samme regel som tag-sjekken i «Determine image tags». */
const DOCKER_TAG = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Tom tekst betyr ingen pinner. Kaster med en melding som kan vises i jobbloggen. */
export function lesPinner(tekst) {
  if (tekst.trim() === '') return {};
  let pinner;
  try {
    pinner = JSON.parse(tekst);
  } catch {
    throw new Error('er ikke gyldig JSON');
  }
  if (pinner === null || typeof pinner !== 'object' || Array.isArray(pinner)) {
    throw new Error('skal være et objekt fra tjeneste til tag, for eksempel {"melosys-web": "br-123"}');
  }
  for (const [tjeneste, tag] of Object.entries(pinner)) {
    if (!(tjeneste in TJENESTER)) {
      throw new Error(`ukjent tjeneste «${tjeneste}». Gyldige: ${Object.keys(TJENESTER).join(', ')}`);
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

function main() {
  const fil = process.argv[2];
  if (!fil) {
    console.error('Bruk: e2e-pins.mjs <pin-fil>');
    process.exit(2);
  }
  if (!existsSync(fil)) return;
  let pinner;
  try {
    pinner = lesPinner(readFileSync(fil, 'utf8'));
  } catch (e) {
    console.error(`${fil} ${e.message}`);
    process.exit(1);
  }
  for (const { variabel, tjeneste, tag } of brukPinner(pinner, process.env)) {
    console.log(`${variabel} ${tjeneste} ${tag}`);
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
