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
 * MELOSYS-8161: Årsavregningsbehandling blir ikke opprettet pga. åpen årsav. beh. uten år.
 *
 * Spec: specs/aarsavregning-uten-aar-blokkerer-ikke.md
 *
 * Når Melosys i en saksbehandlingsflyt automatisk skal opprette en årsavregningsbehandling for et
 * tidligere år, og det allerede finnes en ÅPEN årsavregningsbehandling UTEN fastsatt år på saken,
 * skal den ufullstendige behandlingen IKKE blokkere opprettelsen. Den nye årsavregningen skal
 * likevel opprettes for det aktuelle året, uten en misvisende feilmelding rettet mot manuell
 * saksbehandling.
 *
 * Samme bug-mønster som den allerede fiksede MELOSYS-8045 (ÅrsavregningIkkeSkattepliktigeProsessGenerator
 * → hentÅrFraBehandlingDefensivt), men i OppretteÅrsavregningVedEndring-flyten.
 *
 * STATUS — les status-merknaden i speken:
 *  - Det finnes INGEN 8161-fix-branch i melosys-api ennå → testen asserter målatferden og er IKKE
 *    CI-verifisert (verifiseres mot fiks-branchen i en egen orkestreringsrunde).
 *  - «Åpen årsavregning uten år» = ÅRSAVREGNING-behandling med behandlingsresultat, men UTEN
 *    AARSAVREGNING-rad. Preconditionen injiseres deterministisk via DB (skjema/enum-verdier grunnet
 *    mot live Oracle 2026-06-30) fordi det ikke finnes en verifisert UI-sti for å lage en manuell,
 *    ufullført årsavregning på en eksisterende FTRL-sak.
 */

/** AktørId for USER_ID_VALID i PDL-mocken (ikke brukt direkte her, men dokumenterer testbrukeren). */
const AKTOER_ID_VALID = '1111111111111';
void AKTOER_ID_VALID;

type IdRad = {ID: number};

/**
 * Felles forutsetning: vedtatt FTRL-sak med trygdeavgift som betales til NAV (ikke-skattepliktig).
 * Førstegangsvedtaket gjelder INNEVÆRENDE år — tidligere-års-endringen gjøres etterpå som ny
 * vurdering. Byte-for-byte samme oppskrift som MELOSYS-8148 scenario 1.
 *
 * Toggle melosys.faktureringskomponenten.ikke-tidligere-perioder må være AV under opprettelsen.
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

/** Saksnummeret til den (eneste) fagsaken — cleanup-fixturen gir nøyaktig én fagsak per test. */
async function lesEnesteSaksnummer(): Promise<string> {
    return withDatabase(async (db) => {
        const rader = await db.query<{SAKSNUMMER: string}>('SELECT SAKSNUMMER FROM FAGSAK', {});
        expect(rader.length, 'Forventet nøyaktig én fagsak (ren DB per test)').toBe(1);
        return rader[0].SAKSNUMMER;
    });
}

/**
 * Gitt: en ÅPEN ÅRSAVREGNING-behandling UTEN år på saken.
 *
 * Injiserer den kanoniske «uten år»-tilstanden: en BEHANDLING (BEH_TYPE='ÅRSAVREGNING', åpen) med et
 * BEHANDLINGSRESULTAT, men UTEN AARSAVREGNING-rad. Enum-verdier er FK-verifisert mot live Oracle
 * (BEHANDLING_STATUS/BEHANDLING_TYPE/BEHANDLING_TEMA/BEHANDLINGSMAATE/BEHANDLINGSRESULTAT_TYPE).
 *
 * @returns BEHANDLING.ID for den injiserte uten-år-behandlingen.
 */
async function gittÅpenÅrsavregningUtenÅr(saksnummer: string): Promise<number> {
    return withDatabase(async (db) => {
        // REGISTRERT_AV/ENDRET_AV settes (saksbehandler-ident, som alle ekte behandlinger) slik at
        // stubben kan åpnes i GUI-en. Uten ident gir GET /api/behandlinger/{id} HTTP 500
        // (AzureAdService.hentSaksbehandlerNavn(ident: String) er non-null), GUI-en faller tilbake til
        // ingen-flyt-ruten med behandlingID=-1. Påvirker ikke assertene (kun DB-tilstand verifiseres).
        await db.execute(
            `INSERT INTO BEHANDLING
                 (SAKSNUMMER, STATUS, BEH_TYPE, REGISTRERT_DATO, ENDRET_DATO,
                  REGISTRERT_AV, ENDRET_AV, BEH_TEMA, BEHANDLINGSFRIST)
             VALUES (:s, 'OPPRETTET', 'ÅRSAVREGNING', SYSTIMESTAMP, SYSTIMESTAMP,
                     'Z123456', 'Z123456', 'YRKESAKTIV', SYSDATE)`,
            {s: saksnummer}
        );

        // På injeksjonstidspunktet (før NV-vedtaket fyrer auto-opprettelsen) er dette den ENESTE
        // ÅRSAVREGNING-behandlingen på saken → entydig select-back av den genererte ID-en.
        const rad = await db.queryOne<IdRad>(
            `SELECT ID FROM BEHANDLING WHERE SAKSNUMMER = :s AND BEH_TYPE = 'ÅRSAVREGNING'`,
            {s: saksnummer}
        );
        expect(rad, 'Injeksjon feilet: fant ikke den injiserte ÅRSAVREGNING-behandlingen').not.toBeNull();
        const id = Number(rad!.ID);

        await db.execute(
            `INSERT INTO BEHANDLINGSRESULTAT
                 (BEHANDLING_ID, BEHANDLINGSMAATE, RESULTAT_TYPE, REGISTRERT_DATO, ENDRET_DATO)
             VALUES (:id, 'MANUELT', 'IKKE_FASTSATT', SYSTIMESTAMP, SYSTIMESTAMP)`,
            {id}
        );

        // Verifiser preconditionen: ingen AARSAVREGNING-rad = «uten år». Slår en mislykket injeksjon
        // av ved et tydelig, merket punkt i stedet for som en forvirrende nedstrøms-feil.
        const utenÅr = await db.queryOne<{N: number}>(
            'SELECT COUNT(*) AS N FROM AARSAVREGNING WHERE BEHANDLINGSRESULTAT_ID = :id',
            {id}
        );
        expect(
            Number(utenÅr!.N),
            'Precondition: injisert årsavregning skal være UTEN år (ingen AARSAVREGNING-rad)'
        ).toBe(0);

        console.log(`📌 Injisert åpen ÅRSAVREGNING-behandling UTEN år: behandlingId=${id} (sak ${saksnummer})`);
        return id;
    });
}

/**
 * Finn en ÅRSAVREGNING-behandling som HAR en AARSAVREGNING-rad for gitt år (ekskl. den injiserte
 * uten-år-behandlingen, som per definisjon ikke har en slik rad). Returnerer undefined hvis ingen
 * finnes ennå (auto-opprettelsen er asynkron → poll på denne).
 */
async function finnNyÅrsavregningMedÅr(aar: number, ekskluderBehandlingId: number): Promise<number | undefined> {
    return withDatabase(async (db) => {
        const rad = await db.queryOne<IdRad>(
            `SELECT b.ID
             FROM BEHANDLING b
             JOIN AARSAVREGNING a ON a.BEHANDLINGSRESULTAT_ID = b.ID
             WHERE b.BEH_TYPE = 'ÅRSAVREGNING' AND a.AAR = :aar AND b.ID <> :ekskluder`,
            {aar, ekskluder: ekskluderBehandlingId}
        );
        return rad ? Number(rad.ID) : undefined;
    });
}

/**
 * Gitt: en ÅPEN ÅRSAVREGNING-behandling MED år (aar) på saken, men med behandlingsresultattype
 * != IKKE_FASTSATT. Dette er nettopp feilstien fiksen lukker: den gamle gaten filtrerte på
 * IKKE_FASTSATT og BOMMET på denne, mens den nedstrøms SQL-guarden (kun status != AVSLUTTET) talte
 * den → «opprett-så-kast» med den misvisende feilmeldingen.
 *
 * Tilstanden speiler den ENESTE måten en årsavregning faktisk er «åpen + type != IKKE_FASTSATT» på i
 * prod: vinduet mellom vedtaksfatting og AVSLUTTET. ÅrsavregningVedtakService setter
 * RESULTAT_TYPE=FASTSATT_TRYGDEAVGIFT og flytter behandlingen til IVERKSETTER_VEDTAK før
 * iverksett-prosessen til slutt setter AVSLUTTET. Derfor injiseres nettopp STATUS=IVERKSETTER_VEDTAK +
 * RESULTAT_TYPE=FASTSATT_TRYGDEAVGIFT (ikke MEDLEM_I_FOLKETRYGDEN — det er en FTRL førstegang/NV-
 * resultattype, aldri en årsavregningstype). Enum-verdier FK-verifisert mot live Oracle
 * (AARSAVREGNING-PK = (BEHANDLINGSRESULTAT_ID, AAR), begge NOT NULL).
 *
 * @returns BEHANDLING.ID for den injiserte med-år-behandlingen.
 */
async function gittÅpenÅrsavregningMedÅr(saksnummer: string, aar: number): Promise<number> {
    return withDatabase(async (db) => {
        await db.execute(
            `INSERT INTO BEHANDLING
                 (SAKSNUMMER, STATUS, BEH_TYPE, REGISTRERT_DATO, ENDRET_DATO,
                  REGISTRERT_AV, ENDRET_AV, BEH_TEMA, BEHANDLINGSFRIST)
             VALUES (:s, 'IVERKSETTER_VEDTAK', 'ÅRSAVREGNING', SYSTIMESTAMP, SYSTIMESTAMP,
                     'Z123456', 'Z123456', 'YRKESAKTIV', SYSDATE)`,
            {s: saksnummer}
        );

        // På injeksjonstidspunktet (før NV-vedtaket) er dette den ENESTE ÅRSAVREGNING-behandlingen.
        const rad = await db.queryOne<IdRad>(
            `SELECT ID FROM BEHANDLING WHERE SAKSNUMMER = :s AND BEH_TYPE = 'ÅRSAVREGNING'`,
            {s: saksnummer}
        );
        expect(rad, 'Injeksjon feilet: fant ikke den injiserte ÅRSAVREGNING-behandlingen').not.toBeNull();
        const id = Number(rad!.ID);

        await db.execute(
            `INSERT INTO BEHANDLINGSRESULTAT
                 (BEHANDLING_ID, BEHANDLINGSMAATE, RESULTAT_TYPE, REGISTRERT_DATO, ENDRET_DATO)
             VALUES (:id, 'MANUELT', 'FASTSATT_TRYGDEAVGIFT', SYSTIMESTAMP, SYSTIMESTAMP)`,
            {id}
        );
        await db.execute(
            `INSERT INTO AARSAVREGNING (BEHANDLINGSRESULTAT_ID, AAR) VALUES (:id, :aar)`,
            {id, aar}
        );

        const medÅr = await db.queryOne<{N: number}>(
            'SELECT COUNT(*) AS N FROM AARSAVREGNING WHERE BEHANDLINGSRESULTAT_ID = :id AND AAR = :aar',
            {id, aar}
        );
        expect(
            Number(medÅr!.N),
            'Precondition: injisert årsavregning skal HA år (AARSAVREGNING-rad for året)'
        ).toBe(1);

        console.log(`📌 Injisert åpen ÅRSAVREGNING-behandling MED år=${aar}: behandlingId=${id} (sak ${saksnummer})`);
        return id;
    });
}

/**
 * Felles flyt for scenariene: vedtatt FTRL-sak (inneværende år) + ny vurdering som flytter perioden
 * til kun forrige år, helt fram til (men ikke medregnet) vedtaksfattingen. Returnerer saksnummeret
 * og VedtakPage slik at hver test kan injisere sin precondition rett før vedtaket fattes.
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

    // Fakturaene må være BESTILT for at NV-avregningen skal gå gjennom.
    await withFaktureringDatabase(async (db) => {
        const updated = await db.execute("UPDATE faktura SET status = 'BESTILT'");
        console.log(`📝 Satte ${updated} faktura-rader til BESTILT`);
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
    console.log(`📝 NV medlemskap (${periodeNV.start} - ${periodeNV.end})...`);
    await medlemskap.velgPeriode(periodeNV.start, periodeNV.end);
    await medlemskap.klikkBekreftOgFortsett();

    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    console.log('📝 NV lovvalg (FTRL 2-1 fjerde ledd)...');
    await lovvalg.velgBestemmelse('FTRL_KAP2_2_1');
    await lovvalg.velgBrukersSituasjon('MIDLERTIDIG_ARBEID_2_1_FJERDE_LEDD');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmålIGruppe('Er søkers arbeidsoppdrag i');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Plikter arbeidsgiver å betale');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker lovlig opphold i');
    await lovvalg.klikkBekreftOgFortsett();

    // Resultat og trygdeavgift beholdes fra forrige behandling.
    await resultatPeriode.klikkBekreftOgFortsett();
    await trygdeavgift.klikkBekreftOgFortsett();

    return {saksnummer, vedtak};
}

test.describe('Årsavregning uten år blokkerer ikke automatisk opprettelse (MELOSYS-8161)', () => {
    test('åpen årsavregning uten år hindrer ikke auto-opprettelse for tidligere år', async ({
        page,
        request,
    }) => {
        test.setTimeout(240_000);
        const auth = new AuthHelper(page);
        const unleash = new UnleashHelper(request);

        // Endringen som berører tidligere år gjøres som ny vurdering: førstegangsvedtaket gjelder
        // inneværende år (toggle AV — fakturering må akseptere serien), NV endrer perioden til kun
        // forrige år med toggle PÅ slik at OppretteÅrsavregningVedEndring auto-oppretter årsavregningen.
        await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');
        await auth.login();

        await opprettVedtattSakInneværendeÅr(page);

        // Fakturaene må være BESTILT for at NV-avregningen skal gå gjennom.
        await withFaktureringDatabase(async (db) => {
            const updated = await db.execute("UPDATE faktura SET status = 'BESTILT'");
            console.log(`📝 Satte ${updated} faktura-rader til BESTILT`);
        });

        await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        // Saksnummeret (én fagsak) — trengs for å injisere preconditionen på samme sak.
        const saksnummer = await lesEnesteSaksnummer();

        // Ny vurdering: perioden endres til kun forrige år.
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
        console.log(`📝 NV medlemskap (${periodeNV.start} - ${periodeNV.end})...`);
        await medlemskap.velgPeriode(periodeNV.start, periodeNV.end);
        await medlemskap.klikkBekreftOgFortsett();

        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        console.log('📝 NV lovvalg (FTRL 2-1 fjerde ledd)...');
        await lovvalg.velgBestemmelse('FTRL_KAP2_2_1');
        await lovvalg.velgBrukersSituasjon('MIDLERTIDIG_ARBEID_2_1_FJERDE_LEDD');
        await lovvalg.svarJaPaaFørsteSpørsmål();
        await lovvalg.svarJaPaaSpørsmålIGruppe('Er søkers arbeidsoppdrag i');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Plikter arbeidsgiver å betale');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker lovlig opphold i');
        await lovvalg.klikkBekreftOgFortsett();

        // Resultat og trygdeavgift beholdes fra forrige behandling.
        await resultatPeriode.klikkBekreftOgFortsett();
        await trygdeavgift.klikkBekreftOgFortsett();

        // GITT: en åpen årsavregningsbehandling UTEN år finnes på saken når vedtaket fattes.
        // Injiseres her — etter at all UI-navigasjon for NV-en er ferdig (null UI-interaksjonsrisiko)
        // og rett før vedtaket fyrer OppretteÅrsavregningVedEndring.
        const utenÅrBehandlingId = await gittÅpenÅrsavregningUtenÅr(saksnummer);

        console.log('📝 Fatter vedtak for ny vurdering (med endring i forrige års periode)...');
        await vedtak.fattVedtakForNyVurdering('FEIL_I_BEHANDLING');
        await waitForProcessInstances(page.request, 60);

        // SÅ: Melosys skal automatisk opprette en NY årsavregningsbehandling for FORRIGE_AAR — den
        // injiserte uten-år-behandlingen skal ikke ha blokkert. Auto-opprettelsen er asynkron → poll.
        console.log(`🔎 Venter på auto-opprettet ÅRSAVREGNING for ${FORRIGE_AAR}...`);
        let nyÅrsavregningId: number | undefined;
        await expect
            .poll(
                async () => {
                    nyÅrsavregningId = await finnNyÅrsavregningMedÅr(FORRIGE_AAR, utenÅrBehandlingId);
                    return nyÅrsavregningId !== undefined;
                },
                {
                    message: `Forventet en auto-opprettet ÅRSAVREGNING-behandling for ${FORRIGE_AAR} (uten-år skal ikke blokkere)`,
                    timeout: 30_000,
                }
            )
            .toBe(true);

        // «den nye behandlingen skal knyttes til korrekt kalenderår» + «ikke en misvisende feilmelding» —
        // fokusert DB-sluttilstand. Den auto-opprettede årsavregningen er nettopp opprettet i flyten og
        // ennå ikke saksbehandlet, så den er ÅPEN (ikke AVSLUTTET). Status pinnes IKKE til en bestemt
        // åpen verdi: flyt-auto-opprettede årsavregninger kan være OPPRETTET eller UNDER_BEHANDLING (jf.
        // aarsavregning.assertions.ts), og en åpen behandling kan ha prosesser som ennå ikke er FERDIG —
        // derfor brukes ikke verifiserAarsavregningBehandling (som krever AVSLUTTET-default + alle
        // prosesser FERDIG) her. Bærende: ÅRSAVREGNING-behandling med AARSAVREGNING-rad for FORRIGE_AAR
        // + behandlingsresultat + at OPPRETT_NY_BEHANDLING_AARSAVREGNING-prosessen fullførte (FERDIG, ikke
        // feilet med den misvisende FunksjonellException).
        await withDatabase(async (db) => {
            const beh = await db.queryOne<{STATUS: string; BEH_TYPE: string}>(
                'SELECT STATUS, BEH_TYPE FROM BEHANDLING WHERE ID = :id',
                {id: nyÅrsavregningId}
            );
            expect(beh, 'Den nye årsavregningsbehandlingen skal finnes i DB').not.toBeNull();
            expect(beh!.BEH_TYPE, 'Den nye behandlingen skal være en ÅRSAVREGNING').toBe('ÅRSAVREGNING');
            expect(
                beh!.STATUS,
                'Den nye, nettopp auto-opprettede årsavregningen skal være åpen (ikke AVSLUTTET)'
            ).not.toBe('AVSLUTTET');

            const resultat = await db.queryOne<{RESULTAT_TYPE: string}>(
                'SELECT RESULTAT_TYPE FROM BEHANDLINGSRESULTAT WHERE BEHANDLING_ID = :id',
                {id: nyÅrsavregningId}
            );
            expect(resultat, 'Den nye årsavregningen skal ha et behandlingsresultat').not.toBeNull();

            const aar = await db.queryOne<{AAR: number}>(
                'SELECT AAR FROM AARSAVREGNING WHERE BEHANDLINGSRESULTAT_ID = :id',
                {id: nyÅrsavregningId}
            );
            expect(aar, 'Den nye årsavregningen skal ha en AARSAVREGNING-rad').not.toBeNull();
            expect(Number(aar!.AAR), `Årsavregningen skal gjelde ${FORRIGE_AAR}`).toBe(FORRIGE_AAR);

            // «ikke en misvisende feilmelding rettet mot manuell saksbehandling» — opprett-prosessen
            // fullførte (ville feilet med FunksjonellException dersom uten-år hadde blokkert).
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
                'Opprett-prosessen skal være FERDIG (ingen blokkerende «åpen årsavregning for samme år»-feil)'
            ).toBe('FERDIG');
        });

        // «den ufullstendige behandlingen (uten år) skal ikke ha hindret opprettelsen» — det finnes nå
        // ≥ 2 ÅRSAVREGNING-behandlinger: den injiserte uten-år + den nye med-år.
        const antallÅrsavregninger = await withDatabase(async (db) =>
            db.queryOne<{N: number}>(
                "SELECT COUNT(*) AS N FROM BEHANDLING WHERE BEH_TYPE = 'ÅRSAVREGNING'",
                {}
            )
        );
        expect(
            Number(antallÅrsavregninger!.N),
            'Det skal finnes minst 2 ÅRSAVREGNING-behandlinger (uten-år + den nye med-år)'
        ).toBeGreaterThanOrEqual(2);

        // Den injiserte uten-år-behandlingen skal fortsatt finnes (ble ikke feilaktig avsluttet ved
        // opprettelsen) — den er fremdeles «uten år».
        const utenÅrFortsattÅpen = await withDatabase(async (db) =>
            db.queryOne<{STATUS: string}>('SELECT STATUS FROM BEHANDLING WHERE ID = :id', {
                id: utenÅrBehandlingId,
            })
        );
        expect(
            utenÅrFortsattÅpen,
            'Den uten-år årsavregningsbehandlingen skal fortsatt finnes på saken'
        ).not.toBeNull();

        // «det skal ikke vises en misvisende feilmelding rettet mot manuell saksbehandling» —
        // den misvisende FunksjonellException ville feilet OPPRETT_NY_BEHANDLING_AARSAVREGNING-prosessen
        // (waitForProcessInstances over kaster på feilede instanser) og blitt logget som api-ERROR
        // (docker-log-fixturen fanger det; testen er IKKE @expect-docker-errors-tagget). Bærende bevis
        // er at den nye årsavregningen faktisk ble opprettet (assertions over).

        // Avslutt med waitForProcessInstances slik at cleanup-fixturen ikke treffer aktive prosesser.
        await waitForProcessInstances(page.request, 30);
        console.log('✅ Uten-år-behandlingen blokkerte ikke auto-opprettelsen.');
    });

    // Scenario 2 — eksisterende åpen årsavregning MED år (feilstien) blokkerer fortsatt.
    //
    // Precondition strammet til den FAKTISKE feilstien (jf. spec-ens status-merknad): åpen ÅRSAVREGNING
    // MED AARSAVREGNING-rad AAR=FORRIGE_AAR, men RESULTAT_TYPE != IKKE_FASTSATT. Mot master bommer den
    // gamle IKKE_FASTSATT-filtrerte gaten på den → auto-opprettelsen går videre → SQL-guarden kaster
    // den misvisende feilen (OPPRETT_NY_BEHANDLING_AARSAVREGNING feiler → waitForProcessInstances kaster
    // = RØD). Med fiksen er gaten enig med SQL-guarden og blokkerer rent (GRØNN). «Tilbakestilles»
    // (resetEksisterendeÅrsavregning, MELOSYS-7826) er pre-eksisterende atferd og ikke bundet her.
    test('åpen årsavregning MED år (annen resultattype) blokkerer fortsatt — uten misvisende feil', async ({
        page,
        request,
    }) => {
        test.setTimeout(240_000);

        const {saksnummer, vedtak} = await settOppSakOgNyVurderingTilbakeITid(page, request);

        // GITT: en åpen ÅRSAVREGNING MED år (FORRIGE_AAR), behandlingsresultattype != IKKE_FASTSATT.
        const medÅrBehandlingId = await gittÅpenÅrsavregningMedÅr(saksnummer, FORRIGE_AAR);

        console.log('📝 Fatter vedtak for ny vurdering (med endring i forrige års periode)...');
        await vedtak.fattVedtakForNyVurdering('FEIL_I_BEHANDLING');
        // Med fiksen starter ingen opprett-prosess (gaten blokkerer) → ingen feilende prosess.
        // Mot master ville OPPRETT_NY_BEHANDLING_AARSAVREGNING feilet → dette kallet kastet.
        await waitForProcessInstances(page.request, 60);

        // SÅ: ingen NY årsavregning opprettes for FORRIGE_AAR — fortsatt nøyaktig ÉN ÅRSAVREGNING med
        // AARSAVREGNING-rad for året (den injiserte).
        const nyId = await finnNyÅrsavregningMedÅr(FORRIGE_AAR, medÅrBehandlingId);
        expect(
            nyId,
            'Ingen NY årsavregning skal opprettes når det finnes en åpen for samme år'
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
            `Det skal finnes nøyaktig én ÅRSAVREGNING for ${FORRIGE_AAR} (den injiserte) — ingen ny`
        ).toBe(1);

        // Den injiserte behandlingen skal fortsatt finnes (ikke feilaktig avsluttet/ryddet).
        const fortsatt = await withDatabase(async (db) =>
            db.queryOne<{STATUS: string}>('SELECT STATUS FROM BEHANDLING WHERE ID = :id', {
                id: medÅrBehandlingId,
            })
        );
        expect(fortsatt, 'Den injiserte årsavregningsbehandlingen skal fortsatt finnes').not.toBeNull();

        await waitForProcessInstances(page.request, 30);
        console.log('✅ Eksisterende årsavregning MED år blokkerte ny opprettelse uten misvisende feil.');
    });
});
