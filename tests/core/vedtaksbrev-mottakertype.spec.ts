import { test, expect } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../../pages/behandling/medlemskap.page';
import { ArbeidsforholdPage } from '../../pages/behandling/arbeidsforhold.page';
import { LovvalgPage } from '../../pages/behandling/lovvalg.page';
import { ResultatPeriodePage } from '../../pages/behandling/resultat-periode.page';
import { TrygdeavgiftPage } from '../../pages/trygdeavgift/trygdeavgift.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import { TrygdeavtaleBehandlingPage } from '../../pages/behandling/trygdeavtale-behandling.page';
import { TrygdeavtaleArbeidsstedPage } from '../../pages/behandling/trygdeavtale-arbeidssted.page';
import { verifiserVedtaksbrev } from '../../pages/shared/vedtaksbrev.assertions';
import {
  USER_ID_VALID,
  USER_ID_KOSOVO,
  BRUKERNAVN_VALID,
  PERSON_NAME_KOSOVO,
  SAKSTYPER,
  SAKSTEMA,
  BEHANDLINGSTEMA,
  AARSAK,
  ARBEIDSLAND,
  BESTEMMELSER,
} from '../../pages/shared/constants';
import { TestPeriods } from '../../helpers/date-helper';
import { waitForProcessInstances } from '../../helpers/api-helper';

/**
 * Vedtaksbrev-innhold per mottakertype (dokgen) — P3-dekningshull.
 *
 * I dag dekkes dokgen kun INDIREKTE (papir-A1 / anmodning / innhentingsbrev) —
 * ingen test asserterer faktisk BREVINNHOLD per mottakertype. Bug-klyngen
 * 6950 / 7128 / 6759 (land-/person-spesifikke vedtaksbrev) sitter nettopp her.
 *
 * Denne testen fatter to vedtak for to ULIKE personer/sakstyper og asserterer at
 * HVER produserer KORREKT, DISTINKT vedtaksbrev — ikke bare at «et brev ble laget»:
 *
 *   1. FTRL § 2-8 frivillig medlemskap (person A) → brevmal `innvilgelse_ftrl`,
 *      tittel «Vedtak om frivillig medlemskap».
 *   2. Trygdeavtale Australia (person B)          → brevmal `trygdeavtale_au`,
 *      tittel «Vedtak om medlemskap, Attest for medlemskap i folketrygden».
 *
 * Brevet observeres som UTGAAENDE journalpost i SAF-mocken: `HOVEDDOKUMENT.brevkode`
 * = dokgen-malen (selve brev-VARIANTEN), `tittel` = journalføringstittelen,
 * `avsenderMottaker` = mottakeren. Brevkoden mappes fra Produserbaredokumenter i
 * melosys-api (DokumentproduksjonsInfoMapper) — distinkt per sakstype/land/person.
 *
 * Asserten BITER: sendes feil brevmal for en sakstype (en 6950/7128/6759-klasse
 * regresjon) slår eksakt-match-asserten testen rød. Kryss-asserten nederst beviser
 * at de to mottakertypene faktisk får ULIKE brev.
 */
const FTRL_BREVKODE = 'innvilgelse_ftrl';
const FTRL_TITTEL = 'Vedtak om frivillig medlemskap';
const TRYGDEAVTALE_BREVKODE = 'trygdeavtale_au';
const TRYGDEAVTALE_TITTEL = 'Vedtak om medlemskap, Attest for medlemskap i folketrygden';

test.describe('Vedtaksbrev-innhold per mottakertype', () => {
  test('skal produsere korrekt, distinkt vedtaksbrev for FTRL- og trygdeavtale-mottaker', async ({
    page,
    request,
  }) => {
    test.setTimeout(300000);

    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);

    // =====================================================================
    // Mottakertype 1: FTRL § 2-8 første ledd a (frivillig medlemskap), person A
    // =====================================================================
    console.log('📨 Mottakertype 1: FTRL § 2-8 frivillig medlemskap');
    const medlemskap = new MedlemskapPage(page);
    const arbeidsforhold = new ArbeidsforholdPage(page);
    const lovvalg = new LovvalgPage(page);
    const resultatPeriode = new ResultatPeriodePage(page);
    const trygdeavgift = new TrygdeavgiftPage(page);
    const vedtak = new VedtakPage(page);

    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();
    await hovedside.åpneBehandling(`${BRUKERNAVN_VALID} -`);

    const period = TestPeriods.standardPeriod;
    await medlemskap.velgPeriode(period.start, period.end);
    await medlemskap.velgLand('Afghanistan');
    await medlemskap.velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON');
    await medlemskap.klikkBekreftOgFortsett();

    await arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS');

    await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
    await lovvalg.svarJaPaaFørsteSpørsmål();
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
    await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
    await lovvalg.klikkBekreftOgFortsett();

    await resultatPeriode.fyllUtResultatPeriode('INNVILGET');

    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
    await trygdeavgift.velgBetalesAga(false);
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('100000');
    await trygdeavgift.klikkBekreftOgFortsett();

    const ftrlBehandlingId = new URL(page.url()).searchParams.get('behandlingID');
    expect(ftrlBehandlingId, 'behandlingID skal finnes i URL').not.toBeNull();

    await vedtak.klikkFattVedtak();
    console.log('📝 Venter på iverksetting (FTRL)...');
    await waitForProcessInstances(page.request, 60);
    await vedtak.assertions.verifiserBehandlingAvsluttet({
      behandlingId: ftrlBehandlingId,
      forventetResultatType: 'MEDLEM_I_FOLKETRYGDEN',
      forventetIverksettProsess: 'IVERKSETT_VEDTAK_FTRL',
    });

    const ftrlBrev = await verifiserVedtaksbrev(request, {
      mottakerFnr: USER_ID_VALID,
      forventetBrevkode: FTRL_BREVKODE,
      forventetTittel: FTRL_TITTEL,
    });

    // =====================================================================
    // Mottakertype 2: Trygdeavtale Australia (bilateral avtale), person B
    // =====================================================================
    console.log('📨 Mottakertype 2: Trygdeavtale Australia');
    const trygdeavtaleBehandling = new TrygdeavtaleBehandlingPage(page);
    const arbeidssted = new TrygdeavtaleArbeidsstedPage(page);

    await hovedside.gotoOgOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_KOSOVO);
    await opprettSak.velgSakstype(SAKSTYPER.TRYGDEAVTALE);
    await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
    await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.YRKESAKTIV);
    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();
    await opprettSak.assertions.verifiserBehandlingOpprettet();
    await hovedside.åpneBehandling(`${PERSON_NAME_KOSOVO} -`);

    await trygdeavtaleBehandling.fyllUtPeriodeOgLand('01.01.2024', '01.01.2026', ARBEIDSLAND.AUSTRALIA);
    await trygdeavtaleBehandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
    await trygdeavtaleBehandling.innvilgeOgVelgBestemmelse(BESTEMMELSER.AUS_ART9_3);
    await arbeidssted.fyllUtArbeidsstedOgFattVedtak('Test');

    console.log('📝 Venter på iverksetting (trygdeavtale)...');
    await waitForProcessInstances(page.request, 60);
    await trygdeavtaleBehandling.assertions.verifiserBehandlingAvsluttet({
      forventetIverksettProsess: 'IVERKSETT_VEDTAK_TRYGDEAVTALE',
    });

    const trygdeavtaleBrev = await verifiserVedtaksbrev(request, {
      mottakerFnr: USER_ID_KOSOVO,
      forventetBrevkode: TRYGDEAVTALE_BREVKODE,
      forventetTittel: TRYGDEAVTALE_TITTEL,
    });

    // =====================================================================
    // Kryss-assertion: de to mottakertypene fikk DISTINKTE vedtaksbrev
    // =====================================================================
    expect(
      ftrlBrev.hoveddokument.brevkode,
      'FTRL- og trygdeavtale-vedtak skal produsere ULIKE brevmaler (land-/person-spesifikt)'
    ).not.toBe(trygdeavtaleBrev.hoveddokument.brevkode);
    expect(
      ftrlBrev.hoveddokument.tittel,
      'De to brevvariantene skal ha ulik journalføringstittel'
    ).not.toBe(trygdeavtaleBrev.hoveddokument.tittel);

    console.log(
      `✅ Distinkte vedtaksbrev per mottakertype: '${ftrlBrev.hoveddokument.brevkode}' vs ` +
        `'${trygdeavtaleBrev.hoveddokument.brevkode}'`
    );
  });
});
