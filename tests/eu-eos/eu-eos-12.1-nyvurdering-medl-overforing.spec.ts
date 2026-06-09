import {test, expect} from '../../fixtures';
import {AuthHelper} from '../../helpers/auth-helper';
import {HovedsidePage} from '../../pages/hovedside.page';
import {OpprettNySakPage} from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {EuEosBehandlingPage} from '../../pages/behandling/eu-eos-behandling.page';
import {USER_ID_VALID} from '../../pages/shared/constants';
import {waitForProcessInstances} from '../../helpers/api-helper';
import {withDatabase} from '../../helpers/db-helper';

/**
 * Nyvurdering på EU/EØS utsendt arbeidstaker - MEDL-overføring
 *
 * Gap: nv-eos-utsendt-medl-overforing (toppen av e2e-dekningshullet, score 9).
 * Ingen e2e dekker en Nyvurdering på en EU/EØS utsendt-sak. Bug-tett område:
 * 7045/6125 (feil MEDL-overføring ved NV), 8034 (A011 mottak bruker utdatert
 * lovvalgsperiode fra minnet → feilede prosessinstanser).
 *
 * Scenario:
 * 1. Fullfør en førstegangs utsendt-sak → vedtak (periode 01.01.2024–31.12.2025, Danmark)
 * 2. Opprett Nyvurdering på samme sak
 * 3. Forkort lovvalgsperioden (til-dato 31.12.2025 → 30.06.2025)
 * 4. Fatt nytt vedtak
 * 5. Verifiser at:
 *    - iverksettingen ikke gir feilede prosessinstanser (waitForProcessInstances kaster ved FAILED)
 *    - nyeste IVERKSETT_VEDTAK_EOS er FERDIG (MEDL-overføring skjer som steg LAGRE_LOVVALGSPERIODE_MEDL her)
 *    - nyeste lovvalgsperiode i DB reflekterer den FORKORTEDE perioden (ikke en utdatert periode)
 */
const FØRSTE_FRA = '01.01.2024';
const FØRSTE_TIL = '31.12.2025';
const NV_FORKORTET_TIL = '30.06.2025';

test.describe('EU/EØS - Nyvurdering (MEDL-overføring)', () => {
    test('skal forkorte lovvalgsperiode via nyvurdering og overføre ny periode til MEDL', async ({page}) => {
        test.setTimeout(180000);

        const auth = new AuthHelper(page);
        await auth.login();

        const hovedside = new HovedsidePage(page);
        const opprettSak = new OpprettNySakPage(page);
        const behandling = new EuEosBehandlingPage(page);

        // === DEL A: Førstegangs utsendt-sak → vedtak ===
        console.log('📝 Del A: Oppretter førstegangs utsendt-sak...');
        await hovedside.goto();
        await hovedside.klikkOpprettNySak();
        await opprettSak.fyllInnBrukerID(USER_ID_VALID);
        await opprettSak.velgSakstype('EU_EOS');
        await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
        await opprettSak.velgBehandlingstema('UTSENDT_ARBEIDSTAKER');
        await behandling.fyllInnFraTilDato(FØRSTE_FRA, FØRSTE_TIL);
        await behandling.velgLand('Danmark');
        await opprettSak.velgAarsak('SØKNAD');
        await opprettSak.leggBehandlingIMine();
        await opprettSak.klikkOpprettNyBehandling();

        await waitForProcessInstances(page.request, 30);
        await hovedside.goto();
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).click();
        await page.waitForLoadState('networkidle');

        console.log('📝 Del A: Fullfører førstegangs behandling til vedtak...');
        await behandling.klikkBekreftOgFortsett();
        await behandling.velgYrkesaktivEllerSelvstendigOgFortsett(true);
        await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
        await behandling.velgArbeidstype(true);
        await behandling.svarJaOgFortsett();
        await behandling.svarJaOgFortsett();
        await behandling.innvilgeOgFattVedtak();

        console.log('📝 Del A: Venter på iverksetting av førstegangsvedtak...');
        await waitForProcessInstances(page.request, 30);

        // === DEL B: Opprett Nyvurdering ===
        console.log('📝 Del B: Oppretter nyvurdering...');
        await hovedside.goto();
        await hovedside.klikkOpprettNySak();
        await opprettSak.opprettNyVurdering(USER_ID_VALID, 'SØKNAD');
        await waitForProcessInstances(page.request, 30);

        // Åpne den NYE aktive behandlingen (første lenke = nyeste)
        await hovedside.goto();
        await page.getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).first().click();
        await page.waitForLoadState('networkidle');

        // === DEL C: Forkort lovvalgsperioden og fatt nytt vedtak ===
        console.log(`📝 Del C: Forkorter lovvalgsperioden (til-dato → ${NV_FORKORTET_TIL})...`);
        // Forkort perioden via "Periode og land" → "Rediger" i opplysninger-panelet
        // (i NV-behandlingen er ikke perioden et eget steg; den endres her).
        await page.getByRole('button', { name: 'Periode og land' }).click();
        const periodeOgLandPanel = page.getByRole('complementary').filter({ hasText: 'Periode og land' });
        await periodeOgLandPanel.getByRole('button', { name: 'Rediger' }).first().click();
        const tilField = periodeOgLandPanel.getByRole('textbox', { name: 'Til og med' });
        await tilField.click();
        await tilField.fill(NV_FORKORTET_TIL);
        await tilField.press('Enter');
        // Enter committer som regel lagringen; klikk "Lagre" kun hvis editoren fortsatt er åpen
        const lagreBtn = periodeOgLandPanel.getByRole('button', { name: 'Lagre' });
        if (await lagreBtn.isVisible().catch(() => false)) {
            await lagreBtn.click();
        }
        // Vent til panelet viser den forkortede perioden (lagring fullført)
        await expect(periodeOgLandPanel.getByText(`${FØRSTE_FRA} - ${NV_FORKORTET_TIL}`)).toBeVisible({ timeout: 10000 });
        console.log(`✅ Lovvalgsperiode forkortet i UI: ${FØRSTE_FRA} - ${NV_FORKORTET_TIL}`);

        // Gå gjennom stegene på nytt og fatt vedtak
        await behandling.klikkBekreftOgFortsett();
        await behandling.velgYrkesaktivEllerSelvstendigOgFortsett(true);
        await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
        await behandling.velgArbeidstype(true);
        await behandling.svarJaOgFortsett();
        await behandling.svarJaOgFortsett();

        // Vedtak-steget for en NV krever obligatorisk "grunn for nytt vedtak"
        await behandling.innvilgeSøknad();
        await behandling.klikkBekreftOgFortsett();
        await behandling.velgMottakerInstitusjon();
        await behandling.velgGrunnForNyttVedtak('FEIL_I_BEHANDLING');
        await behandling.fattVedtak();

        // === DEL D: Verifiser MEDL-overføring + prosessinstans FERDIG ===
        console.log('📝 Del D: Venter på iverksetting av NV-vedtak (kaster ved feilede prosessinstanser)...');
        await waitForProcessInstances(page.request, 30);

        await withDatabase(async (db) => {
            // Ingen feilede prosessinstanser de siste 10 min (fanger 8034-klassen)
            const feilede = await db.query<{ PROSESS_TYPE: string; STATUS: string }>(
                `SELECT PI.PROSESS_TYPE, PI.STATUS
                 FROM PROSESSINSTANS PI
                 WHERE PI.STATUS = 'FEILET'
                   AND PI.REGISTRERT_DATO > SYSDATE - INTERVAL '10' MINUTE`,
                {}
            );
            expect(feilede, `Forventet ingen feilede prosessinstanser, fant: ${JSON.stringify(feilede)}`).toHaveLength(0);

            // Nyeste IVERKSETT_VEDTAK_EOS skal være FERDIG (MEDL-overføring skjer som steg her)
            const iverksett = await db.queryOne<{ STATUS: string; SIST_FULLFORT_STEG: string }>(
                `SELECT PI.STATUS, PI.SIST_FULLFORT_STEG
                 FROM PROSESSINSTANS PI
                 WHERE PI.PROSESS_TYPE = 'IVERKSETT_VEDTAK_EOS'
                   AND PI.REGISTRERT_DATO > SYSDATE - INTERVAL '10' MINUTE
                 ORDER BY PI.REGISTRERT_DATO DESC
                 FETCH FIRST 1 ROWS ONLY`,
                {}
            );
            expect(iverksett, 'Forventet en IVERKSETT_VEDTAK_EOS-prosessinstans etter NV-vedtak').not.toBeNull();
            expect(iverksett!.STATUS, 'NV-iverksetting skal være FERDIG').toBe('FERDIG');
            console.log(`✅ IVERKSETT_VEDTAK_EOS FERDIG (sist fullført steg: ${iverksett!.SIST_FULLFORT_STEG})`);

            // Nyeste lovvalgsperiode skal reflektere den FORKORTEDE perioden (ikke utdatert periode).
            // Databasen renses før hver test, så nyeste rad (høyest id) = nyvurderingens periode.
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
            expect(periode, 'Forventet en lovvalgsperiode etter NV').not.toBeNull();
            // Lovvalgsland for utsendt norsk arbeidstaker er NO (Norge beholder lovvalget)
            expect(periode!.LOVVALGSLAND).toBe('NO');
            expect(periode!.FOM).toBe(FØRSTE_FRA);
            expect(periode!.TOM, 'Lovvalgsperiode skal være forkortet av nyvurderingen (ikke utdatert periode)').toBe(NV_FORKORTET_TIL);
            // MEDL-overføring: perioden skal være registrert i MEDL (medlperiode_id satt)
            expect(periode!.MEDLPERIODE_ID, 'Lovvalgsperioden skal være overført til MEDL (medlperiode_id satt)').not.toBeNull();
            console.log(`✅ MEDL-overført lovvalgsperiode forkortet: ${periode!.FOM} – ${periode!.TOM} (${periode!.LOVVALGSLAND}, medlperiode_id=${periode!.MEDLPERIODE_ID})`);
        });

        console.log('✅ NV på EU/EØS utsendt-sak fullført med korrekt MEDL-overføring');
    });
});
