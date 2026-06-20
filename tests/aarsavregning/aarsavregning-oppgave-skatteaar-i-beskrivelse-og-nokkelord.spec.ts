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
import {AdminApiHelper, waitForProcessInstances} from '../../helpers/api-helper';
import {fetchOppgaver, fetchOppgaveV2} from '../../helpers/mock-helper';
import {publishSkattehendelse} from '../../helpers/skattehendelse-helper';
import {TestPeriods, TestPeriodsISO} from '../../helpers/date-helper';
import {withFaktureringDatabase} from '../../helpers/pg-db-helper';

/**
 * MELOSYS-8123: Angi år i beskrivelse ved opprettelse av årsavregningsoppgave
 * MELOSYS-8128: Sett år som nøkkelord på årsavregningsoppgaver via Oppgave-API v2
 *
 * Spec: specs/aarsavregning-oppgave-skatteaar-i-beskrivelse.md (8123)
 * Spec: specs/aarsavregning-oppgave-nokkelord.md (8128)
 *
 * Verifiserer at skatteåret settes i beskrivelsesfeltet (8123) og som nøkkelordet
 * «Årsavregning <år>» (8128) på BEH_ARSAVREG-oppgaven for alle tre automatiske
 * opprettelses-triggere:
 *   1. Skattehendelse fra Skatteetaten (Kafka)
 *   2. Periodisk jobb for ikke-skattepliktige
 *   3. Saksbehandlingsflyt som berører tidligere år
 */

/** AktørId for USER_ID_VALID (30056928150) i PDL-mocken — oppgavens gjelderfelt */
const AKTOER_ID_VALID = '1111111111111';

/**
 * Felles forutsetning: vedtatt FTRL-sak med trygdeavgift som betales til NAV
 * (ikke-skattepliktig). Trigger 1 og 2 bruker forrige-års-periode (default);
 * trigger 3 bruker inneværende år som utgangspunkt for ny vurdering.
 *
 * Toggle melosys.faktureringskomponenten.ikke-tidligere-perioder må være AV
 * under opprettelsen — UI-et for tidligere-års-perioder krever det, og
 * faktureringskomponenten avviser tidligere-års-fakturaserier med togglen PÅ.
 */
async function opprettVedtattIkkeSkattepliktigSak(
    page: Page,
    periode: { start: string; end: string } = TestPeriods.previousYearPeriod
): Promise<void> {
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const resultatPeriode = new ResultatPeriodePage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);

    console.log('📝 Oppretter sak...');
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

    console.log('📝 Fatter vedtak...');
    await vedtak.klikkFattVedtak();
    await waitForProcessInstances(page.request, 30);
}

/**
 * Binder «Så»-linjene i 8123-speken: poller til nøyaktig én BEH_ARSAVREG-oppgave
 * finnes i mockens oppgaveregister, og verifiserer beskrivelse (skatteår),
 * tema, oppgavetype og gjelderfelt. Returnerer oppgave-id for videre
 * nøkkelord-verifisering (8128) — samme id i v1 og v2 av Oppgave-API-et.
 */
async function verifiserAarsavregningsoppgaveMedSkatteaar(
    request: APIRequestContext,
    skatteaar: number
): Promise<number> {
    await expect
        .poll(
            async () => {
                const oppgaver = await fetchOppgaver(request);
                return oppgaver.filter((o) => o.oppgavetype === 'BEH_ARSAVREG').length;
            },
            {
                message: 'Venter på at BEH_ARSAVREG-oppgave opprettes i oppgaveregisteret',
                timeout: 30_000,
            }
        )
        .toBe(1);

    const oppgaver = await fetchOppgaver(request);
    const oppgave = oppgaver.find((o) => o.oppgavetype === 'BEH_ARSAVREG')!;
    console.log(`🔍 Årsavregningsoppgave: beskrivelse='${oppgave.beskrivelse}'`);

    // Selve akseptansekriteriet (MELOSYS-8123): skatteåret står i beskrivelsesfeltet.
    // Format-robust inntil avklaring fra fagperson ('2025' vs 'Skatteår 2025').
    expect(oppgave.beskrivelse, `Skatteår ${skatteaar} skal stå i beskrivelsesfeltet`).toContain(
        String(skatteaar)
    );

    // «Og oppgaven har ellers riktig tema, oppgavetype og gjelderfelt»
    expect(oppgave.tema, 'Oppgaven skal ha tema Trygdeavgift').toBe('TRY');
    expect(oppgave.behandlingstema, 'FTRL/YRKESAKTIV → UTENFOR_AVTALAND_YRKESAKTIV').toBe('ab0484');
    expect(oppgave.aktoerId, 'Oppgaven skal gjelde testbrukeren').toBe(AKTOER_ID_VALID);

    return oppgave.id;
}

/**
 * Binder «Så»-linjene i 8128-speken: nøkkelordet «Årsavregning <år>» settes av
 * melosys-api i et separat PATCH-kall (Oppgave-API v2) rett ETTER at oppgaven
 * er opprettet/oppdatert — poll til det er på plass. Eksakt format fra
 * OppgaveService: `Årsavregning ${skatteaar}`.
 */
async function verifiserNokkelordPaaOppgave(
    request: APIRequestContext,
    oppgaveId: number,
    skatteaar: number
): Promise<void> {
    const forventet = `Årsavregning ${skatteaar}`;
    await expect
        .poll(
            async () => {
                const oppgave = await fetchOppgaveV2(request, oppgaveId);
                return oppgave.nokkelord;
            },
            {
                message: `Venter på nøkkelordet «${forventet}» på oppgave ${oppgaveId} (Oppgave-API v2)`,
                timeout: 30_000,
            }
        )
        .toContain(forventet);
    console.log(`🔑 Oppgave ${oppgaveId} har nøkkelordet «${forventet}»`);
}

test.describe('Årsavregningsoppgave — skatteår i beskrivelse (MELOSYS-8123)', () => {
    test('skattehendelse for skatteår X gir årsavregningsoppgave med X i beskrivelsen', async ({
        page,
        request,
    }) => {
        test.setTimeout(180_000);
        const auth = new AuthHelper(page);
        const unleash = new UnleashHelper(request);

        // Toggle AV under vedtak: hindrer at saksbehandlingsflyten (trigger 3)
        // auto-oppretter årsavregningen før skattehendelsen får gjort det.
        await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');
        await auth.login();

        await opprettVedtattIkkeSkattepliktigSak(page);

        await unleash.enableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

        console.log(`📨 Sender skattehendelse for skatteår ${FORRIGE_AAR}...`);
        publishSkattehendelse({
            gjelderPeriode: String(FORRIGE_AAR),
            identifikator: USER_ID_VALID,
            hendelsetype: 'NY',
        });

        const oppgaveId = await verifiserAarsavregningsoppgaveMedSkatteaar(request, FORRIGE_AAR);
        await verifiserNokkelordPaaOppgave(request, oppgaveId, FORRIGE_AAR);
        await waitForProcessInstances(page.request, 30);

        // Oppdatering/rebuild av oppgaven går via v1-PUT som nullstiller nokkelord i
        // mocken (asserted semantikk, jf. melosys-docker-compose#148); backend skal
        // re-sette nøkkelordet etterpå. Re-sjekken etter at alle prosessinstanser er
        // ferdige fanger derfor regresjon i backends re-assert-vern.
        await verifiserNokkelordPaaOppgave(request, oppgaveId, FORRIGE_AAR);
    });

    test('ikke-skattepliktig-jobben for skatteår X gir årsavregningsoppgave med X i beskrivelsen', async ({
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
        console.log(`⚙️ Kjører ikke-skattepliktige-jobben for ${periodeISO.start} - ${periodeISO.end}...`);
        await adminApi.finnIkkeSkattepliktigeSaker(request, periodeISO.start, periodeISO.end, true);
        const jobbStatus = await adminApi.waitForIkkeSkattepliktigeSakerJob(request, 60, 1000);
        expect(jobbStatus.antallProsessert, 'Jobben skal prosessere saken').toBe(1);

        const oppgaveId = await verifiserAarsavregningsoppgaveMedSkatteaar(request, FORRIGE_AAR);
        await verifiserNokkelordPaaOppgave(request, oppgaveId, FORRIGE_AAR);
        await waitForProcessInstances(page.request, 30);

        // Oppdatering/rebuild av oppgaven går via v1-PUT som nullstiller nokkelord i
        // mocken (asserted semantikk, jf. melosys-docker-compose#148); backend skal
        // re-sette nøkkelordet etterpå. Re-sjekken etter at alle prosessinstanser er
        // ferdige fanger derfor regresjon i backends re-assert-vern.
        await verifiserNokkelordPaaOppgave(request, oppgaveId, FORRIGE_AAR);
    });

    test('saksbehandlingsflyt som berører tidligere år X gir årsavregningsoppgave med X i beskrivelsen', async ({
        page,
        request,
    }) => {
        test.setTimeout(240_000);
        const auth = new AuthHelper(page);
        const unleash = new UnleashHelper(request);

        // Endringen som berører tidligere år gjøres som ny vurdering: førstegangs-
        // vedtaket gjelder inneværende år (toggle AV — fakturering må akseptere
        // serien), NV endrer perioden til kun forrige år med toggle PÅ slik at
        // OppretteÅrsavregningVedEndring auto-oppretter årsavregningen.
        await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');
        await auth.login();

        await opprettVedtattIkkeSkattepliktigSak(page, TestPeriods.currentYearPeriod);

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

        const oppgaveId = await verifiserAarsavregningsoppgaveMedSkatteaar(request, FORRIGE_AAR);
        await verifiserNokkelordPaaOppgave(request, oppgaveId, FORRIGE_AAR);
        await waitForProcessInstances(page.request, 30);

        // Oppdatering/rebuild av oppgaven går via v1-PUT som nullstiller nokkelord i
        // mocken (asserted semantikk, jf. melosys-docker-compose#148); backend skal
        // re-sette nøkkelordet etterpå. Re-sjekken etter at alle prosessinstanser er
        // ferdige fanger derfor regresjon i backends re-assert-vern.
        await verifiserNokkelordPaaOppgave(request, oppgaveId, FORRIGE_AAR);
    });
});
