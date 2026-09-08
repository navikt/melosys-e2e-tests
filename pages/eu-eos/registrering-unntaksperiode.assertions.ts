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
  verifiserKontrollForPeriode(
    kall: UnntaksperiodeKontrollKall[],
    periode: { fom: string; tom: string },
    forventetStatus: number
  ): void {
    const forventetBody = `{"periodeFom":"${periode.fom}","periodeTom":"${periode.tom}"}`;
    const treff = kall.filter(k => k.body === forventetBody);
    expect(
      treff.length,
      `Forventet minst ett live-kontrollkall med ${forventetBody}. Observerte kall: ${JSON.stringify(kall)}`
    ).toBeGreaterThan(0);
    expect(
      treff.map(k => k.status),
      `Live-kontrollen skal svare ${forventetStatus} på perioden ${periode.fom} – ${periode.tom}`
    ).toContain(forventetStatus);
    console.log(`✅ Live-kontroll ${periode.fom} – ${periode.tom} → ${forventetStatus}`);
  }

  verifiserIngenUgyldigDatoSendt(kall: UnntaksperiodeKontrollKall[]): void {
    const ugyldige = kall.filter(k => k.body.includes('Invalid date'));
    expect(
      ugyldige.map(k => k.body),
      'melosys-web skal ikke sende sentinelstrengen «Invalid date» til unntaksperiode-kontrollen'
    ).toEqual([]);
    console.log(`✅ Ingen av ${kall.length} kontrollkall inneholdt «Invalid date»`);
  }

  /**
   * Færre kontrollkall enn tastetrykk er det positive beviset: minst ett tastetrykk
   * i datoen gir en uparsebar verdi («0», «05.0») som skal stoppes i frontend.
   */
  verifiserUgyldigeTastetrykkStoppet(antallSendt: number, dato: string): void {
    expect(
      antallSendt,
      'Live-kontrollen skal ha blitt kalt mens datoen ble skrevet (ellers tester vi ingenting)'
    ).toBeGreaterThan(0);
    expect(
      antallSendt,
      `Minst ett av de ${dato.length} tastetrykkene i «${dato}» gir en uparsebar dato og skal stoppes i frontend`
    ).toBeLessThan(dato.length);
    console.log(`✅ ${dato.length - antallSendt} av ${dato.length} tastetrykk stoppet i frontend (ugyldig dato)`);
  }

  /** En periode over 24 måneder er en forventet 400 med feilkoder; det er 5xx som er feilen. */
  verifiserIngenServerfeil(kall: UnntaksperiodeKontrollKall[]): void {
    const serverfeil = kall.filter(k => (k.status ?? 0) >= 500);
    expect(
      serverfeil.map(k => `${k.status}: ${k.body}`),
      'Live-kontrollen skal aldri gi 5xx — en tastefeil er en klientfeil'
    ).toEqual([]);
    console.log(`✅ Ingen serverfeil i ${kall.length} kontrollkall`);
  }

  /**
   * Perioden saksbehandler registrerte skal ha overstyrt perioden fra SED-en.
   *
   * @param fom - Forventet startdato på formatet dd.MM.yyyy
   * @param tom - Forventet sluttdato på formatet dd.MM.yyyy
   */
  async verifiserEndretPeriodeLagret(fom: string, tom: string): Promise<void> {
    await withDatabase(async (db) => {
      const periode = await db.queryOne<{ FOM: string; TOM: string }>(
        `SELECT TO_CHAR(FOM_DATO, 'DD.MM.YYYY') AS FOM, TO_CHAR(TOM_DATO, 'DD.MM.YYYY') AS TOM
         FROM LOVVALG_PERIODE ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY`, {});
      expect(periode, 'Forventet en lovvalgsperiode').not.toBeNull();
      expect(periode!.FOM, 'Startdato skal være den saksbehandler registrerte').toBe(fom);
      expect(periode!.TOM, 'Sluttdato skal være den ENDREDE (forkortede) datoen, ikke SED-ens').toBe(tom);
      console.log(`✅ Endret periode lagret: ${periode!.FOM} – ${periode!.TOM}`);
    });
  }

  /**
   * Kalles direkte mot melosys-api fordi frontenden ikke sender slike verdier:
   * en ugyldig datostreng skal gi 400 med sanert melding, ikke 500 med stacktrace.
   */
  async verifiserApiAvviserUgyldigDato(request: APIRequestContext, behandlingID: number): Promise<void> {
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
    expect(body, 'Responsen skal ikke lekke Jackson-/klassedetaljer').not.toContain('Invalid date');
    expect(body, 'Responsen skal ikke lekke interne klassenavn').not.toContain('no.nav.melosys');
    expect(JSON.parse(body).message).toBe('Ugyldig format på forespørselen');

    console.log('✅ melosys-api avviser ugyldig dato med 400 og sanert melding');
  }
}
