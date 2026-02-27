/**
 * Shared constants for E2E tests
 */

// Test user data
export const USER_ID_VALID = "30056928150";
export const USER_ID_KOSOVO = "17016820148";
export const USER_ID_INVALID = "INVALID123";

// Person names (must match mock data)
export const PERSON_NAME_KOSOVO = "SALMANSEN TREIG";
export const ORG_NUMBER_VALID = "999999999";

// URLs
export const BASE_URL = "http://localhost:3000";
export const MELOSYS_URL = `${BASE_URL}/melosys/`;

// Timeouts (ms)
export const TIMEOUT_SHORT = 2000;
export const TIMEOUT_MEDIUM = 5000;
export const TIMEOUT_LONG = 10000;
export const TIMEOUT_API = 15000;

// Common dropdown values
export const SAKSTYPER = {
  FTRL: 'FTRL',
  AVTALELAND: 'AVTALELAND',
  TRYGDEAVTALE: 'TRYGDEAVTALE',
  EU_EOS: 'EU_EOS',
} as const;

export const SAKSTEMA = {
  MEDLEMSKAP_LOVVALG: 'MEDLEMSKAP_LOVVALG',
} as const;

export const BEHANDLINGSTEMA = {
  YRKESAKTIV: 'YRKESAKTIV',
  SELVSTENDIG: 'SELVSTENDIG',
  UTSENDT_ARBEIDSTAKER: 'UTSENDT_ARBEIDSTAKER',
  ARBEID_FLERE_LAND: 'ARBEID_FLERE_LAND',
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
  NORGE: 'Norge',
} as const;
