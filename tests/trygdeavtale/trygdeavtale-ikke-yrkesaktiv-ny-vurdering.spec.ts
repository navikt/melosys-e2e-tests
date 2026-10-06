import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { runAndWaitForProcessInstances } from '../../helpers/api-helper';
import { hentNyVurdering } from '../../helpers/db-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { IkkeYrkesaktivBehandlingPage } from '../../pages/behandling/ikke-yrkesaktiv-behandling.page';
import { verifiserBehandlingSluttilstand } from '../../pages/shared/behandling-sluttilstand.assertions';
import { verifiserVedtaksmetadata } from '../../pages/shared/vedtaksmetadata.assertions';
import {
  AARSAK,
  ARBEIDSLAND,
  BEHANDLINGSTEMA,
  SAKSTEMA,
  SAKSTYPER,
  USER_ID_VALID,
} from '../../pages/shared/constants';

/**
 * MELOSYS-8337: et vedtak i en ny vurdering for en ikke-yrkesaktiv skal lagres som
 * ENDRINGSVEDTAK. Det første vedtaket i saken skal fortsatt være FØRSTEGANGSVEDTAK.
 *
 * Flyt: opprett trygdeavtalesak med behandlingstema IKKE_YRKESAKTIV → innvilg med
 * art. 11 for Australia og fatt vedtak → opprett ny vurdering på samme sak → bekreft
 * de kopierte opplysningene, oppgi grunn og fatt vedtak → iverksettingen går ferdig.
 *
 * Perioden er den samme i begge vedtakene. Kontrollen overlappendePeriode ser bort fra
 * MEDL-perioden som det første vedtaket lagret.
 */
const FRA_OG_MED = '01.01.2024';
const TIL_OG_MED = '31.12.2025';
const BESTEMMELSE = 'AUS_ART11';

test.describe('Trygdeavtale - ikke-yrkesaktiv ny vurdering (MELOSYS-8337)', () => {
  test('vedtak i ny vurdering lagres som ENDRINGSVEDTAK', async ({ page }) => {
    // To vedtak, en ny vurdering og to iverksettinger
    test.setTimeout(240000);

    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const ikkeYrkesaktiv = new IkkeYrkesaktivBehandlingPage(page);

    // ── Første vedtak ──────────────────────────────────────────────────
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype(SAKSTYPER.TRYGDEAVTALE);
    await opprettSak.velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG);
    await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.IKKE_YRKESAKTIV);
    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    await opprettSak.leggBehandlingIMine();
    await runAndWaitForProcessInstances(
      page.request,
      async () => {
        await opprettSak.klikkOpprettNyBehandling();
        await opprettSak.assertions.verifiserBehandlingOpprettet();
      },
      { timeoutSeconds: 30 }
    );

    await hovedside.goto();
    await hovedside.åpneBehandling('TRIVIELL KARAFFEL -');

    await ikkeYrkesaktiv.fyllUtSøknadsopplysninger(FRA_OG_MED, TIL_OG_MED, ARBEIDSLAND.AUSTRALIA);
    await ikkeYrkesaktiv.bekreftOgFortsett();
    await ikkeYrkesaktiv.innvilgOgVelgBestemmelse(BESTEMMELSE);
    await runAndWaitForProcessInstances(page.request, () => ikkeYrkesaktiv.fattVedtak(), {
      timeoutSeconds: 60,
    });

    const førsteBehandlingId = await verifiserBehandlingSluttilstand({
      forventetResultatType: 'FASTSATT_LOVVALGSLAND',
      forventetIverksettProsess: 'IVERKSETT_VEDTAK_IKKE_YRKESAKTIV',
    });

    // ── Ny vurdering ───────────────────────────────────────────────────
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await runAndWaitForProcessInstances(
      page.request,
      () => opprettSak.opprettNyVurdering(USER_ID_VALID, AARSAK.SØKNAD),
      { timeoutSeconds: 30 }
    );

    const nyVurderingId = await hentNyVurdering(førsteBehandlingId);
    await hovedside.goto();
    await hovedside.åpneBehandlingMedId(nyVurderingId);

    await ikkeYrkesaktiv.bekreftKopierteSøknadsopplysninger(FRA_OG_MED, TIL_OG_MED, ARBEIDSLAND.AUSTRALIA);
    await ikkeYrkesaktiv.innvilgOgVelgBestemmelse(BESTEMMELSE);
    await ikkeYrkesaktiv.velgGrunnForNyttVedtak('NYE_OPPLYSNINGER');
    await runAndWaitForProcessInstances(page.request, () => ikkeYrkesaktiv.fattVedtak(), {
      timeoutSeconds: 60,
    });

    await verifiserBehandlingSluttilstand({
      behandlingId: nyVurderingId,
      forventetResultatType: 'FASTSATT_LOVVALGSLAND',
      forventetIverksettProsess: 'IVERKSETT_VEDTAK_IKKE_YRKESAKTIV',
    });
    await verifiserVedtaksmetadata(førsteBehandlingId, { vedtakstype: 'FØRSTEGANGSVEDTAK' });
    await verifiserVedtaksmetadata(nyVurderingId, { vedtakstype: 'ENDRINGSVEDTAK' });
  });
});
