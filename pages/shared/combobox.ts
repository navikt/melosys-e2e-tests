import { expect, Locator } from '@playwright/test';

/**
 * Velg verdi i en Aksel Combobox med enkeltvalg og autocomplete (f.eks. landvelgere).
 * Skriver teksten, venter på at autocomplete har fylt inn treffet, og velger med Enter.
 *
 * @param tekst - Starten av visningsteksten, f.eks. 'Sverige' eller 'Sverige (SE)'
 */
export async function velgIComboboxMedAutocomplete(combobox: Locator, tekst: string): Promise<void> {
  const starterMedTekst = startRegex(tekst);
  await combobox.clear();
  await combobox.pressSequentially(tekst);
  await expect(combobox, `Autocomplete fant ikke «${tekst}»`).toHaveValue(starterMedTekst);
  await combobox.press('Enter');
  await verifiserValgtIComboboxStarterMed(combobox, tekst);
}

/** Valgt verdi i enkeltvalg vises ikke i input-feltet, så sjekk valgt option i listen. */
export async function verifiserValgtIComboboxStarterMed(combobox: Locator, tekst: string): Promise<void> {
  const listeId = await combobox.getAttribute('aria-controls');
  const valgt = combobox
    .page()
    .locator(`[id="${listeId}"]`)
    .getByRole('option', { selected: true, includeHidden: true });
  await expect(valgt, `«${tekst}» ble ikke valgt`).toHaveCount(1);
  await expect(valgt, `«${tekst}» ble ikke valgt`).toHaveText(startRegex(tekst));
}

function startRegex(tekst: string): RegExp {
  return new RegExp(`^${tekst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
}
