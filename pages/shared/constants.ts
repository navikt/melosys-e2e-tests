/**
 * Shared constants for E2E tests
 */

// Test user data
export const USER_ID_VALID = "30056928150";
export const USER_ID_INVALID = "INVALID123";
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
} as const;

export const SAKSTEMA = {
  MEDLEMSKAP_LOVVALG: 'MEDLEMSKAP_LOVVALG',
} as const;

export const BEHANDLINGSTEMA = {
  YRKESAKTIV: 'YRKESAKTIV',
  SELVSTENDIG: 'SELVSTENDIG',
} as const;

export const AARSAK = {
  SØKNAD: 'SØKNAD',
} as const;
