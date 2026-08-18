import { dslTest as test } from '../../atdd/fixtures';

/**
 * Format-demo (@manual): SAMME TrygdeavtaleDsl som BDD-scenarioene, men Lag 1 er
 * her lesbar TypeScript i stedet for Gherkin. Poenget er å vise konkret at
 * playwright-bdd er BYTTBART — verdien ligger i DSL-/driver-lagene, ikke i
 * feature-fil-innpakningen. Å rive ut playwright-bdd koster da ~10 omskrevne
 * linjer (steg → direkte DSL-kall), som demonstrert her.
 *
 * Tagget @manual så den ikke dupliserer BDD-scenarioets dekning i default-kjøring
 * (grep filtrerer bort @manual). Kjør bevisst:
 *   MANUAL_TESTS=true npx playwright test tests/trygdeavtale/trygdeavtale-vedtak-dsl.spec.ts --project=chromium
 *
 * Fila importerer atdd/fixtures.ts og lastes ved innsamling (collection) i
 * default-suiten — den er dermed også en gratis røyktest på at atdd/-importene
 * laster rent (jf. verifikasjonssteg 5 i planen).
 */
test.describe('Trygdeavtale ATDD — Lag 1 som ren Playwright (format-demo)', () => {
  test('samme DSL, Lag 1 som lesbar TypeScript @manual', async ({ trygdeavtale }) => {
    // Tilsvarer BDD-scenario 2 (eksplisitt oppgitt periode), men uttrykt direkte
    // mot DSL-en. Les det som en spesifikasjon: opprett → oppgi periode → fatt
    // vedtak → verifiser.
    await trygdeavtale.opprettBehandling();
    trygdeavtale.oppgiPeriode('01.01.2024', '31.12.2025');
    await trygdeavtale.fattVedtak('INNVILGET');

    await trygdeavtale.verifiserFullført();
    await trygdeavtale.verifiserVedtaksperiode('01.01.2024', '31.12.2025');
  });
});
