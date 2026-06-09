import {test, expect} from '../../fixtures';
import {AuthHelper} from '../../helpers/auth-helper';
import {HovedsidePage} from '../../pages/hovedside.page';
import {OpprettNySakPage} from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {EuEosBehandlingPage} from '../../pages/behandling/eu-eos-behandling.page';
import {USER_ID_VALID} from '../../pages/shared/constants';
import {waitForProcessInstances} from '../../helpers/api-helper';
import {withDatabase} from '../../helpers/db-helper';
import {
    fetchStoredSedDocuments, findNewNavFormatSed,
    fetchStoredJournalposter, findNewUtgaaendeJournalpost,
} from '../../helpers/mock-helper';

/**
 * EU/EØS 12.1 - Iverksetting / mottaker-kjede (UTSENDT_ARBEIDSTAKER)
 *
 * Gap: iverksetting-mottaker-kjede-brev-sed. Den eksisterende 12.1-testen stopper på
 * "vedtak fattet" uten DB/SED/brev-assert. Denne verifiserer hele iverksettingskjeden
 * for en utsendt arbeidstaker (PD-A1 / lovvalgsvedtak):
 *  - IVERKSETT_VEDTAK_EOS fullfører (FERDIG, ingen feilede prosessinstanser)
 *  - A009 lovvalgsvedtak-SED (LA_BUC_01) sendes til mottakerinstitusjon (Danmark)
 *  - utgående EESSI-journalpost opprettes og ferdigstilles (hele Kafka-sløyfen)
 *  - lovvalgsperioden overføres til MEDL (medlperiode_id satt)
 *
 * NB: Utsendt arbeidstaker (LA_BUC_01) sender A009, ikke A003 (som "arbeid i flere land"/LA_BUC_02).
 */
const FRA = '01.01.2024';
const TIL = '31.12.2025';

test.describe('EU/EØS 12.1 - Iverksetting mottaker-kjede (UTSENDT_ARBEIDSTAKER)', () => {
    test('skal iverksette vedtak og verifisere MEDL-periode, A009 SED og utgående journalpost', async ({page, request}) => {
        test.setTimeout(150000);

        const auth = new AuthHelper(page);
        await auth.login();

        const hovedside = new HovedsidePage(page);
        const opprettSak = new OpprettNySakPage(page);
        const behandling = new EuEosBehandlingPage(page);

        // Opprett utsendt-arbeidstaker-sak (Danmark)
        await hovedside.goto();
        await hovedside.klikkOpprettNySak();
        await opprettSak.fyllInnBrukerID(USER_ID_VALID);
        await opprettSak.velgSakstype('EU_EOS');
        await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
        await opprettSak.velgBehandlingstema('UTSENDT_ARBEIDSTAKER');
        await behandling.fyllInnFraTilDato(FRA, TIL);
        await behandling.velgLand('Danmark');
        await opprettSak.velgAarsak('SØKNAD');
        await opprettSak.leggBehandlingIMine();
        await opprettSak.klikkOpprettNyBehandling();

        await waitForProcessInstances(page.request, 30);
        await hovedside.goto();
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();
        await page.waitForLoadState('networkidle');

        // Gå gjennom behandlingen frem til (men ikke inkludert) "Fatt vedtak"
        await behandling.klikkBekreftOgFortsett();
        await behandling.velgYrkesaktivEllerSelvstendigOgFortsett(true);
        await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
        await behandling.velgArbeidstype(true);
        await behandling.svarJaOgFortsett();
        await behandling.svarJaOgFortsett();
        await behandling.innvilgeSøknad();
        await behandling.klikkBekreftOgFortsett();
        await behandling.velgMottakerInstitusjon();

        // Snapshot SED- og journalpost-tilstand FØR vedtak (iverksetting sender SED/oppretter JP)
        const docsBefore = await fetchStoredSedDocuments(request, 'A009');
        const jpBefore = await fetchStoredJournalposter(request);

        await behandling.fattVedtak();

        console.log('📝 Venter på iverksetting (kaster ved feilede prosessinstanser)...');
        await waitForProcessInstances(page.request, 60);

        // === 1. A009 lovvalgsvedtak-SED (LA_BUC_01) sendt til EESSI-mottaker ===
        const sed = await findNewNavFormatSed(request, 'A009', docsBefore);
        expect(sed.sed).toBe('A009');
        expect(sed.sedVer).toBe('4');
        console.log(`✅ A009 SED sendt til EESSI (sedVer=${sed.sedVer})`);

        // === 2. Utgående EESSI-journalpost opprettet og ferdigstilt (mottaker Danmark) ===
        const jp = await findNewUtgaaendeJournalpost(request, jpBefore);
        expect(jp, 'Forventet UTGAAENDE EESSI-journalpost etter iverksetting').not.toBeNull();
        expect(jp!.journalStatus, 'Journalpost skal være ferdigstilt (J)').toBe('J');
        expect(jp!.kanal).toBe('EESSI');
        expect((jp!.avsenderMottaker?.id ?? '').split(':')[0], 'SED skal være sendt til DK').toBe('DK');
        console.log(`✅ Utgående EESSI-journalpost til DK (id=${jp!.journalpostId}, mottaker=${jp!.avsenderMottaker?.id})`);

        // === 3. IVERKSETT_VEDTAK_EOS FERDIG + MEDL-periode overført ===
        await withDatabase(async (db) => {
            const iverksett = await db.queryOne<{ BEHANDLING_ID: number; STATUS: string; SIST_FULLFORT_STEG: string }>(
                `SELECT PI.BEHANDLING_ID, PI.STATUS, PI.SIST_FULLFORT_STEG
                 FROM PROSESSINSTANS PI
                 WHERE PI.PROSESS_TYPE = 'IVERKSETT_VEDTAK_EOS'
                   AND PI.REGISTRERT_DATO > SYSDATE - INTERVAL '10' MINUTE
                 ORDER BY PI.REGISTRERT_DATO DESC
                 FETCH FIRST 1 ROWS ONLY`,
                {}
            );
            expect(iverksett, 'Forventet IVERKSETT_VEDTAK_EOS-prosessinstans').not.toBeNull();
            expect(iverksett!.STATUS, 'IVERKSETT_VEDTAK_EOS skal være FERDIG').toBe('FERDIG');
            console.log(`✅ IVERKSETT_VEDTAK_EOS FERDIG (behandlingId=${iverksett!.BEHANDLING_ID}, sist steg=${iverksett!.SIST_FULLFORT_STEG})`);

            // Lovvalgsperiode skal være opprettet og overført til MEDL (medlperiode_id satt)
            const periode = await db.queryOne<{ FOM: string; TOM: string; LOVVALGSLAND: string; MEDLPERIODE_ID: number | null }>(
                `SELECT
                   TO_CHAR(lp.fom_dato, 'DD.MM.YYYY') AS FOM,
                   TO_CHAR(lp.tom_dato, 'DD.MM.YYYY') AS TOM,
                   lp.lovvalgsland AS LOVVALGSLAND,
                   lp.medlperiode_id AS MEDLPERIODE_ID
                 FROM lovvalg_periode lp
                 ORDER BY lp.id DESC
                 FETCH FIRST 1 ROWS ONLY`,
                {}
            );
            expect(periode, 'Forventet en lovvalgsperiode etter iverksetting').not.toBeNull();
            expect(periode!.FOM).toBe(FRA);
            expect(periode!.TOM).toBe(TIL);
            expect(periode!.LOVVALGSLAND).toBe('NO');
            expect(periode!.MEDLPERIODE_ID, 'Lovvalgsperioden skal være overført til MEDL (medlperiode_id satt)').not.toBeNull();
            console.log(`✅ MEDL-periode opprettet: ${periode!.FOM} – ${periode!.TOM} (${periode!.LOVVALGSLAND}, medlperiode_id=${periode!.MEDLPERIODE_ID})`);

            // Vedtaksbrev produsert via dokgen og sendt (INNVILGELSE_YRKESAKTIV → BRUKER)
            const sendBrev = await db.query<{ DATA: string; STATUS: string }>(
                `SELECT PI.DATA, PI.STATUS
                 FROM PROSESSINSTANS PI
                 WHERE PI.BEHANDLING_ID = :behandlingId
                   AND PI.PROSESS_TYPE = 'SEND_BREV'`,
                { behandlingId: iverksett!.BEHANDLING_ID }
            );
            const vedtaksbrev = sendBrev.find(b => (b.DATA || '').includes('INNVILGELSE_YRKESAKTIV'));
            expect(vedtaksbrev, 'Forventet et innvilgelsesbrev (SEND_BREV) for vedtaket').toBeTruthy();
            expect(vedtaksbrev!.STATUS, 'Vedtaksbrev skal være FERDIG').toBe('FERDIG');
            console.log('✅ Vedtaksbrev (INNVILGELSE_YRKESAKTIV → BRUKER) produsert og FERDIG');

            // Merk: "Skatteinnkrever-kopi" sendes ikke som en egen observerbar SEND_BREV-
            // prosessinstans i lokal stack for denne flyten (kun innvilgelsesbrevet til BRUKER
            // opprettes). Den asserteres derfor ikke her — vi unngår en falsk-grønn vakt.
        });

        console.log('✅ Iverksettingskjede for UTSENDT_ARBEIDSTAKER verifisert');
    });
});
