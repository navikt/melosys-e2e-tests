import { Page, expect } from '@playwright/test';

/**
 * Innloggingshjelper for melosys-skjema-web (digital «Utsendt arbeidstaker»-søknad).
 *
 * I MOTSETNING til AuthHelper (saksbehandler i melosys-web, Azure AD) logger denne
 * inn som INNBYGGER via ID-porten-flyten: wonderwall-sidecar foran skjema-web gjør
 * auto-login mot mock-oauth2-server, som viser et "Velg testbruker"-skjema der vi
 * oppgir fødselsnummeret til testbrukeren.
 *
 * Testbrukere er dokumentert i melosys-docker-compose/TESTBRUKERE.md. Eksempler:
 *  - 12928056706  LANSEN LANSANSEN   (arbeidstaker NOR → Frankrike, "DEG SELV")
 *  - 30056928150  KARAFFEL TRIVIELL  (arbeidsgiver, Ståles Stål + Steinars Stein)
 *  - 77777777777  JUNIOR TRIVIELL    (kun "DEG SELV", ingen tilganger)
 *
 * Stacken må kjøre med skjema-profilen: cd ../melosys-docker-compose && make dev-skjema
 */
export class SkjemaAuthHelper {
  /** Frontend bak wonderwall. Kan overstyres med SKJEMA_WEB_BASE_URL i .env.local. */
  static readonly BASE_URL =
    process.env.SKJEMA_WEB_BASE_URL || 'http://localhost:3001/medlemskap-lovvalg/soknad/';

  constructor(private page: Page) {}

  /**
   * Logg inn som innbygger og lande på rollevalg-siden (/representasjon).
   *
   * @param fnr Fødselsnummeret til testbrukeren (default LANSEN — arbeidstaker).
   */
  async login(fnr: string = '12928056706'): Promise<void> {
    await this.page.goto(SkjemaAuthHelper.BASE_URL);

    // Wonderwall redirecter til mock-oauth2 sin login-form. Hvis vi allerede har en
    // aktiv sesjon dukker den ikke opp og vi lander rett i appen.
    //
    // Subjekt-feltet treffes på placeholder ELLER tilgjengelig navn: den rå mock-oauth2-formen
    // (CI) gir feltet KUN en placeholder, mens login-proxyen lokalt legger på et navn.
    const subjectField = this.page
      .getByPlaceholder('Enter any user/subject')
      .or(this.page.getByRole('textbox', { name: 'Enter any user/subject' }));
    const signInButton = this.page.getByRole('button', { name: 'Sign-in' });

    if (await subjectField.isVisible({ timeout: 15000 }).catch(() => false)) {
      await subjectField.fill(fnr);
      await signInButton.click();
    }

    // Appen redirecter via /oauth2/callback til rollevalg-siden.
    await this.page.waitForURL(/\/representasjon/, { timeout: 30000 });
    await expect(
      this.page.getByRole('heading', { name: 'Hvem skal du opptre som?' })
    ).toBeVisible();

    console.log('✅ Logget inn i skjema-web som', fnr);
  }
}
