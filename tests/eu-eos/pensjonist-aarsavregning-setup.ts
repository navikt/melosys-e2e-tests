import { Page } from '@playwright/test';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { AarsavregningPage } from '../../pages/behandling/aarsavregning.page';
import { EuEosPensjonistBehandlingPage } from '../../pages/behandling/eu-eos-pensjonist-behandling.page';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import {
  AARSAK,
  BEHANDLINGSTEMA,
  BRUKERNAVN_VALID,
  SAKSTEMA,
  SAKSTYPER,
  USER_ID_VALID,
} from '../../pages/shared/constants';
import { TrygdeavgiftPage } from '../../pages/trygdeavgift/trygdeavgift.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';

export const PENSJONIST_AARSAVREGNING_TEST_DATA = {
  periodeFra: '01.04.2024',
  periodeTil: '05.04.2024',
  bostedsland: 'BE',
  år: '2024',
  trygdeavgiftBruttoinntekt: '32313',
  aarsavregningBruttoinntekt: '23313',
  innbetaltAvvik: '300',
  inntektskilde: 'PENSJON',
} as const;

function hentSaksnummerFraUrl(url: string): string {
  // Saksnummer er enten «MEL-<n>» (EU/EØS-flyten, f.eks.
  // /melosys/EU_EOS/pensjonist/MEL-40/) eller et rent tall (FTRL-flyten,
  // f.eks. /FTRL/saksbehandling/2024000001). MEL- prioriteres siden det er
  // entydig og aldri kan forveksles med fødselsnummeret (11 siffer). Det rene
  // tallet ankres derfor på «saksbehandling/» for å unngå å plukke opp fnr.
  const pathname = new URL(url).pathname;
  const saksnummer =
    pathname.match(/\b(MEL-\d+)\b/)?.[1] ??
    pathname.match(/saksbehandling\/(\d{10,})/)?.[1];

  if (!saksnummer) {
    throw new Error(`Fant ikke saksnummer i URL-en: ${url}`);
  }

  return decodeURIComponent(saksnummer);
}

export async function setupPensjonistMedAarsavregning(
  page: Page
): Promise<{ aarsavregning: AarsavregningPage; vedtak: VedtakPage }> {
  const hovedside = new HovedsidePage(page);
  const opprettSak = new OpprettNySakPage(page);
  const pensjonistBehandling = new EuEosPensjonistBehandlingPage(page);
  const trygdeavgift = new TrygdeavgiftPage(page);
  const aarsavregning = new AarsavregningPage(page);
  const vedtak = new VedtakPage(page);

  await hovedside.goto();
  await hovedside.klikkOpprettNySak();
  await opprettSak.fyllInnBrukerID(USER_ID_VALID);
  await opprettSak.velgSakstype(SAKSTYPER.EU_EOS);
  await opprettSak.velgSakstema(SAKSTEMA.TRYGDEAVGIFT);
  await opprettSak.velgBehandlingstema(BEHANDLINGSTEMA.PENSJONIST);
  await opprettSak.velgAarsak(AARSAK.SØKNAD);
  await opprettSak.leggBehandlingIMine();
  await opprettSak.klikkOpprettNyBehandling();
  await opprettSak.assertions.verifiserBehandlingOpprettet();

  console.log('📝 Venter på prosessinstanser etter opprettelse av pensjonistbehandling...');
  await waitForProcessInstances(page.request, 30);
  await hovedside.goto();
  await hovedside.åpneSak(BRUKERNAVN_VALID);
  const saksnummer = hentSaksnummerFraUrl(page.url());
  await pensjonistBehandling.fyllUtPeriodeOgBostedsland(
    PENSJONIST_AARSAVREGNING_TEST_DATA.periodeFra,
    PENSJONIST_AARSAVREGNING_TEST_DATA.periodeTil,
    PENSJONIST_AARSAVREGNING_TEST_DATA.bostedsland
  );
  await pensjonistBehandling.klikkBekreftOgFortsett();

  await trygdeavgift.ventPåSideLastet();
  await trygdeavgift.velgSkattepliktig(false);
  await trygdeavgift.velgInntektskilde(PENSJONIST_AARSAVREGNING_TEST_DATA.inntektskilde);
  await trygdeavgift.fyllInnBruttoinntektMedApiVent(
    PENSJONIST_AARSAVREGNING_TEST_DATA.trygdeavgiftBruttoinntekt
  );
  await trygdeavgift.klikkBekreftOgFortsett();

  await pensjonistBehandling.assertions.verifiserBekreftOgSendSynlig();
  await pensjonistBehandling.klikkBekreftOgSend();

  console.log('📝 Venter på prosessinstanser etter innsending av pensjonistbehandling...');
  await waitForProcessInstances(page.request, 60);
  await hovedside.goto();

  await hovedside.klikkOpprettNySak();
  await opprettSak.fyllInnBrukerID(USER_ID_VALID);
  await opprettSak.velgPensjonistAarsavregning();
  await opprettSak.velgAarsak(AARSAK.SØKNAD);
  await opprettSak.leggBehandlingIMine();
  await opprettSak.klikkOpprettNyBehandling();
  await opprettSak.assertions.verifiserBehandlingOpprettet();

  console.log('📝 Venter på prosessinstanser etter opprettelse av årsavregning...');
  await waitForProcessInstances(page.request, 30);
  await hovedside.goto();
  await hovedside.åpneAarsavregningForSaksnummer(saksnummer);

  return { aarsavregning, vedtak };
}
