/**
 * Enhetstester for assertErrors(scope, []): bare elementer med tekst er feil. melosys-web har
 * tomme `role="alert"`-beholdere (MultiSelect), og siden kan navigere bort mellom to lesinger.
 *
 * Kjør: npm run test:unit
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import type { Locator, Page } from '@playwright/test';
import { assertErrors } from '../utils/assertions';

/** Side der selektoren `[role="alert"]` treffer elementer med de gitte tekstene. */
function sideMedAlerts(tekster: string[], forsvinnerFørLesing = false): Page {
  const locator = (selector: string) => {
    const treff = selector === '[role="alert"]' ? tekster : [];
    const element = {
      // Som Playwright: venter på et element som er borte, til timeouten slår til.
      textContent: async () => {
        if (forsvinnerFørLesing) throw new Error('locator.textContent: Timeout 10000ms exceeded.');
        return treff[0];
      },
    };
    return {
      count: async () => treff.length,
      first: () => element,
      nth: () => element,
      allTextContents: async () => (forsvinnerFørLesing ? [] : treff),
    } as unknown as Locator;
  };
  return { locator } as unknown as Page;
}

describe('assertErrors(scope, [])', () => {
  test('tom alert-beholder er ikke en feil', async () => {
    await assertErrors(sideMedAlerts(['']), []);
  });

  test('alert som forsvinner før den leses, er ikke en feil', async () => {
    await assertErrors(sideMedAlerts(['Noe gikk galt'], true), []);
  });

  test('alert med tekst er en feil, og teksten står i meldingen', async () => {
    await assert.rejects(assertErrors(sideMedAlerts(['Noe gikk galt']), []), /Noe gikk galt/);
  });
});
