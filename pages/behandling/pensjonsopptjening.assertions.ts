import { Page, expect } from '@playwright/test';
import { TIMEOUT_LONG } from '../shared/constants';
import type { PoppRad } from './pensjonsopptjening.page';

/**
 * Assertion methods for PensjonsopptjeningPage.
 *
 * Binder akseptansekriteriene i specs/popp-pensjonsopptjening-visning.md til kode.
 * En `Så`-linje i speken skal alltid ha en tilsvarende `verifiser…()` her.
 */
export class PensjonsopptjeningAssertions {
  constructor(readonly page: Page) {}

  /**
   * Verifiser at seksjonen «Pensjonsopptjening» vises (overskrift synlig).
   */
  async verifiserSeksjonVises(): Promise<void> {
    // Speil POM-ens seksjonOverskrift-locator (level: 2) og bruk samme
    // tidsbudsjett som ventPåSeksjon for å unngå asymmetrisk flake.
    await expect(
      this.page.getByRole('heading', { name: 'Pensjonsopptjening', level: 2 }),
    ).toBeVisible({ timeout: TIMEOUT_LONG });
  }

  /**
   * Verifiser at alle rader har samme kilde-visning.
   *
   * @param kilde - Forventet visningsnavn («Skatt», «Avgiftssystemet», «Melosys»)
   */
  async verifiserAlleRaderHarKilde(rader: PoppRad[], kilde: string): Promise<void> {
    expect(rader.length).toBeGreaterThan(0);
    for (const rad of rader) {
      expect(rad.kilde).toBe(kilde);
    }
  }

  /**
   * Verifiser antall rader som vises for et gitt år.
   */
  async verifiserAntallRaderForAar(
    rader: PoppRad[],
    aar: number,
    forventetAntall: number,
  ): Promise<void> {
    const raderForAar = rader.filter(r => r.aar === aar);
    expect(raderForAar.length).toBe(forventetAntall);
  }

  /**
   * Verifiser at radene for et gitt år inneholder alle forventede kilder.
   *
   * @param kilder - Liste over visningsnavn som skal være representert
   */
  async verifiserRaderInneholderKilder(
    rader: PoppRad[],
    aar: number,
    kilder: string[],
  ): Promise<void> {
    const kilderForAar = rader.filter(r => r.aar === aar).map(r => r.kilde);
    for (const kilde of kilder) {
      expect(kilderForAar).toContain(kilde);
    }
  }

  /**
   * Verifiser monotont synkende år (nyeste øverst). Tillater like år for
   * multi-kilde-rader for samme inntektsår.
   */
  async verifiserNyesteÅrØverst(rader: PoppRad[]): Promise<void> {
    expect(rader.length).toBeGreaterThan(0);
    for (let i = 1; i < rader.length; i++) {
      expect(rader[i - 1].aar).toBeGreaterThanOrEqual(rader[i].aar);
    }
  }

  /**
   * Verifiser at alle viste rader ligger innenfor `[fraAar, tilAar]` (inklusiv).
   * Speilen «inntil 5 år tilbake» i scenario 1, og «tilbake til avregningsåret»
   * i scenario 5.
   */
  async verifiserAarIntervall(
    rader: PoppRad[],
    fraAar: number,
    tilAar: number,
  ): Promise<void> {
    expect(rader.length).toBeGreaterThan(0);
    for (const rad of rader) {
      expect(rad.aar).toBeGreaterThanOrEqual(fraAar);
      expect(rad.aar).toBeLessThanOrEqual(tilAar);
    }
  }

  /**
   * Verifiser at tom-tilstand vises (informasjonsmelding, ingen rader).
   * Eksakt tekst fra bygg.
   */
  async verifiserTomMelding(): Promise<void> {
    await expect(
      this.page.getByText('Ingen pensjonsopptjening registrert i POPP for personen.'),
    ).toBeVisible();
  }

  /**
   * Verifiser at rad for gitt (år, kilde) viser forventede tidsstempler.
   *
   * Brukes for å speile spec-kravet om at hver rad viser «Registrert» og
   * «Oppdatert» pr kilde — spesielt når samme år har flere rader.
   *
   * @param kilde - Visningsnavn («Skatt» / «Avgiftssystemet» / «Melosys»)
   * @param forventet - Forventede dd.MM.yyyy-strenger (eller «—» for null/tom)
   */
  async verifiserRadHarTidsstempler(
    rader: PoppRad[],
    aar: number,
    kilde: string,
    forventet: { registrert: string; oppdatert: string },
  ): Promise<void> {
    const rad = rader.find(r => r.aar === aar && r.kilde === kilde);
    expect(
      rad,
      `Fant ingen rad for år=${aar} kilde="${kilde}" (rader: ${JSON.stringify(rader)})`,
    ).toBeDefined();
    expect(rad!.registrert).toBe(forventet.registrert);
    expect(rad!.oppdatert).toBe(forventet.oppdatert);
  }

  /**
   * Verifiser at type-cellen for en rad har en tooltip med forventet
   * beskrivelse. Strategi: hover/focus trigger-elementet, vent på Aksel
   * Tooltip-popover med role="tooltip", les tekstinnholdet.
   *
   * Aksel `Tooltip` rendrer popover-innholdet utenfor cellen (portal i
   * `<body>`), så vi kan ikke scope locator til cellen — vi henter popoveren
   * fra page-nivå. For å støtte både `describesChild={true}` (popover med
   * role="tooltip") og `describesChild={false}` (aria-label på trigger),
   * leser vi først eksplisitt popover-tekst, faller tilbake til
   * `aria-label`/`title`-attributtet på trigger.
   *
   * @param kilde - Visningsnavn («Skatt» / «Avgiftssystemet» / «Melosys»)
   * @param inntektType - Kode, f.eks. «SUM_PI»
   * @param forventetBeskrivelse - Forventet norsk beskrivelse (substring-match)
   */
  async verifiserTooltipForInntektType(
    aar: number,
    kilde: string,
    inntektType: string,
    forventetBeskrivelse: string,
  ): Promise<void> {
    // Type-cellen er kolonne-indeks 3 (År=0, PGI=1, Kilde=2, Type=3).
    const rader = this.page.locator('tbody').getByRole('row');
    const antall = await rader.count();
    for (let i = 0; i < antall; i++) {
      const rad = rader.nth(i);
      const celler = rad.getByRole('cell');
      const [aarCelle, kildeCelle, typeCelle] = await Promise.all([
        celler.nth(0).textContent(),
        celler.nth(2).textContent(),
        celler.nth(3).textContent(),
      ]);
      const radAar = Number.parseInt((aarCelle ?? '').replace(/\D/g, ''), 10);
      if (
        radAar === aar &&
        (kildeCelle ?? '').trim() === kilde &&
        (typeCelle ?? '').trim() === inntektType
      ) {
        const trigger = celler.nth(3).locator('span, abbr').first();

        // 1) Sjekk om beskrivelsen er på trigger som aria-label eller title
        //    (Aksel `describesChild={false}` eller native `<abbr title>`).
        const ariaLabel = await trigger.getAttribute('aria-label');
        const title = await trigger.getAttribute('title');
        if (ariaLabel?.includes(forventetBeskrivelse) || title?.includes(forventetBeskrivelse)) {
          return;
        }

        // 2) Ellers — hover og let etter popover med role="tooltip"
        //    (Aksel `describesChild={true}` eller default Tooltip).
        await trigger.hover();
        const popover = this.page.getByRole('tooltip').filter({ hasText: forventetBeskrivelse });
        try {
          await expect(popover).toBeVisible({ timeout: 3000 });
        } catch (e) {
          // 3) Siste fallback — sjekk aria-describedby → finn elementet
          const describedby = await trigger.getAttribute('aria-describedby');
          if (describedby) {
            const describedElement = this.page.locator(`#${describedby}`);
            const tekst = await describedElement.textContent();
            expect(
              tekst ?? '',
              `Forventet beskrivelse for ${inntektType} via aria-describedby="${describedby}", ` +
                `men fant tekst="${tekst}".`,
            ).toContain(forventetBeskrivelse);
            return;
          }
          throw new Error(
            `Fant ingen tooltip for ${inntektType} på rad (år=${aar}, kilde=${kilde}). ` +
              `Sjekket: aria-label="${ariaLabel}", title="${title}", role="tooltip" popover, ` +
              `aria-describedby="${describedby}".`,
          );
        }
        return;
      }
    }
    throw new Error(
      `Fant ingen rad med år=${aar}, kilde="${kilde}", inntektType="${inntektType}".`,
    );
  }
}
