import { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import { AuthHelper } from '../../../helpers/auth-helper';
import { HovedsidePage } from '../../../pages/hovedside.page';
import { OpprettNySakPage } from '../../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { EuEosBehandlingPage } from '../../../pages/behandling/eu-eos-behandling.page';
import { AnmodningUnntakPage } from '../../../pages/eu-eos/unntak/anmodning-unntak.page';
import { SvarAnmodningUnntakAssertions } from '../../../pages/eu-eos/unntak/svar-anmodning-unntak.assertions';
import { waitForProcessInstances } from '../../../helpers/api-helper';
import { UnleashHelper } from '../../../helpers/unleash-helper';
import { fetchStoredSedDocuments, findNewRinaSedDocument } from '../../../helpers/mock-helper';
import { SedHelper } from '../../../helpers/sed-helper';
import { withDatabase } from '../../../helpers/db-helper';
import {
  USER_ID_VALID, SAKSTYPER, SAKSTEMA, BEHANDLINGSTEMA, AARSAK, EU_EOS_LAND,
} from '../../../pages/shared/constants';

/**
 * EU/EØS Utsendt arbeidstaker - Anmodning om unntak (art.16): MOTTA SVAR → ny vurdering
 *
 * Dekker tilstands-/oppgaveovergangene når en anmodning-om-unntak-sak (A001 sendt)
 * MOTTAR svar fra utlandet på den SAMME LA_BUC_01:
 *   - A002 (innvilgelse) → melosys-api fatter vedtak automatisk
 *     (FASTSATT_LOVVALGSLAND, DELVIS_AUTOMATISERT, MEDL-overføring)
 *   - A011 (avslag)      → behandling SVAR_ANMODNING_MOTTATT (manuell ny vurdering)
 *
 * Svaret routes av SvarAnmodningUnntakSedRuter (korrelert via rinaSaksnummer) til
 * prosessen ANMODNING_OM_UNNTAK_SVAR. Bug-klynge testen vokter mot: MELOSYS-6836
 * (to oppgaver — asserterer NØYAKTIG én behandlingsoppgave), 7124 (kan ikke sende
 * NV) og 5415 (stegvelger åpnes ikke) fanges av "ingen feilede prosessinstanser"
 * + at svar-prosessen faktisk avanserer behandlingen.
 *
 * Mock-avhengighet (melosys-docker-compose): LagMelosysEessiMeldingController må
 * støtte `svarAnmodningUnntak`, og eux-mocken må gi NUMERISK rinaSaksnummer
 * (api sin SED-låsreferanse-regex er ^\d+_..._\d+).
 */
test.describe('EU/EØS Anmodning om unntak - motta svar (A002/A011)', () => {

  /**
   * Opprett EU/EØS utsendt-arbeidstaker-sak, send A001 anmodning om unntak,
   * og returner rinaSaksnummer (= caseId på den utgående A001) slik at svaret
   * kan injiseres på SAMME BUC.
   */
  async function opprettSakOgSendAnmodning(page: Page, request: any): Promise<string> {
    const auth = new AuthHelper(page);
    await auth.login();
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new EuEosBehandlingPage(page);
    const unntak = new AnmodningUnntakPage(page);

    console.log('Steg 1: Oppretter EU/EØS utsendt-arbeidstaker-sak');
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype(SAKSTYPER.EU_EOS);
    await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
    await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.UTSENDT_ARBEIDSTAKER);
    await behandling.fyllInnFraTilDato('01.01.2026', '01.01.2027');
    await behandling.velgLand(EU_EOS_LAND.DANMARK);
    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();

    console.log('Steg 2: Venter på prosessinstanser og navigerer til behandling');
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();
    await hovedside.åpneSak('TRIVIELL KARAFFEL -');
    await page.waitForLoadState('networkidle');
    await behandling.klikkBekreftOgFortsett();

    console.log('Steg 3: Velger yrkesaktiv (direkte til) og arbeidsgiver');
    await behandling.velgYrkesaktiv();
    await behandling.velgYrkesaktivDirekteTil();
    await behandling.klikkBekreftOgFortsett();
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');

    console.log('Steg 4: Fyller ut og sender A001 anmodning om unntak');
    await unntak.fyllUtBrevSkjema({
      artikkel: 'FO_883_2004_ART11_3A',
      begrunnelse: 'KORTVARIG_PERIODE_RETUR_NORSK_AG',
    });
    const docsBefore = await fetchStoredSedDocuments(request, 'A001');
    await unntak.klikkSendBrevene();
    const a001 = await findNewRinaSedDocument(request, 'A001', docsBefore);
    console.log(`Steg 5: A001 sendt, rinaSaksnummer=${a001.caseId}`);

    // Vent til anmodning-prosessen er ferdig (behandling -> ANMODNING_UNNTAK_SENDT)
    // slik at rinasak-koblingen er persistert og auto-vedtak-porten er åpen.
    await ventPaaBehandlingStatus('ANMODNING_UNNTAK_SENDT');
    return a001.caseId;
  }

  async function ventPaaBehandlingStatus(target: string, timeoutMs = 30000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let siste = '';
    while (Date.now() < deadline) {
      siste = await withDatabase(async (db) => {
        const r = await db.queryOne<{ STATUS: string }>(
          `SELECT status FROM behandling ORDER BY id DESC FETCH FIRST 1 ROWS ONLY`, {});
        return r?.STATUS ?? '';
      });
      if (siste === target) return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    expect(siste, `Behandling nådde ikke status ${target} innen ${timeoutMs}ms`).toBe(target);
  }

  /** Vent på at ANMODNING_OM_UNNTAK_SVAR-prosessen er ferdig etter mottatt svar. */
  async function ventPaaSvarProsessFerdig(timeoutMs = 30000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await withDatabase(async (db) => {
        const r = await db.queryOne<{ STATUS: string }>(
          `SELECT status FROM prosessinstans WHERE prosess_type = 'ANMODNING_OM_UNNTAK_SVAR'
           ORDER BY registrert_dato DESC FETCH FIRST 1 ROWS ONLY`, {});
        return r?.STATUS ?? null;
      });
      if (status === 'FERDIG') return;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  test('mottar A002 (innvilgelse) - skal fatte vedtak automatisk', async ({ page, request }) => {
    test.setTimeout(180000);
    const unleash = new UnleashHelper(request);
    await unleash.enableFeature('melosys.cdm-4-4');

    const rinaSaksnummer = await opprettSakOgSendAnmodning(page, request);

    console.log('Steg 6: Injiserer A002 (innvilgelse) på samme BUC');
    const sedHelper = new SedHelper(request);
    const resp = await sedHelper.sendSed({
      sedType: 'A002',
      bucType: 'LA_BUC_01',
      rinaSaksnummer,
      fnr: USER_ID_VALID,
      landkode: 'DK',
      svarAnmodningUnntak: { beslutning: 'INNVILGELSE', begrunnelse: 'Innvilget av utenlandsk myndighet' },
    });
    expect(resp.success, `A002-injeksjon feilet: ${resp.message}`).toBe(true);

    console.log('Steg 7: Venter på at svaret routes og vedtak fattes automatisk');
    await ventPaaSvarProsessFerdig();
    await ventPaaBehandlingStatus('AVSLUTTET');
    await waitForProcessInstances(request, 30);

    console.log('Steg 8: Verifiserer auto-vedtak');
    const svar = new SvarAnmodningUnntakAssertions(page);
    await svar.verifiserAutoVedtakVedInnvilgelse(request);
  });

  test('mottar A011 (avslag) - skal kreve manuell ny vurdering', async ({ page, request }) => {
    test.setTimeout(180000);
    const unleash = new UnleashHelper(request);
    await unleash.enableFeature('melosys.cdm-4-4');

    const rinaSaksnummer = await opprettSakOgSendAnmodning(page, request);

    console.log('Steg 6: Injiserer A011 (avslag) på samme BUC');
    const sedHelper = new SedHelper(request);
    const resp = await sedHelper.sendSed({
      sedType: 'A011',
      bucType: 'LA_BUC_01',
      rinaSaksnummer,
      fnr: USER_ID_VALID,
      landkode: 'DK',
      svarAnmodningUnntak: { beslutning: 'AVSLAG', begrunnelse: 'Avslått av utenlandsk myndighet' },
    });
    expect(resp.success, `A011-injeksjon feilet: ${resp.message}`).toBe(true);

    console.log('Steg 7: Venter på at svaret routes (manuell vurdering)');
    await ventPaaSvarProsessFerdig();
    await ventPaaBehandlingStatus('SVAR_ANMODNING_MOTTATT');
    await waitForProcessInstances(request, 30);

    console.log('Steg 8: Verifiserer manuell vurdering kreves');
    const svar = new SvarAnmodningUnntakAssertions(page);
    await svar.verifiserManuellVurderingVedAvslag(request);
  });
});
