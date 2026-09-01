import { expect, test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import {
  getFakturaserieReferanse,
  ventPåManglendeInnbetalingBehandling,
  withDatabase,
} from '../../helpers/db-helper';
import { FaktureringHelper } from '../../helpers/fakturering-helper';
import { runAndWaitForProcessInstances } from '../../helpers/api-helper';
import { UnleashHelper } from '../../helpers/unleash-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../../pages/behandling/medlemskap.page';
import { ArbeidsforholdPage } from '../../pages/behandling/arbeidsforhold.page';
import { LovvalgPage } from '../../pages/behandling/lovvalg.page';
import { ResultatPeriodePage } from '../../pages/behandling/resultat-periode.page';
import { ManglendeInnbetalingPage } from '../../pages/behandling/manglende-innbetaling.page';
import { AarsavregningPage } from '../../pages/behandling/aarsavregning.page';
import { verifiserAarsavregningBehandling } from '../../pages/behandling/aarsavregning.assertions';
import { TrygdeavgiftPage } from '../../pages/trygdeavgift/trygdeavgift.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import { FORRIGE_AAR, USER_ID_VALID } from '../../pages/shared/constants';

const IKKE_TIDLIGERE_PERIODER = 'melosys.faktureringskomponenten.ikke-tidligere-perioder';

test.describe('Årsavregning etter delvis opphør ved manglende innbetaling', () => {
  test('beregner årsavregning kun for innvilget del av medlemskapsperioden', async ({ page, request }) => {
    test.setTimeout(240_000);

    const unleash = new UnleashHelper(request);
    await unleash.disableFeature(IKKE_TIDLIGERE_PERIODER);

    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const resultatPeriode = new ResultatPeriodePage(page);
    const manglendeInnbetaling = new ManglendeInnbetalingPage(page);
    const aarsavregning = new AarsavregningPage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);
    const fakturering = new FaktureringHelper(request);

    await hovedside.gotoOgOpprettNySak();
    await runAndWaitForProcessInstances(
      page.request,
      async () => {
        await opprettSak.opprettStandardSak(USER_ID_VALID);
        await opprettSak.assertions.verifiserBehandlingOpprettet();
      },
      { timeoutSeconds: 30 }
    );

    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();

    await medlemskap.velgPeriode(`01.03.${FORRIGE_AAR}`, `01.08.${FORRIGE_AAR}`);
    await medlemskap.velgLand('Afghanistan');
    await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
    await medlemskap.klikkBekreftOgFortsett();

    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    const opprinneligBehandlingId = new URL(page.url()).searchParams.get('behandlingID');
    expect(opprinneligBehandlingId, 'behandlingID skal finnes i URL').not.toBeNull();

    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
    await lovvalg.klikkBekreftOgFortsett();

    await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
    await trygdeavgift.velgBetalesAga(false);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('50000');
    await trygdeavgift.klikkBekreftOgFortsett();

    await runAndWaitForProcessInstances(
      page.request,
      () => vedtak.klikkFattVedtak(),
      { timeoutSeconds: 60 }
    );

    const fakturaserieReferanse = await getFakturaserieReferanse(opprinneligBehandlingId);
    expect(fakturaserieReferanse, 'Førstegangsvedtaket skal opprette en fakturaserie').toBeTruthy();

    const serie = await fakturering.hentFakturaserie(fakturaserieReferanse!);
    const datoIPlanlagtOpphørtDel = `${FORRIGE_AAR}-07-01`;
    const fakturaForOpphørtDel = fakturering
      .fakturaerMedStatus(serie, 'OPPRETTET')
      .find(faktura =>
        faktura.fakturaLinje.some(
          linje => linje.periodeFra <= datoIPlanlagtOpphørtDel && linje.periodeTil >= datoIPlanlagtOpphørtDel
        )
      );

    expect(
      fakturaForOpphørtDel,
      `Forventet en opprettet faktura som dekker ${datoIPlanlagtOpphørtDel}`
    ).toBeTruthy();

    await fakturering.settFakturaStatus(fakturaForOpphørtDel!.fakturaReferanse, 'BESTILT');
    await runAndWaitForProcessInstances(
      page.request,
      () => fakturering.simulerManglendeInnbetaling(fakturaForOpphørtDel!.fakturaReferanse, 0),
      { expectedNew: 2, timeoutSeconds: 60 }
    );

    const manglendeInnbetalingBehandling = await ventPåManglendeInnbetalingBehandling(
      opprinneligBehandlingId!
    );
    await withDatabase(async db => {
      const årsak = await db.queryOne<{ AARSAK_TYPE: string }>(
        'SELECT AARSAK_TYPE FROM BEHANDLINGSAARSAK WHERE BEHANDLING_ID = :id',
        { id: manglendeInnbetalingBehandling.ID }
      );
      expect(årsak?.AARSAK_TYPE).toBe('MELDING_OM_MANGLENDE_INNBETALING');

      const behandling = await db.queryOne<{ OPPGAVE_ID: number | null }>(
        'SELECT OPPGAVE_ID FROM BEHANDLING WHERE ID = :id',
        { id: manglendeInnbetalingBehandling.ID }
      );
      expect(behandling?.OPPGAVE_ID, 'Behandlingen skal ha fått en oppgave').toBeTruthy();

      const prosesser = await db.query<{ PROSESS_TYPE: string; STATUS: string }>(
        `SELECT PROSESS_TYPE, STATUS
         FROM PROSESSINSTANS
         WHERE BEHANDLING_ID = :id`,
        { id: manglendeInnbetalingBehandling.ID }
      );
      expect(
        prosesser.some(
          prosess =>
            prosess.PROSESS_TYPE === 'OPPRETT_NY_BEHANDLING_MANGLENDE_INNBETALING' &&
            prosess.STATUS === 'FERDIG'
        )
      ).toBe(true);
      expect(
        prosesser.some(
          prosess => prosess.PROSESS_TYPE === 'OPPRETT_OG_DISTRIBUER_BREV' && prosess.STATUS === 'FERDIG'
        )
      ).toBe(true);
    });

    await hovedside.goto();
    await hovedside.søkEtterBruker(manglendeInnbetalingBehandling.SAKSNUMMER);
    await hovedside.åpneBehandlingMedId(manglendeInnbetalingBehandling.ID);

    await manglendeInnbetaling.ventPaaSteg();
    await manglendeInnbetaling.velgInnbetalingManglerDelerAvPerioden();
    await manglendeInnbetaling.bekreftOgGaaTilRevurderingsflyt();

    await medlemskap.klikkBekreftOgFortsett();
    await arbeidsforhold.klikkBekreftOgFortsett();
    await lovvalg.klikkBekreftOgFortsett();

    await resultatPeriode.ventPåSideLastet();
    await resultatPeriode.registrerDelvisOpphør(
      `30.06.${FORRIGE_AAR}`,
      `01.07.${FORRIGE_AAR}`,
      `01.08.${FORRIGE_AAR}`,
      'FTRL_2_9_FØRSTE_LEDD_A_HELSE'
    );
    await resultatPeriode.klikkBekreftOgFortsett();

    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.fyllInnSkatteforholdDatoer(0, `01.03.${FORRIGE_AAR}`, `30.06.${FORRIGE_AAR}`);
    await trygdeavgift.velgSkattepliktigForIndeks(0, false);
    await trygdeavgift.velgInntektskildeForIndeks(0, 'INNTEKT_FRA_UTLANDET');
    await trygdeavgift.fyllInnInntektsperiodeDatoer(0, `01.03.${FORRIGE_AAR}`, `30.06.${FORRIGE_AAR}`);
    await trygdeavgift.velgBetalesAgaForIndeks(0, false);
    await trygdeavgift.fyllInnBruttoinntektForIndeksMedApiVent(0, '50000');
    await trygdeavgift.klikkBekreftOgFortsett();

    await runAndWaitForProcessInstances(
      page.request,
      () => vedtak.klikkFattVedtak(),
      { timeoutSeconds: 60 }
    );

    await withDatabase(async db => {
      const resultat = await db.queryOne<{ RESULTAT_TYPE: string }>(
        'SELECT RESULTAT_TYPE FROM BEHANDLINGSRESULTAT WHERE BEHANDLING_ID = :id',
        { id: manglendeInnbetalingBehandling.ID }
      );
      expect(resultat?.RESULTAT_TYPE).toBe('DELVIS_OPPHØRT');

      const perioder = await db.query<{ FOM_DATO: string; TOM_DATO: string; INNVILGELSE_RESULTAT: string }>(
        `SELECT TO_CHAR(FOM_DATO, 'YYYY-MM-DD') AS FOM_DATO,
                TO_CHAR(TOM_DATO, 'YYYY-MM-DD') AS TOM_DATO,
                INNVILGELSE_RESULTAT
         FROM MEDLEMSKAPSPERIODE
         WHERE BEHANDLINGSRESULTAT_ID = :id
         ORDER BY FOM_DATO`,
        { id: manglendeInnbetalingBehandling.ID }
      );
      expect(perioder.map(periode => periode.INNVILGELSE_RESULTAT)).toEqual(['INNVILGET', 'OPPHØRT']);
      expect(perioder[0].TOM_DATO).toBe(`${FORRIGE_AAR}-06-30`);
      expect(perioder[1].FOM_DATO).toBe(`${FORRIGE_AAR}-07-01`);
    });

    await hovedside.gotoOgOpprettNySak();
    await runAndWaitForProcessInstances(
      page.request,
      async () => {
        await opprettSak.opprettAarsavregningPåEksisterendeSak(
          USER_ID_VALID,
          manglendeInnbetalingBehandling.SAKSNUMMER
        );
        await opprettSak.assertions.verifiserBehandlingOpprettet();
      },
      { timeoutSeconds: 30 }
    );

    await hovedside.goto();
    await hovedside.søkEtterBruker(manglendeInnbetalingBehandling.SAKSNUMMER);
    await hovedside.åpneAarsavregningForSaksnummer(manglendeInnbetalingBehandling.SAKSNUMMER);
    const aarsavregningBehandlingId = new URL(page.url()).searchParams.get('behandlingID');
    expect(aarsavregningBehandlingId, 'Årsavregningens behandlingID skal finnes i URL').not.toBeNull();

    await aarsavregning.ventPåSideLastet();
    await aarsavregning.velgÅrOgVentPåOpprettelseOgBeregning(String(FORRIGE_AAR));

    await withDatabase(async db => {
      const perioder = await db.query<{ FOM_DATO: string; TOM_DATO: string; INNVILGELSE_RESULTAT: string }>(
        `SELECT TO_CHAR(FOM_DATO, 'YYYY-MM-DD') AS FOM_DATO,
                TO_CHAR(TOM_DATO, 'YYYY-MM-DD') AS TOM_DATO,
                INNVILGELSE_RESULTAT
         FROM MEDLEMSKAPSPERIODE
         WHERE BEHANDLINGSRESULTAT_ID = :id
         ORDER BY FOM_DATO`,
        { id: aarsavregningBehandlingId }
      );
      expect(perioder).toHaveLength(1);
      expect(perioder[0].INNVILGELSE_RESULTAT).toBe('INNVILGET');
      expect(perioder[0].FOM_DATO).toBe(`${FORRIGE_AAR}-03-01`);
      expect(perioder[0].TOM_DATO).toBe(`${FORRIGE_AAR}-06-30`);
    });

    await aarsavregning.klikkBekreftOgFortsett();
    await vedtak.bekreftSkjønnsmessigInntektsgrunnlag();
    await runAndWaitForProcessInstances(
      page.request,
      () => vedtak.klikkFattVedtak(),
      { timeoutSeconds: 60 }
    );

    await verifiserAarsavregningBehandling(aarsavregningBehandlingId!, {
      forventetResultatType: 'FASTSATT_TRYGDEAVGIFT',
      forventetAar: FORRIGE_AAR,
    });

    await withDatabase(async db => {
      const perioder = await db.query<{ PERIODE_TIL: string }>(
        `SELECT TO_CHAR(TP.PERIODE_TIL, 'YYYY-MM-DD') AS PERIODE_TIL
         FROM TRYGDEAVGIFTSPERIODE TP
         JOIN MEDLEMSKAPSPERIODE MP ON MP.ID = TP.MEDLEMSKAPSPERIODE_ID
         WHERE MP.BEHANDLINGSRESULTAT_ID = :id`,
        { id: aarsavregningBehandlingId }
      );
      expect(perioder.length, 'Årsavregningen skal ha beregnede trygdeavgiftsperioder').toBeGreaterThan(0);
      expect(perioder.every(periode => periode.PERIODE_TIL <= `${FORRIGE_AAR}-06-30`)).toBe(true);
    });

  });
});
