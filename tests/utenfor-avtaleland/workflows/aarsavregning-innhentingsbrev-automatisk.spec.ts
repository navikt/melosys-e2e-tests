import {expect, test} from '../../../fixtures';
import type {Page} from '@playwright/test';
import {AuthHelper} from '../../../helpers/auth-helper';
import {HovedsidePage} from '../../../pages/hovedside.page';
import {OpprettNySakPage} from '../../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {MedlemskapPage} from '../../../pages/behandling/medlemskap.page';
import {ArbeidsforholdPage} from '../../../pages/behandling/arbeidsforhold.page';
import {LovvalgPage} from '../../../pages/behandling/lovvalg.page';
import {ResultatPeriodePage} from '../../../pages/behandling/resultat-periode.page';
import {TrygdeavgiftPage} from '../../../pages/trygdeavgift/trygdeavgift.page';
import {VedtakPage} from '../../../pages/vedtak/vedtak.page';
import {FORRIGE_AAR, USER_ID_VALID} from '../../../pages/shared/constants';
import {UnleashHelper} from '../../../helpers/unleash-helper';
import {AdminApiHelper, waitForProcessInstances} from '../../../helpers/api-helper';
import {publishSkattehendelse} from '../../../helpers/skattehendelse-helper';
import {TestPeriods, TestPeriodsISO} from '../../../helpers/date-helper';
import {withDatabase} from '../../../helpers/db-helper';

/**
 * MELOSYS-8122: Automatisk sende innhentingsbrev ved automatisk opprettelse av årsavregning
 *
 * Spec: specs/aarsavregning-innhentingsbrev-automatisk.md
 *
 * Brev-søsknen til MELOSYS-8123: identisk auto-årsavregning-trigger, men asserterer at brevet
 * "Innhenting av inntektsopplysninger" (brevmal INNHENTING_AV_INNTEKTSOPPLYSNINGER) sendes
 * automatisk — til bruker når ingen fullmektig er registrert, til fullmektig (FULLMEKTIG_SØKNAD)
 * ellers.
 *
 * STATUS: Verifisert grønt i CI mot melosys-api-feature-imaget (branch
 * 8122-auto-innhentingsbrev-arsavregning). Brevet scopes via prosessdata-flagget
 * SEND_INNHENTINGSBREV i de to auto-flytene — ingen dedikert brev-toggle (droppet etter
 * fagavklaring). Scenario 1+3 (mottaker=bruker) kjørbare; 2+4 (fullmektig) er test.fixme.
 *
 * KONSOLIDERING: Denne testen deler NØYAKTIG samme trigger-oppsett (sak→vedtak→skattehendelse/jobb)
 * som MELOSYS-8123 (arsavregning-oppgave-aar-i-beskrivelse.spec.ts, oppgavebeskrivelse). Når begge
 * sakene er på main kan de slås sammen til én «auto-årsavregning-trigger»-test som asserter både
 * brev (8122) og oppgavebeskrivelse (8123) → fjerner ~90s duplisert oppsett. Holdt separate så lenge
 * sakene er umergede (én Jira/AC per test + uavhengig image/PR-kobling).
 *
 * Tverr-repo flyt + fallgruver: melosys-kode-wiki/flows/aarsavregning-auto-innhentingsbrev.md
 */

/** AktørId for USER_ID_VALID (30056928150) i PDL-mocken — brevets mottaker uten fullmektig */
const AKTOER_ID_VALID = '1111111111111';

/** Brevmal-identifikator slik den står i brevbestilling-DATA (melosys-api Produserbaredokumenter) */
const BREVMAL_INNHENTING = 'INNHENTING_AV_INNTEKTSOPPLYSNINGER';

/**
 * Felles forutsetning: vedtatt FTRL-sak med trygdeavgift som betales til NAV
 * (ikke-skattepliktig), avgiftsperiode i forrige år.
 *
 * Toggle melosys.faktureringskomponenten.ikke-tidligere-perioder må være AV under opprettelsen —
 * forrige-års-UI-et krever det, og faktureringskomponenten avviser tidligere-års-fakturaserier
 * med togglen PÅ. Identisk med MELOSYS-8123 sin opprettVedtattIkkeSkattepliktigSak.
 */
async function opprettVedtattIkkeSkattepliktigSak(page: Page): Promise<void> {
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const resultatPeriode = new ResultatPeriodePage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);

    const periode = TestPeriods.previousYearPeriod;

    console.log('📝 Oppretter sak...');
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();
    // åpneBehandling laster saksoversikten på nytt med retry (finnBehandlingslenke) — robust mot
    // async-lasting-racen der lenken ikke er synlig enda. Foretrekkes framfor direkte getByRole-klikk.
    await hovedside.åpneBehandling('TRIVIELL KARAFFEL -');

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

    console.log('📝 Fatter vedtak...');
    await vedtak.klikkFattVedtak();
    await waitForProcessInstances(page.request, 30);
}

/**
 * DB-klokka rett nå (SYSDATE). Fanges rett FØR en trigger fyres og sendes til
 * verifiserInnhentingsbrevSendt som «tidligst registrert»-grense, slik at brev-søket kun matcher
 * prosessinstanser denne triggeren faktisk laget. Bruker DB-tid (ikke testverts-tid) for å unngå
 * klokkeskew mot Oracle.
 */
async function hentDbTidspunkt(): Promise<Date> {
    return await withDatabase(async (db) => {
        const rad = await db.queryOne<{NAA: Date}>('SELECT SYSDATE AS NAA FROM DUAL');
        return rad!.NAA;
    });
}

/**
 * Binder «Så»-linjene: poller PROSESSINSTANS til en fersk brev-prosessinstans for
 * innhentingsbrevet finnes, og verifiserer at den er FERDIG og adressert til forventet mottaker.
 *
 * Brevet enqueues som en OPPRETT_OG_DISTRIBUER_BREV-prosessinstans med brevmal-identifikatoren i
 * DATA (samme JS-includes-mønster som vedtaksbrev-verifiseringen i eu-eos-12.1).
 *
 * @param mottakerIdentifikatorer mulige mottaker-identifikatorer (fnr og/eller aktørId). Det er
 *   uavklart om brevets DATA lagrer fnr eller aktørId for mottakeren (feature ikke implementert
 *   ennå) — assertionen godtar derfor at minst én av dem står i DATA. Eksakt identifikator pinnes
 *   når feature-branchen lander.
 * @param siden DB-tidspunkt fanget rett før triggeren (hentDbTidspunkt). Brev-søket avgrenses til
 *   prosessinstanser registrert >= dette, så testen aldri kan bli falsk-grønn på et brev fra en
 *   tidligere test/trigger (begge tester lager samme brevmal for samme bruker → ellers umulig å
 *   skille på innhold). Hardere enn det gamle «siste 10 minutter»-vinduet.
 */
async function verifiserInnhentingsbrevSendt(
    mottakerIdentifikatorer: string[],
    siden: Date
): Promise<void> {
    type BrevRad = {DATA: string; STATUS: string; PROSESS_TYPE: string};

    // Brevet enqueues av saksflyt-steget SEND_INNHENTINGSBREV_AARSAVREGNING som en egen barn-
    // prosessinstans OPPRETT_OG_DISTRIBUER_BREV (dokgen-mal → produserOgDistribuerBrev). DATA-
    // kolonnen er serialisert DokgenBrevbestilling-JSON med "produserbartdokument":
    // "INNHENTING_AV_INNTEKTSOPPLYSNINGER" + den oppløste mottakerens ident.
    const hentInnhentingsbrev = async (): Promise<BrevRad | undefined> =>
        await withDatabase(async (db) => {
            // Avgrens til prosessinstanser registrert >= triggertidspunktet (siden) → ekskluderer en
            // evt. sen innkommende rad fra forrige test (cleanup kjører før, ikke etter, og begge
            // tester lager samme brevmal for samme bruker). ORDER BY DESC + .find() treffer den
            // NYESTE matchende brev-prosessinstansen, så matchingen er deterministisk.
            const rader = await db.query<BrevRad>(
                `SELECT PI.DATA, PI.STATUS, PI.PROSESS_TYPE
                 FROM PROSESSINSTANS PI
                 WHERE PI.PROSESS_TYPE = 'OPPRETT_OG_DISTRIBUER_BREV'
                   AND PI.REGISTRERT_DATO >= :siden
                 ORDER BY PI.REGISTRERT_DATO DESC`,
                {siden}
            );
            return rader.find((r) => (r.DATA || '').includes(BREVMAL_INNHENTING));
        });

    // Barn-prosessinstansen opprettes med STATUS=KLAR og plukkes asynkront av saga-workeren
    // (OPPRETT_OG_JOURNALFØR_BREV → DISTRIBUER_JOURNALPOST) før den blir FERDIG. Poll til FERDIG.
    //
    // DEBUG-HINT: Hvis denne henger på KLAR/aldri-FERDIG + api-loggen viser ORA-02291
    // (FK_PIHEND_STEG) → det nye saksflyt-steget mangler rad i PROSESS_STEG-lookup (Flyway). Da blir
    // også parent-prosessinstansen aldri FERDIG (notFinished i waitForProcessInstances). Se
    // melosys-kode-wiki/flows/aarsavregning-auto-innhentingsbrev.md.
    let brev: BrevRad | undefined;
    await expect
        .poll(
            async () => {
                brev = await hentInnhentingsbrev();
                return brev?.STATUS;
            },
            {
                message: `Venter på at innhentingsbrevet (${BREVMAL_INNHENTING}) blir FERDIG`,
                timeout: 60_000,
            }
        )
        .toBe('FERDIG');

    console.log(`🔍 Innhentingsbrev: prosess=${brev!.PROSESS_TYPE}, status=${brev!.STATUS}`);

    // «Så skal Melosys ha sendt brevet "Innhenting av inntektsopplysninger" ... til bruker»
    // (scenario 1/3). Mottakerens ident står i samme DATA (fullmektig-substitusjon skjer FØR
    // prosessinstansen lages). Godtar fnr ELLER aktørId — eksakt format pinnes ved første grønne.
    const dataHarMottaker = mottakerIdentifikatorer.some((id) => (brev!.DATA || '').includes(id));
    expect(
        dataHarMottaker,
        `Brevet skal være adressert til bruker (en av ${mottakerIdentifikatorer.join(' / ')})`
    ).toBe(true);
}

test.describe('Automatisk innhentingsbrev ved årsavregning (MELOSYS-8122)', () => {
    test('skattehendelse uten fullmektig sender innhentingsbrev til bruker', async ({
        page,
        request,
    }) => {
        test.setTimeout(180_000);
        const auth = new AuthHelper(page);
        const unleash = new UnleashHelper(request);

        // Toggle AV under vedtak: hindrer at saksbehandlingsflyt-grenen auto-oppretter
        // årsavregningen før skattehendelsen får gjort det.
        await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');
        await auth.login();

        await opprettVedtattIkkeSkattepliktigSak(page);

        await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        // Fang DB-tid FØR triggeren → brev-søket matcher kun brev denne skattehendelsen laget.
        const triggerTidspunkt = await hentDbTidspunkt();
        console.log(`📨 Sender skattehendelse for skatteår ${FORRIGE_AAR}...`);
        publishSkattehendelse({
            gjelderPeriode: String(FORRIGE_AAR),
            identifikator: USER_ID_VALID,
            hendelsetype: 'NY',
        });

        await verifiserInnhentingsbrevSendt([USER_ID_VALID, AKTOER_ID_VALID], triggerTidspunkt);
        await waitForProcessInstances(page.request, 30);
    });

    test('ikke-skattepliktig-jobben uten fullmektig sender innhentingsbrev til bruker', async ({
        page,
        request,
    }) => {
        test.setTimeout(180_000);
        const auth = new AuthHelper(page);
        const unleash = new UnleashHelper(request);
        const adminApi = new AdminApiHelper();

        // Toggle AV under vedtak: årsavregningen skal opprettes av jobben, ikke av vedtaket.
        await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');
        await auth.login();

        await opprettVedtattIkkeSkattepliktigSak(page);

        await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        const periodeISO = TestPeriodsISO.previousYearPeriod;
        // Fang DB-tid FØR jobben kjøres → brev-søket matcher kun brev denne jobben laget.
        const triggerTidspunkt = await hentDbTidspunkt();
        console.log(`⚙️ Kjører ikke-skattepliktige-jobben for ${periodeISO.start} - ${periodeISO.end}...`);
        await adminApi.finnIkkeSkattepliktigeSaker(request, periodeISO.start, periodeISO.end, true);
        const jobbStatus = await adminApi.waitForIkkeSkattepliktigeSakerJob(request, 60, 1000);
        expect(jobbStatus.antallProsessert, 'Jobben skal prosessere saken').toBe(1);

        await verifiserInnhentingsbrevSendt([USER_ID_VALID, AKTOER_ID_VALID], triggerTidspunkt);
        await waitForProcessInstances(page.request, 30);
    });

    // Scenario 2 og 4 — mottaker = fullmektig (FULLMEKTIG_SØKNAD).
    //
    // Bundet som fixme: det finnes ingen e2e-fikstur for å registrere en FULLMEKTIG_SØKNAD-fullmakt
    // på saken. Fullmakten ligger i melosys-api sin egen `fullmakt`-tabell (Fullmakt → aktoer_id,
    // type) og krever en Aktoer med rolle FULLMEKTIG knyttet til fagsaken. Oppsett-sti for senere
    // aktivering (DB-injeksjon via withDatabase): insert i AKTOER med FULLMEKTIG-rolle på fagsaken
    // + insert i FULLMAKT(aktoer_id, type='FULLMEKTIG_SØKNAD'), deretter samme trigger og assert at
    // brevets DATA inneholder fullmektigens fnr i stedet for brukerens. Å fake oppsettet ville gitt
    // falsk dekning — derfor fixme til fiksturen finnes. Se speken.
    test.fixme('skattehendelse med fullmektig sender innhentingsbrev til fullmektig', async () => {
        // Krever FULLMEKTIG_SØKNAD-fikstur — se kommentar over og speken.
    });

    test.fixme('ikke-skattepliktig-jobben med fullmektig sender innhentingsbrev til fullmektig', async () => {
        // Krever FULLMEKTIG_SØKNAD-fikstur — se kommentar over og speken.
    });
});
