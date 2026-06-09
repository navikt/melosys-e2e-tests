import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { OppgaverPage } from '../../pages/oppgaver/oppgaver.page';
import { JournalforingPage } from '../../pages/journalforing/journalforing.page';
import { USER_ID_VALID } from '../../pages/shared/constants';
import { createJournalforingOppgaver } from '../../helpers/mock-helper';

/**
 * @manual — hele Journalføring-suiten er midlertidig manuell (kjøres ikke i CI).
 *
 * Status (e2e-audit 2026-06-08): alle 5 testene passerte tidligere uten å verifisere noe
 * (gated bak if(journalforingCount>0)/if(saksnummer) med expect(true) i else; én happy-path
 * var dessuten unåbar, og verifiserSakOpprettet inneholder null expect). De er nå hardnet med
 * ekte assertions, men tagget @manual fordi de avhenger av at mock-tjenestens journalføring-
 * oppgaver faktisk dukker opp i UI-lista (getJournalforingOppgaveAntall > 0) — en timing/
 * pålitelighet vi ikke har kunnet verifisere uten lokal kjøring (delt Oracle-DB).
 *
 * For å promotere til CI: kjør lokalt (MANUAL_TESTS=true), bekreft at createJournalforingOppgaver
 * pålitelig gir journalforingCount>0, fiks TODO-ene under, og fjern @manual.
 */
test.describe('Journalføring @manual', () => {
  let auth: AuthHelper;
  let hovedside: HovedsidePage;
  let oppgaver: OppgaverPage;
  let journalforing: JournalforingPage;

  test.beforeEach(async ({ page }) => {
    auth = new AuthHelper(page);
    hovedside = new HovedsidePage(page);
    oppgaver = new OppgaverPage(page);
    journalforing = new JournalforingPage(page);

    await auth.login();
  });

  test('skal kunne navigere til journalføring-side fra oppgave', async ({ page, request }) => {
    console.log('📝 Step 1: Creating journalføring oppgaver...');
    const created = await createJournalforingOppgaver(request, { antall: 1 });
    expect(created, 'createJournalforingOppgaver skal lykkes').toBeTruthy();

    console.log('📝 Step 2: Navigating to forside...');
    await hovedside.goto();
    await oppgaver.ventPåOppgaverLastet();

    console.log('📝 Step 3: Checking for journalføring tasks...');
    const journalforingCount = await oppgaver.getJournalforingOppgaveAntall();
    console.log(`   Found ${journalforingCount} journalføring oppgaver`);
    expect(journalforingCount, 'Opprettet journalføring-oppgave skal vises i lista').toBeGreaterThan(0);

    console.log('📝 Step 4: Clicking on journalføring task...');
    await oppgaver.klikkJournalforingOppgaveIndex(0);

    console.log('📝 Step 5: Verifying navigation to journalføring...');
    await oppgaver.assertions.verifiserNavigertTilJournalforing();
    await journalforing.assertions.verifiserSideLaster();

    console.log('✅ Successfully navigated to journalføring page');
  });

  test('skal vise journalføring-skjema med dokument', async ({ page, request }) => {
    console.log('📝 Step 1: Creating journalføring oppgaver...');
    await createJournalforingOppgaver(request, { antall: 1, medVedlegg: true });

    console.log('📝 Step 2: Navigating to forside...');
    await hovedside.goto();
    await oppgaver.ventPåOppgaverLastet();

    const journalforingCount = await oppgaver.getJournalforingOppgaveAntall();
    console.log(`   Found ${journalforingCount} journalføring oppgaver`);
    expect(journalforingCount, 'Opprettet journalføring-oppgave skal vises i lista').toBeGreaterThan(0);

    console.log('📝 Step 3: Opening journalføring task...');
    await oppgaver.klikkJournalforingOppgaveIndex(0);
    await journalforing.ventPåSkjemaLastet();

    console.log('📝 Step 4: Verifying form is ready...');
    await journalforing.assertions.verifiserSkjemaKlart();

    // Oppgaven ble opprettet med medVedlegg:true, så dokument-preview SKAL vises (testens hele poeng).
    console.log('📝 Step 5: Verifying document preview...');
    expect(await journalforing.erDokumentSynlig(), 'Dokument-preview skal vises (medVedlegg:true)').toBe(true);

    console.log('✅ Journalføring form with document is ready');
  });

  test('skal kunne knytte dokument til eksisterende sak', async ({ page, request }) => {
    console.log('📝 Step 1: Creating a case to link to...');
    await hovedside.gotoOgOpprettNySak();
    const opprettSak = new OpprettNySakPage(page);
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // TODO: etter verifiserBehandlingOpprettet står vi på forsiden (/melosys/$), så saksnummer-regexen
    // mot page.url() blir alltid null — happy-path var derfor tidligere unåbar. Hent saksnummer fra DB
    // (withDatabase SELECT på FAGSAK for USER_ID_VALID) før KNYTT for å gjøre dette robust.
    const url = page.url();
    let match = url.match(/saksbehandling\/(\d{10,})/);
    if (!match) {
      match = url.match(/saksbehandling\/(MEL-\d+)/);
    }
    const saksnummer = match ? match[1] : null;
    console.log(`   Created case with saksnummer: ${saksnummer || 'unknown'}`);
    expect(saksnummer, 'TODO: trenger pålitelig saksnummer-kilde (DB) — se kommentar').not.toBeNull();

    console.log('📝 Step 2: Creating journalføring oppgaver...');
    await createJournalforingOppgaver(request, { antall: 1 });

    console.log('📝 Step 3: Checking for journalføring tasks...');
    await hovedside.goto();
    await oppgaver.ventPåOppgaverLastet();
    const journalforingCount = await oppgaver.getJournalforingOppgaveAntall();
    console.log(`   Found ${journalforingCount} journalføring oppgaver`);
    expect(journalforingCount, 'Opprettet journalføring-oppgave skal vises i lista').toBeGreaterThan(0);

    console.log('📝 Step 4: Opening journalføring...');
    await oppgaver.klikkJournalforingOppgaveIndex(0);
    await journalforing.ventPåSkjemaLastet();

    console.log('📝 Step 5: Linking to existing case...');
    await journalforing.knyttTilSak(saksnummer!);

    // TODO: verifiserJournalføringVellykket er lempelig (Promise.race i .catch). Erstatt med
    // withDatabase-sjekk på at journalposten faktisk er koblet til fagsaken.
    console.log('📝 Step 6: Verifying journalføring success...');
    await journalforing.assertions.verifiserJournalføringVellykket();

    console.log('✅ Successfully linked document to existing case');
  });

  test('skal kunne opprette ny sak fra journalpost', async ({ page, request }) => {
    console.log('📝 Step 1: Creating journalføring oppgaver...');
    await createJournalforingOppgaver(request, { antall: 1 });

    console.log('📝 Step 2: Navigating to forside...');
    await hovedside.goto();
    await oppgaver.ventPåOppgaverLastet();
    const journalforingCount = await oppgaver.getJournalforingOppgaveAntall();
    console.log(`   Found ${journalforingCount} journalføring oppgaver`);
    expect(journalforingCount, 'Opprettet journalføring-oppgave skal vises i lista').toBeGreaterThan(0);

    console.log('📝 Step 3: Opening journalføring...');
    await oppgaver.klikkJournalforingOppgaveIndex(0);
    await journalforing.ventPåSkjemaLastet();

    console.log('📝 Step 4: Filling form and submitting...');
    await journalforing.opprettNySakOgJournalfør({
      sakstype: 'EU/EØS-land',
    });

    // TODO: verifiserSakOpprettet inneholder null expect og "lykkes" på enhver URL. Erstatt med en
    // withDatabase-sjekk på at en ny FAGSAK/BEHANDLING faktisk ble opprettet fra journalposten
    // (mønster: sed-mottak full-eessi-flow), og pin behandlingstype.
    console.log('📝 Step 5: Verifying case creation...');
    await journalforing.assertions.verifiserSakOpprettet();

    console.log('✅ Successfully created new case from document');
  });

  test('skal håndtere journalføring-side uten data gracefully @expect-docker-errors', async ({ page }) => {
    console.log('📝 Step 1: Navigating to non-existent journalpost...');
    await journalforing.gotoJournalpost('non-existent-123', 'non-existent-456');

    console.log('📝 Step 2: Checking error handling...');
    const hasError = await page.getByText(/ikke funnet|feil|error|404/i).isVisible().catch(() => false);
    console.log(`   Current URL: ${page.url()}`);
    console.log(`   Error message visible: ${hasError}`);

    // TODO: definer den faktiske produktkontrakten for en ikke-eksisterende journalpost og
    // hard-asserter den (verifiserFeilmelding(/ikke funnet/) ELLER toHaveURL-redirect til forside).
    // Inntil kontrakten er bekreftet lokalt er dette kun en røyktest på at siden ikke kræsjer.
    console.log('✅ Page handled missing data without crashing');
  });
});
