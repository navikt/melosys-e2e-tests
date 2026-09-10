import { test, expect } from '../../fixtures';
import { Browser, APIRequestContext } from '@playwright/test';
import { withDatabase } from '../../helpers/db-helper';
import { withPgDatabase } from '../../helpers/pg-db-helper';
import { SkjemaAuthHelper } from '../../helpers/skjema-auth-helper';
import { AuthHelper } from '../../helpers/auth-helper';
import { runAndWaitForProcessInstances, AdminApiHelper, clearApiCaches } from '../../helpers/api-helper';
import { SoknadUtsendtArbeidstakerPage } from '../../pages/skjema/soknad-utsendt-arbeidstaker.page';
import { SoknadArbeidsgiverPage } from '../../pages/skjema/soknad-arbeidsgiver.page';
import { SkjemaMottakAssertions } from '../../pages/skjema/skjema-mottak.assertions';
import { HovedsidePage } from '../../pages/hovedside.page';
import { SokPage } from '../../pages/sok/sok.page';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';

/**
 * T4 — MELOSYS-8084 saksstatus-synk: melosys-api holder skjema-api oppdatert om sakens status.
 *
 * Semantikk (produkteierbeslutning 2026-07-21):
 *   - Ved MOTTAK får innsendingen `saksnummer` via M2M-callback, og skjema-api setter samtidig
 *     `saksstatus = MOTTATT`: melosys-api publiserer kun status*endringer*, og en nyopprettet sak
 *     har ingen — saksnummeret er beviset på at saken finnes. Videre synk skjer når fagsakens
 *     status ENDRES i melosys-api.
 *   - Mappingen er en REN funksjon av fagsakstatus: OPPRETTET → MOTTATT, alt annet (inkl.
 *     LOVVALG_AVKLART etter vedtak, henlagt, annullert) → AVSLUTTET. Behandlingsstatus er irrelevant.
 *   - Mottakssiden (skjema-api) oppdaterer PER skjemaId (ingen kohort-sweep på saksnummer):
 *     melosys-api sender én oppdatering per skjema koblet til saken
 *     (PUT /m2m/api/skjema/{id}/saksstatus, bulk: PUT /m2m/api/skjema/saksstatus/bulk).
 *     Saksnummer er immutabelt på mottakssiden (409/konflikt ved avvik), og AVSLUTTET
 *     nedgraderes aldri til MOTTATT (monotoni-guard).
 *   - Løpende synk: fagsak-statusendring → SYNK_SKJEMA_SAKSSTATUS-prosessinstans → bulk-kall.
 *     Massesynk (sikkerhetsnett): POST /admin/skjema-saksstatus/synk?dryRun=true|false.
 *
 * Saksstatus er foreløpig IKKE eksponert i skjema-web (egen plan-oppgave) — de brukervendte
 * assertsene går derfor mot skjema-api sin Postgres, ikke mot frontend.
 *
 * Bruker ../fixtures (Oracle-cleanup før test). skjema-api sin Postgres ryddes eksplisitt i hver
 * test (samme mønster som skjema-begge-deler-samme-sak) for deterministisk motpart-kobling.
 * Testbrukere fra TESTBRUKERE.md scenario 1: KARAFFEL 30056928150 (arbeidsgiver, Ståles Stål AS
 * 999999999) og LANSEN LANSANSEN 12928056706 (arbeidstaker NOR → Frankrike).
 */

const ORGNR = '999999999'; // Ståles Stål AS
const ARBEIDSTAKER_FNR = '12928056706'; // LANSEN LANSANSEN
const ARBEIDSGIVER_FNR = '30056928150'; // KARAFFEL TRIVIELL

/**
 * Fatt vedtak på den skjema-opprettede saken som saksbehandler i melosys-web (egen browser-context,
 * saksbehandler-login — IKKE innbygger-konteksten). Etter vedtaket settes fagsaken til
 * LOVVALG_AVKLART, som saksstatus-synken mapper til AVSLUTTET i skjema-api.
 *
 * Behandlingen er opprettet fra en digital søknad. Steg-sekvensen for den skjema-opprettede
 * behandlingen (kartlagt med Playwright mot lokal stack, avviker fra manuell-sak-flyten i
 * eu-eos-art12-utsendt-arbeidstaker-fullfort-vedtak.spec.ts ved at periode/land kommer fra
 * søknaden og wizarden starter på inngangsvilkår-kontrollen):
 *   1. Kontroller inngangsvilkår       → Bekreft og fortsett
 *   2. Yrkessituasjon                  → velg «Yrkesaktiv» → Bekreft
 *   3. Virksomhet                      → huk av arbeidsgiveren fra søknaden → Bekreft
 *   4. Yrkesaktivitet                  → «Lønnet arbeid» → Bekreft
 *   5. Forutgående medlemskap          → Ja → Bekreft
 *   6. Vesentlig virksomhet            → Ja → Bekreft
 *   7. Vurdering arbeidstaker          → «Ja, jeg vil innvilge søknaden» → Bekreft
 *   8. Omfattet av norsk trygdelovgivning → Fatt vedtak (mottaker-SED er forhåndsutfylt)
 *
 * Flyten kjøres som en tilstandsdrevet løkke (les synlig steg → gjør valget → bekreft):
 * wizarden lagrer valg asynkront og kan lokalt både sprette tilbake et steg og hoppe et
 * ekstra steg frem rundt en bekreft — en rigid steg-for-steg-sekvens kommer ut av synk.
 */
async function fattVedtakSomSaksbehandler(
  browser: Browser,
  request: APIRequestContext,
  saksnummer: string
): Promise<void> {
  const saksbehandlerContext = await browser.newContext();
  try {
    const sbPage = await saksbehandlerContext.newPage();
    const auth = new AuthHelper(sbPage);
    await auth.login();

    // Finn saken via søk (søkefeltet støtter saksnummer). Resultatsiden viser saksoversikten
    // direkte med behandlingsraden — åpne den via «Vis behandling»-knappen.
    const hovedside = new HovedsidePage(sbPage);
    const sokPage = new SokPage(sbPage);
    await hovedside.goto();
    await hovedside.søkEtterBruker(saksnummer);
    await sokPage.ventPåResultater();
    await hovedside.klikkVisBehandling();
    await sbPage.waitForLoadState('networkidle');

    const behandling = new EuEosBehandlingPage(sbPage);

    // Wizarden er rasete lokalt: valg lagres asynkront, og en bekreft kan både «sprette
    // tilbake» et steg (lagrings-/bekreft-race) og hoppe et EKSTRA steg frem (forsinket
    // respons bekrefter neste steg også). En rigid steg-for-steg-modell kommer derfor ut
    // av synk. I stedet: tilstandsdrevet løkke — les det synlige steget, gjør stegets
    // valg (idempotent), bekreft når knappen er aktiv, og gjenta til vedtakssteget.
    const stegHandlinger: Record<string, () => Promise<void>> = {
      'Kontroller inngangsvilkår': async () => {},
      Yrkessituasjon: () => behandling.velgYrkesaktiv(),
      Virksomhet: async () => {
        const arbeidsgiver = sbPage.getByRole('checkbox', { name: 'Ståles Stål AS' });
        await arbeidsgiver.waitFor({ state: 'visible', timeout: 30000 });
        if (!(await arbeidsgiver.isChecked())) {
          await arbeidsgiver.check();
        }
      },
      Yrkesaktivitet: () => behandling.velgLønnetArbeid(),
      'Forutgående medlemskap': () => behandling.svarJa(),
      'Vesentlig virksomhet': () => behandling.svarJa(),
      'Vurdering arbeidstaker': () => behandling.innvilgeSøknad(),
    };
    const vedtakssteg = 'Omfattet av norsk trygdelovgivning';
    const bekreftKnapp = sbPage.getByRole('button', { name: 'Bekreft og fortsett' });

    const frist = Date.now() + 150000;
    let forrigeSteg = '';
    while (Date.now() < frist) {
      await sbPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      const steg = (await sbPage.locator('main h1:visible').first().textContent().catch(() => ''))?.trim() ?? '';
      if (steg !== forrigeSteg) {
        console.log(`🧭 Wizard-steg: «${steg}»`);
        forrigeSteg = steg;
      }
      if (steg === vedtakssteg) {
        break;
      }
      const handling = stegHandlinger[steg];
      if (!handling) {
        throw new Error(`Ukjent wizard-steg «${steg}» — steg-sekvensen har endret seg, oppdater stegHandlinger.`);
      }
      await handling();
      await sbPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      // Klikk bekreft hvis mulig; er knappen fortsatt deaktivert, tar løkka en ny runde.
      try {
        await bekreftKnapp.click({ timeout: 10000 });
      } catch {
        console.log(`⏳ «Bekreft og fortsett» ikke klikkbar på «${steg}» — prøver igjen`);
      }
      await sbPage.waitForTimeout(500);
    }
    expect(forrigeSteg, `nådde ikke vedtakssteget «${vedtakssteg}» innen fristen`).toBe(vedtakssteg);

    // Vedtakssteget — mottaker-SED er forhåndsutfylt for den skjema-opprettede saken.
    await runAndWaitForProcessInstances(
      request,
      () => behandling.fattVedtak(),
      { timeoutSeconds: 30 }
    );

    // Vedtaket skal ha avsluttet lovvalgssaken: fagsak → LOVVALG_AVKLART (mapper til AVSLUTTET).
    const fagsak = await withDatabase((db) =>
      db.queryOne<{ STATUS: string }>(`SELECT STATUS FROM FAGSAK WHERE SAKSNUMMER = :s`, {
        s: saksnummer,
      })
    );
    expect(fagsak?.STATUS, `fagsak ${saksnummer} skal være LOVVALG_AVKLART etter vedtak`).toBe(
      'LOVVALG_AVKLART'
    );
    console.log(`✅ Vedtak fattet — fagsak ${saksnummer} er LOVVALG_AVKLART`);
  } finally {
    await saksbehandlerContext.close();
  }
}

/**
 * Assert at innsendingen står som MOTTATT — statusen skjema-api setter sammen med saksnummeret,
 * før noen fagsak-statusendring har skjedd. Trygg som punkt-i-tid-sjekk fordi begge feltene
 * skrives i samme transaksjon: har saksnummeret rukket frem, har statusen det også.
 */
async function forventSaksstatusMottatt(
  mottak: SkjemaMottakAssertions,
  skjemaId: string
): Promise<void> {
  const { saksstatus, saksstatusOppdatert } = await mottak.hentSaksstatusISkjemaApi(skjemaId);
  expect(saksstatus, `saksstatus skal være MOTTATT etter mottak (skjema ${skjemaId})`).toBe(
    'MOTTATT'
  );
  expect(
    saksstatusOppdatert,
    `saksstatus_oppdatert skal settes sammen med statusen (skjema ${skjemaId})`
  ).not.toBeNull();
}

test.describe('MELOSYS-8084 saksstatus-synk: melosys-api → skjema-api', () => {
  test(
    'vedtak avslutter saken → innsending.saksstatus blir AVSLUTTET (løpende synk) #MELOSYS-8084',
    async ({ page, browser, request }) => {
      test.setTimeout(240000); // innsending + async Kafka-mottak + saksbehandling + synk-polling

      const mottak = new SkjemaMottakAssertions();

      // Rydd skjema-api sin Postgres for deterministisk kobling (samme mønster som T3).
      await withPgDatabase('melosys-skjema', (db) => db.cleanDatabase(true));
      expect(await mottak.tellFagsaker(), 'ingen fagsaker ved teststart (Kafka-leak-vakt)').toBe(0);

      // ---- 1. Innbygger sender inn «Utsendt arbeidstaker»-søknad (DEG SELV) ----------------
      const auth = new SkjemaAuthHelper(page);
      await auth.login(ARBEIDSTAKER_FNR);

      const soknad = new SoknadUtsendtArbeidstakerPage(page);
      const { skjemaId, referanse } = await soknad.fyllUtOgSendInnKomplettSoknad(ORGNR, 'Frankrike');
      console.log('📨 Søknad sendt:', { skjemaId, referanse });

      // ---- 2. Sak opprettes i melosys-api, saksnummer synkes tilbake — status blir MOTTATT ---
      const { saksnummer } = await mottak.ventPaaSakForSkjema(skjemaId);
      await mottak.verifiserSakOgBehandling(saksnummer); // UTSENDT_ARBEIDSTAKER / FØRSTEGANG
      await mottak.ventPaaSaksnummerISkjemaApi(skjemaId, saksnummer);
      // Saksnummeret beviser at saken finnes — statusen settes i samme slengen, ikke av synken.
      await forventSaksstatusMottatt(mottak, skjemaId);

      // ---- 3. Saksbehandler fatter vedtak → fagsak LOVVALG_AVKLART -------------------------
      await fattVedtakSomSaksbehandler(browser, request, saksnummer);

      // ---- 4. Løpende synk: skjema-api skal få AVSLUTTET (+ saksstatus_oppdatert satt) -----
      await mottak.ventPaaSaksstatusISkjemaApi(skjemaId, 'AVSLUTTET');

      console.log(`✅ Løpende saksstatus-synk verifisert for sak ${saksnummer}`);
    }
  );

  // Verifiserer per-skjemaId-semantikken for en sak med flere innsendinger: AG-delen og AT-delen
  // er to separate innsendinger (to skjema-id-er) koblet til samme sak. melosys-api sender én
  // oppdatering per skjema på saken (bulk med to rader) — begge skal ende som AVSLUTTET.
  test(
    'begge deler (AG + AT) på samme sak → BEGGE innsendinger får AVSLUTTET #MELOSYS-8084',
    async ({ page, browser, request }) => {
      test.setTimeout(360000); // to innsendinger + kobling + saksbehandling + synk-polling

      const mottak = new SkjemaMottakAssertions();

      await withPgDatabase('melosys-skjema', (db) => db.cleanDatabase(true));
      expect(await mottak.tellFagsaker(), 'ingen fagsaker ved teststart (Kafka-leak-vakt)').toBe(0);

      // ---- 1. Arbeidsgiver (KARAFFEL) sender KUN sin del ------------------------------------
      const agAuth = new SkjemaAuthHelper(page);
      await agAuth.login(ARBEIDSGIVER_FNR);

      const agSoknad = new SoknadArbeidsgiverPage(page);
      const { skjemaId: agSkjemaId } = await agSoknad.fyllUtOgSendInnArbeidsgiversDel({
        arbeidsgiverOrgnr: ORGNR,
        arbeidstakerFnr: ARBEIDSTAKER_FNR,
        arbeidstakerEtternavn: 'LANSANSEN',
        land: 'Frankrike',
      });
      console.log('📨 Arbeidsgiver-del sendt:', { agSkjemaId });

      const { saksnummer } = await mottak.ventPaaSakForSkjema(agSkjemaId);
      await mottak.ventPaaBehandlingStatus(saksnummer, 'AVVENT_DOK_PART');
      await mottak.ventPaaSaksnummerISkjemaApi(agSkjemaId, saksnummer);

      // ---- 2. Arbeidstaker (LANSEN) sender sin del → kobles til SAMME sak -------------------
      const atContext = await browser.newContext();
      let atSkjemaId: string;
      try {
        const atPage = await atContext.newPage();
        const atAuth = new SkjemaAuthHelper(atPage);
        await atAuth.login(ARBEIDSTAKER_FNR);

        const atSoknad = new SoknadUtsendtArbeidstakerPage(atPage);
        ({ skjemaId: atSkjemaId } = await atSoknad.fyllUtOgSendInnKomplettSoknad(
          ORGNR,
          'Frankrike'
        ));
        console.log('📨 Arbeidstaker-del sendt:', { atSkjemaId });

        const { saksnummer: atSaksnummer } = await mottak.ventPaaSakForSkjema(atSkjemaId);
        expect(atSaksnummer, 'begge deler skal mappe til samme saksnummer').toBe(saksnummer);
        await mottak.ventPaaBehandlingStatus(saksnummer, 'VURDER_DOKUMENT');
        await mottak.ventPaaSaksnummerISkjemaApi(atSkjemaId, saksnummer);
      } finally {
        await atContext.close();
      }

      // Ingen fagsak-statusendring ennå → begge innsendinger står som MOTTATT fra mottaket.
      await forventSaksstatusMottatt(mottak, agSkjemaId);
      await forventSaksstatusMottatt(mottak, atSkjemaId);

      // ---- 3. Saksbehandler avslutter saken (vedtak → LOVVALG_AVKLART) ----------------------
      await fattVedtakSomSaksbehandler(browser, request, saksnummer);

      // ---- 4. BEGGE innsendinger på saken skal få AVSLUTTET (én oppdatering per skjemaId) ---
      await mottak.ventPaaSaksstatusISkjemaApi(agSkjemaId, 'AVSLUTTET');
      await mottak.ventPaaSaksstatusISkjemaApi(atSkjemaId, 'AVSLUTTET');

      console.log(
        `✅ Begge innsendinger (AG ${agSkjemaId}, AT ${atSkjemaId}) fikk AVSLUTTET for sak ${saksnummer}`
      );
    }
  );

  // Admin-massesynken er sikkerhetsnettet for rader den løpende synken har bommet på: vi simulerer
  // et slikt hull ved å endre fagsakstatusen DIREKTE i Oracle (ingen event → ingen løpende synk),
  // og verifiserer så dryRun=true (rapport, ingen DB-endring), dryRun=false (DB oppdateres) og
  // idempotens (ny kjøring rapporterer 0 oppdaterte).
  test(
    'admin-massesynk: dryRun rapporterer uten endring, deretter reell synk oppdaterer #MELOSYS-8084',
    async ({ page, request }) => {
      test.setTimeout(180000);

      const mottak = new SkjemaMottakAssertions();
      const adminApi = new AdminApiHelper();

      await withPgDatabase('melosys-skjema', (db) => db.cleanDatabase(true));
      expect(await mottak.tellFagsaker(), 'ingen fagsaker ved teststart (Kafka-leak-vakt)').toBe(0);

      // ---- 1. Innsending → sak → saksnummer synket, status MOTTATT fra mottaket -------------
      const auth = new SkjemaAuthHelper(page);
      await auth.login(ARBEIDSTAKER_FNR);

      const soknad = new SoknadUtsendtArbeidstakerPage(page);
      const { skjemaId } = await soknad.fyllUtOgSendInnKomplettSoknad(ORGNR, 'Frankrike');

      const { saksnummer } = await mottak.ventPaaSakForSkjema(skjemaId);
      await mottak.ventPaaSaksnummerISkjemaApi(skjemaId, saksnummer);
      await forventSaksstatusMottatt(mottak, skjemaId);

      // ---- 2. Avslutt saken UTENOM eventflyten (direkte i Oracle) ---------------------------
      // LOVVALG_AVKLART er statusen et vedtak normalt setter — men uten event fanger ikke den
      // løpende synken det opp. Dette er nøyaktig gapet massesynken skal tette. Mappingen er en
      // ren fagsak-status-mapping, så behandlingsstatus er irrelevant her.
      const oppdatert = await withDatabase((db) =>
        db.execute(`UPDATE FAGSAK SET STATUS = 'LOVVALG_AVKLART' WHERE SAKSNUMMER = :s`, {
          s: saksnummer,
        })
      );
      expect(oppdatert, 'én fagsakrad skal være oppdatert').toBe(1);
      // melosys-api kan ha fagsaken i JPA/Hibernate-cache — tøm så massesynken leser fersk status.
      await clearApiCaches(request);

      // Ingen event → ingen løpende synk: statusen står fortsatt på MOTTATT fra mottaket.
      await forventSaksstatusMottatt(mottak, skjemaId);

      // ---- 3. dryRun=true: rapport, men INGEN endring i skjema-api --------------------------
      // Rapportkontrakt: SkjemaSaksstatusSynkRapport i melosys-api. antallOppdatert,
      // ukjenteSkjemaIder og konfliktSkjemaIder settes KUN ved reell synk (null i dry-run).
      const dryRunRespons = await adminApi.synkSkjemaSaksstatus(request, true);
      expect(dryRunRespons.ok(), `dryRun-synk skal svare 2xx (fikk ${dryRunRespons.status()})`).toBe(
        true
      );
      const dryRunRapport = await dryRunRespons.json();
      console.log('📋 dryRun-rapport:', JSON.stringify(dryRunRapport));
      expect(dryRunRapport.dryRun, 'rapporten skal markere dry-run').toBe(true);
      expect(dryRunRapport.antallTotalt, 'én skjema-sak-mapping totalt').toBe(1);
      expect(dryRunRapport.antallMottatt, 'ingen rader mapper til MOTTATT').toBe(0);
      expect(dryRunRapport.antallAvsluttet, 'én rad mapper til AVSLUTTET').toBe(1);
      expect(dryRunRapport.perMelosysStatus, 'fordeling per intern fagsakstatus').toEqual({
        LOVVALG_AVKLART: 1,
      });
      expect(dryRunRapport.antallOppdatert ?? null, 'antallOppdatert settes ikke i dry-run').toBeNull();
      expect(dryRunRapport.ukjenteSkjemaIder ?? null, 'ukjenteSkjemaIder settes ikke i dry-run').toBeNull();
      expect(dryRunRapport.konfliktSkjemaIder ?? null, 'konfliktSkjemaIder settes ikke i dry-run').toBeNull();

      // dry-run skal IKKE ha endret databasen.
      await forventSaksstatusMottatt(mottak, skjemaId);

      // ---- 4. dryRun=false: reell synk → AVSLUTTET + saksstatus_oppdatert satt --------------
      const synkRespons = await adminApi.synkSkjemaSaksstatus(request, false);
      expect(synkRespons.ok(), `reell synk skal svare 2xx (fikk ${synkRespons.status()})`).toBe(
        true
      );
      const synkRapport = await synkRespons.json();
      console.log('📋 synk-rapport:', JSON.stringify(synkRapport));
      expect(synkRapport.dryRun).toBe(false);
      expect(synkRapport.antallTotalt).toBe(1);
      expect(synkRapport.antallAvsluttet).toBe(1);
      expect(synkRapport.antallOppdatert, 'én innsending skal være oppdatert').toBe(1);
      expect(synkRapport.ukjenteSkjemaIder).toEqual([]);
      expect(synkRapport.konfliktSkjemaIder).toEqual([]);

      await mottak.ventPaaSaksstatusISkjemaApi(skjemaId, 'AVSLUTTET');

      // ---- 5. Idempotens: ny reell synk rapporterer 0 oppdaterte (skriver kun ved endring) ---
      const rekjoeringRespons = await adminApi.synkSkjemaSaksstatus(request, false);
      expect(rekjoeringRespons.ok()).toBe(true);
      const rekjoeringRapport = await rekjoeringRespons.json();
      console.log('📋 rekjøring-rapport:', JSON.stringify(rekjoeringRapport));
      expect(
        rekjoeringRapport.antallOppdatert,
        'gjentatt massesynk skal ikke oppdatere noe (idempotens)'
      ).toBe(0);

      console.log(`✅ Admin-massesynk verifisert for sak ${saksnummer} (skjema ${skjemaId})`);
    }
  );
});
