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
}
