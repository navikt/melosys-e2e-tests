/**
 * Protokolldriver for Trygdeavtale — Lag 3 i Farleys fire-lags-modell.
 *
 * Her bor ALL kjennskap til POM-er, selektorer, helpers og DB. DSL-en (Lag 2)
 * kaller disse metodene med domeneverdier; driveren oversetter til POM-kall.
 *
 * Designprinsipp (jf. planen, issue 2): driveren er *tilstandsløs* — metodene tar
 * verdier som argumenter og RETURNERER det de fanger (f.eks. behandlingId,
 * medlPeriodeId). All flyt-tilstand som deles mellom steg bor som private felt på
 * DSL-en, ikke her. Det gjør dataflyten DSL↔driver eksplisitt.
 *
 * Importregel: driveren importerer POM-er/helpers; DSL-en importerer KUN driveren;
 * steg importerer KUN DSL-fixturen. (Motsatt av refactor-plan-dokumentets gamle
 * skisse — se docs/atdd/ATDD-refactor-plan.md, revidert 2026-07-07.)
 */
import { Page, expect } from '@playwright/test';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { TrygdeavtaleBehandlingPage } from '../../pages/behandling/trygdeavtale-behandling.page';
import { TrygdeavtaleArbeidsstedPage } from '../../pages/behandling/trygdeavtale-arbeidssted.page';
import { TrygdeavtaleUnntaksregistreringPage } from '../../pages/trygdeavtale/trygdeavtale-unntaksregistrering.page';
import {
  USER_ID_VALID,
  BRUKERNAVN_VALID,
  SAKSTYPER,
  AARSAK,
  ARBEIDSLAND,
  BESTEMMELSER,
} from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';
import { withDatabase } from '../../helpers/db-helper';
import { verifiserBehandlingSluttilstand } from '../../pages/shared/behandling-sluttilstand.assertions';

/**
 * Faste testdata-verdier for trygdeavtale-flyten. De ligger som lesbare literaler
 * her (Lag 3), ikke som DSL-parametre, fordi mock-oppsettet kun støtter ÉN verdi:
 *  - LAND: kun Australia (AU) har fungerende mock-data. India feiler (MELOSYS-6938).
 *  - ARBEIDSGIVER: Aareg-mocken returnerer alltid nøyaktig ett arbeidsforhold
 *    ("Ståles Stål AS", første org i OrganisasjonRepo), og POM-ens velgArbeidsgiver
 *    er et radio-oppslag uten fritekst. En «override» ville bare gjentatt defaulten.
 *  - BESTEMMELSE: AUS_ART9_3 er bestemmelsen for Australia art. 9 nr. 3.
 * Periode er derfor den ENESTE reelle variasjonsaksen (se DSL.oppgiPeriode).
 */
const LAND = ARBEIDSLAND.AUSTRALIA; // 'AU'
const ARBEIDSGIVER = 'Ståles Stål AS';
const BESTEMMELSE = BESTEMMELSER.AUS_ART9_3; // 'AUS_ART9_3'
const ARBEIDSSTED = 'Test';
const IVERKSETT_PROSESS = 'IVERKSETT_VEDTAK_TRYGDEAVTALE';

export class TrygdeavtaleDriver {
  private loggedIn = false;

  constructor(private readonly page: Page) {}

  // ── Felles ───────────────────────────────────────────────────────────

  async loggInn(): Promise<void> {
    if (this.loggedIn) return;
    await new AuthHelper(this.page).login();
    this.loggedIn = true;
  }

  /**
   * Opprett en TRYGDEAVTALE/MEDLEMSKAP_LOVVALG/YRKESAKTIV-sak (årsak SØKNAD) og
   * returner BEHANDLING.ID for den nyopprettede behandlingen.
   *
   * behandlingId fanges via nyeste rad i BEHANDLING (ren DB per test → sekvensiell
   * opprettelse gjør «høyest ID» deterministisk). Vi bruker den live-verifiserte
   * kolonnen BEHANDLING.ID — IKKE opprett-ny-sak-hjelperens uverifiserte
   * BEHANDLING_ID/SAK_ID-spørring (jf. planen, issue 5).
   */
  async opprettFørstegangssak(): Promise<string> {
    const hovedside = new HovedsidePage(this.page);
    const opprettSak = new OpprettNySakPage(this.page);

    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID, SAKSTYPER.TRYGDEAVTALE);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    return this.hentNyesteBehandlingId();
  }

  /**
   * Åpne den nyeste behandlingen fra saksoversikten.
   *
   * Venter FØRST på at OPPRETT_SAK-prosessen er ferdig (issue 10 — den gamle PoC-
   * driveren hoppet over dette og var «timing-heldig»), og bruker hovedsidens
   * robuste åpneBehandling (reload-retry mot den asynkrone saksoversikt-lastingen)
   * i stedet for en hardkodet lenketekst.
   */
  async åpneNyesteBehandling(): Promise<void> {
    await waitForProcessInstances(this.page.request, 30);
    const hovedside = new HovedsidePage(this.page);
    await hovedside.goto();
    await hovedside.åpneBehandling(`${BRUKERNAVN_VALID} -`);
    await this.page.waitForLoadState('networkidle');
  }

  // ── Førstegangs vedtak (scenario 1 + 2) ──────────────────────────────

  /**
   * Fullfør førstegangs-behandlingen til fattet vedtak med gitt søknadsperiode.
   * Land/arbeidsgiver/bestemmelse/arbeidssted er faste (mock-begrensning, se topp).
   */
  async fyllUtOgFattVedtak(fom: string, tom: string): Promise<void> {
    const behandling = new TrygdeavtaleBehandlingPage(this.page);
    const arbeidssted = new TrygdeavtaleArbeidsstedPage(this.page);

    await behandling.fyllUtPeriodeOgLand(fom, tom, LAND);
    await behandling.velgArbeidsgiverOgFortsett(ARBEIDSGIVER);
    await behandling.innvilgeOgVelgBestemmelse(BESTEMMELSE);
    await arbeidssted.fyllUtArbeidsstedOgFattVedtak(ARBEIDSSTED);
  }

  async ventPåIverksetting(timeoutSekunder: number = 60): Promise<void> {
    await waitForProcessInstances(this.page.request, timeoutSekunder);
  }

  /**
   * Hard DB-sluttilstand for en fattet/iverksatt førstegangsbehandling: AVSLUTTET,
   * resultat FASTSATT_LOVVALGSLAND, og IVERKSETT_VEDTAK_TRYGDEAVTALE FERDIG.
   * Bruker den fangede behandlingId-en (ikke «nyeste») for presis treff.
   */
  async verifiserBehandlingAvsluttet(behandlingId: string): Promise<void> {
    await verifiserBehandlingSluttilstand({
      behandlingId,
      forventetResultatType: 'FASTSATT_LOVVALGSLAND',
      forventetIverksettProsess: IVERKSETT_PROSESS,
    });
  }

  /**
   * Verifiser at vedtakets lovvalgsperiode i DB har forventet fom/tom.
   * (LOVVALG_PERIODE ORDER BY ID DESC = nyeste = vedtakets periode i en
   * enkeltbehandlings-flyt med ren DB per test.)
   */
  async verifiserVedtaksperiode(fom: string, tom: string): Promise<void> {
    const behandling = new TrygdeavtaleBehandlingPage(this.page);
    await behandling.assertions.verifiserPeriodeIDatabase(fom, tom);
  }

  // ── Nyvurdering (scenario 3) ─────────────────────────────────────────

  /**
   * Opprett en nyvurdering (NY_VURDERING) på den eksisterende trygdeavtale-saken
   * og åpne den nye aktive behandlingen.
   */
  async opprettNyvurdering(): Promise<void> {
    const hovedside = new HovedsidePage(this.page);
    const opprettSak = new OpprettNySakPage(this.page);

    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.opprettNyVurdering(USER_ID_VALID, AARSAK.SØKNAD);
    await waitForProcessInstances(this.page.request, 30);

    await hovedside.goto();
    await hovedside.åpneBehandling(`${BRUKERNAVN_VALID} -`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Driv NV-flyten fra Inngang til Vedtak-steget: forkort perioden på Inngang og
   * klikk gjennom Virksomhet → Bestemmelse → Familie (alle prefilled fra forrige
   * behandling). Etterpå står vi på Vedtak-steget.
   */
  async forkortPeriodePåInngang(nyTilOgMed: string): Promise<void> {
    const behandling = new TrygdeavtaleBehandlingPage(this.page);
    await behandling.endreInngangTilOgMedOgFortsett(nyTilOgMed); // Inngang
    // Virksomhet: arbeidsgiveren SKAL være forhåndsvalgt fra forrige behandling, men
    // Aareg-mocken re-hentes asynkront ved NV, så pre-valget racer av og til (radioen
    // står uavkrysset → «Bekreft og fortsett» forblir deaktivert). Vi velger derfor
    // arbeidsgiveren eksplisitt — idempotent (check() er no-op hvis alt er valgt) og
    // venter samtidig på at radioen faktisk er rendret. Driveren er riktig lag å
    // absorbere slike system-quirks (Farley), så DSL/feature slipper å vite om det.
    await behandling.velgArbeidsgiverOgFortsett(ARBEIDSGIVER); // Virksomhet
    // Bestemmelse og vurdering: innvilgelse + AUS_ART9_3 SKAL være forhåndsvalgt fra
    // forrige behandling, men vurderingen re-hentes asynkront ved NV og pre-valget
    // racer på samme måte som Virksomhet (innvilge-radioen står uavkrysset →
    // knappen deaktivert). Velg derfor eksplisitt — idempotent og robust.
    await behandling.innvilgeOgVelgBestemmelse(BESTEMMELSE); // Bestemmelse
    await behandling.klikkBekreftOgFortsett(); // Familie
  }

  /**
   * Vedtak-steget for NV: synk vedtaksperiodens TOM med Inngang-endringen, oppgi
   * obligatorisk grunn for nytt vedtak, og fatt vedtaket.
   */
  async fattNyvurderingsvedtak(nyTilOgMed: string, grunnEnum: string): Promise<void> {
    const behandling = new TrygdeavtaleBehandlingPage(this.page);
    await behandling.endreVedtaksperiodeTom(nyTilOgMed);
    await behandling.velgGrunnForNyttVedtak(grunnEnum);
    await behandling.fattVedtak();
  }

  /**
   * Verifiser hele DB-utfallet av NV-vedtaket og returner medlperiode_id for
   * etterfølgende MEDL-mock-oppslag.
   */
  async verifiserNyvurderingVedtak(forventet: {
    fom: string;
    tom: string;
    bakgrunn: string;
    bestemmelse: string;
  }): Promise<number> {
    const behandling = new TrygdeavtaleBehandlingPage(this.page);
    return behandling.assertions.verifiserNyVurderingVedtakIDatabase(forventet);
  }

  /** Verifiser i MEDL-mocken at perioden er erstattet in-place (GYLD, forkortet TOM). */
  async verifiserMedlPeriodeErstattet(
    medlPeriodeId: number,
    tilOgMedIso: string,
    grunnlag: string
  ): Promise<void> {
    const behandling = new TrygdeavtaleBehandlingPage(this.page);
    await behandling.assertions.verifiserMedlPeriodeErstattet(this.page.request, medlPeriodeId, {
      tilOgMed: tilOgMedIso,
      grunnlag,
    });
  }

  // ── Unntaksregistrering (scenario 4a + 4b) ───────────────────────────

  /**
   * Opprett en TRYGDEAVTALE/UNNTAK/REGISTRERING_UNNTAK-sak (årsak SØKNAD) og åpne
   * unntaksregistrering-siden via oppgavelenken på hovedsiden.
   */
  async opprettUnntakssakOgÅpne(): Promise<void> {
    const hovedside = new HovedsidePage(this.page);
    const opprettSak = new OpprettNySakPage(this.page);

    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype(SAKSTYPER.TRYGDEAVTALE);
    await opprettSak.velgSakstema('UNNTAK');
    await opprettSak.velgBehandlingstema('REGISTRERING_UNNTAK');
    await opprettSak.velgAarsak(AARSAK.SØKNAD);
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // OPPRETT_SAK-prosessen må fullføre før oppgavelenken er klikkbar
    await waitForProcessInstances(this.page.request, 30);
    await hovedside.åpneBehandling(`${BRUKERNAVN_VALID} -`);
  }

  /** Fyll ut Inngang-steget (periode + avsenderland) og fortsett til «Unntak medlemskap». */
  async fyllUtUnntaksInngang(fom: string, tom: string): Promise<void> {
    const unntak = new TrygdeavtaleUnntaksregistreringPage(this.page);
    await unntak.ventPåInngang();
    await unntak.fyllUtInngang(fom, tom, LAND);
    await unntak.bekreftInngangOgFortsett();
  }

  /** Godkjenn unntaket med bestemmelse og avslutt. */
  async godkjennUnntak(bestemmelse: string): Promise<void> {
    const unntak = new TrygdeavtaleUnntaksregistreringPage(this.page);
    await unntak.godkjennMedBestemmelse(bestemmelse);
    await unntak.bekreftOgAvslutt();
  }

  /** «Ikke godkjenn» unntaket og avslutt (negativt utfall). */
  async ikkeGodkjennUnntak(): Promise<void> {
    const unntak = new TrygdeavtaleUnntaksregistreringPage(this.page);
    await unntak.ikkeGodkjenn();
    await unntak.bekreftOgAvslutt();
  }

  /** Verifiser DB-utfallet av et GODKJENT unntak; returner medlperiode_id. */
  async verifiserGodkjentUnntak(forventet: {
    fom: string;
    tom: string;
    land: string;
    bestemmelse: string;
  }): Promise<number> {
    const unntak = new TrygdeavtaleUnntaksregistreringPage(this.page);
    return unntak.assertions.verifiserGodkjentUnntakIDatabase(forventet);
  }

  /** Verifiser MEDL-mockens ENDELIGE, gyldige periode for et godkjent unntak. */
  async verifiserMedlPeriodeEndelig(
    medlPeriodeId: number,
    forventet: { lovvalgsland: string; grunnlag: string; fraOgMed: string; tilOgMed: string }
  ): Promise<void> {
    const unntak = new TrygdeavtaleUnntaksregistreringPage(this.page);
    await unntak.assertions.verifiserMedlPeriodeEndelig(this.page.request, medlPeriodeId, forventet);
  }

  /** Verifiser DB-utfallet av et IKKE_GODKJENT unntak (sak avsluttet, ingen periode). */
  async verifiserIkkeGodkjentUnntak(land: string): Promise<void> {
    const unntak = new TrygdeavtaleUnntaksregistreringPage(this.page);
    await unntak.assertions.verifiserIkkeGodkjentUnntakIDatabase({ land });
  }

  // ── Privat ───────────────────────────────────────────────────────────

  private async hentNyesteBehandlingId(): Promise<string> {
    return withDatabase(async (db) => {
      const row = await db.queryOne<{ ID: number }>(
        `SELECT ID FROM BEHANDLING ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY`
      );
      expect(row, 'Forventet en behandling i DB etter saksopprettelse').not.toBeNull();
      return String(row!.ID);
    });
  }
}
