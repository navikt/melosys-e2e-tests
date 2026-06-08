import { APIRequestContext } from '@playwright/test';

const TRYGDEAVGIFT_BEREGNING_BASE_URL = 'http://localhost:8095';

interface MinstebeløpResponse {
  aar: number;
  beloep: number;
}

/**
 * Henter årlig minstebeløp for trygdeavgift fra melosys-trygdeavgift-beregning.
 *
 * Minstebeløpet er G-relativt og endrer seg år for år. Tester som trenger å
 * være sikker på at en inntekt ligger trygt under eller over minstebeløpet
 * bør hente faktisk verdi via denne, i stedet for å hardkode tall som kan
 * bli feil ved G-justering.
 *
 * Endepunktet er @Unprotected i melosys-trygdeavgift-beregning.
 */
export async function hentMinstebeløp(
  request: APIRequestContext,
  aar: number,
): Promise<number> {
  const response = await request.get(
    `${TRYGDEAVGIFT_BEREGNING_BASE_URL}/api/v2/minstebeloep/${aar}`,
  );
  if (!response.ok()) {
    throw new Error(
      `Kunne ikke hente minstebeløp for år ${aar}: HTTP ${response.status()}`,
    );
  }
  const body = (await response.json()) as MinstebeløpResponse;
  return body.beloep;
}
