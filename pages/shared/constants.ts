/**
 * Shared constants for E2E tests
 */

// Test user data
export const USER_ID_VALID = "30056928150";
export const USER_ID_KOSOVO = "17016820148";
export const USER_ID_INVALID = "INVALID123";

// Person names (must match mock data)
export const PERSON_NAME_KOSOVO = "SALMANSEN TREIG";
export const BRUKERNAVN_VALID = "TRIVIELL KARAFFEL";
export const ORG_NUMBER_VALID = "999999999";

// URLs
export const BASE_URL = "http://localhost:3000";
export const MELOSYS_URL = `${BASE_URL}/melosys/`;

// Foregående år (kalenderår). Brukes for medlemskaps-/søknadsperioder i tester
// av automatisk årsavregning, der avgiftspliktig periode MÅ ligge i et foregående
// år for at årsavregning skal opprettes automatisk (jf. MELOSYS-7828). Beregnes
// dynamisk slik at testene ikke ruster når årstallet ruller over.
export const FORRIGE_AAR = new Date().getFullYear() - 1;

// Timeouts (ms)
export const TIMEOUT_SHORT = 2000;
export const TIMEOUT_MEDIUM = 5000;
export const TIMEOUT_LONG = 10000;
export const TIMEOUT_API = 15000;
export const TIMEOUT_VEDTAK = 60000;

// Common dropdown values
export const SAKSTYPER = {
  FTRL: 'FTRL',
  AVTALELAND: 'AVTALELAND',
  TRYGDEAVTALE: 'TRYGDEAVTALE',
  EU_EOS: 'EU_EOS',
} as const;

export const SAKSTEMA = {
  MEDLEMSKAP_LOVVALG: 'MEDLEMSKAP_LOVVALG',
  TRYGDEAVGIFT: 'TRYGDEAVGIFT',
} as const;

export const BEHANDLINGSTEMA = {
  YRKESAKTIV: 'YRKESAKTIV',
  SELVSTENDIG: 'SELVSTENDIG',
  UTSENDT_ARBEIDSTAKER: 'UTSENDT_ARBEIDSTAKER',
  ARBEID_FLERE_LAND: 'ARBEID_FLERE_LAND',
  ARBEID_TJENESTEPERSON_ELLER_FLY: 'ARBEID_TJENESTEPERSON_ELLER_FLY',
  PENSJONIST: 'PENSJONIST',
} as const;

export const AARSAK = {
  SØKNAD: 'SØKNAD',
} as const;

export const BEHANDLINGSTYPE = {
  ÅRSAVREGNING: 'ÅRSAVREGNING',
} as const;

// Trygdeavtale constants
export const ARBEIDSLAND = {
  AUSTRALIA: 'AU',
  SWEDEN: 'SE',
  DENMARK: 'DK',
  FINLAND: 'FI',
  ICELAND: 'IS',
} as const;

export const BESTEMMELSER = {
  // Australia
  AUS_ART9_3: 'AUS_ART9_3',
  // Sweden
  SWE_ART10_1: 'SWE_ART10_1',
  // Add more as needed
} as const;

// EU/EØS constants
export const EU_EOS_LAND = {
  DANMARK: 'Danmark',
  SVERIGE: 'Sverige',
  FINLAND: 'Finland',
  TYSKLAND: 'Tyskland',
  FRANKRIKE: 'Frankrike',
  NEDERLAND: 'Nederland',
  ESTLAND: 'Estland',
  BELGIA: 'Belgia',
  BULGARIA: 'Bulgaria',
  NORGE: 'Norge',
  // Ikke-EESSI-land som brukes i arbeid-i-flere-land-saker
  FAROEYENE: 'Færøyene',
  GRONLAND: 'Grønland',
} as const;

// EU/EØS lovvalgsbestemmelser (synlig tekst i lovvalgssteget)
export const EU_EOS_LOVVALG = {
  // Offentlig tjenesteperson, jf. rfo. 883/2004 art.11(3)(b) (FO_883_2004_ART11_3B)
  ART_11_3_B: 'Rfo. 883/2004 art.11(3)(b)',
} as const;

// POPP-kilde-enum (verbatim — slik POPP-API leverer dem, jf. MELOSYS-8073).
export const POPP_KILDE = {
  SKATT: 'SKATT',
  AVGIFTSSYSTEMET: 'AVGIFTSSYSTEMET',
  MELOSYS: 'MELOSYS',
} as const;

// POPP-kilde slik den vises i UI (verbatim — bygg bekrefter visningsnavn).
export const POPP_KILDE_VISNING = {
  SKATT: 'Skatt',
  AVGIFTSSYSTEMET: 'Avgiftssystemet',
  MELOSYS: 'Melosys',
} as const;
