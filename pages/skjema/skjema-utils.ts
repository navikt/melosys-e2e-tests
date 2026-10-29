import { Page, expect } from '@playwright/test';

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

/**
 * Første skjema-steg: velg land og standard utsendingsperiode, og gå videre til `nesteUrl`.
 *
 * Når perioden er fylt ut, slår skjema-web opp arbeidsforholdet i AAREG (POST .../aareg-sjekk).
 * Mangler arbeidsforholdet hos arbeidsgiveren, vises et varsel som ikke stopper innsendingen.
 * Med `aaregVarsel` venter steget på oppslaget og verifiserer om varselet vises.
 */
export async function fyllUtsendingsperiodeOgLand(
  page: Page,
  land: string,
  nesteUrl: RegExp,
  aaregVarsel?: 'vises' | 'vises-ikke'
): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Utenlandsperiode og land' })).toBeVisible();
  await page.getByLabel('I hvilket land skal arbeidet utføres?').selectOption({ label: land });

  const aaregSjekk = aaregVarsel
    ? page.waitForResponse((r) => r.url().includes('/aareg-sjekk') && r.ok(), { timeout: 15000 })
    : undefined;
  const { fraDato, tilDato } = standardUtsendingsperiode();
  await page.getByRole('textbox', { name: 'Fra dato' }).fill(fraDato);
  await page.getByRole('textbox', { name: 'Til dato' }).fill(tilDato);

  if (aaregSjekk) {
    await aaregSjekk;
    const varsel = page.getByRole('alert').filter({ hasText: 'Arbeidsforholdet er ikke registrert' });
    if (aaregVarsel === 'vises') {
      await expect(varsel).toBeVisible();
    } else {
      await expect(varsel).toHaveCount(0);
    }
  }

  await lagreOgFortsett(page, nesteUrl);
}

/** Navn på arbeidsstedet som oppgis i den statlige flyten. */
export const STATLIG_ARBEIDSSTED_NAVN = 'Norges ambassade';

/**
 * Arbeidssted i utlandet når arbeidsgiveren er statlig (MELOSYS-7694). Arbeidet skjer alltid på
 * land, så steget har verken valg av arbeidsstedstype eller spørsmål om hjemmekontor. Samme
 * felter vises i arbeidsgivers del og når en statsansatt fyller ut arbeidstakers del først.
 */
export async function fyllArbeidsstedForStatligArbeidsgiver(page: Page, nesteUrl: RegExp): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Arbeidssted i utlandet', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Hvor skal arbeidet utføres?')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Navn på virksomheten' }).fill(STATLIG_ARBEIDSSTED_NAVN);
  await page.getByRole('radio', { name: 'Fast arbeidssted' }).check();
  await page.getByRole('textbox', { name: 'Gate/vei' }).fill('Rauchstraße');
  await page.getByRole('textbox', { name: 'Nummer' }).fill('1');
  await page.getByRole('textbox', { name: 'Postkode' }).fill('10787');
  await page.getByRole('textbox', { name: 'By/sted/region' }).fill('Berlin');
  await expect(page.getByRole('radiogroup', { name: /hjemmekontor/ })).toHaveCount(0);
  await lagreOgFortsett(page, nesteUrl);
}

/** Klikk «Lagre og fortsett» og vent på neste steg-URL. */
export async function lagreOgFortsett(page: Page, nesteUrl: RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Lagre og fortsett' }).click();
  await page.waitForURL(nesteUrl);
}

/**
 * Klikk «Start søknad» på oversikten, bekreft på introsiden (/skjema/start) og vent på første
 * skjema-steg. Utkastet opprettes først når introsiden er bekreftet (skjema-web #671).
 */
export async function startSoknadViaIntroside(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start søknad' }).click();
  await page.waitForURL(/\/skjema\/start(\?|$)/);
  await page.getByRole('checkbox', { name: /Jeg bekrefter/ }).check();
  await page.getByRole('button', { name: 'Start søknad' }).click();
  await page.waitForURL(/\/skjema\/[^/]+\/utsendingsperiode-og-land/);
}
