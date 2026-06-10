import {expect, test} from '../../fixtures';
import {AuthHelper} from '../../helpers/auth-helper';
import {HovedsidePage} from '../../pages/hovedside.page';
import {OpprettNySakPage} from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {MedlemskapPage} from '../../pages/behandling/medlemskap.page';
import {ArbeidsforholdPage} from '../../pages/behandling/arbeidsforhold.page';
import {LovvalgPage} from '../../pages/behandling/lovvalg.page';
import {ResultatPeriodePage} from '../../pages/behandling/resultat-periode.page';
import {TrygdeavgiftPage} from '../../pages/trygdeavgift/trygdeavgift.page';
import {VedtakPage} from '../../pages/vedtak/vedtak.page';
import {USER_ID_VALID} from '../../pages/shared/constants';
import {TestPeriods, TestPeriodsISO} from '../../helpers/date-helper';
import {waitForProcessInstances} from '../../helpers/api-helper';
import {getFakturaserieReferanse, withDatabase} from '../../helpers/db-helper';
import {FaktureringHelper} from '../../helpers/fakturering-helper';

/**
 * FTRL § 2-2 yrkesaktiv (pliktig medlemskap) - ren førstegangsbehandling
 *
 * Gap: ftrl-yrkesaktiv-2-2-forstegang-full. § 2-2 har til nå kun vært "vert" for
 * årsavregningstester - dette er den første rene førstegangstesten som verifiserer
 * hele kjeden:
 *
 *   medlemskapsvurdering § 2-2 (pliktig, arbeidstaker i Norge)
 *     → forskudds-trygdeavgift (FORELØPIG)
 *     → fattet vedtak (behandling AVSLUTTET, MEDLEM_I_FOLKETRYGDEN)
 *     → iverksetting (IVERKSETT_VEDTAK_FTRL FERDIG, ingen feilede prosessinstanser)
 *     → fakturaserie faktisk opprettet i faktureringskomponenten
 *       (status OPPRETTET, KVARTAL, 4 kvartals-fakturalinjer à 114 000 for full-års-perioden)
 *
 * Flyt og fasit verifisert live 2026-06-10 (sak MEL-7/behandling 11):
 * brutto 500 000 → sats 7,6 % → 38 000 nkr/md → 4 kvartalslinjer à 114 000 (totalt 456 000).
 *
 * NB: Antall FAKTURAER varierer med kjøredato — kvartaler som allerede har startet
 * slås sammen i én første faktura (f.eks. Q1+Q2 i juni → 3 fakturaer). Antall
 * fakturaLINJER er alltid 4 (én per kvartal), så assertions er på linjenivå +
 * kontiguerlig helårsdekning.
 */
const BRUTTOINNTEKT = '500000';
const FORVENTET_BELOP_PER_KVARTAL = 114000; // 38 000/md × 3 md (sats 7,6 % av 500 000)
const FORVENTET_ANTALL_KVARTALER = 4; // KVARTAL-intervall over full-års-periode

test.describe('FTRL § 2-2 yrkesaktiv - førstegangsbehandling', () => {
    test('skal innvilge pliktig medlemskap § 2-2, fatte vedtak og opprette fakturaserie', async ({page, request}) => {
        test.setTimeout(150000);

        // Setup: Authentication
        const auth = new AuthHelper(page);
        await auth.login();

        // Setup: Page Objects
        const hovedside = new HovedsidePage(page);
        const opprettSak = new OpprettNySakPage(page);
        const medlemskap = new MedlemskapPage(page);
        const arbeidsforhold = new ArbeidsforholdPage(page);
        const lovvalg = new LovvalgPage(page);
        const resultatPeriode = new ResultatPeriodePage(page);
        const trygdeavgift = new TrygdeavgiftPage(page);
        const vedtak = new VedtakPage(page);

        // Step 1: Create new case (FTRL / MEDLEMSKAP_LOVVALG / YRKESAKTIV / FØRSTEGANG / SØKNAD)
        console.log('📝 Step 1: Creating new FTRL case...');
        await hovedside.gotoOgOpprettNySak();
        await opprettSak.opprettStandardSak(USER_ID_VALID);
        await opprettSak.assertions.verifiserBehandlingOpprettet();

        // Step 2: Open behandling
        console.log('📝 Step 2: Opening behandling...');
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();

        // Step 3: Inngang (Medlemskap) - full current year, Afghanistan, full dekning
        // Full-års-periode gir deterministisk kvartalssplitt i fakturaserien, og
        // inneværende år unngår "fastsettes på årsavregning" + ikke-tidligere-perioder-400
        const period = TestPeriods.fullCurrentYearPeriod;
        console.log(`📝 Step 3: Filling inngang/medlemskap (${period.start} - ${period.end})...`);
        await medlemskap.velgPeriode(period.start, period.end);
        await medlemskap.velgLand('Afghanistan');
        await medlemskap.velgTrygdedekning('FULL_DEKNING_FTRL');
        await medlemskap.klikkBekreftOgFortsett();

        // Step 4: Virksomhet (Arbeidsforhold)
        console.log('📝 Step 4: Selecting arbeidsforhold...');
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        // Capture behandlingId from URL for DB assertions
        const behandlingId = new URL(page.url()).searchParams.get('behandlingID');
        expect(behandlingId, 'behandlingID skal finnes i URL').not.toBeNull();
        console.log(`📋 BehandlingId: ${behandlingId}`);

        // Step 5: Bestemmelse (Lovvalg) - § 2-2 pliktig medlemskap, arbeid i Norge
        console.log('📝 Step 5: Answering § 2-2 lovvalg questions...');
        await lovvalg.fyllUtLovvalgPliktig22('Arbeid i Norge');
        await lovvalg.klikkBekreftOgFortsett();

        // Step 6: Perioder - pre-filled INNVILGET ved pliktig medlemskap, bare bekreft
        console.log('📝 Step 6: Confirming pre-filled INNVILGET periode...');
        await resultatPeriode.klikkBekreftOgFortsett();

        // Step 7: Trygdeavgift - ikke skattepliktig, arbeidsinntekt (aga "Ikke relevant"), 500 000
        console.log('📝 Step 7: Filling trygdeavgift...');
        await trygdeavgift.ventPåSideLastet();
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');
        // No velgBetalesAga() - field shows "Ikke relevant" for ARBEIDSINNTEKT
        await trygdeavgift.fyllInnBruttoinntektMedApiVent(BRUTTOINNTEKT);
        await trygdeavgift.klikkBekreftOgFortsett();

        // Step 8: Fatt vedtak
        console.log('📝 Step 8: Making decision...');
        await vedtak.klikkFattVedtak();

        // Step 9: Wait for iverksetting (throws on FAILED process instances)
        console.log('📝 Step 9: Waiting for iverksetting...');
        await waitForProcessInstances(page.request, 60);

        // === DB: behandling AVSLUTTET + behandlingsresultat + prosessinstanser ===
        await withDatabase(async (db) => {
            const behandling = await db.queryOne<{ STATUS: string }>(
                'SELECT STATUS FROM BEHANDLING WHERE ID = :id',
                {id: behandlingId}
            );
            expect(behandling, 'Forventet behandling i DB').not.toBeNull();
            expect(behandling!.STATUS, 'Behandling skal være AVSLUTTET').toBe('AVSLUTTET');
            console.log('✅ Behandling AVSLUTTET');

            const resultat = await db.queryOne<{ RESULTAT_TYPE: string; TRYGDEAVGIFT_TYPE: string }>(
                `SELECT RESULTAT_TYPE, TRYGDEAVGIFT_TYPE
                 FROM BEHANDLINGSRESULTAT
                 WHERE BEHANDLING_ID = :id`,
                {id: behandlingId}
            );
            expect(resultat, 'Forventet behandlingsresultat i DB').not.toBeNull();
            expect(resultat!.RESULTAT_TYPE, 'Resultat skal være MEDLEM_I_FOLKETRYGDEN').toBe('MEDLEM_I_FOLKETRYGDEN');
            expect(resultat!.TRYGDEAVGIFT_TYPE, 'Trygdeavgift skal være FORELØPIG (forskudd)').toBe('FORELØPIG');
            console.log(`✅ Behandlingsresultat: ${resultat!.RESULTAT_TYPE} / trygdeavgift ${resultat!.TRYGDEAVGIFT_TYPE}`);

            const prosesser = await db.query<{ PROSESS_TYPE: string; STATUS: string; SIST_FULLFORT_STEG: string }>(
                `SELECT PROSESS_TYPE, STATUS, SIST_FULLFORT_STEG
                 FROM PROSESSINSTANS
                 WHERE BEHANDLING_ID = :id`,
                {id: behandlingId}
            );
            expect(prosesser.length, 'Forventet prosessinstanser for behandlingen').toBeGreaterThan(0);
            for (const p of prosesser) {
                expect(p.STATUS, `Prosess ${p.PROSESS_TYPE} skal være FERDIG (sist steg: ${p.SIST_FULLFORT_STEG})`).toBe('FERDIG');
            }
            const iverksett = prosesser.find(p => p.PROSESS_TYPE === 'IVERKSETT_VEDTAK_FTRL');
            expect(iverksett, 'Forventet IVERKSETT_VEDTAK_FTRL-prosessinstans').toBeTruthy();
            console.log(`✅ ${prosesser.length} prosessinstanser FERDIG (inkl. IVERKSETT_VEDTAK_FTRL, sist steg: ${iverksett!.SIST_FULLFORT_STEG})`);
        });

        // === Fakturaserie: referanse i DB + faktisk opprettet i faktureringskomponenten ===
        const fakturaserieReferanse = await getFakturaserieReferanse(behandlingId);
        expect(fakturaserieReferanse, 'FAKTURASERIE_REFERANSE skal være satt på behandlingsresultatet').toBeTruthy();
        console.log(`📋 FakturaserieReferanse: ${fakturaserieReferanse}`);

        const faktureringHelper = new FaktureringHelper(request);
        const serie = await faktureringHelper.hentFakturaserie(fakturaserieReferanse!);
        faktureringHelper.loggFakturaserie(serie);

        const {start: currentYearStart, end: currentYearEnd} = TestPeriodsISO.fullCurrentYearPeriod;

        expect(serie.status, 'Fakturaserie skal ha status OPPRETTET').toBe('OPPRETTET');
        expect(serie.intervall, 'Fakturaserie skal ha intervall KVARTAL').toBe('KVARTAL');
        expect(serie.fodselsnummer).toBe(USER_ID_VALID);
        expect(serie.startdato).toBe(currentYearStart);
        expect(serie.sluttdato).toBe(currentYearEnd);

        // Fakturaene skal dekke hele året kontiguerlig (antall varierer med kjøredato)
        const sorterteFakturaer = [...serie.faktura].sort((a, b) => a.periodeFra.localeCompare(b.periodeFra));
        expect(sorterteFakturaer.length, 'Forventet minst én faktura').toBeGreaterThan(0);
        expect(sorterteFakturaer[0].periodeFra, 'Første faktura skal starte 1. januar').toBe(currentYearStart);
        expect(sorterteFakturaer[sorterteFakturaer.length - 1].periodeTil, 'Siste faktura skal slutte 31. desember').toBe(currentYearEnd);
        for (let i = 1; i < sorterteFakturaer.length; i++) {
            const forrigeTil = new Date(sorterteFakturaer[i - 1].periodeTil);
            const dennesFra = new Date(sorterteFakturaer[i].periodeFra);
            const gapDager = (dennesFra.getTime() - forrigeTil.getTime()) / (1000 * 60 * 60 * 24);
            expect(gapDager, `Fakturaene skal være kontiguerlige (${sorterteFakturaer[i - 1].periodeTil} → ${sorterteFakturaer[i].periodeFra})`).toBe(1);
        }

        // Linjenivå: alltid 4 kvartalslinjer à 114 000 for full-års-perioden
        const alleLinjer = serie.faktura.flatMap(f => f.fakturaLinje);
        expect(alleLinjer.length, `Full-års-periode skal gi ${FORVENTET_ANTALL_KVARTALER} kvartals-fakturalinjer`).toBe(FORVENTET_ANTALL_KVARTALER);
        for (const linje of alleLinjer) {
            expect(faktureringHelper.avrundBelop(linje.belop), `Linje ${linje.periodeFra}→${linje.periodeTil} skal være ${FORVENTET_BELOP_PER_KVARTAL} (38 000/md × 3)`).toBe(FORVENTET_BELOP_PER_KVARTAL);
        }

        const totalt = faktureringHelper.avrundBelop(faktureringHelper.totalBelop(serie));
        expect(totalt, 'Total trygdeavgift for året skal være 38 000/md × 12').toBe(FORVENTET_BELOP_PER_KVARTAL * FORVENTET_ANTALL_KVARTALER);

        console.log(`✅ Fakturaserie ${fakturaserieReferanse} OPPRETTET: ${serie.faktura.length} fakturaer / ${alleLinjer.length} kvartalslinjer à ${FORVENTET_BELOP_PER_KVARTAL}, totalt ${totalt}`);
    });
});
