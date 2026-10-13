/**
 * Enhetstester for assertErrors: bare elementer med tekst er feil. melosys-web har tomme
 * `role="alert"`-beholdere (MultiSelect), og siden kan navigere bort mellom to lesinger.
 *
 * Kjør: npm run test:unit
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import type { Locator, Page } from '@playwright/test';
import { assertErrors } from '../utils/assertions';

const ALERT = '[role="alert"]';
const FELTFEIL = '.aksel-error-message';
// Selektorene assertFieldErrors og assertErrorSummary bruker når feil forventes.
const FELTFEIL_SAMLET = '.skjemaelement__feilmelding, .aksel-error-message, .feilmelding';
const OPPSUMMERING_SAMLET = '.alertstripe--advarsel, .aksel-alert--error, [role="alert"]';

/** Side der hver selektor treffer elementer med de gitte tekstene. */
function side(treffPerSelektor: Record<string, string[]>, forsvinnerFørLesing = false): Page {
  const locator = (selector: string) => {
    const treff = treffPerSelektor[selector] ?? [];
    const element = (i: number) => ({
      // Som Playwright: venter på et element som er borte, til timeouten slår til.
      textContent: async () => {
        if (forsvinnerFørLesing) throw new Error('locator.textContent: Timeout 10000ms exceeded.');
        return treff[i];
      },
    });
    return {
      count: async () => treff.length,
      first: () => element(0),
      nth: (i: number) => element(i),
      allTextContents: async () => (forsvinnerFørLesing ? [] : treff),
    } as unknown as Locator;
  };
  return { locator } as unknown as Page;
}

describe('assertErrors(scope, [])', () => {
  test('tom alert-beholder er ikke en feil', async () => {
    await assertErrors(side({ [ALERT]: [''] }), []);
  });

  test('alert med bare mellomrom og linjeskift er ikke en feil', async () => {
    await assertErrors(side({ [ALERT]: [' \n  '] }), []);
  });

  test('alert som forsvinner før den leses, er ikke en feil', async () => {
    await assertErrors(side({ [ALERT]: ['Noe gikk galt'] }, true), []);
  });

  test('alert med tekst er en feil, og teksten står i meldingen', async () => {
    await assert.rejects(assertErrors(side({ [ALERT]: ['Noe gikk galt'] }), []), /Noe gikk galt/);
  });

  test('tom feltfeil er ikke en feil', async () => {
    await assertErrors(side({ [FELTFEIL]: [''] }), []);
  });

  test('feltfeil som forsvinner før den leses, er ikke en feil', async () => {
    await assertErrors(side({ [FELTFEIL]: ['Feltet er påkrevd'] }, true), []);
  });

  test('feltfeil med tekst er en feil', async () => {
    await assert.rejects(
      assertErrors(side({ [FELTFEIL]: ['Feltet er påkrevd'] }), []),
      /1 field error\(s\):\n {2}1\. Feltet er påkrevd/
    );
  });
});

describe('assertErrors(scope, [forventet])', () => {
  test('finner feilen selv om en tom alert-beholder står først', async () => {
    await assertErrors(
      side({ [FELTFEIL_SAMLET]: ['Ugyldig dato'], [OPPSUMMERING_SAMLET]: ['', 'Ugyldig dato'] }),
      [/Ugyldig dato/]
    );
  });

  test('finner feilen i en senere boks når den første har annen tekst', async () => {
    await assertErrors(
      side({ [FELTFEIL_SAMLET]: ['Ugyldig dato'], [OPPSUMMERING_SAMLET]: ['Lagret', 'Ugyldig dato'] }),
      [/Ugyldig dato/]
    );
  });

  test('feiler når ingen oppsummering inneholder feilen', async () => {
    await assert.rejects(
      assertErrors(
        side({ [FELTFEIL_SAMLET]: ['Ugyldig dato'], [OPPSUMMERING_SAMLET]: ['', 'Noe annet'] }),
        [/Ugyldig dato/]
      ),
      /Expected error summary to match/
    );
  });
});
