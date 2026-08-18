import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { SedHelper } from '../../helpers/sed-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { RegistreringUnntaksperiodePage } from '../../pages/eu-eos/registrering-unntaksperiode.page';
import { EuEosUtpekingPage } from '../../pages/behandling/eu-eos-utpeking.page';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { formatDateISO, formatDateNorwegian, getDateMonthsFromNow } from '../../helpers/date-helper';
import { BRUKERNAVN_VALID } from '../../pages/shared/constants';

/**
 * EU/EØS – «Invalid date» i live-kontrollen av unntaksperiode
 *
 * Regresjonsvakt for two-sided-bugen beskrevet i
 * melosys-kode-wiki/archive/melosys-api/2026-07-28-invalid-date-unntaksperiode-kontroll-plan.md:
 *
 *  - **melosys-web (T2, rotårsak):** «Endre periode»-feltene på registrering av
 *    unntaksperioder kjører en live-kontroll per tastetrykk. `formatterDatoTilISO`
 *    returnerte sentinelstrengen `"Invalid date"` som default, og truthiness-guarden
 *    i `mapDispatchToProps` slapp den gjennom — så en halvskrevet dato ble POSTet
 *    som `{"periodeTom":"Invalid date"}`.
 *  - **melosys-api (T1):** ingen handler for `HttpMessageNotReadableException` →
 *    catch-all → **HTTP 500 + ERROR med full stacktrace** for en ren tastefeil.
 *    Latent siden 2022, oppdaget som logstøy i prod 19.06.2026.
 *
 * Scenario:
 * 1. Injiser en inngående A009 fra Tyskland med en periode på 2 år og 1 dag, som
 *    gir treff i registerkontrollen (UfmKontroll::periodeOver24MånederOgEnDag),
 *    slik at behandlingen IKKE registreres
 *    automatisk (BestemBehandlingsmåteSed) men havner på saksbehandlers bord.
 * 2. Åpne behandlingen: «Godkjenn unntaksperiode» er deaktivert pga. kontrolltreffet,
 *    saksbehandler må velge «Godkjenn, men endre periode».
 * 3. Skriv en ny sluttdato TEGN FOR TEGN — den nøyaktige brukerhandlingen som
 *    trigget bugen. Verifiser at ingen av kontrollkallene inneholder «Invalid date»
 *    og at ingen av dem gir 5xx.
 * 4. Verifiser API-kontrakten direkte: en ugyldig datostreng skal gi 400 med
 *    sanert melding (frontenden sender den aldri lenger, så den må testes direkte).
 * 5. Sett en gyldig, forkortet periode (12 md) → kontrollfeilen forsvinner →
 *    Lagre → REGISTRERT_UNNTAK med den ENDREDE perioden persistert.
 */
test.describe('EU/EØS - Registrering av unntaksperiode (ugyldig dato i live-kontrollen)', () => {
  test('skal ikke sende «Invalid date» eller få 500 når sluttdato skrives tegn for tegn', async ({ page, request }) => {
    test.setTimeout(300000);

    // Perioden må gi treff i UfmKontroll::periodeOver24MånederOgEnDag, som er
    // implementert som «over 2 år OG minst én dag» (PeriodeRegler:33-37 — måneder
    // teller ikke, så 30 md gir IKKE treff). Fom kan ikke ligge mer enn 1 år frem
    // i tid (PERIODE_LANGT_FREM_I_TID) eller før 01.06.2012.
    const fom = new Date();
    const sedTom = new Date(fom);
    sedTom.setFullYear(sedTom.getFullYear() + 2);
    sedTom.setDate(sedTom.getDate() + 1);
    const nyTom = getDateMonthsFromNow(12);
    // Dag 05 gjør at det ALLTID finnes minst ett halvskrevet, uparsebart tastetrykk
    // («0») uansett når på året testen kjører — det er den tilstanden guarden i
    // saksopplysninger.jsx må fange.
    nyTom.setDate(5);

    // === DEL A: Inngående A009 med for lang periode → manuell behandling ===
    console.log('📝 Del A: Injiserer inngående A009 (DE) med periode på 2 år + 1 dag...');
    const sed = new SedHelper(request);
    const result = await sed.sendSed({
      sedType: 'A009',
      bucType: 'LA_BUC_02',
      landkode: 'DE',
      avsenderId: 'DE:DRV',
      lovvalgsland: 'DE',
      periodeFom: formatDateISO(fom),
      periodeTom: formatDateISO(sedTom),
    });
    expect(result.success, `Send A009 feilet: ${result.message}`).toBe(true);
    await waitForProcessInstances(request, 60);

    const auth = new AuthHelper(page);
    await auth.login();
    const hovedside = new HovedsidePage(page);
    const unntak = new RegistreringUnntaksperiodePage(page);

    await hovedside.goto();
    await hovedside.åpneBehandling(`${BRUKERNAVN_VALID} -`);
    await unntak.ventPåSiden();

    // Kontrolltreffet (PERIODEN_OVER_24_MD) er forutsetningen for hele scenariet:
    // uten det ville A009-en blitt registrert automatisk, uten UI i det hele tatt.
    await unntak.assertions.verifiserRegisterkontrolltreff('Periodelengde er mer enn 24 måneder');

    // === DEL B: Skriv sluttdato tegn for tegn (reproduserer bugen) ===
    console.log('📝 Del B: Skriver ny sluttdato tegn for tegn...');
    const kontrollkall = unntak.overvåkKontrollkall();

    // Valget forhåndsutfyller datofeltene med SED-perioden, som trigger den første
    // live-kontrollen. Den skal avvise perioden (for lang) med 400 + feilkoder.
    await unntak.velgGodkjennMenEndrePeriode();
    unntak.assertions.verifiserKontrollForPeriode(
      kontrollkall,
      { fom: formatDateISO(fom), tom: formatDateISO(sedTom) },
      400
    );

    const nyTomNorsk = formatDateNorwegian(nyTom);
    const antallFørTyping = kontrollkall.length;
    await unntak.skrivSluttdatoTegnForTegn(nyTomNorsk);

    unntak.assertions.verifiserUgyldigeTastetrykkStoppet(kontrollkall.length - antallFørTyping, nyTomNorsk);
    unntak.assertions.verifiserIngenUgyldigDatoSendt(kontrollkall);
    unntak.assertions.verifiserIngenServerfeil(kontrollkall);

    // === DEL C: API-kontrakten – ugyldig dato er en klientfeil (400), ikke 500 ===
    console.log('📝 Del C: Verifiserer at melosys-api svarer 400 på ugyldig datostreng...');
    await unntak.assertions.verifiserApiAvviserUgyldigDato(request, unntak.hentBehandlingID());

    // === DEL D: Gyldig forkortet periode → kontrollen godtar → lagre ===
    console.log('📝 Del D: Setter gyldig periode (12 md) og lagrer...');
    await unntak.settPeriode(formatDateNorwegian(fom), nyTomNorsk);
    unntak.assertions.verifiserKontrollForPeriode(
      kontrollkall,
      { fom: formatDateISO(fom), tom: formatDateISO(nyTom) },
      204
    );
    await unntak.lagre();
    await waitForProcessInstances(request, 90);

    const utpeking = new EuEosUtpekingPage(page);
    await utpeking.assertions.verifiserRegistrertUnntakIverksatt(request, {
      lovvalgsland: 'DE',
      medlLovvalgsland: 'DEU',
    });
    await unntak.assertions.verifiserEndretPeriodeLagret(formatDateNorwegian(fom), nyTomNorsk);

    console.log('✅ Ugyldig dato i live-kontrollen gir verken «Invalid date»-payload eller 500');
  });
});
