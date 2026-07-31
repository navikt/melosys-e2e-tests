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
import {waitForProcessInstances} from '../../helpers/api-helper';
import {hentSaksnummerFraUrl} from '../../helpers/url-helper';
import {withFaktureringDatabase} from '../../helpers/pg-db-helper';
import {AnnulleringPage} from '../../pages/behandling/annullering.page';
import {getFakturaserieReferanse} from '../../helpers/db-helper';
import {FaktureringHelper} from '../../helpers/fakturering-helper';
import {AarsavregningPage} from '../../pages/behandling/aarsavregning.page';
import {TestPeriods} from '../../helpers/date-helper';

/**
 * Komplett saksflyt for FTRL-sak med flere land og pensjon-dekning,
 * etterfulgt av ny vurdering som annulleres.
 *
 * Tester:
 * - Opprettelse av FTRL-sak (Folketrygdloven)
 * - Medlemskap: Flere land (ikke kjent hvilke), delvis dekning (pensjon)
 * - Lovvalg: § 2-8 første ledd a med alle vilkår oppfylt
 * - Trygdeavgift: Ikke-skattepliktig, arbeidsinntekt fra Norge
 * - Vedtak: Fullføring av saksflyt
 * - Faktura: Sett alle rader til BESTILT
 * - Ny vurdering: Opprett og annuller (kansellering)
 */
test.describe('Komplett saksflyt - Flere land med pensjon-dekning og nyvurdering-annullering', () => {
    test('skal fullføre sak med flere land, pensjon-dekning, deretter NV som annulleres', async ({page, request}) => {
        test.setTimeout(120000);

        // Setup
        const auth = new AuthHelper(page);
        await auth.login();

        // Page Objects
        const hovedside = new HovedsidePage(page);
        const opprettSak = new OpprettNySakPage(page);
        const medlemskap = new MedlemskapPage(page);
        const arbeidsforhold = new ArbeidsforholdPage(page);
        const lovvalg = new LovvalgPage(page);
        const resultatPeriode = new ResultatPeriodePage(page);
        const trygdeavgift = new TrygdeavgiftPage(page);
        const vedtak = new VedtakPage(page);
        const annullering = new AnnulleringPage(page);
        const arsavregning = new AarsavregningPage(page);

        // Step 1: Opprett sak
        console.log('Step 1: Creating new case...');
        await hovedside.gotoOgOpprettNySak();
        await opprettSak.opprettStandardSak(USER_ID_VALID);
        await opprettSak.assertions.verifiserBehandlingOpprettet();

        // Step 2: Åpne behandling
        console.log('Step 2: Opening behandling...');
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();

        // Step 3: Medlemskap - Flere land med pensjon-dekning
        const period = TestPeriods.yearBoundaryPeriod
        console.log(`Step 3: Filling medlemskap (${period.start} - ${period.end})...`);
        await medlemskap.velgPeriode(period.start, period.end);
        await medlemskap.velgFlereLandIkkeKjentHvilke();
        await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_B_PENSJON');
        await medlemskap.klikkBekreftOgFortsett();

        // Step 4: Arbeidsforhold
        console.log('Step 4: Selecting arbeidsforhold...');
        await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

        // Step 5: Lovvalg - § 2-8 a med alle vilkår oppfylt
        console.log('Step 5: Answering lovvalg questions...');
        await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
        await lovvalg.svarJaPaaFørsteSpørsmål();
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
        await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
        await lovvalg.klikkBekreftOgFortsett();

        // Step 6: Resultat Periode
        console.log('Step 6: Setting resultat periode...');
        await resultatPeriode.ventPåSideLastet();
        await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

        // Hent behandlingId og saksnummer fra URL. Saksnummeret brukes til å åpne
        // årsavregningen scoped til NETTOPP denne saken (se steg 10) – hvis en tidligere
        // (feilet) kjøring har lekket en avsluttet årsavregning for samme år i en annen sak,
        // ville et løst «Årsavregning»-lokator ellers matche to lenker og gi strict-mode-feil.
        const opprinneligBehandlingId = new URL(page.url()).searchParams.get('behandlingID');
        // Saksnummeret brukes til å scope oppslagene under til NØYAKTIG denne saken – uten
        // det bommer valget hvis en tidligere, feilet kjøring har lekket en sak på samme
        // bruker. Formatvariantene håndteres av hentSaksnummerFraUrl.
        const saksnummer = hentSaksnummerFraUrl(page.url());
        console.log(`OpprinneligBehandlingId: ${opprinneligBehandlingId}, saksnummer: ${saksnummer}`);

        // Step 7: Trygdeavgift - Ikke-skattepliktig med arbeidsinntekt fra Norge
        console.log('Step 7: Filling trygdeavgift...');
        await trygdeavgift.ventPåSideLastet();
        await trygdeavgift.velgSkattepliktig(false);
        await trygdeavgift.velgInntektskilde('ARBEIDSINNTEKT');
        await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
        await trygdeavgift.klikkBekreftOgFortsett();

        // Step 8: Vedtak
        console.log('Step 8: Making decision...');
        await vedtak.klikkFattVedtak();

        // Step 9: Vent på prosesser
        console.log('Step 9: Waiting for processes...');
        await waitForProcessInstances(page.request, 30);

        // Step 10: Søk opp bruker og åpne årsavregningsbehandling
        console.log('Step 10: Opening årsavregning behandling...');
        await hovedside.goto();
        await hovedside.søkEtterBruker(USER_ID_VALID);
        // Scoped til denne sakens saksnummer (åpneAarsavregningForSaksnummer asserter
        // nøyaktig én treff) slik at en evt. lekket årsavregning fra en tidligere kjøring
        // ikke gir strict-mode-brudd på et retry-forsøk.
        await hovedside.åpneAarsavregningForSaksnummer(saksnummer);

        // Step 11: Fyll ut årsavregning
        console.log('Step 11: Filling årsavregning...');
        await arsavregning.svarNei();
        await arsavregning.velgSkattepliktig(false);
        await arsavregning.velgInntektskilde('ARBEIDSINNTEKT_FRA_NORGE');
        await arsavregning.fyllInnBruttoinntektMedApiVent('20000');
        await arsavregning.klikkBekreftOgFortsett();

        // Hent behandlingId fra URL
        const arsavregningBehandlingId = new URL(page.url()).searchParams.get('behandlingID');
        console.log(`ArsavregningBehandlingId: ${arsavregningBehandlingId}`);

        // Step 12: Fatt vedtak for årsavregning
        console.log('Step 12: Making årsavregning decision...');
        await vedtak.klikkFattVedtak();

        await waitForProcessInstances(page.request, 30);
        console.log('✅ Årsavregning vedtak completed');

        await withFaktureringDatabase(async (db) => {
            const updated = await db.execute("UPDATE faktura SET status = 'BESTILT'");
            console.log(`Updated ${updated} faktura rows to BESTILT`);
        });

        // Step 13: Opprett ny vurdering
        console.log('Step 13: Creating nyvurdering...');
        await hovedside.klikkOpprettNySak();
        await opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD', saksnummer);
        await waitForProcessInstances(page.request, 30);

        // Step 14: Åpne ny behandling
        console.log('Step 14: Opening new behandling...');
        await hovedside.goto();
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).first().click();

        // Hent behandlingId fra URL
        const behandlingId = new URL(page.url()).searchParams.get('behandlingID');
        console.log(`BehandlingId: ${behandlingId}`);

        // Step 15: Annuller saken
        console.log('Step 15: Annullering...');
        await annullering.annullerSak();
        await waitForProcessInstances(page.request, 30);

        console.log('✅ Workflow completed successfully!');

        // Verifiserer at annulering har avregnet innværende fakturalinjer
        // Nyvurderingen (behandlingId) annulleres uten vedtak, så den har ingen fakturaserie

        const opprinneligFakturaserieReferanse = await getFakturaserieReferanse(opprinneligBehandlingId);
        const arsavregningFakturaserieRef = await getFakturaserieReferanse(arsavregningBehandlingId);

        if (!opprinneligFakturaserieReferanse || !arsavregningFakturaserieRef) {
            throw new Error(`Fakturaserie referanse er ikke satt. Opprinnelig: ${opprinneligFakturaserieReferanse} (behandlingId: ${opprinneligBehandlingId}), Årsavregning: ${arsavregningFakturaserieRef} (behandlingId: ${arsavregningBehandlingId})`);
        }

        const faktureringHelper = new FaktureringHelper(request);
        // waitForProcessInstances kan svare COMPLETED før annulleringens egen
        // prosessinstans er registrert – selve krediteringen er synkron, så det er
        // registreringen vi poller rundt (se FaktureringHelper.ventPåKjedeSum).
        const alleSerier = await faktureringHelper.ventPåKjedeSum(
            [opprinneligFakturaserieReferanse, arsavregningFakturaserieRef],
            0
        );

        alleSerier.forEach(s => faktureringHelper.loggFakturaserie(s));

        const sum = faktureringHelper.avrundBelop(faktureringHelper.totalBelopKjede(alleSerier));

        expect(sum, 'Sum av fakturaserier skal være 0').toBe(0);
    });
});