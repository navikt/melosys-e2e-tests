import {expect, test} from '../../fixtures';
import {AuthHelper} from '../../helpers/auth-helper';
import {HovedsidePage} from '../../pages/hovedside.page';
import {OpprettNySakPage} from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {MedlemskapPage} from '../../pages/behandling/medlemskap.page';
import {ArbeidsforholdPage} from '../../pages/behandling/arbeidsforhold.page';
import {LovvalgPage} from '../../pages/behandling/lovvalg.page';
import {ResultatPeriodePage} from '../../pages/behandling/resultat-periode.page';
import {TrygdeavgiftPage} from '../../pages/trygdeavgift/trygdeavgift.page';
import {AarsavregningPage} from '../../pages/behandling/aarsavregning.page';
import {VedtakPage} from '../../pages/vedtak/vedtak.page';
import {verifiserAarsavregningBehandling} from '../../pages/behandling/aarsavregning.assertions';
import {FORRIGE_AAR, USER_ID_VALID} from '../../pages/shared/constants';
import {UnleashHelper} from '../../helpers/unleash-helper';
import {TestPeriods} from '../../helpers/date-helper';
import {waitForProcessInstances} from '../../helpers/api-helper';
import {getFakturaserieReferanse, withDatabase} from '../../helpers/db-helper';
import {withFaktureringDatabase} from '../../helpers/pg-db-helper';
import {FaktureringHelper} from '../../helpers/fakturering-helper';

/**
 * MELOSYS-8006: Årsavregning krediterer hele fjoråret når ny vurdering fjerner året
 *
 * Scenario (akseptansekriterium 1 i storyen):
 *  1. Toggle `melosys.faktureringskomponenten.ikke-tidligere-perioder` AV.
 *  2. Førstegangsbehandling FTRL yrkesaktiv med medlemskapsperiode 01.12.<fjor> – 31.12.<i år>,
 *     ikke-skattepliktig → fakturaserie opprettes, også for desember i fjor.
 *  3. Toggle PÅ.
 *  4. Ny vurdering som avkorter perioden til 01.01.<i år> – 31.12.<i år>. Fjoråret faller bort.
 *  5. Melosys oppretter automatisk årsavregning for fjoråret (OppretteÅrsavregningVedEndring).
 *  6. Årsavregningen har ingen avgiftspliktig periode for fjoråret: endelig avgift skal være 0,
 *     grunnlag for tidligere trygdeavgift kopieres fra førstegangsbehandlingen, og differansen er
 *     full kreditering av det som ble fakturert for fjoråret.
 *  7. Vedtak på årsavregningen skal gå gjennom (brev + kreditnota), uten at saksbehandler
 *     beregner eller oppgir endelig avgift.
 *
 * Bakgrunn: før fiksen ble beregnet avgift og beløp til fakturering stående som null når året
 * var fjernet, slik at vedtaksbrev («BeregnetAvgiftBelop finnes ikke») og fakturasteget
 * («tilFaktureringBeloep er ikke satt») feilet.
 *
 * STATUS: Skrevet mot melosys-api-branchen 8006-aarsavregning-endelig-avgift-null (PR #3440).
 * Ikke kjørt lokalt ennå (stacken var ikke oppe) — forventes RØD mot main/latest til PR-en er
 * merget, og må verifiseres i CI mot feature-image før den regnes som grønn.
 */

const TOGGLE_IKKE_TIDLIGERE_PERIODER = 'melosys.faktureringskomponenten.ikke-tidligere-perioder';
const INNEVÆRENDE_AAR = new Date().getFullYear();

/** Periode over to år: desember i fjor til og med hele inneværende år (som i Jira-testtilfellet). */
const PERIODE_FØRSTEGANG = {
    start: `01.12.${FORRIGE_AAR}`,
    end: `31.12.${INNEVÆRENDE_AAR}`,
};

function hentSaksnummerFraUrl(url: string): string {
    const pathname = new URL(url).pathname;
    const saksnummer =
        pathname.match(/\b(MEL-\d+)\b/)?.[1] ?? pathname.match(/saksbehandling\/(\d{10,})/)?.[1];
    if (!saksnummer) {
        throw new Error(`Fant ikke saksnummer i URL-en: ${url}`);
    }
    return decodeURIComponent(saksnummer);
}

function hentBehandlingIdFraUrl(url: string): string {
    const id = new URL(url).searchParams.get('behandlingID');
    if (!id) {
        throw new Error(`Fant ikke behandlingID i URL-en: ${url}`);
    }
    return id;
}

type AarsavregningRad = {
    AAR: number;
    BEREGNET_AVGIFT_BELOP: number | null;
    MANUELT_AVGIFT_BELOEP: number | null;
    TIDLIGERE_FAKTURERT_BELOEP: number | null;
    TIL_FAKTURERING_BELOEP: number | null;
    ENDELIG_AVGIFT_VALG: string | null;
};

async function hentAarsavregningRad(behandlingId: string): Promise<AarsavregningRad> {
    return await withDatabase(async (db) => {
        const rad = await db.queryOne<AarsavregningRad>(
            // BEHANDLINGSRESULTAT har behandling_id som PK, så BEHANDLINGSRESULTAT_ID = behandlingens ID
            `SELECT AAR,
                    BEREGNET_AVGIFT_BELOP,
                    MANUELT_AVGIFT_BELOEP,
                    TIDLIGERE_FAKTURERT_BELOEP,
                    TIL_FAKTURERING_BELOEP,
                    ENDELIG_AVGIFT_VALG
               FROM AARSAVREGNING
              WHERE BEHANDLINGSRESULTAT_ID = :id`,
            {id: behandlingId}
        );
        expect(rad, `Forventet AARSAVREGNING-rad for behandling ${behandlingId}`).not.toBeNull();
        return rad!;
    });
}

test.describe('Årsavregning når ny vurdering fjerner fjoråret (MELOSYS-8006)', () => {
    test('endelig avgift settes til 0 og hele fjoråret krediteres uten manuell beregning', async ({
        page,
        request,
    }) => {
        test.setTimeout(300_000);

        const auth = new AuthHelper(page);
        const unleash = new UnleashHelper(request);
        const faktureringHelper = new FaktureringHelper(request);

        const hovedside = new HovedsidePage(page);
        const opprettSak = new OpprettNySakPage(page);
        const medlemskap = new MedlemskapPage(page);
        const arbeidsforhold = new ArbeidsforholdPage(page);
        const lovvalg = new LovvalgPage(page);
        const resultatPeriode = new ResultatPeriodePage(page);
        const trygdeavgift = new TrygdeavgiftPage(page);
        const aarsavregning = new AarsavregningPage(page);
        const vedtak = new VedtakPage(page);

        // ---------- Steg 1–2: førstegangsbehandling over to år med toggle AV ----------
        // Togglen må være AV: forrige-års-UI-et i trygdeavgiftssteget krever det, og
        // faktureringskomponenten avviser fakturaserier med perioder i tidligere år når den er PÅ.
        await unleash.disableFeature(TOGGLE_IKKE_TIDLIGERE_PERIODER);
        await auth.login();

        console.log('📝 Oppretter FTRL-sak (yrkesaktiv)...');
        await hovedside.gotoOgOpprettNySak();
        await opprettSak.opprettStandardSak(USER_ID_VALID);
        await opprettSak.assertions.verifiserBehandlingOpprettet();
        await waitForProcessInstances(page.request, 30);
        await hovedside.goto();
        await hovedside.åpneBehandling('TRIVIELL KARAFFEL -');
        const saksnummer = hentSaksnummerFraUrl(page.url());
        console.log(`📌 Saksnummer: ${saksnummer}`);

        console.log(`📝 Medlemskap ${PERIODE_FØRSTEGANG.start} – ${PERIODE_FØRSTEGANG.end}...`);
        await medlemskap.velgPeriode(PERIODE_FØRSTEGANG.start, PERIODE_FØRSTEGANG.end);
        await medlemskap.velgLand('Afghanistan');
        await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
        await medlemskap.klikkBekreftOgFortsett();

        console.log('📝 Arbeidsforhold...');
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');
        const førstegangBehandlingId = hentBehandlingIdFraUrl(page.url());
        console.log(`📌 Førstegangsbehandling: behandlingID=${førstegangBehandlingId}`);

        console.log('📝 Lovvalg (§ 2-8 første ledd a)...');
        await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
        await lovvalg.svarJaPaaFørsteSpørsmål();
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
        await lovvalg.klikkBekreftOgFortsett();

        console.log('📝 Resultat...');
        await resultatPeriode.ventPåSideLastet();
        await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

        console.log('📝 Trygdeavgift (ikke-skattepliktig, inntekt fra utlandet uten AGA)...');
        await trygdeavgift.ventPåSideLastet();
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
        await trygdeavgift.velgBetalesAga(false);
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
        await trygdeavgift.klikkBekreftOgFortsett();

        console.log('📝 Fatter førstegangsvedtak...');
        await vedtak.klikkFattVedtak();
        await waitForProcessInstances(page.request, 60);

        const førstegangFakturaserieRef = await getFakturaserieReferanse(førstegangBehandlingId);
        expect(førstegangFakturaserieRef, 'Førstegangsbehandlingen skal ha fakturaserie').toBeTruthy();

        const førstegangSerie = await faktureringHelper.hentFakturaserie(førstegangFakturaserieRef!);
        faktureringHelper.loggFakturaserie(førstegangSerie);
        const fakturertForrigeAar = faktureringHelper.avrundBelop(
            faktureringHelper.totalBelop(førstegangSerie, FORRIGE_AAR)
        );
        console.log(`📌 Fakturert for ${FORRIGE_AAR} i førstegangsbehandlingen: ${fakturertForrigeAar} kr`);
        expect(fakturertForrigeAar, `Førstegangsbehandlingen skal ha fakturert avgift for ${FORRIGE_AAR}`).toBeGreaterThan(0);

        // Fakturaene må være BESTILT for at avregning/kreditering skal ta dem med
        await withFaktureringDatabase(async (db) => {
            const updated = await db.execute("UPDATE faktura SET status = 'BESTILT'");
            console.log(`📝 Satte ${updated} faktura-rader til BESTILT`);
        });

        // ---------- Steg 3–4: toggle PÅ, ny vurdering avkorter til inneværende år ----------
        await unleash.enableFeature(TOGGLE_IKKE_TIDLIGERE_PERIODER);

        console.log('📝 Oppretter ny vurdering...');
        await hovedside.klikkOpprettNySak();
        await opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD');
        await waitForProcessInstances(page.request, 30);
        await hovedside.goto();
        await hovedside.åpneBehandling('TRIVIELL KARAFFEL -');

        const periodeNV = TestPeriods.fullCurrentYearPeriod;
        console.log(`📝 NV medlemskap avkortet til ${periodeNV.start} – ${periodeNV.end}...`);
        await medlemskap.velgPeriode(periodeNV.start, periodeNV.end);
        await medlemskap.klikkBekreftOgFortsett();

        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');
        const nyVurderingBehandlingId = hentBehandlingIdFraUrl(page.url());
        console.log(`📌 Ny vurdering: behandlingID=${nyVurderingBehandlingId}`);

        console.log('📝 NV lovvalg (§ 2-8 første ledd a)...');
        await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
        await lovvalg.svarJaPaaFørsteSpørsmål();
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
        await lovvalg.klikkBekreftOgFortsett();

        // Resultat og trygdeavgift er replikert fra førstegangen (avkortet til inneværende år)
        await resultatPeriode.klikkBekreftOgFortsett();
        await trygdeavgift.klikkBekreftOgFortsett();

        console.log('📝 Fatter endringsvedtak for ny vurdering...');
        await vedtak.fattVedtakForNyVurdering('FEIL_I_BEHANDLING');
        // NV-vedtaket starter selv OPPRETT_NY_BEHANDLING_AARSAVREGNING (+ innhentingsbrev)
        await waitForProcessInstances(page.request, 60);

        // ---------- Steg 5: årsavregning for fjoråret er opprettet automatisk ----------
        console.log(`🔍 Åpner auto-opprettet årsavregning for ${FORRIGE_AAR}...`);
        await hovedside.goto();
        await hovedside.åpneAarsavregningForSaksnummer(saksnummer);
        await page.waitForURL(/behandlingID=\d+/, {timeout: 15_000});
        const aarsavregningBehandlingId = hentBehandlingIdFraUrl(page.url());
        console.log(`📌 Årsavregning: behandlingID=${aarsavregningBehandlingId}`);

        await verifiserAarsavregningBehandling(aarsavregningBehandlingId, {
            forventetStatus: 'UNDER_BEHANDLING',
            forventetResultatType: 'IKKE_FASTSATT',
            forventetAar: FORRIGE_AAR,
            forventedeProsesser: ['OPPRETT_NY_BEHANDLING_AARSAVREGNING'],
        });

        // ---------- Steg 6: endelig avgift er 0 allerede ved opprettelse ----------
        const radVedOpprettelse = await hentAarsavregningRad(aarsavregningBehandlingId);
        console.log(
            `📌 AARSAVREGNING ved opprettelse: beregnet=${radVedOpprettelse.BEREGNET_AVGIFT_BELOP}, ` +
                `tidligereFakturert=${radVedOpprettelse.TIDLIGERE_FAKTURERT_BELOEP}, ` +
                `tilFakturering=${radVedOpprettelse.TIL_FAKTURERING_BELOEP}, valg=${radVedOpprettelse.ENDELIG_AVGIFT_VALG}`
        );
        expect(Number(radVedOpprettelse.AAR)).toBe(FORRIGE_AAR);
        expect(Number(radVedOpprettelse.BEREGNET_AVGIFT_BELOP), 'Endelig avgift skal være 0 når året er fjernet').toBe(0);
        expect(radVedOpprettelse.MANUELT_AVGIFT_BELOEP, 'Ingen manuell avgift').toBeNull();
        expect(radVedOpprettelse.ENDELIG_AVGIFT_VALG).toBe('OPPLYSNINGER_ENDRET');
        expect(
            Number(radVedOpprettelse.TIDLIGERE_FAKTURERT_BELOEP),
            'Tidligere fakturert skal være det førstegangsbehandlingen fakturerte for fjoråret'
        ).toBeCloseTo(fakturertForrigeAar, 0);
        expect(
            Number(radVedOpprettelse.TIL_FAKTURERING_BELOEP),
            'Beløp til fakturering skal være full kreditering (minus tidligere fakturert)'
        ).toBeCloseTo(-fakturertForrigeAar, 0);

        // ---------- Steg 6 (UI): ingen grunnlag å fylle ut, sum-tabellen viser 0 og kreditering ----------
        await aarsavregning.ventPåSideLastet();
        await aarsavregning.assertions.verifiserValgtÅr(String(FORRIGE_AAR));
        // Adaptiv: klikker «Nei» på inngangsspørsmålet hvis det vises, ellers ingenting
        await aarsavregning.svarNei();

        const sumTabell = page.locator('.sumArsavregningTabell').first();
        await expect(sumTabell).toBeVisible({timeout: 15_000});
        await expect(
            sumTabell.getByRole('row').filter({hasText: /Endelig beregnet trygdeavgift/})
        ).toContainText('0,00 kr');
        await expect(
            sumTabell.getByRole('row').filter({hasText: /Differanse/}),
            'Differansen skal være negativ (kreditering)'
        ).toContainText('−');
        // Feltet for endelig avgift skal ikke kunne fylles ut når året er fjernet
        await expect(page.getByLabel(/Endelig beregnet trygdeavgift/)).toHaveCount(0);

        // ---------- Steg 7: vedtak uten manuell beregning ----------
        await aarsavregning.klikkBekreftOgFortsett();
        await aarsavregning.klikkBekreftPåResultatside();
        await vedtak.assertions.verifiserFattVedtakKnapp();
        await vedtak.klikkFattVedtak();
        await waitForProcessInstances(page.request, 60);

        await verifiserAarsavregningBehandling(aarsavregningBehandlingId, {
            forventetStatus: 'AVSLUTTET',
            forventetResultatType: 'FASTSATT_TRYGDEAVGIFT',
            forventetAar: FORRIGE_AAR,
            forventedeProsesser: ['IVERKSETT_VEDTAK_AARSAVREGNING', 'OPPRETT_OG_DISTRIBUER_BREV'],
        });

        const radEtterVedtak = await hentAarsavregningRad(aarsavregningBehandlingId);
        expect(Number(radEtterVedtak.BEREGNET_AVGIFT_BELOP)).toBe(0);
        expect(Number(radEtterVedtak.TIL_FAKTURERING_BELOEP)).toBeCloseTo(-fakturertForrigeAar, 0);

        // Kreditnota: årsavregningen har egen fakturaserie med negativt beløp lik det fakturerte
        const aarsavregningFakturaserieRef = await getFakturaserieReferanse(aarsavregningBehandlingId);
        expect(aarsavregningFakturaserieRef, 'Årsavregningen skal ha sendt kreditnota (fakturaserie)').toBeTruthy();
        const kreditSerie = await faktureringHelper.hentFakturaserie(aarsavregningFakturaserieRef!);
        faktureringHelper.loggFakturaserie(kreditSerie);
        const kreditBeløp = faktureringHelper.avrundBelop(faktureringHelper.totalBelop(kreditSerie));
        expect(kreditBeløp, `Kreditnota skal tilsvare hele beløpet fakturert for ${FORRIGE_AAR}`).toBeCloseTo(-fakturertForrigeAar, 0);

        // Netto for fjoråret på tvers av førstegangskjeden og årsavregningen skal være 0
        const nyVurderingFakturaserieRef = await getFakturaserieReferanse(nyVurderingBehandlingId);
        const kjede = await faktureringHelper.hentSammenslåttKjede(
            [førstegangFakturaserieRef!, nyVurderingFakturaserieRef, aarsavregningFakturaserieRef!].filter(
                (ref): ref is string => !!ref
            )
        );
        const nettoForrigeAar = faktureringHelper.avrundBelop(faktureringHelper.totalBelopKjede(kjede, FORRIGE_AAR));
        console.log(`📌 Netto fakturert for ${FORRIGE_AAR} etter årsavregning: ${nettoForrigeAar} kr`);
        expect(nettoForrigeAar, `Netto for ${FORRIGE_AAR} skal være 0 etter kreditering`).toBe(0);
    });
});
