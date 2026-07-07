/**
 * DSL for Trygdeavtale — Lag 2 i Farleys fire-lags-modell.
 *
 * Rent domenespråk. Ingen kjennskap til POM-er, selektorer, sider eller helpers —
 * all den kunnskapen ligger i driveren (Lag 3), som er det eneste denne klassen
 * importerer. Dette er ekvivalenten til Farleys ShoppingDsl: den eksponerer
 * domeneoperasjoner som BÅDE step-definisjoner (Gherkin) og rene Playwright-tester
 * kan komponere (se tests/trygdeavtale/trygdeavtale-vedtak-dsl.spec.ts).
 *
 * TILSTAND (jf. planen, issue 2): fixturen lager en fersk TrygdeavtaleDsl per
 * scenario, så flyt-tilstand som deles mellom steg bor som private felt HER — ikke
 * i en egen DslContext (unødvendig med kun én DSL-klasse) og ikke i driveren (som
 * er tilstandsløs og returnerer det den fanger). «Precision where needed»:
 * søknadsperioden har fornuftige standardverdier og overstyres kun når et scenario
 * sier det eksplisitt (oppgiPeriode).
 */
import { TrygdeavtaleDriver } from './drivers/trygdeavtale.driver';

/** Standard søknadsperiode — brukt når et scenario ikke oppgir en egen (oppgiPeriode). */
const STANDARD_FOM = '01.01.2024';
const STANDARD_TOM = '01.01.2026';

/** AUS_ART9_3 gir dette grunnlaget i MEDL-mocken (Australia art. 9 nr. 3). */
const MEDL_GRUNNLAG_AUS = 'Australia_9_3';

/** Lesbar norsk grunn i Lag 1 → backend-enum (enumen lekker ikke inn i feature-fila). */
const GRUNN_ENUM: Record<string, string> = {
  'nye opplysninger': 'NYE_OPPLYSNINGER',
  'feil i behandling': 'FEIL_I_BEHANDLING',
};

/** Lesbart bestemmelses-navn i Lag 1 → UI-/backend-kode (Australia art. 9 nr. 3). */
const BESTEMMELSE_KODE: Record<string, string> = {
  'australia artikkel 9 nr. 3': 'AUS_ART9_3',
};

export class TrygdeavtaleDsl {
  // Delt flyt-tilstand (privat — scenario-scoped via fixturen)
  private fom = STANDARD_FOM;
  private tom = STANDARD_TOM;
  private førsteBehandlingId?: string;
  private medlPeriodeId?: number;

  constructor(private readonly driver: TrygdeavtaleDriver) {}

  // ── Førstegangs vedtak (scenario 1 + 2) ──────────────────────────────

  /** Opprett en standard trygdeavtale-behandling (logg inn → opprett sak → åpne behandling). */
  async opprettBehandling(): Promise<void> {
    await this.driver.loggInn();
    this.førsteBehandlingId = await this.driver.opprettFørstegangssak();
    await this.driver.åpneNyesteBehandling();
  }

  /**
   * Overstyr søknadsperioden (precision-where-needed). Ren felt-skriver — ingen
   * UI-handling; verdiene leses når vedtaket faktisk fattes (fattVedtak).
   */
  oppgiPeriode(fom: string, tom: string): void {
    this.fom = fom;
    this.tom = tom;
  }

  /** Fatt vedtak med gitt resultat. Kun INNVILGET er implementert (issue 3). */
  async fattVedtak(resultat: string): Promise<void> {
    if (resultat !== 'INNVILGET') {
      throw new Error(
        `Resultat «${resultat}» er ikke implementert i DSL-en ennå (kun INNVILGET er dekket).`
      );
    }
    await this.driver.fyllUtOgFattVedtak(this.fom, this.tom);
    await this.driver.ventPåIverksetting(60);
  }

  /** Verifiser at behandlingen er fullført: AVSLUTTET i DB med ferdig iverksetting. */
  async verifiserFullført(): Promise<void> {
    await this.driver.verifiserBehandlingAvsluttet(this.krevFørsteBehandlingId());
  }

  /** Verifiser at vedtakets lovvalgsperiode i DB har forventet fom/tom. */
  async verifiserVedtaksperiode(fom: string, tom: string): Promise<void> {
    await this.driver.verifiserVedtaksperiode(fom, tom);
  }

  // ── Nyvurdering (scenario 3) ─────────────────────────────────────────

  /**
   * Komposisjon (Gitt-steg): opprett OG fullfør en innvilget førstegangsbehandling
   * for gitt periode, slik at en nyvurdering har noe å bygge på.
   */
  async opprettInnvilgetBehandling(fom: string, tom: string): Promise<void> {
    this.oppgiPeriode(fom, tom);
    await this.opprettBehandling();
    await this.fattVedtak('INNVILGET');
  }

  /** Opprett en nyvurdering og forkort perioden til ny sluttdato (Inngang-steget). */
  async opprettNyvurderingMedForkortetPeriode(nyTilOgMed: string): Promise<void> {
    this.tom = nyTilOgMed;
    await this.driver.opprettNyvurdering();
    await this.driver.forkortPeriodePåInngang(nyTilOgMed);
  }

  /** Fatt nytt vedtak på nyvurderingen med lesbar norsk grunn (mappes til enum her). */
  async fattNyttVedtak(grunn: string): Promise<void> {
    const enumVerdi = GRUNN_ENUM[grunn.toLowerCase()];
    if (!enumVerdi) {
      throw new Error(
        `Ukjent grunn for nytt vedtak: «${grunn}». Gyldige: ${Object.keys(GRUNN_ENUM).join(', ')}.`
      );
    }
    await this.driver.fattNyvurderingsvedtak(this.tom, enumVerdi);
    await this.driver.ventPåIverksetting(60);
  }

  /** Verifiser at nyvurderingen er fullført i DB (forkortet periode, erstattet MEDL-periode). */
  async verifiserNyvurderingFullført(fom: string, tom: string): Promise<void> {
    this.medlPeriodeId = await this.driver.verifiserNyvurderingVedtak({
      fom,
      tom,
      bakgrunn: 'NYE_OPPLYSNINGER',
      bestemmelse: 'AUS_ART9_3',
    });
  }

  /** Verifiser at MEDL-perioden er erstattet in-place (GYLD, forkortet TOM). */
  async verifiserMedlPeriodeErstattet(nyTilOgMed: string): Promise<void> {
    await this.driver.verifiserMedlPeriodeErstattet(
      this.krevMedlPeriodeId(),
      tilIso(nyTilOgMed),
      MEDL_GRUNNLAG_AUS
    );
  }

  // ── Unntaksregistrering (scenario 4a + 4b) ───────────────────────────

  /** Opprett en unntaksregistrering (UNNTAK-sak) og fyll ut Inngang-steget. */
  async opprettUnntaksregistrering(fom: string, tom: string): Promise<void> {
    this.fom = fom;
    this.tom = tom;
    await this.driver.loggInn();
    await this.driver.opprettUnntakssakOgÅpne();
    await this.driver.fyllUtUnntaksInngang(fom, tom);
  }

  /** Godkjenn unntaket med bestemmelse (lesbart navn mappes til kode her) og avslutt. */
  async godkjennUnntak(bestemmelseNavn: string): Promise<void> {
    const kode = BESTEMMELSE_KODE[bestemmelseNavn.toLowerCase()];
    if (!kode) {
      throw new Error(
        `Ukjent bestemmelse: «${bestemmelseNavn}». Gyldige: ${Object.keys(BESTEMMELSE_KODE).join(', ')}.`
      );
    }
    await this.driver.godkjennUnntak(kode);
  }

  /** «Ikke godkjenn» unntaket og avslutt (negativt utfall). */
  async ikkeGodkjennUnntak(): Promise<void> {
    await this.driver.ikkeGodkjennUnntak();
  }

  /** Verifiser at det godkjente unntaket er registrert i DB og MEDL (endelig periode). */
  async verifiserGodkjentUnntakRegistrert(): Promise<void> {
    const medlPeriodeId = await this.driver.verifiserGodkjentUnntak({
      fom: this.fom,
      tom: this.tom,
      land: 'AU',
      bestemmelse: 'AUS_ART9_3',
    });
    await this.driver.verifiserMedlPeriodeEndelig(medlPeriodeId, {
      lovvalgsland: 'AUS',
      grunnlag: MEDL_GRUNNLAG_AUS,
      fraOgMed: tilIso(this.fom),
      tilOgMed: tilIso(this.tom),
    });
  }

  /** Verifiser at saken er avsluttet uten lovvalgsperiode (ikke-godkjent unntak). */
  async verifiserSakAvsluttetUtenUnntak(): Promise<void> {
    await this.driver.verifiserIkkeGodkjentUnntak('AU');
  }

  // ── Privat ───────────────────────────────────────────────────────────

  private krevFørsteBehandlingId(): string {
    if (!this.førsteBehandlingId) {
      throw new Error('Ingen behandlingId fanget — opprettBehandling() må kjøres først.');
    }
    return this.førsteBehandlingId;
  }

  private krevMedlPeriodeId(): number {
    if (this.medlPeriodeId === undefined) {
      throw new Error(
        'Ingen medlPeriodeId fanget — verifiserNyvurderingFullført() må kjøres først.'
      );
    }
    return this.medlPeriodeId;
  }
}

/** Konverter DD.MM.YYYY → ISO YYYY-MM-DD (MEDL-mocken svarer med ISO-datoer). */
function tilIso(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split('.');
  return `${yyyy}-${mm}-${dd}`;
}
