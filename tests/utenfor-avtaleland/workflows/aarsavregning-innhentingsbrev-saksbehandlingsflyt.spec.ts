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
import {
    AARSAK,
    BEHANDLINGSTEMA,
    BEHANDLINGSTYPE,
    FORRIGE_AAR,
    SAKSTEMA,
    SAKSTYPER,
    USER_ID_VALID,
} from '../../../pages/shared/constants';
import {UnleashHelper} from '../../../helpers/unleash-helper';
import {waitForProcessInstances} from '../../../helpers/api-helper';
import {TestPeriods} from '../../../helpers/date-helper';
import {withDatabase} from '../../../helpers/db-helper';
import {withFaktureringDatabase} from '../../../helpers/pg-db-helper';
import {setupPensjonistUtenGrunnlagMedAutoAarsavregning} from '../../eu-eos/pensjonist-aarsavregning-setup';

/**
 * MELOSYS-8148: Automatisk sende innhentingsbrev ved opprettelse av årsavregning i flytene
 *
 * Spec: specs/aarsavregning-innhentingsbrev-saksbehandlingsflyt.md
 *
 * MELOSYS-8148 = MELOSYS-8123 sin Trigger 3 (saksbehandlingsflyt som berører tidligere år, gjort
 * som ny vurdering) + MELOSYS-8122 sin brev-assertion. Når Melosys i en saksbehandlingsflyt
 * automatisk oppretter en årsavregningsbehandling for et tidligere år, skal brevet "Innhenting av
 * inntektsopplysninger" (brevmal INNHENTING_AV_INNTEKTSOPPLYSNINGER) sendes automatisk — til
 * bruker når ingen fullmektig er registrert, til fullmektig (FULLMEKTIG_SØKNAD) ellers. Ved
 * MANUELL opprettelse skal brevet IKKE sendes (året er ikke valgt på opprettelsestidspunktet).
 *
 * STATUS: Auto-utsending av brevet i saksbehandlingsflyten er ikke implementert i melosys-api ennå
 * (MELOSYS-8148 er i «Utvikle og teste»). Brev-assertionen i scenario 1 er derfor korrekt RØD til
 * feature-branchen lander; selve trigger-flyten (sak → vedtak → NV for tidligere år → auto-opprettet
 * årsavregning) er grønn i dag. Søsteroppgaven MELOSYS-8122 (samme brev, annen trigger) er
 * implementasjonsmønsteret. Se status-merknaden i speken.
 */

/** AktørId for USER_ID_VALID (30056928150) i PDL-mocken — brevets mottaker uten fullmektig */
const AKTOER_ID_VALID = '1111111111111';

/** Brevmal-identifikator slik den står i SEND_BREV/brevbestilling-DATA (melosys-api Produserbaredokumenter) */
const BREVMAL_INNHENTING = 'INNHENTING_AV_INNTEKTSOPPLYSNINGER';

type BrevRad = {DATA: string; STATUS: string; PROSESS_TYPE: string};

/** Henter en fersk innhentingsbrev-prosessinstans, eller undefined hvis ingen finnes. */
async function hentInnhentingsbrev(): Promise<BrevRad | undefined> {
    return await withDatabase(async (db) => {
        const rader = await db.query<BrevRad>(
            `SELECT PI.DATA, PI.STATUS, PI.PROSESS_TYPE
             FROM PROSESSINSTANS PI
             WHERE PI.PROSESS_TYPE IN ('SEND_BREV', 'OPPRETT_OG_DISTRIBUER_BREV')
               AND PI.REGISTRERT_DATO > SYSDATE - INTERVAL '10' MINUTE`,
            {}
        );
        return rader.find((r) => (r.DATA || '').includes(BREVMAL_INNHENTING));
    });
}

/**
 * Felles forutsetning for scenario 1: vedtatt FTRL-sak med trygdeavgift som betales til NAV
 * (ikke-skattepliktig). Førstegangsvedtaket gjelder INNEVÆRENDE år — den tidligere-års-endringen
 * gjøres etterpå som ny vurdering. Identisk med opprettVedtattIkkeSkattepliktigSak i 8122/8123.
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

/**
 * Binder «Så»-linjene i scenario 1: poller PROSESSINSTANS til en fersk brev-prosessinstans for
 * innhentingsbrevet finnes, og verifiserer at den er FERDIG og adressert til forventet mottaker.
 *
 * @param mottakerIdentifikatorer mulige mottaker-identifikatorer (fnr og/eller aktørId). Det er
 *   uavklart om brevets DATA lagrer fnr eller aktørId (feature ikke implementert ennå) —
 *   assertionen godtar derfor at minst én av dem står i DATA. Eksakt identifikator pinnes når
 *   feature-branchen lander.
 */
async function verifiserInnhentingsbrevSendt(mottakerIdentifikatorer: string[]): Promise<void> {
    // Opprettelsen er asynkron (NV-vedtak → auto-årsavregning → prosessinstans).
    await expect
        .poll(async () => (await hentInnhentingsbrev()) !== undefined, {
            message: `Venter på brev-prosessinstans for ${BREVMAL_INNHENTING}`,
            timeout: 30_000,
        })
        .toBe(true);

    const brev = (await hentInnhentingsbrev())!;
    console.log(`🔍 Innhentingsbrev: prosess=${brev.PROSESS_TYPE}, status=${brev.STATUS}`);

    // «Så skal brevet "Innhenting av inntektsopplysninger" sendes automatisk»
    expect(brev.STATUS, 'Innhentingsbrevet skal være produsert og distribuert (FERDIG)').toBe(
        'FERDIG'
    );

    // «... til bruker» — mottakeren skal stå i brevets DATA. Godtar fnr ELLER aktørId siden
    // eksakt identifikator-format er uavklart til feature lander.
    const dataHarMottaker = mottakerIdentifikatorer.some((id) => (brev.DATA || '').includes(id));
    expect(
        dataHarMottaker,
        `Brevet skal være adressert til bruker (en av ${mottakerIdentifikatorer.join(' / ')})`
    ).toBe(true);
}

/**
 * Binder «Så»-linjen i scenario 3 (negativ): etter at opprettelses-prosessinstansene er FERDIG
 * skal det IKKE finnes noen innhentingsbrev-prosessinstans. Manuell opprettelse trigger ikke
 * brevet (året er ikke valgt på opprettelsestidspunktet).
 */
async function verifiserIngenInnhentingsbrev(): Promise<void> {
    const brev = await hentInnhentingsbrev();
    expect(
        brev,
        'Manuell opprettelse skal IKKE produsere innhentingsbrev (året er ikke valgt enda)'
    ).toBeUndefined();
}

test.describe('Automatisk innhentingsbrev ved årsavregning i saksbehandlingsflyten (MELOSYS-8148)', () => {
    // @expect-docker-errors: NV-flyten trigger en pre-eksisterende, transient GUI-race som er
    // URELATERT til 8148 (8148 endrer kun saga-steget OppretteÅrsavregningVedEndring, ingen
    // GUI/medlemskap/lovvalg-endepunkt). Ved render av NV-lovvalgssteget kaller web
    // `/api/medlemskapsperioder/trygdedekning/lovlige-kombinasjoner` før en bestemmelse er valgt →
    // melosys-api logger `RuntimeException: Finner ingen bestemmelse for :` på ERROR (GUI
    // ExceptionMapper). Selve test-logikken (brevet sendes, FERDIG) er upåvirket og grønn; uten
    // taggen feiler docker-log-fixturen sporadisk på denne ERROR-en (verifisert: CI run 27825161737
    // forsøk 1, behandling 2, requestURI .../lovlige-kombinasjoner). Kun sc1 tagges — sc3/sc4
    // forblir strenge.
    test('saksbehandlingsflyt for tidligere år uten fullmektig sender innhentingsbrev til bruker', async ({
        page,
        request,
    }) => {
        test.setTimeout(240_000);
        const auth = new AuthHelper(page);
        const unleash = new UnleashHelper(request);

        // Endringen som berører tidligere år gjøres som ny vurdering: førstegangsvedtaket gjelder
        // inneværende år (toggle AV — fakturering må akseptere serien), NV endrer perioden til kun
        // forrige år med toggle PÅ slik at OppretteÅrsavregningVedEndring auto-oppretter
        // årsavregningen — som igjen skal utløse innhentingsbrevet.
        await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');
        await auth.login();

        await opprettVedtattSakInneværendeÅr(page);

        // Fakturaene må være BESTILT for at NV-avregningen skal gå gjennom
        await withFaktureringDatabase(async (db) => {
            const updated = await db.execute("UPDATE faktura SET status = 'BESTILT'");
            console.log(`📝 Satte ${updated} faktura-rader til BESTILT`);
        });

        await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        // Ny vurdering: perioden endres til kun forrige år
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

        // Resultat og trygdeavgift beholdes fra forrige behandling
        await resultatPeriode.klikkBekreftOgFortsett();
        await trygdeavgift.klikkBekreftOgFortsett();

        console.log('📝 Fatter vedtak for ny vurdering...');
        await vedtak.fattVedtakForNyVurdering('FEIL_I_BEHANDLING');
        await waitForProcessInstances(page.request, 30);

        // «brevet skal gjelde for inntektsåret X» — NV endret perioden til kun FORRIGE_AAR, så den
        // auto-opprettede årsavregningen (og brevet) gjelder FORRIGE_AAR.
        console.log(`📨 Verifiserer innhentingsbrev for inntektsår ${FORRIGE_AAR}...`);
        await verifiserInnhentingsbrevSendt([USER_ID_VALID, AKTOER_ID_VALID]);
        await waitForProcessInstances(page.request, 30);
    });

    test('manuell opprettelse av årsavregning sender ikke innhentingsbrev', async ({page}) => {
        test.setTimeout(120_000);
        const auth = new AuthHelper(page);
        await auth.login();

        const hovedside = new HovedsidePage(page);
        const opprettSak = new OpprettNySakPage(page);

        // Manuell opprettelse av en årsavregningsbehandling via «Opprett ny sak». Året velges
        // først på selve årsavregningssiden — på opprettelsestidspunktet er det ikke valgt.
        console.log('📝 Oppretter årsavregningsbehandling manuelt...');
        await hovedside.goto();
        await hovedside.klikkOpprettNySak();
        await opprettSak.fyllInnBrukerID(USER_ID_VALID);
        await opprettSak.velgOpprettNySak();
        await opprettSak.velgSakstype(SAKSTYPER.FTRL);
        await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
        await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.YRKESAKTIV);
        await opprettSak.velgBehandlingstype(BEHANDLINGSTYPE.ÅRSAVREGNING);
        await opprettSak.velgAarsak(AARSAK.SØKNAD);
        await opprettSak.leggBehandlingIMine();
        await opprettSak.klikkOpprettNyBehandling();
        await opprettSak.assertions.verifiserBehandlingOpprettet();

        // La opprettelses-prosessinstansene bli ferdige før vi sjekker fravær av brev.
        await waitForProcessInstances(page.request, 30);

        // «Så skal Melosys ikke sende brevet "Innhenting av inntektsopplysninger"»
        console.log('🔍 Verifiserer at ingen innhentingsbrev ble sendt...');
        await verifiserIngenInnhentingsbrev();
    });

    // Scenario 4 (kjørbar negativ) — EØS-pensjonist-UNNTAK.
    //
    // AC: «bortsett fra EØS pensjonister» — de skal IKKE motta innhentingsbrev via denne
    // funksjonaliteten per nå (krever særskilt brevtekst, egen oppgave, jf. Yvonne 2026-06-19).
    // Dette er det samme flyt-SHAPE-et som scenario 1 (en saksbehandlingsflyt der Melosys
    // auto-oppretter en årsavregning for et tidligere år), men for sakstypen EØS-pensjonist —
    // der FTRL ville sendt brev (sc1), skal EØS-pensjonist IKKE få det. Isolerer dermed selve
    // sakstype-unntaket (skalSendeInnhentingsbrev) på samme flyt.
    //
    // Trigger: EØS-pensjonist førstegangsbehandling med HELE perioden i et tidligere år (2024)
    // og default toggle-state → trygdeavgift fastsettes ikke på førstegangen, og årsavregningen
    // auto-opprettes ved «Bekreft og send» (prosess OPPRETT_NY_BEHANDLING_AARSAVREGNING). Gjenbruk
    // av setupPensjonistUtenGrunnlagMedAutoAarsavregning (tests/eu-eos). Etter at setup returnerer
    // er auto-opprettelsens prosessinstanser FERDIG (setup venter 60s) og årsavregningsvedtaket er
    // ennå IKKE fattet — så et evt. innhentingsbrev ville vært synlig her, men resultatbrevet
    // (annen brevmal) er det ikke. verifiserIngenInnhentingsbrev filtrerer eksakt på
    // INNHENTING_AV_INNTEKTSOPPLYSNINGER, så den treffer kun innhentingsbrevet.
    test('EØS-pensjonist auto-årsavregning i saksbehandlingsflyt sender ikke innhentingsbrev', async ({
        page,
    }) => {
        test.setTimeout(240_000);
        const auth = new AuthHelper(page);
        await auth.login();

        console.log('📝 EØS-pensjonist saksbehandlingsflyt → auto-opprettet årsavregning (2024)...');
        await setupPensjonistUtenGrunnlagMedAutoAarsavregning(page);

        // «Så skal Melosys ikke sende brevet "Innhenting av inntektsopplysninger"» (EØS-pensjonist-unntak)
        console.log('🔍 Verifiserer at EØS-pensjonist IKKE fikk innhentingsbrev...');
        await verifiserIngenInnhentingsbrev();

        await waitForProcessInstances(page.request, 30);
    });

    // Scenario 2 — mottaker = fullmektig (FULLMEKTIG_SØKNAD).
    //
    // Bundet som fixme: det finnes ingen e2e-fikstur for å registrere en FULLMEKTIG_SØKNAD-fullmakt
    // på saken (identisk begrunnelse som MELOSYS-8122). Fullmakten ligger i melosys-api sin egen
    // `fullmakt`-tabell (Fullmakt → aktoer_id, type) og krever en Aktoer med rolle FULLMEKTIG
    // knyttet til fagsaken. Oppsett-sti for senere aktivering (DB-injeksjon via withDatabase):
    // insert i AKTOER med FULLMEKTIG-rolle på fagsaken + insert i FULLMAKT(aktoer_id,
    // type='FULLMEKTIG_SØKNAD'), deretter samme NV-trigger og assert at brevets DATA inneholder
    // fullmektigens fnr i stedet for brukerens. Å fake oppsettet ville gitt falsk dekning — derfor
    // fixme til fiksturen finnes. Se speken.
    test.fixme(
        'saksbehandlingsflyt for tidligere år med fullmektig sender innhentingsbrev til fullmektig',
        async () => {
            // Krever FULLMEKTIG_SØKNAD-fikstur — se kommentar over og speken.
        }
    );
});
