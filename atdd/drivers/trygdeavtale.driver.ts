/**
 * Protocol driver for Trygdeavtale — Layer 3.
 *
 * This is where all POM/helper knowledge lives.
 * The DSL (Layer 2) calls these methods with domain parameters.
 * The driver translates them into POM operations.
 */
import { Page } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { TrygdeavtaleBehandlingPage } from '../../pages/behandling/trygdeavtale-behandling.page';
import { TrygdeavtaleArbeidsstedPage } from '../../pages/behandling/trygdeavtale-arbeidssted.page';
import { USER_ID_VALID, SAKSTYPER, SAKSTEMA, BEHANDLINGSTEMA, AARSAK } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { verifiserBehandlingSluttilstand } from '../../pages/shared/behandling-sluttilstand.assertions';

export class TrygdeavtaleDriver {
  private loggedIn = false;

  constructor(private readonly page: Page) {}

  async loggInn(): Promise<void> {
    if (!this.loggedIn) {
      const auth = new AuthHelper(this.page);
      await auth.login();
      this.loggedIn = true;
    }
  }

  async navigerTilOpprettSak(): Promise<void> {
    const hovedside = new HovedsidePage(this.page);
    await hovedside.gotoOgOpprettNySak();
  }

  async opprettSak(): Promise<void> {
    const opprettSak = new OpprettNySakPage(this.page);
    await opprettSak.opprettStandardSak(USER_ID_VALID, SAKSTYPER.TRYGDEAVTALE);
    await opprettSak.assertions.verifiserBehandlingOpprettet();
  }

  async navigerTilBehandling(): Promise<void> {
    await this.page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
  }

  async fyllUtBehandling(): Promise<void> {
    const behandling = new TrygdeavtaleBehandlingPage(this.page);
    await behandling.fyllUtTrygdeavtaleBehandling();
  }

  async fattVedtak(): Promise<void> {
    const arbeidssted = new TrygdeavtaleArbeidsstedPage(this.page);
    await arbeidssted.fyllUtArbeidsstedOgFattVedtak();
  }

  /**
   * Hard sluttilstand i DB — samme standard som trygdeavtale-fullfort-vedtak.spec.ts:
   * vent på at alle prosessinstanser er ferdige (kaster på feilede), og verifiser at
   * behandlingen er AVSLUTTET med behandlingsresultat og at iverksettingen
   * (IVERKSETT_VEDTAK_TRYGDEAVTALE) er FERDIG.
   */
  async verifiserFullført(): Promise<void> {
    await waitForProcessInstances(this.page.request, 60);
    await verifiserBehandlingSluttilstand({
      // Live-verifisert resultat for innvilget trygdeavtale-søknad
      forventetResultatType: 'FASTSATT_LOVVALGSLAND',
      forventetIverksettProsess: 'IVERKSETT_VEDTAK_TRYGDEAVTALE',
    });
  }
}
