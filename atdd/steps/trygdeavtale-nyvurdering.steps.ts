/**
 * Step-definisjoner for trygdeavtale-nyvurdering — Lag 2 (lim mellom Gherkin og DSL).
 *
 * Én steps-fil per feature-fil; hver step-tekst er unik på tvers av alle steps-
 * filer (playwright-bdd sitt step-register er globalt). «Og» arver keyword-typen
 * fra forrige steg: «Og fatter nytt vedtak ...» er en Når-fortsettelse (When),
 * «Og medlemskapsperioden ...» er en Så-fortsettelse (Then).
 *
 * Merk: den lesbare norske grunnen «nye opplysninger» mappes til backend-enumen
 * NYE_OPPLYSNINGER inne i DSL-en — enumer lekker ikke inn i feature-fila.
 */
import { Given, When, Then } from '../fixtures';

Given(
  'en innvilget trygdeavtale-behandling for perioden {dato} til {dato}',
  async ({ trygdeavtale }, fom: string, tom: string) => {
    await trygdeavtale.opprettInnvilgetBehandling(fom, tom);
  }
);

When(
  'saksbehandler oppretter en nyvurdering med forkortet periode til {dato}',
  async ({ trygdeavtale }, nyTilOgMed: string) => {
    await trygdeavtale.opprettNyvurderingMedForkortetPeriode(nyTilOgMed);
  }
);

When('fatter nytt vedtak med grunn {string}', async ({ trygdeavtale }, grunn: string) => {
  await trygdeavtale.fattNyttVedtak(grunn);
});

Then(
  'er nyvurderingen fullført med perioden {dato} til {dato}',
  async ({ trygdeavtale }, fom: string, tom: string) => {
    await trygdeavtale.verifiserNyvurderingFullført(fom, tom);
  }
);

Then(
  'medlemskapsperioden er erstattet med sluttdato {dato}',
  async ({ trygdeavtale }, nyTilOgMed: string) => {
    await trygdeavtale.verifiserMedlPeriodeErstattet(nyTilOgMed);
  }
);
