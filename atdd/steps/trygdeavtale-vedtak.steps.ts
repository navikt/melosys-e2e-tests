/**
 * Step-definisjoner for trygdeavtale-vedtak — Lag 2 (lim mellom Gherkin og DSL).
 *
 * Konvensjon (issue 9): én steps-fil per feature-fil, hver step-tekst definert
 * nøyaktig ÉN gang (grep atdd/steps/ før du legger til). Hver binding er en
 * one-liner mot DSL-en. matchKeywords er IKKE aktivert; «Og» arver keyword-typen
 * fra forrige steg (Gitt→Given, Så→Then), så override-steget under registreres som
 * Given og verifikasjons-steget som Then.
 */
import { Given, When, Then } from '../fixtures';

Given('en opprettet trygdeavtale-behandling', async ({ trygdeavtale }) => {
  await trygdeavtale.opprettBehandling();
});

Given('søknaden gjelder perioden {dato} til {dato}', async ({ trygdeavtale }, fom: string, tom: string) => {
  trygdeavtale.oppgiPeriode(fom, tom);
});

When('saksbehandler fatter vedtak med resultat {string}', async ({ trygdeavtale }, resultat: string) => {
  await trygdeavtale.fattVedtak(resultat);
});

Then('blir behandlingen fullført og søknad innvilget', async ({ trygdeavtale }) => {
  await trygdeavtale.verifiserFullført();
});

Then('vedtaket gjelder perioden {dato} til {dato}', async ({ trygdeavtale }, fom: string, tom: string) => {
  await trygdeavtale.verifiserVedtaksperiode(fom, tom);
});
