import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { SedHelper } from '../../helpers/sed-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { RegistreringUnntaksperiodePage } from '../../pages/eu-eos/registrering-unntaksperiode.page';
import { EuEosUtpekingPage } from '../../pages/behandling/eu-eos-utpeking.page';
import { getProcessMarker, runAndWaitForProcessInstances, waitForNewProcessInstances } from '../../helpers/api-helper';
import { formatDateISO, formatDateNorwegian, getDateMonthsFromNow } from '../../helpers/date-helper';
import { BRUKERNAVN_VALID } from '../../pages/shared/constants';

/**
 * Spesifikasjon: `specs/eu-eos-unntaksperiode-ugyldig-dato.md`
 *
 * Halvskrevne datoer i «Godkjenn, men endre periode» skal verken nå
 * unntaksperiode-kontrollen eller gi 5xx, og en ugyldig datostreng skal avvises
 * som klientfeil.
 */
test.describe('EU/EØS - Registrering av unntaksperiode (ugyldig dato mens saksbehandler skriver)', () => {
  test('skal ikke sende «Invalid date» eller få 500 når sluttdato skrives tegn for tegn', async ({ page, request }) => {
    test.setTimeout(300000);

    // Perioden må gi treff i UfmKontroll::periodeOver24MånederOgEnDag, som teller
    // år og dager, ikke måneder: 30 md gir ikke treff, 2 år + 1 dag gjør det.
    // Fom kan ikke ligge mer enn ett år fram i tid eller før 01.06.2012.
    const fom = new Date();
    const sedTom = new Date(fom);
    sedTom.setFullYear(sedTom.getFullYear() + 2);
    sedTom.setDate(sedTom.getDate() + 1);
    const nyTom = getDateMonthsFromNow(12);
    // Dag 05 gir minst ett uparsebart tastetrykk («0») uansett når på året testen
    // kjører. Uten det kan alle mellomtilstandene være parsebare, og testen måler ingenting.
    nyTom.setDate(5);

    console.log('📝 Del A: Injiserer inngående A009 (DE) med periode på 2 år og 1 dag');
    const sed = new SedHelper(request);
    // Markøren tas før innsendingen, men resultatet sjekkes før ventingen: en mislykket
    // innsending starter ingen prosesser, og skal gi SED-feilmeldingen, ikke en timeout.
    const markørFørSed = await getProcessMarker(request);
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
    await waitForNewProcessInstances(request, markørFørSed, { timeoutSeconds: 60 });

    const auth = new AuthHelper(page);
    await auth.login();
    const hovedside = new HovedsidePage(page);
    const unntak = new RegistreringUnntaksperiodePage(page);

    await hovedside.goto();
    await hovedside.åpneBehandling(`${BRUKERNAVN_VALID} -`);
    await unntak.ventPåSiden();

    await unntak.assertions.verifiserRegisterkontrolltreff('Periodelengde er mer enn 24 måneder');

    console.log('📝 Del B: Skriver ny sluttdato tegn for tegn');
    const kontrollkall = unntak.overvåkKontrollkall();

    // Forhåndsutfyllingen med SED-perioden trigger første kontroll, som skal avvise den.
    await unntak.velgGodkjennMenEndrePeriode();
    await unntak.assertions.verifiserKontrollForPeriode(
      kontrollkall,
      { fom: formatDateISO(fom), tom: formatDateISO(sedTom) },
      400
    );

    const nyTomNorsk = formatDateNorwegian(nyTom);
    const antallFørTyping = kontrollkall.length;
    await unntak.skrivSluttdatoTegnForTegn(nyTomNorsk, kontrollkall, formatDateISO(nyTom));

    unntak.assertions.verifiserUgyldigeTastetrykkStoppet(kontrollkall.length - antallFørTyping, nyTomNorsk);
    unntak.assertions.verifiserIngenUgyldigDatoSendt(kontrollkall);
    unntak.assertions.verifiserIngenServerfeil(kontrollkall);

    console.log('📝 Del C: Verifiserer at melosys-api svarer 400 på ugyldig datostreng');
    const behandlingID = unntak.hentBehandlingID();
    await unntak.assertions.verifiserApiAvviserUgyldigDato(request, behandlingID);

    console.log('📝 Del D: Setter gyldig periode på 12 måneder og lagrer');
    // Siste tastetrykk i del B ga den ferdige datoen, altså samme body som del D venter på.
    // Uten dette vinduet ville assertionen under bli oppfylt av del B og ikke kunne feile.
    const antallFørDelD = kontrollkall.length;
    await unntak.settPeriode(formatDateNorwegian(fom), nyTomNorsk);
    await unntak.assertions.verifiserKontrollForPeriode(
      kontrollkall,
      { fom: formatDateISO(fom), tom: formatDateISO(nyTom) },
      204,
      antallFørDelD
    );
    await runAndWaitForProcessInstances(request, () => unntak.lagre(), { timeoutSeconds: 90 });

    const utpeking = new EuEosUtpekingPage(page);
    await utpeking.assertions.verifiserRegistrertUnntakIverksatt(request, {
      lovvalgsland: 'DE',
      medlLovvalgsland: 'DEU',
    });
    await unntak.assertions.verifiserEndretPeriodeLagret(behandlingID, formatDateNorwegian(fom), nyTomNorsk);

    console.log('✅ Ingen kontrollkall med «Invalid date», ingen serverfeil');
  });
});
