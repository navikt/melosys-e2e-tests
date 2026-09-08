import { APIRequestContext, Page, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { withDatabase } from '../../helpers/db-helper';
import { UnntaksperiodeKontrollKall } from './registrering-unntaksperiode.page';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), override: true });

const API_BASE_URL = process.env.MELOSYS_API_BASE_URL || 'http://localhost:8080/api';

/** Assertions for «Registrering av unntaksperioder» og kontroll-endepunktet skjermen kaller. */
export class RegistreringUnntaksperiodeAssertions {
  constructor(private readonly page: Page) {}

  /**
   * Treff i registerkontrollen er forutsetningen for hele skjermen: uten treff
   * registreres unntaket automatisk, og saksbehandler ser aldri UI-et.
   *
   * @param treffTekst - Kontrollbegrunnelsen, f.eks. «Periodelengde er mer enn 24 måneder»
   */
  async verifiserRegisterkontrolltreff(treffTekst: string): Promise<void> {
    await expect(
      this.page.getByText('Treff ved automatisk kontroll'),
      'Registerkontrollen skal ha gitt treff (ellers ville behandlingen blitt registrert automatisk)'
    ).toBeVisible({ timeout: 30000 });

    await expect(
      this.page.getByText(treffTekst),
      `Forventet kontrollbegrunnelsen «${treffTekst}»`
    ).toBeVisible({ timeout: 15000 });

    console.log(`✅ Registerkontrolltreff bekreftet: «${treffTekst}»`);
  }

  /**
   * Asserter på HTTP-kontrakten, ikke på UI: `KontrollFeilSelector` i melosys-web
   * leser `data.kontrollfeilList`, mens ExceptionMapper svarer med `feilkoder`, så
   * kontrollfeilene når aldri skjermen.
   *
   * @param periode - Forventet periode i ISO-format
   * @param forventetStatus - 400 for en periode som bryter regelsettet, 204 for en gyldig
   */
  async verifiserKontrollForPeriode(
    kall: UnntaksperiodeKontrollKall[],
    periode: { fom: string; tom: string },
    forventetStatus: number
  ): Promise<void> {
    const forventetBody = `{"periodeFom":"${periode.fom}","periodeTom":"${periode.tom}"}`;
    // Kallet er sendt av en useEffect som kan fyre etter at feltet er synlig, og svaret kommer
    // enda senere. Et øyeblikksbilde av listen ville lest `status: undefined` på en treg maskin.
    await expect
      .poll(() => kall.filter(k => k.body === forventetBody).map(k => k.status), {
        timeout: 20000,
        message: `Kontrollen skal svare ${forventetStatus} på perioden ${periode.fom} – ${periode.tom}. ` +
          `Observerte kall: ${JSON.stringify(kall)}`
      })
      .toContain(forventetStatus);
    console.log(`✅ Kontroll ${periode.fom} – ${periode.tom} → ${forventetStatus}`);
  }

  verifiserIngenUgyldigDatoSendt(kall: UnntaksperiodeKontrollKall[]): void {
    const ugyldige = kall.filter(k => k.body.includes('Invalid date'));
    expect(
      ugyldige.map(k => k.body),
      'melosys-web skal ikke sende den ugyldige verdien «Invalid date» til unntaksperiode-kontrollen'
    ).toEqual([]);
    console.log(`✅ Ingen av ${kall.length} kontrollkall inneholdt «Invalid date»`);
  }

  /**
   * Færre kontrollkall enn tastetrykk viser at guarden stopper noe. Den garanterte
   * stoppen er det ledende «0», som aldri kan parses; de øvrige mellomtilstandene
   * avhenger av måned og år. Assertionen som faktisk pinner feilen er
   * `verifiserIngenUgyldigDatoSendt` — denne er et supplerende signal, ikke beviset.
   */
  verifiserUgyldigeTastetrykkStoppet(antallSendt: number, dato: string): void {
    expect(
      antallSendt,
      'Kontrollen skal ha blitt kalt mens datoen ble skrevet, ellers måler ikke testen noe'
    ).toBeGreaterThan(0);
    expect(
      antallSendt,
      `Minst ett av de ${dato.length} tastetrykkene i «${dato}» gir en uparsebar dato og skal stoppes i frontend`
    ).toBeLessThan(dato.length);
    console.log(`✅ ${dato.length - antallSendt} av ${dato.length} tastetrykk stoppet i frontend (ugyldig dato)`);
  }

  /**
   * En periode over 24 måneder er en forventet 400 med feilkoder; det er 5xx som er feilen.
   *
   * Ubesvarte kall avvises særskilt: uten den sjekken ville et kall som ennå ikke har svart
   * telle som «ingen serverfeil», og en 500 som kom for sent gå upåaktet hen.
   */
  verifiserIngenServerfeil(kall: UnntaksperiodeKontrollKall[]): void {
    const ubesvarte = kall.filter(k => k.status === undefined);
    expect(
      ubesvarte.map(k => k.body),
      'Alle kontrollkall skal være besvart før statusene vurderes'
    ).toEqual([]);
    const serverfeil = kall.filter(k => k.status! >= 500);
    expect(
      serverfeil.map(k => `${k.status}: ${k.body}`),
      'Kontrollen skal aldri gi 5xx — en tastefeil er en klientfeil'
    ).toEqual([]);
    console.log(`✅ Ingen serverfeil i ${kall.length} kontrollkall`);
  }

  /**
   * Perioden saksbehandler registrerte skal ha overstyrt perioden fra SED-en.
   *
   * LOVVALG_PERIODE.BEH_RESULTAT_ID peker på BEHANDLINGSRESULTAT, som er nøklet
   * på BEHANDLING_ID — behandlingID kan derfor brukes direkte.
   *
   * @param fom - Forventet startdato på formatet dd.MM.yyyy
   * @param tom - Forventet sluttdato på formatet dd.MM.yyyy
   */
  async verifiserEndretPeriodeLagret(behandlingID: number, fom: string, tom: string): Promise<void> {
    await withDatabase(async (db) => {
      const periode = await db.queryOne<{ FOM: string; TOM: string }>(
        `SELECT TO_CHAR(FOM_DATO, 'DD.MM.YYYY') AS FOM, TO_CHAR(TOM_DATO, 'DD.MM.YYYY') AS TOM
         FROM LOVVALG_PERIODE
         WHERE BEH_RESULTAT_ID = :behandlingID
         ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY`, { behandlingID });
      expect(periode, `Forventet en lovvalgsperiode for behandling ${behandlingID}`).not.toBeNull();
      expect(periode!.FOM, 'Startdato skal være den saksbehandler registrerte').toBe(fom);
      expect(periode!.TOM, 'Sluttdato skal være datoen saksbehandler registrerte, ikke datoen fra SED-en').toBe(tom);
      console.log(`✅ Endret periode lagret: ${periode!.FOM} – ${periode!.TOM}`);
    });
  }

  /**
   * Kalles direkte mot melosys-api fordi frontenden ikke sender slike verdier:
   * en ugyldig datostreng skal gi 400 med sanert melding, ikke 500 med stacktrace.
   *
   * Deserialiseringen feiler før tilgangskontrollen, så svaret er det samme for enhver
   * behandlingID. Behandlingen i testen brukes likevel, slik at kallet er realistisk.
   */
  async verifiserApiAvviserUgyldigDato(request: APIRequestContext, behandlingID: number): Promise<void> {
    expect(
      process.env.LOCAL_AUTH_TOKEN,
      'LOCAL_AUTH_TOKEN mangler. Uten den svarer endepunktet 401, og feilen ser ut som en api-feil.'
    ).toBeTruthy();

    const response = await request.post(
      `${API_BASE_URL}/kontroll/${behandlingID}/unntaksperiode`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.LOCAL_AUTH_TOKEN}`,
        },
        data: '{"periodeFom":"2026-01-01","periodeTom":"Invalid date"}',
      }
    );

    const body = await response.text();
    expect(
      response.status(),
      `Ugyldig dato skal gi 400 (klientfeil), ikke ${response.status()}. Body: ${body}`
    ).toBe(400);
    expect(body, 'Responsen skal ikke gjengi den ugyldige inputverdien').not.toContain('Invalid date');
    expect(body, 'Responsen skal ikke lekke interne klassenavn').not.toContain('no.nav.melosys');
    expect(JSON.parse(body).message).toBe('Ugyldig format på forespørselen');

    console.log('✅ melosys-api avviser ugyldig dato med 400 og sanert melding');
  }
}
