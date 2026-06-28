import { Page } from '@playwright/test';

/**
 * Delte hjelpere for «Utsendt arbeidstaker»-søknaden i melosys-skjema-web.
 *
 * Brukes av både DEG SELV-POM-en (soknad-utsendt-arbeidstaker.page.ts) og
 * arbeidsgiver-POM-en (soknad-arbeidsgiver.page.ts). Holdes som frittstående
 * funksjoner (ikke metoder) slik at begge POM-ene kan dele dem uten arv.
 */

/** dd.mm.yyyy — formatet Aksel DatePicker forventer på norsk. */
export function ddmmyyyy(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/**
 * En utsendingsperiode godt innenfor 24-måneders-grensen, beregnet relativt til i dag
 * (1. i neste måned → +6 måneder) så testen ikke ruster. Begge skjemadeler i en
 * kobling-test (T3) må dele EN periode for å overlappe — beregn én gang og send inn.
 */
export function standardUtsendingsperiode(): { fraDato: string; tilDato: string } {
  const fra = new Date();
  fra.setMonth(fra.getMonth() + 1, 1);
  const til = new Date(fra);
  til.setMonth(til.getMonth() + 6);
  return { fraDato: ddmmyyyy(fra), tilDato: ddmmyyyy(til) };
}

/**
 * Svar på en Aksel RadioGroup. Aksel rendrer `<fieldset role="radiogroup">` med legend
 * som tilgjengelig navn — id-er er dynamiske, så vi scoper på legend og velger radioen
 * på dens tilgjengelige navn.
 */
export async function svarRadio(page: Page, gruppe: RegExp, svar: string): Promise<void> {
  await page.getByRole('radiogroup', { name: gruppe }).getByRole('radio', { name: svar }).check();
}

/** Klikk «Lagre og fortsett» og vent på neste steg-URL. */
export async function lagreOgFortsett(page: Page, nesteUrl: RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Lagre og fortsett' }).click();
  await page.waitForURL(nesteUrl);
}
