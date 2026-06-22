import { test, expect } from '@playwright/test';
import { SkjemaAuthHelper } from '../../helpers/skjema-auth-helper';

/**
 * Røyktest for melosys-skjema-web (digital «Utsendt arbeidstaker»-søknad).
 *
 * Dette er den FØRSTE e2e-testen mot skjema-stacken (melosys-skjema-web +
 * melosys-skjema-api), lagt til docker-compose under "skjema"-profilen.
 *
 * Hva den verifiserer (hele kjeden, uten testdata-fixtures):
 *   wonderwall auto-login → mock-oauth2 (innbygger/ID-porten)
 *   → skjema-web SPA → BFF TokenX-veksling → skjema-api er oppe og svarer.
 *
 * Den bruker BEVISST ren @playwright/test og IKKE ../fixtures: standard-fixturen
 * gjør Oracle-cleanup, Unleash-reset og melosys-api docker-logg-skanning som er
 * irrelevant (og støyende) for en ren skjema-web-frontendtest. Tester som faktisk
 * berører melosys-api/Oracle (Kafka-mottak → sak/behandling) tar inn fixturen.
 *
 * Krever stacken oppe: cd ../melosys-docker-compose && make dev-skjema
 */
test.describe('skjema-web røyktest', () => {
  test('innbygger kan logge inn og starte søknad (DEG SELV)', async ({ page }) => {
    const auth = new SkjemaAuthHelper(page);

    // Steg 1: logg inn som innbygger → rollevalg-siden.
    await auth.login('12928056706'); // LANSEN LANSANSEN — arbeidstaker NOR → Frankrike

    // Steg 2: rollevalget viser de fire representasjonstypene.
    await expect(page.getByRole('heading', { name: 'Hvem skal du opptre som?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'DEG SELV' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /ARBEIDSGIVER/ })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /RÅDGIVER/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /PRIVATPERSON/ })).toBeVisible();

    // Steg 3: velg "DEG SELV" → oversiktssiden for søknader.
    await page.getByRole('button', { name: 'DEG SELV' }).click();
    await page.waitForURL(/\/oversikt/, { timeout: 30000 });

    // Oversikten lastes (henter utkast/innsendte fra skjema-api via BFF) og viser
    // inngangen til en ny søknad.
    await expect(page.getByRole('heading', { name: 'Oversiktsside for søknader' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start søknad' })).toBeVisible();
  });
});
