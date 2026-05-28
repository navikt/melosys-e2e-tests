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

/**
 * InntektTypeCode (verbatim — fra
 * no.nav.popp.domain.codestable.InntektTypeCode).
 *
 * Kun PGI-relevante typer + SUM_PI er listet her — det er hva
 * `PensjonsopptjeningOppslag` slipper gjennom whitelist-filteret. Andre koder
 * (INN_*, SJO_*, UTE_*, DIP_*, RED_INT, AI, PI66, PGI_NAV) er bevisst
 * utelatt og filtreres bort i api-laget.
 */
export const POPP_INNTEKT_TYPE = {
  SUM_PI: 'SUM_PI',
  FL_PGI_LOENN: 'FL_PGI_LOENN',
  FL_PGI_LOENN_PD: 'FL_PGI_LOENN_PD',
  FL_PGI_NAERING: 'FL_PGI_NAERING',
  FL_PGI_NAERING_FFF: 'FL_PGI_NAERING_FFF',
  KSL_PGI_LOENN: 'KSL_PGI_LOENN',
  KSL_PGI_LOENN_PD: 'KSL_PGI_LOENN_PD',
  KSL_PGI_NAERING: 'KSL_PGI_NAERING',
  KSL_PGI_NAERING_FFF: 'KSL_PGI_NAERING_FFF',
  SVA_PGI_LOENN: 'SVA_PGI_LOENN',
  SVA_PGI_LOENN_PD: 'SVA_PGI_LOENN_PD',
  SVA_PGI_NAERING: 'SVA_PGI_NAERING',
  SVA_PGI_NAERING_FFF: 'SVA_PGI_NAERING_FFF',
} as const;

/**
 * Forventede dekode-strenger for inntektType-kodene — verbatim fra mockens
 * `INNTEKT_TYPE_DEKODE`-map (`PoppInntektApi.kt`), som speiler Javadoc-en i
 * `no.nav.popp.domain.codestable.InntektTypeCode`.
 *
 * Web rendrer `periode.inntektTypeDekode || periode.inntektType` direkte i
 * «Pensjonsgivende inntektstype»-kolonnen. Mocken auto-fyller dekode både i
 * default-radene og i seed-endepunktet hvis kaller ikke oppgir egen verdi,
 * så testen kan stole på at disse strengene faktisk havner i UI-cellen.
 */
export const POPP_INNTEKT_TYPE_BESKRIVELSE: Record<string, string> = {
  SUM_PI: 'Sum pensjonsgivende inntekt',
  AI: 'Antatt inntekt',
  PI66: 'Pensjonsgivende inntekt 1966 - Konv',
  PGI_NAV: 'PGI innland fastsatt av NAV',
  RED_INT: 'Reduksjonsinntekt',
  INN_LON: 'Innenlandsinntekt - Lønn',
  INN_SEL: 'Innenlandsinntekt - Selvstendig',
  INN_JSF: 'Innenlandsinntekt - Jord/Skog/Fisk',
  SJO_LON: 'Sjøinntekt - Lønn',
  SJO_SEL: 'Sjøinntekt - Selvstendig',
  SJO_JSF: 'Sjøinntekt - Jord/Skog/Fisk',
  UTE_LON: 'Utenlandsinntekt - Lønn',
  UTE_SEL: 'Utenlandsinntekt - Selvstendig',
  UTE_JSF: 'Utenlandsinntekt - Jord/Skog/Fisk',
  SVA_LON: 'Svalbardinntekt - Lønn',
  SVA_SEL: 'Svalbardinntekt - Selvstendig',
  SVA_JSF: 'Svalbardinntekt - Jord/Skog/Fisk',
  DIP_LON: 'Diplomatinntekt - Lønn',
  DIP_SEL: 'Diplomatinntekt - Selvstendig',
  DIP_JSF: 'Diplomatinntekt - Jord/Skog/Fisk',
  FL_PGI_LOENN: 'Fastland pensjonsgivende inntekt av lønnsinntekt',
  FL_PGI_LOENN_PD: 'Fastland pensjonsgivende inntekt av lønnsinntekt bare pensjonsdel',
  FL_PGI_NAERING: 'Fastland pensjonsgivende inntekt av næringsinntekt',
  FL_PGI_NAERING_FFF: 'Fastland pensjonsgivende inntekt av næringsinntekt fra fiske, fangst eller familiebarnehage',
  KSL_PGI_LOENN: 'Kildeskatt på lønn pensjonsgivende inntekt av lønnsinntekt',
  KSL_PGI_LOENN_PD: 'Kildeskatt på lønn pensjonsgivende inntekt av lønnsinntekt bare pensjonsdel',
  KSL_PGI_NAERING: 'Kildeskatt på lønn pensjonsgivende inntekt av næringsinntekt',
  KSL_PGI_NAERING_FFF: 'Kildeskatt på lønn pensjonsgivende inntekt av næringsinntekt fra fiske, fangst eller familiebarnehage',
  SVA_PGI_LOENN: 'Svalbard pensjonsgivende inntekt av lønnsinntekt',
  SVA_PGI_LOENN_PD: 'Svalbard pensjonsgivende inntekt av lønnsinntekt bare pensjonsdel',
  SVA_PGI_NAERING: 'Svalbard pensjonsgivende inntekt av næringsinntekt',
  SVA_PGI_NAERING_FFF: 'Svalbard pensjonsgivende inntekt av næringsinntekt fra fiske, fangst eller familiebarnehage',
};
