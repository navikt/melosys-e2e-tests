import {expect, test} from '../../fixtures';
import type {APIRequestContext, Page} from '@playwright/test';
import {AuthHelper} from '../../helpers/auth-helper';
import {HovedsidePage} from '../../pages/hovedside.page';
import {OpprettNySakPage} from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {MedlemskapPage} from '../../pages/behandling/medlemskap.page';
import {ArbeidsforholdPage} from '../../pages/behandling/arbeidsforhold.page';
import {LovvalgPage} from '../../pages/behandling/lovvalg.page';
import {ResultatPeriodePage} from '../../pages/behandling/resultat-periode.page';
import {TrygdeavgiftPage} from '../../pages/trygdeavgift/trygdeavgift.page';
import {VedtakPage} from '../../pages/vedtak/vedtak.page';
import {FORRIGE_AAR, USER_ID_VALID} from '../../pages/shared/constants';
import {UnleashHelper} from '../../helpers/unleash-helper';
import {waitForProcessInstances} from '../../helpers/api-helper';
import {TestPeriods} from '../../helpers/date-helper';
import {withDatabase} from '../../helpers/db-helper';
import {withFaktureringDatabase} from '../../helpers/pg-db-helper';

/**
 * Årsavregning opprettes automatisk når en eksisterende behandling mangler år.
 * En årsavregning under iverksetting for samme år skal hindre ny opprettelse uten feil.
 *
 * Spesifikasjon: specs/aarsavregning-uten-aar-blokkerer-ikke.md
 */

type IdRad = {ID: number};

/**
 * Oppretter en vedtatt sak for inneværende år med trygdeavgift som betales til NAV.
 * Funksjonsbryteren for tidligere perioder må være av under opprettelsen.
 */
async function opprettVedtattSakInneværendeÅr(page: Page): Promise<void> {
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const resultatPeriode = new ResultatPeriodePage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);

    const periode = TestPeriods.currentYearPeriod;

    console.log('📝 Oppretter sak (inneværende år)...');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();
    await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();

    console.log(`📝 Medlemskap (${periode.start} - ${periode.end})...`);
    await medlemskap.velgPeriode(periode.start, periode.end);
    await medlemskap.velgLand('Afghanistan');
    await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
    await medlemskap.klikkBekreftOgFortsett();

    console.log('📝 Arbeidsforhold...');
    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    console.log('📝 Lovvalg...');
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
    await lovvalg.klikkBekreftOgFortsett();

    console.log('📝 Resultat...');
    await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

    console.log('📝 Trygdeavgift (ikke-skattepliktig)...');
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
    await trygdeavgift.velgBetalesAga(false);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
    await trygdeavgift.klikkBekreftOgFortsett();

    console.log('📝 Fatter førstegangsvedtak...');
    await vedtak.klikkFattVedtak();
    await waitForProcessInstances(page.request, 30);
}

/**
 * Databasen tømmes før hver test, så det skal finnes nøyaktig én fagsak.
 */
async function lesEnesteSaksnummer(): Promise<string> {
    return withDatabase(async (db) => {
        const rader = await db.query<{SAKSNUMMER: string}>('SELECT SAKSNUMMER FROM FAGSAK', {});
        expect(rader.length, 'Forventet nøyaktig én fagsak (ren DB per test)').toBe(1);
        return rader[0].SAKSNUMMER;
    });
}

/**
 * Oppretter en åpen årsavregningsbehandling med behandlingsresultat, men uten rad i
 * `AARSAVREGNING`. Året er dermed ikke fastsatt.
 *
 * @returns ID-en til behandlingen som ble opprettet.
 */
async function gittÅpenÅrsavregningUtenÅr(saksnummer: string): Promise<number> {
    return withDatabase(async (db) => {
        // Saksbehandleridenten må være satt for at behandlingen skal kunne åpnes i brukergrensesnittet.
        await db.execute(
            `INSERT INTO BEHANDLING
                 (SAKSNUMMER, STATUS, BEH_TYPE, REGISTRERT_DATO, ENDRET_DATO,
                  REGISTRERT_AV, ENDRET_AV, BEH_TEMA, BEHANDLINGSFRIST)
             VALUES (:s, 'OPPRETTET', 'ÅRSAVREGNING', SYSTIMESTAMP, SYSTIMESTAMP,
                     'Z123456', 'Z123456', 'YRKESAKTIV', SYSDATE)`,
            {s: saksnummer}
        );

        // Dette er den eneste årsavregningsbehandlingen på saken før vedtaket fattes.
        const rad = await db.queryOne<IdRad>(
            `SELECT ID FROM BEHANDLING WHERE SAKSNUMMER = :s AND BEH_TYPE = 'ÅRSAVREGNING'`,
            {s: saksnummer}
        );
        expect(rad, 'Fant ikke årsavregningsbehandlingen som ble lagt inn i databasen').not.toBeNull();
        const id = Number(rad!.ID);

        await db.execute(
            `INSERT INTO BEHANDLINGSRESULTAT
                 (BEHANDLING_ID, BEHANDLINGSMAATE, RESULTAT_TYPE, REGISTRERT_DATO, ENDRET_DATO)
             VALUES (:id, 'MANUELT', 'IKKE_FASTSATT', SYSTIMESTAMP, SYSTIMESTAMP)`,
            {id}
        );

        const utenÅr = await db.queryOne<{N: number}>(
            'SELECT COUNT(*) AS N FROM AARSAVREGNING WHERE BEHANDLINGSRESULTAT_ID = :id',
            {id}
        );
        expect(
            Number(utenÅr!.N),
            'Årsavregningen skal mangle år (ingen rad i AARSAVREGNING)'
        ).toBe(0);

        console.log(`📌 Opprettet åpen årsavregningsbehandling uten år: behandlingId=${id} (sak ${saksnummer})`);
        return id;
    });
}

/**
 * Finner en årsavregning for året, unntatt behandlingen testen opprettet som forutsetning.
 */
async function finnNyÅrsavregningMedÅr(år: number, ekskluderBehandlingId: number): Promise<number | undefined> {
    return withDatabase(async (db) => {
        const rad = await db.queryOne<IdRad>(
            `SELECT b.ID
             FROM BEHANDLING b
             JOIN AARSAVREGNING a ON a.BEHANDLINGSRESULTAT_ID = b.ID
             WHERE b.BEH_TYPE = 'ÅRSAVREGNING' AND a.AAR = :aar AND b.ID <> :ekskluder`,
            {aar: år, ekskluder: ekskluderBehandlingId}
        );
        return rad ? Number(rad.ID) : undefined;
    });
}

/**
 * Årsavregningen er under iverksetting og har fastsatt trygdeavgift.
 * Den gamle sjekken overså behandlingen fordi resultattypen ikke var `IKKE_FASTSATT`.
 * Dermed startet en ny opprettelse som feilet i duplikatkontrollen.
 *
 * @returns ID-en til behandlingen som ble opprettet.
 */
async function gittÅpenÅrsavregningMedÅr(saksnummer: string, år: number): Promise<number> {
    return withDatabase(async (db) => {
        await db.execute(
            `INSERT INTO BEHANDLING
                 (SAKSNUMMER, STATUS, BEH_TYPE, REGISTRERT_DATO, ENDRET_DATO,
                  REGISTRERT_AV, ENDRET_AV, BEH_TEMA, BEHANDLINGSFRIST)
             VALUES (:s, 'IVERKSETTER_VEDTAK', 'ÅRSAVREGNING', SYSTIMESTAMP, SYSTIMESTAMP,
                     'Z123456', 'Z123456', 'YRKESAKTIV', SYSDATE)`,
            {s: saksnummer}
        );

        // Dette er den eneste årsavregningsbehandlingen på saken før vedtaket fattes.
        const rad = await db.queryOne<IdRad>(
            `SELECT ID FROM BEHANDLING WHERE SAKSNUMMER = :s AND BEH_TYPE = 'ÅRSAVREGNING'`,
            {s: saksnummer}
        );
        expect(rad, 'Fant ikke årsavregningsbehandlingen som ble lagt inn i databasen').not.toBeNull();
        const id = Number(rad!.ID);

        await db.execute(
            `INSERT INTO BEHANDLINGSRESULTAT
                 (BEHANDLING_ID, BEHANDLINGSMAATE, RESULTAT_TYPE, REGISTRERT_DATO, ENDRET_DATO)
             VALUES (:id, 'MANUELT', 'FASTSATT_TRYGDEAVGIFT', SYSTIMESTAMP, SYSTIMESTAMP)`,
            {id}
        );
        await db.execute(
            `INSERT INTO AARSAVREGNING (BEHANDLINGSRESULTAT_ID, AAR) VALUES (:id, :aar)`,
            {id, aar: år}
        );

        const medÅr = await db.queryOne<{N: number}>(
            'SELECT COUNT(*) AS N FROM AARSAVREGNING WHERE BEHANDLINGSRESULTAT_ID = :id AND AAR = :aar',
            {id, aar: år}
        );
        expect(
            Number(medÅr!.N),
            'Årsavregningen skal ha en rad i AARSAVREGNING for året'
        ).toBe(1);

        console.log(`📌 Opprettet åpen årsavregningsbehandling med år=${år}: behandlingId=${id} (sak ${saksnummer})`);
        return id;
    });
}

/**
 * Oppretter en vedtatt sak for inneværende år og en ny vurdering for forrige år.
 * Stopper før vedtaket fattes, slik at testen kan legge inn en eksisterende årsavregning.
 */
async function settOppSakOgNyVurderingTilbakeITid(
    page: Page,
    request: APIRequestContext
): Promise<{saksnummer: string; vedtak: VedtakPage}> {
    const auth = new AuthHelper(page);
    const unleash = new UnleashHelper(request);

    await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');
    await auth.login();

    await opprettVedtattSakInneværendeÅr(page);

    // Fakturaene må ha status `BESTILT` før avregningen ved ny vurdering.
    await withFaktureringDatabase(async (db) => {
        const updated = await db.execute("UPDATE faktura SET status = 'BESTILT'");
        console.log(`📝 Satte ${updated} fakturarader til BESTILT`);
    });

    await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

    const saksnummer = await lesEnesteSaksnummer();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const resultatPeriode = new ResultatPeriodePage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);

    console.log('📝 Oppretter ny vurdering...');
    await hovedside.klikkOpprettNySak();
    await opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD');
    await waitForProcessInstances(page.request, 30);

    await hovedside.goto();
    await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).first().click();

    const periodeNV = TestPeriods.previousYearPeriod;
    console.log(`📝 Medlemskap ved ny vurdering (${periodeNV.start} - ${periodeNV.end})...`);
    await medlemskap.velgPeriode(periodeNV.start, periodeNV.end);
    await medlemskap.klikkBekreftOgFortsett();

    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    console.log('📝 Lovvalg ved ny vurdering (FTRL 2-1 fjerde ledd)...');
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_1');
    await lovvalg.velgBrukersSituasjon('MIDLERTIDIG_ARBEID_2_1_FJERDE_LEDD');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmålIGruppe('Er søkers arbeidsoppdrag i');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Plikter arbeidsgiver å betale');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker lovlig opphold i');
    await lovvalg.klikkBekreftOgFortsett();

    await resultatPeriode.klikkBekreftOgFortsett();
    await trygdeavgift.klikkBekreftOgFortsett();

    return {saksnummer, vedtak};
}

test.describe('Årsavregning uten år blokkerer ikke automatisk opprettelse (MELOSYS-8161)', () => {
    test('åpen årsavregning uten år hindrer ikke automatisk opprettelse for tidligere år', async ({
        page,
        request,
    }) => {
        test.setTimeout(240_000);
        const auth = new AuthHelper(page);
        const unleash = new UnleashHelper(request);

        // Funksjonsbryteren slås på før ny vurdering, slik at endringen for forrige år utløser årsavregning.
        await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');
        await auth.login();

        await opprettVedtattSakInneværendeÅr(page);

        // Fakturaene må ha status `BESTILT` før avregningen ved ny vurdering.
        await withFaktureringDatabase(async (db) => {
            const updated = await db.execute("UPDATE faktura SET status = 'BESTILT'");
            console.log(`📝 Satte ${updated} fakturarader til BESTILT`);
        });

        await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        const saksnummer = await lesEnesteSaksnummer();

        const hovedside = new HovedsidePage(page);
        const opprettSak = new OpprettNySakPage(page);
        const medlemskap = new MedlemskapPage(page);
        const arbeidsforhold = new ArbeidsforholdPage(page);
        const lovvalg = new LovvalgPage(page);
        const resultatPeriode = new ResultatPeriodePage(page);
        const trygdeavgift = new TrygdeavgiftPage(page);
        const vedtak = new VedtakPage(page);

        console.log('📝 Oppretter ny vurdering...');
        await hovedside.klikkOpprettNySak();
        await opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD');
        await waitForProcessInstances(page.request, 30);

        await hovedside.goto();
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).first().click();

        const periodeNV = TestPeriods.previousYearPeriod;
        console.log(`📝 Medlemskap ved ny vurdering (${periodeNV.start} - ${periodeNV.end})...`);
        await medlemskap.velgPeriode(periodeNV.start, periodeNV.end);
        await medlemskap.klikkBekreftOgFortsett();

        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        console.log('📝 Lovvalg ved ny vurdering (FTRL 2-1 fjerde ledd)...');
        await lovvalg.velgBestemmelse('FTRL_KAP2_2_1');
        await lovvalg.velgBrukersSituasjon('MIDLERTIDIG_ARBEID_2_1_FJERDE_LEDD');
        await lovvalg.svarJaPaaFørsteSpørsmål();
        await lovvalg.svarJaPaaSpørsmålIGruppe('Er søkers arbeidsoppdrag i');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Plikter arbeidsgiver å betale');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker lovlig opphold i');
        await lovvalg.klikkBekreftOgFortsett();

        await resultatPeriode.klikkBekreftOgFortsett();
        await trygdeavgift.klikkBekreftOgFortsett();

        // Legg inn årsavregningen etter navigasjonen, slik at den ikke påvirker hvilken behandling som åpnes.
        const utenÅrBehandlingId = await gittÅpenÅrsavregningUtenÅr(saksnummer);

        console.log('📝 Fatter vedtak for ny vurdering (med endring i forrige års periode)...');
        await vedtak.fattVedtakForNyVurdering('FEIL_I_BEHANDLING');
        await waitForProcessInstances(page.request, 60);

        // Opprettelsen skjer asynkront, så vi venter på at årsavregningen finnes i databasen.
        console.log(`🔎 Venter på automatisk opprettet årsavregning for ${FORRIGE_AAR}...`);
        let nyÅrsavregningId: number | undefined;
        await expect
            .poll(
                async () => {
                    nyÅrsavregningId = await finnNyÅrsavregningMedÅr(FORRIGE_AAR, utenÅrBehandlingId);
                    return nyÅrsavregningId !== undefined;
                },
                {
                    message: `Forventet en automatisk opprettet årsavregning for ${FORRIGE_AAR}`,
                    timeout: 30_000,
                }
            )
            .toBe(true);

        // Den nye årsavregningen er ennå ikke ferdigbehandlet og skal ha en åpen status.
        await withDatabase(async (db) => {
            const beh = await db.queryOne<{STATUS: string; BEH_TYPE: string}>(
                'SELECT STATUS, BEH_TYPE FROM BEHANDLING WHERE ID = :id',
                {id: nyÅrsavregningId}
            );
            expect(beh, 'Den nye årsavregningsbehandlingen skal finnes i DB').not.toBeNull();
            expect(beh!.BEH_TYPE, 'Den nye behandlingen skal være en årsavregning').toBe('ÅRSAVREGNING');
            expect(
                beh!.STATUS,
                'Den nye årsavregningen skal være åpen'
            ).not.toBe('AVSLUTTET');

            const resultat = await db.queryOne<{RESULTAT_TYPE: string}>(
                'SELECT RESULTAT_TYPE FROM BEHANDLINGSRESULTAT WHERE BEHANDLING_ID = :id',
                {id: nyÅrsavregningId}
            );
            expect(resultat, 'Den nye årsavregningen skal ha et behandlingsresultat').not.toBeNull();

            const år = await db.queryOne<{AAR: number}>(
                'SELECT AAR FROM AARSAVREGNING WHERE BEHANDLINGSRESULTAT_ID = :id',
                {id: nyÅrsavregningId}
            );
            expect(år, 'Den nye årsavregningen skal ha en AARSAVREGNING-rad').not.toBeNull();
            expect(Number(år!.AAR), `Årsavregningen skal gjelde ${FORRIGE_AAR}`).toBe(FORRIGE_AAR);

            const opprettProsess = await db.queryOne<{STATUS: string}>(
                `SELECT STATUS FROM PROSESSINSTANS
                 WHERE BEHANDLING_ID = :id AND PROSESS_TYPE = 'OPPRETT_NY_BEHANDLING_AARSAVREGNING'`,
                {id: nyÅrsavregningId}
            );
            expect(
                opprettProsess,
                'Forventet en OPPRETT_NY_BEHANDLING_AARSAVREGNING-prosess på den nye årsavregningen'
            ).not.toBeNull();
            expect(
                opprettProsess!.STATUS,
                'Prosessen som oppretter årsavregningen skal være ferdig'
            ).toBe('FERDIG');
        });

        const antallÅrsavregninger = await withDatabase(async (db) =>
            db.queryOne<{N: number}>(
                "SELECT COUNT(*) AS N FROM BEHANDLING WHERE BEH_TYPE = 'ÅRSAVREGNING'",
                {}
            )
        );
        expect(
            Number(antallÅrsavregninger!.N),
            'Det skal finnes minst to årsavregningsbehandlinger: den eksisterende uten år og den nye med år'
        ).toBeGreaterThanOrEqual(2);

        const eksisterendeUtenÅr = await withDatabase(async (db) =>
            db.queryOne<{STATUS: string}>('SELECT STATUS FROM BEHANDLING WHERE ID = :id', {
                id: utenÅrBehandlingId,
            })
        );
        expect(
            eksisterendeUtenÅr,
            'Årsavregningsbehandlingen uten år skal fortsatt finnes på saken'
        ).not.toBeNull();

        // Vent til prosessene er ferdige før databasen ryddes.
        await waitForProcessInstances(page.request, 30);
        console.log('✅ Behandlingen uten år hindret ikke automatisk opprettelse.');
    });

    // Tilbakestilling av eksisterende årsavregning dekkes ikke av dette scenarioet.
    test('årsavregning under iverksetting hindrer ny opprettelse for samme år uten misvisende feil', async ({
        page,
        request,
    }) => {
        test.setTimeout(240_000);

        const {saksnummer, vedtak} = await settOppSakOgNyVurderingTilbakeITid(page, request);

        const medÅrBehandlingId = await gittÅpenÅrsavregningMedÅr(saksnummer, FORRIGE_AAR);

        console.log('📝 Fatter vedtak for ny vurdering (med endring i forrige års periode)...');
        await vedtak.fattVedtakForNyVurdering('FEIL_I_BEHANDLING');
        // En feil under opprettelsen gjør at ventingen kaster et unntak.
        await waitForProcessInstances(page.request, 60);

        const nyId = await finnNyÅrsavregningMedÅr(FORRIGE_AAR, medÅrBehandlingId);
        expect(
            nyId,
            'Ingen ny årsavregning skal opprettes når det finnes en åpen for samme år'
        ).toBeUndefined();

        const antallMedÅr = await withDatabase(async (db) =>
            db.queryOne<{N: number}>(
                `SELECT COUNT(*) AS N
                 FROM BEHANDLING b
                 JOIN AARSAVREGNING a ON a.BEHANDLINGSRESULTAT_ID = b.ID
                 WHERE b.BEH_TYPE = 'ÅRSAVREGNING' AND a.AAR = :aar`,
                {aar: FORRIGE_AAR}
            )
        );
        expect(
            Number(antallMedÅr!.N),
            `Det skal fortsatt finnes nøyaktig én årsavregning for ${FORRIGE_AAR}`
        ).toBe(1);

        const fortsatt = await withDatabase(async (db) =>
            db.queryOne<{STATUS: string}>('SELECT STATUS FROM BEHANDLING WHERE ID = :id', {
                id: medÅrBehandlingId,
            })
        );
        expect(fortsatt, 'Den injiserte årsavregningsbehandlingen skal fortsatt finnes').not.toBeNull();

        await waitForProcessInstances(page.request, 30);
        console.log('✅ Eksisterende årsavregning med år hindret ny opprettelse uten misvisende feil.');
    });
});
