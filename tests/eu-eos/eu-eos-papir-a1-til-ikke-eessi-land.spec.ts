import { test, expect } from '../../fixtures';
import { Page } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';
import { ArbeidFlereLandBehandlingPage } from '../../pages/behandling/arbeid-flere-land-behandling.page';
import { USER_ID_VALID, EU_EOS_LAND } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { withDatabase } from '../../helpers/db-helper';
import { APIRequestContext } from '@playwright/test';
import {
  fetchStoredSedDocuments, findNewNavFormatSed, RinaDocumentInfo,
  fetchStoredJournalposter, findNewUtgaaendeJournalpost, JournalpostInfo,
} from '../../helpers/mock-helper';

/**
 * Papir-A1 til ikke-EESSI-land (FO/GL) ved EOS-vedtak
 *
 * Disse testene verifiserer at når en sak inkluderer både EESSI-klare land og
 * ikke-EESSI-land (Færøyene og/eller Grønland), så:
 * - SED sendes til EESSI-klare land som normalt
 * - Papir-A1 sendes til Færøyene/Grønland (SEND_BREV prosessinstans opprettet)
 * - Ingen av delene hindrer den andre (IVERKSETT_VEDTAK_EOS STATUS = FERDIG)
 *
 * DB-verifikasjoner skjer via PROSESSINSTANS-tabellen:
 * - IVERKSETT_VEDTAK_EOS med STATUS = FERDIG → vedtak gjennomført uten feil
 * - SEND_BREV med trygdemyndighetLand = FO/GL → papir-A1 sendt til riktig land
 *
 * Testene dekker den manuelle testplanen fra 3-løsning.md:
 * - Scenario 1: Hovedscenario — Færøyene + EU/EØS-land
 * - Scenario 2: Færøyene + Grønland + EU/EØS-land
 * - Scenario 3: Regresjon — kun EU/EØS-land (ingen FO/GL)
 * - Scenario 4: Regresjon — kun ikke-EESSI-land (FO + GL)
 */
test.describe('Papir-A1 til ikke-EESSI-land ved EOS-vedtak', () => {

  /**
   * Hjelpefunksjon for å sette opp og navigere til en behandling.
   * Returnerer behandlingssiden klar for stegvelgeren.
   */
  async function opprettOgNavigerTilBehandling(
    page: Page,
    land: string[]
  ) {
    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const euEosBehandling = new EuEosBehandlingPage(page);

    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgOpprettNySak();
    await opprettSak.velgSakstype('EU_EOS');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('ARBEID_FLERE_LAND');

    await euEosBehandling.fyllInnFraTilDato('01.01.2024', '31.12.2025');

    // Velg første land og deretter øvrige
    await euEosBehandling.velgLand(land[0]);
    for (const ekstraLand of land.slice(1)) {
      await euEosBehandling.velgAndreLand(ekstraLand);
    }

    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    console.log('📝 Venter på prosessinstanser etter saksopprettelse...');
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();

    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    await page.waitForLoadState('networkidle');

    return new ArbeidFlereLandBehandlingPage(page);
  }

  /**
   * Verifiserer DB-tilstand etter EOS-vedtak:
   * 1. IVERKSETT_VEDTAK_EOS er FERDIG (ingen feil i prosessen)
   * 2. SEND_BREV er opprettet for hvert forventet papirland (FO/GL)
   * 3. Ingen SEND_BREV er opprettet for rene EESSI-vedtak
   *
   * @param forventetPapirland - Landkoder som skal ha fått papir-A1, f.eks. ['FO'] eller ['FO', 'GL']
   */
  async function verifiserProsessinstanserEtterVedtak(
    forventetPapirland: string[]
  ): Promise<void> {
    await withDatabase(async (db) => {
      // Hent siste IVERKSETT_VEDTAK_EOS (tester kjøres serielt, 5 min vindu er trygt)
      const vedtak = await db.queryOne<{ BEHANDLING_ID: number; STATUS: string; SIST_FULLFORT_STEG: string }>(
        `SELECT PI.BEHANDLING_ID, PI.STATUS, PI.SIST_FULLFORT_STEG
         FROM PROSESSINSTANS PI
         WHERE PI.PROSESS_TYPE = 'IVERKSETT_VEDTAK_EOS'
           AND PI.REGISTRERT_DATO > SYSDATE - INTERVAL '10' MINUTE
         ORDER BY PI.REGISTRERT_DATO DESC
         FETCH FIRST 1 ROWS ONLY`,
        {}
      );

      expect(vedtak, 'Fant ingen nylig IVERKSETT_VEDTAK_EOS prosessinstans').not.toBeNull();
      expect(vedtak!.STATUS, `IVERKSETT_VEDTAK_EOS skal være FERDIG, men er: ${vedtak!.STATUS}`).toBe('FERDIG');
      console.log(`✅ IVERKSETT_VEDTAK_EOS: FERDIG (behandlingId=${vedtak!.BEHANDLING_ID})`);

      const behandlingId = vedtak!.BEHANDLING_ID;

      // Hent papir-A1 SEND_BREV for denne behandlingen.
      // SEND_VEDTAKSBREV_INNLAND oppretter alltid ett SEND_BREV (innlandsbrev) som IKKE
      // har trygdemyndighetLand — vi filtrerer det ut og teller kun papir-A1 til utland.
      const alleSendBrev = await db.query<{ DATA: string; STATUS: string }>(
        `SELECT PI.DATA, PI.STATUS
         FROM PROSESSINSTANS PI
         WHERE PI.BEHANDLING_ID = :behandlingId
           AND PI.PROSESS_TYPE = 'SEND_BREV'`,
        { behandlingId }
      );

      // Papir-A1 til FO/GL er alltid av type ATTEST_A1 sendt til UTENLANDSK_TRYGDEMYNDIGHET.
      // Innlandsbrev (INNVILGELSE_YRKESAKTIV_FLERE_LAND) sendes til BRUKER og inneholder ikke ATTEST_A1.
      // NB: DATA-kolonnen er Java Properties-format der ':' escapes til '\:' i verdier.
      const papirA1Brev = alleSendBrev.filter(row => {
        const data = row.DATA || '';
        return data.includes('ATTEST_A1') && data.includes('UTENLANDSK_TRYGDEMYNDIGHET');
      });

      if (forventetPapirland.length === 0) {
        // Regresjonstest: ingen papir-A1 skal opprettes for rene EESSI-saker.
        // papirA1Brev er allerede filtrert på ATTEST_A1 + UTENLANDSK_TRYGDEMYNDIGHET,
        // så hele lista skal være tom — ikke bare FO/GL-innslag.
        expect(
          papirA1Brev.length,
          `Forventet ingen papir-A1 SEND_BREV, men fant ${papirA1Brev.length}`
        ).toBe(0);
        console.log('✅ Ingen papir-A1 SEND_BREV (regresjonstest OK)');
      } else {
        expect(
          papirA1Brev.length,
          `Forventet ${forventetPapirland.length} papir-A1 SEND_BREV, men fant ${papirA1Brev.length}`
        ).toBe(forventetPapirland.length);

        for (const landkode of forventetPapirland) {
          const brevForLand = papirA1Brev.find(row => {
            const data = row.DATA || '';
            // Properties.store() escaper ':' som '\:' i verdier — søk etter escaped form
            return data.includes(`"trygdemyndighetLand"\\:"${landkode}"`);
          });
          if (!brevForLand) {
            console.log(`DATA-verdier i papir-A1 SEND_BREV (søkte etter landkode="${landkode}"):\n${papirA1Brev.map(b => b.DATA).join('\n---\n')}`);
          }
          expect(brevForLand, `Forventet papir-A1 SEND_BREV med trygdemyndighetLand="${landkode}", men fant det ikke`).toBeTruthy();
          expect(
            brevForLand!.STATUS,
            `SEND_BREV for ${landkode} skal være FERDIG, men er: ${brevForLand!.STATUS}`
          ).toBe('FERDIG');
          console.log(`✅ Papir-A1 SEND_BREV opprettet og FERDIG for land ${landkode}`);
        }
      }
    });
  }

  /**
   * Verifiserer at en A003 SED (LA_BUC_02) ble sendt til EESSI-mock etter vedtak.
   * Brukes for scenariene som har EESSI-klare land (f.eks. Sverige).
   *
   * NB: For LA_BUC_02 (arbeid i flere land) er SED-typen A003, ikke A1.
   * A1 attestasjonen sendes som papir-brev — ikke som SED til EESSI.
   *
   * @param request - Playwright APIRequestContext
   * @param docsBefore - Snapshot av RINA-dokumenter tatt FØR vedtak
   */
  async function verifiserSedSendtTilEessi(
    request: APIRequestContext,
    docsBefore: RinaDocumentInfo[]
  ): Promise<void> {
    const sedContent = await findNewNavFormatSed(request, 'A003', docsBefore);
    expect(sedContent, 'Forventet at A003 SED ble sendt til EESSI-mottaker, men ingen ny SED funnet i mock').toBeTruthy();
    console.log(`✅ A003 SED sendt til EESSI (sed=${sedContent.sed}, sedVer=${sedContent.sedVer})`);
  }

  /**
   * Verifiserer at en UTGAAENDE journalpost ble opprettet og ferdigstilt i SAF-mock
   * etter at SED ble sendt. Bekrefter at hele Kafka-sløyfen fungerte:
   * sendSed → EessiSedSendtProducer → SedSendtConsumer → OpprettUtgaaendeJournalpostService.
   *
   * @param request   - Playwright APIRequestContext
   * @param jpBefore  - Snapshot av journalposter tatt FØR vedtak
   */
  async function verifiserUtgaaendeJournalpostOpprettet(
    request: APIRequestContext,
    jpBefore: JournalpostInfo[]
  ): Promise<void> {
    const jp = await findNewUtgaaendeJournalpost(request, jpBefore);
    expect(jp, 'Forventet UTGAAENDE journalpost i SAF-mock etter SED ble sendt, men fant ingen ny').not.toBeNull();
    expect(
      jp!.journalStatus,
      `Journalpost skal være ferdigstilt (J), men er: ${jp!.journalStatus}`
    ).toBe('J');
    console.log(`✅ UTGAAENDE journalpost opprettet og ferdigstilt (id=${jp!.journalpostId}, tittel="${jp!.tittel}")`);
  }

  // ============================================================
  // Scenario 1: Færøyene + EU/EØS-land
  // ============================================================
  test('Scenario 1: SED sendes til EESSI-land og papir til Færøyene', async ({ page, request }) => {
    test.setTimeout(120000);

    const behandling = await opprettOgNavigerTilBehandling(page, [
      EU_EOS_LAND.SVERIGE,
      EU_EOS_LAND.FAROEYENE,
    ]);

    await behandling.fyllUtArbeidFlereLandBehandling(
      'Norge', 'Ståles Stål AS',
      'Test: SED til Sverige, papir til Færøyene',
      'E2E test scenario 1',
      { skipFattVedtak: true }
    );
    await behandling.velgInstitusjonSomSkalMottaSed(EU_EOS_LAND.SVERIGE);

    const docsBefore = await fetchStoredSedDocuments(request, 'A003');
    const jpBefore = await fetchStoredJournalposter(request);
    await behandling.fattVedtak();

    await waitForProcessInstances(page.request, 60);
    await verifiserSedSendtTilEessi(request, docsBefore);
    await verifiserUtgaaendeJournalpostOpprettet(request, jpBefore);
    await verifiserProsessinstanserEtterVedtak(['FO']);
    console.log('✅ Scenario 1: SED til Sverige og papir til Færøyene — verifisert');
  });

  // ============================================================
  // Scenario 2: Færøyene + Grønland + EU/EØS-land
  // ============================================================
  test('Scenario 2: SED sendes til EESSI-land og papir til Færøyene og Grønland', async ({ page, request }) => {
    test.setTimeout(120000);

    const behandling = await opprettOgNavigerTilBehandling(page, [
      EU_EOS_LAND.SVERIGE,
      EU_EOS_LAND.FAROEYENE,
      EU_EOS_LAND.GRONLAND,
    ]);

    await behandling.fyllUtArbeidFlereLandBehandling(
      'Norge', 'Ståles Stål AS',
      'Test: SED til Sverige, papir til FO og GL',
      'E2E test scenario 2',
      { skipFattVedtak: true }
    );
    await behandling.velgInstitusjonSomSkalMottaSed(EU_EOS_LAND.SVERIGE);

    const docsBefore = await fetchStoredSedDocuments(request, 'A003');
    const jpBefore = await fetchStoredJournalposter(request);
    await behandling.fattVedtak();

    await waitForProcessInstances(page.request, 60);
    await verifiserSedSendtTilEessi(request, docsBefore);
    await verifiserUtgaaendeJournalpostOpprettet(request, jpBefore);
    await verifiserProsessinstanserEtterVedtak(['FO', 'GL']);
    console.log('✅ Scenario 2: SED til Sverige, papir til Færøyene og Grønland — verifisert');
  });

  // ============================================================
  // Scenario 3: Regresjon — kun EU/EØS-land (ingen papir)
  // ============================================================
  test('Scenario 3 (regresjon): Kun EESSI-land — ingen papir-A1 til FO/GL', async ({ page, request }) => {
    test.setTimeout(120000);

    // Sverige + Norge — ARBEID_FLERE_LAND krever minst to land.
    // Norge er hjemland (ingen EESSI-institusjon nødvendig), Sverige har institusjon i mock.
    // Ingen FO/GL i listen → papir-A1-koden skal ikke trigges.
    const behandling = await opprettOgNavigerTilBehandling(page, [
      EU_EOS_LAND.SVERIGE,
      EU_EOS_LAND.NORGE,
    ]);

    await behandling.fyllUtArbeidFlereLandBehandling(
      'Norge', 'Ståles Stål AS',
      'Test: Regresjon kun EESSI-land',
      'E2E test scenario 3',
      { skipFattVedtak: true }
    );

    await behandling.velgInstitusjonSomSkalMottaSed(EU_EOS_LAND.SVERIGE);

    const docsBefore = await fetchStoredSedDocuments(request, 'A003');
    const jpBefore = await fetchStoredJournalposter(request);
    await behandling.fattVedtak();

    await waitForProcessInstances(page.request, 60);
    await verifiserSedSendtTilEessi(request, docsBefore);
    await verifiserUtgaaendeJournalpostOpprettet(request, jpBefore);
    await verifiserProsessinstanserEtterVedtak([]);
    console.log('✅ Scenario 3: SED til Sverige og ingen SEND_BREV for FO/GL — regresjon OK');
  });

  // ============================================================
  // Scenario 4: Kun ikke-EESSI-land (kun papir)
  // ============================================================
  test('Scenario 4: Kun Færøyene + Grønland — papir-A1 sendes til begge', async ({ page }) => {
    test.setTimeout(120000);

    const behandling = await opprettOgNavigerTilBehandling(page, [
      EU_EOS_LAND.FAROEYENE,
      EU_EOS_LAND.GRONLAND,
    ]);

    // FO og GL har ingen EESSI-institusjoner — ingen institusjonsdropdown vises
    await behandling.fyllUtArbeidFlereLandBehandling(
      'Norge', 'Ståles Stål AS',
      'Test: Regresjon kun FO og GL',
      'E2E test scenario 4'
    );

    await waitForProcessInstances(page.request, 60);
    await verifiserProsessinstanserEtterVedtak(['FO', 'GL']);
    console.log('✅ Scenario 4: Kun FO/GL — SEND_BREV for begge land verifisert');
  });
});
