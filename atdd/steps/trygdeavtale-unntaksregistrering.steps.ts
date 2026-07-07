/**
 * Step-definisjoner for trygdeavtale-unntaksregistrering — Lag 2 (lim mellom
 * Gherkin og DSL). Én steps-fil per feature-fil; step-tekstene er unike på tvers
 * av alle steps-filene (globalt step-register).
 *
 * Både «grunn» (nyvurdering) og «bestemmelse» (her) uttrykkes som lesbare norske
 * navn i Lag 1 og mappes til UI-/backend-koder inne i DSL-en — tekniske koder
 * lekker ikke inn i feature-filene.
 */
import { Given, When, Then } from '../fixtures';

Given(
  'en unntaksregistrering for perioden {dato} til {dato}',
  async ({ trygdeavtale }, fom: string, tom: string) => {
    await trygdeavtale.opprettUnntaksregistrering(fom, tom);
  }
);

When(
  'saksbehandler godkjenner unntaket etter {string}',
  async ({ trygdeavtale }, bestemmelse: string) => {
    await trygdeavtale.godkjennUnntak(bestemmelse);
  }
);

When('saksbehandler ikke godkjenner unntaket', async ({ trygdeavtale }) => {
  await trygdeavtale.ikkeGodkjennUnntak();
});

Then('er unntaket registrert med endelig medlemskapsperiode', async ({ trygdeavtale }) => {
  await trygdeavtale.verifiserGodkjentUnntakRegistrert();
});

Then('er saken avsluttet uten medlemskapsperiode', async ({ trygdeavtale }) => {
  await trygdeavtale.verifiserSakAvsluttetUtenUnntak();
});
