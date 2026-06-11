import { Page } from '@playwright/test';
import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { TrygdeavtaleUnntaksregistreringPage } from '../../pages/trygdeavtale/trygdeavtale-unntaksregistrering.page';
import { USER_ID_VALID } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';

/**
 * Trygdeavtale - Unntaksregistrering (registrering av unntak fra medlemskap)
 *
 * Gap: trygdeavtale-anmodning-unntak-departement (e2e-dekningshull, Tier 3).
 * UNNTAK-grenen for trygdeavtale-saker har en EGEN UI-side (unntaksregistrering)
 * og egen prosess (REGISTRERE_UNNTAK_FRA_MEDLEMSKAP) som ingen e2e dekket.
 * Bug-tett område: MELOSYS-6938 (unntakssaker for India avsluttes ikke) — derfor
 * brukes Australia her, som de øvrige trygdeavtale-testene.
 *
 * Scope-merknad: «departement»/mottakerinstitusjon hører til EU/EØS-anmodning-
 * om-unntak-flyten (AVKLAR_MYNDIGHET) og finnes IKKE i unntaksregistrerings-UI-et;
 * for TRYGDEAVTALE ruter selv behandlingstema ANMODNING_OM_UNNTAK_HOVEDREGEL til
 * samme unntaksregistrering-side. Departement er dermed ikke e2e-bart her.
 *
 * Flyt (felles for begge tester):
 * 1. Opprett sak TRYGDEAVTALE/UNNTAK/REGISTRERING_UNNTAK (årsak SØKNAD)
 * 2. Oppgavelenken på hovedsiden peker DIREKTE til unntaksregistrering-siden
 * 3. Inngang: periode + avsenderland Australia (lagres som lovvalgsland)
 * 4. Unntak medlemskap: Godkjenn (+ bestemmelse AUS_ART9_3) ELLER Ikke godkjenn
 * 5. Bekreft og avslutt → prosessen REGISTRERE_UNNTAK_FRA_MEDLEMSKAP kjører
 *
 * Forventet utfall:
 * - GODKJENT: fagsak LOVVALG_AVKLART, resultat REGISTRERT_UNNTAK/GODKJENT,
 *   lovvalgsperiode UNNTATT/UTEN_DEKNING overført til MEDL som GYLD/ENDL
 *   (NB: ENDELIG — ikke «under avklaring»; UAVK/FORL gjelder anmodningsflytene)
 * - IKKE_GODKJENT: fagsak AVSLUTTET, resultat FERDIGBEHANDLET/IKKE_GODKJENT,
 *   INGEN lovvalgsperiode (og dermed ingen MEDL-periode)
 *
 * NB (kjent api-WARN ved IKKE_GODKJENT): frontend POSTer lovvalgsperioder også
 * ved «Ikke godkjenn» → api svarer 400 + WARN, men flyten fullfører likevel.
 * Docker-logs-fixturen flagger ikke denne WARN-en — ingen tag nødvendig.
 */
const FRA = '01.01.2024';
const TIL = '31.12.2025';
const FRA_ISO = '2024-01-01';
const TIL_ISO = '2025-12-31';
const LAND = 'AU';
const BESTEMMELSE = 'AUS_ART9_3';

/**
 * Opprett en TRYGDEAVTALE/UNNTAK/REGISTRERING_UNNTAK-sak og åpne
 * unntaksregistrering-siden via oppgavelenken på hovedsiden.
 */
async function opprettSakOgÅpneUnntaksregistrering(page: Page): Promise<void> {
  const hovedside = new HovedsidePage(page);
  const opprettSak = new OpprettNySakPage(page);

  await hovedside.goto();
  await hovedside.klikkOpprettNySak();
  await opprettSak.fyllInnBrukerID(USER_ID_VALID);
  await opprettSak.velgSakstype('TRYGDEAVTALE');
  await opprettSak.velgSakstema('UNNTAK');
  await opprettSak.velgBehandlingstema('REGISTRERING_UNNTAK');
  await opprettSak.velgAarsak('SØKNAD');
  await opprettSak.leggBehandlingIMine();
  await opprettSak.klikkOpprettNyBehandling();
  await opprettSak.assertions.verifiserBehandlingOpprettet();

  // OPPRETT_SAK-prosessen må fullføre før oppgavelenken er klikkbar
  await waitForProcessInstances(page.request, 30);
  await hovedside.åpneBehandling('TRIVIELL KARAFFEL -');
}

test.describe('Trygdeavtale - Unntaksregistrering', () => {
  test('skal registrere godkjent unntak med endelig MEDL-periode', async ({ page, request }) => {
    test.setTimeout(180000);

    const auth = new AuthHelper(page);
    await auth.login();

    const unntak = new TrygdeavtaleUnntaksregistreringPage(page);

    await opprettSakOgÅpneUnntaksregistrering(page);

    await unntak.ventPåInngang();
    await unntak.fyllUtInngang(FRA, TIL, LAND);
    await unntak.bekreftInngangOgFortsett();

    await unntak.godkjennMedBestemmelse(BESTEMMELSE);
    await unntak.bekreftOgAvslutt();

    console.log('📝 Venter på REGISTRERE_UNNTAK_FRA_MEDLEMSKAP (kaster ved feilede prosesser)...');
    await waitForProcessInstances(page.request, 60);

    const medlPeriodeId = await unntak.assertions.verifiserGodkjentUnntakIDatabase({
      fom: FRA,
      tom: TIL,
      land: LAND,
      bestemmelse: BESTEMMELSE
    });

    await unntak.assertions.verifiserMedlPeriodeEndelig(request, medlPeriodeId, {
      lovvalgsland: 'AUS',
      grunnlag: 'Australia_9_3',
      fraOgMed: FRA_ISO,
      tilOgMed: TIL_ISO
    });

    console.log('✅ Godkjent unntaksregistrering verifisert ende-til-ende (DB + MEDL)');
  });

  test('skal avslutte saken uten lovvalgsperiode ved ikke godkjent unntak', async ({ page }) => {
    test.setTimeout(180000);

    const auth = new AuthHelper(page);
    await auth.login();

    const unntak = new TrygdeavtaleUnntaksregistreringPage(page);

    await opprettSakOgÅpneUnntaksregistrering(page);

    await unntak.ventPåInngang();
    await unntak.fyllUtInngang(FRA, TIL, LAND);
    await unntak.bekreftInngangOgFortsett();

    await unntak.ikkeGodkjenn();
    await unntak.bekreftOgAvslutt();

    console.log('📝 Venter på REGISTRERE_UNNTAK_FRA_MEDLEMSKAP (kaster ved feilede prosesser)...');
    await waitForProcessInstances(page.request, 60);

    await unntak.assertions.verifiserIkkeGodkjentUnntakIDatabase({ land: LAND });

    console.log('✅ Ikke-godkjent unntaksregistrering verifisert: sak avsluttet uten lovvalgsperiode');
  });
});
