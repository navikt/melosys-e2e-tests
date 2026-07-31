import { APIRequestContext } from '@playwright/test';

/**
 * Helper for querying faktureringskomponenten API
 *
 * Faktureringskomponenten manages invoice series (fakturaserier) for
 * trygdeavgift (social security contributions). Runs on port 8084.
 *
 * Requires OAuth token from mock-oauth2-server for authentication.
 *
 * Usage:
 *   const helper = new FaktureringHelper(request);
 *   const serie = await helper.hentFakturaserie('01KK139TBB61C8WQSFJWGSD3JE');
 */

// --- Konstanter ---

/**
 * Sentinel-verdi faktureringskomponenten returnerer i stedet for en ULID når en
 * fakturaserie kanselleres uten kreditering – enten fordi ingen fakturalinjer var
 * BESTILT, eller fordi de bestilte linjene allerede netter til 0 per år.
 * melosys-api skriver den rått til behandlingsresultat.fakturaserieReferanse.
 * Kilde: faktureringskomponenten KanselleringService.kansellerFakuraserieUtenKreditering
 */
export const FAKTURASERIE_KANSELLERT_UTEN_KREDITERING = 'Kansellert';

/**
 * Nedre grense for timeouten vi gir ett enkelt kall mot faktureringskomponenten når
 * `ventPåKjedeSum` poller. Under dette rekker ikke kallet å svare uansett, så et nytt
 * forsøk startes ikke – da ville totalen sklidd forbi `timeoutMs`.
 */
const MIN_KALL_TIMEOUT_MS = 1_000;

// --- Types ---

export interface FakturaLinje {
  periodeFra: string;
  periodeTil: string;
  beskrivelse: string;
  belop: number;
  antall: number;
  enhetsprisPerManed: number;
}

export interface EksternFakturaStatus {
  status: string;
  dato: string;
}

export interface Faktura {
  fakturaReferanse: string;
  datoBestilt: string;
  sistOppdatert: string;
  status: string;
  fakturaLinje: FakturaLinje[];
  periodeFra: string;
  periodeTil: string;
  eksternFakturaStatus: EksternFakturaStatus[];
  eksternFakturaNummer: string;
}

export interface Fakturaserie {
  fakturaserieReferanse: string;
  fakturaGjelderInnbetalingstype: string;
  fodselsnummer: string;
  fullmektig: string | null;
  referanseBruker: string;
  referanseNAV: string;
  startdato: string;
  sluttdato: string;
  status: string;
  intervall: string;
  opprettetTidspunkt: string;
  faktura: Faktura[];
}

// --- Helper ---

export class FaktureringHelper {
  private readonly baseUrl: string;
  private token: string | null = null;

  constructor(
    private readonly request: APIRequestContext,
    baseUrl: string = 'http://localhost:8084'
  ) {
    this.baseUrl = baseUrl;
  }

  /**
   * Get OAuth token from mock-oauth2-server
   */
  private async getToken(): Promise<string> {
    if (this.token) return this.token;

    const response = await this.request.post('http://localhost:8082/isso/token', {
      form: {
        grant_type: 'client_credentials',
        client_id: 'melosys-api',
        client_secret: 'dummy',
        audience: 'melosys-localhost',
      },
    });

    if (!response.ok()) {
      throw new Error(`Failed to get token: ${response.status()}`);
    }

    const data = await response.json();
    this.token = data.access_token;
    return this.token!;
  }

  /**
   * Make authenticated request to faktureringskomponenten
   */
  private async callEndpoint(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    timeoutMs?: number
  ) {
    const token = await this.getToken();
    const url = `${this.baseUrl}${path}`;
    const options = {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        // AuditorAwareFilter i faktureringskomponenten krever ident for sporing på
        // POST/PUT (header Nav-User-Id ELLER NAVident/azp_name-claim i tokenet).
        // CI-stackens mock-oauth2-token mangler claimene → uten header svarer
        // filteret 400 "Ident må oppgis for sporing" (default Spring-error-body).
        'Nav-User-Id': 'melosys-e2e-tests',
      },
      failOnStatusCode: false,
      // Uten eksplisitt timeout arver kallet APIRequestContext-defaulten på 30 s. Det
      // gjør at en poll-løkke med eget budsjett kan bruke budsjettet + 30 s i verste
      // fall; kallere som poller sender derfor gjenstående tid inn her.
      ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {}),
    };

    switch (method) {
      case 'GET':
        return await this.request.get(url, options);
      case 'POST':
        return await this.request.post(url, options);
      case 'PUT':
        return await this.request.put(url, options);
      case 'DELETE':
        return await this.request.delete(url, options);
    }
  }

  /**
   * Hent en fakturaserie by referanse
   *
   * @param referanse - Fakturaserie-referanse (ULID, e.g. '01KK139TBB61C8WQSFJWGSD3JE')
   * @returns Fakturaserie with all fakturaer and linjer
   *
   * @example
   * const serie = await helper.hentFakturaserie('01KK139TBB61C8WQSFJWGSD3JE');
   * console.log(serie.status); // 'UNDER_BESTILLING', 'AKTIV', 'ERSTATTET', 'KANSELLERT'
   * console.log(serie.faktura.length); // Number of invoices
   */
  async hentFakturaserie(referanse: string): Promise<Fakturaserie> {
    const response = await this.callEndpoint('GET', `/fakturaserier/${referanse}`);

    if (!response.ok()) {
      const text = await response.text();
      throw new Error(`Failed to get fakturaserie ${referanse}: ${response.status()} - ${text}`);
    }

    return await response.json();
  }

  /**
   * Hent fakturaserie-kjede by referanse (inkluderer krediterings-serier via erstattet_med-kjeden)
   *
   * Bruker query-parameter-endepunktet som traverserer hele erstattet_med-kjeden,
   * i motsetning til hentFakturaserie som kun returnerer én serie.
   */
  async hentFakturaserieKjede(referanse: string, timeoutMs?: number): Promise<Fakturaserie[]> {
    const response = await this.callEndpoint(
      'GET',
      `/fakturaserier?referanse=${encodeURIComponent(referanse)}`,
      timeoutMs
    );

    if (!response.ok()) {
      const text = await response.text();
      throw new Error(`Failed to get fakturaserie-kjede ${referanse}: ${response.status()} - ${text}`);
    }

    return await response.json();
  }

  /**
   * Get total beløp for en hel fakturaserie-kjede (inkl. krediteringer), eventuelt filtrert på år
   */
  totalBelopKjede(serier: Fakturaserie[], aar?: number): number {
    return serier.reduce((sum, serie) => sum + this.totalBelop(serie, aar), 0);
  }

  /**
   * Hent og slå sammen flere fakturaserie-kjeder, deduplisert på referanse.
   * Nødvendig når krediterings-serier lenkes til flere kjeder via erstattet_med.
   */
  async hentSammenslåttKjede(referanser: string[], timeoutMs?: number): Promise<Fakturaserie[]> {
    const kjeder = await Promise.all(referanser.map(r => this.hentFakturaserieKjede(r, timeoutMs)));
    const sett = new Map<string, Fakturaserie>();
    kjeder.flat().forEach(s => sett.set(s.fakturaserieReferanse, s));
    return [...sett.values()];
  }

  /**
   * Avrund beløp til 2 desimaler (unngår floating point epsilon-avvik)
   */
  avrundBelop(belop: number): number {
    return parseFloat(belop.toFixed(2));
  }

  /**
   * Antall fakturalinjer i kjeden, med samme årsfilter som `totalBelop`.
   *
   * Brukes av `ventPåKjedeSum` til å skille «summen er 0 fordi alt er avregnet» fra
   * «summen er 0 fordi det ikke finnes linjer å måle på ennå».
   */
  private antallFakturaLinjer(serier: Fakturaserie[], aar?: number): number {
    return serier
      .flatMap(serie => serie.faktura)
      .flatMap(faktura => faktura.fakturaLinje)
      .filter(linje => this.matcherAar(linje, aar))
      .length;
  }

  /**
   * Hvilke år har kjeden faktisk fakturalinjer for?
   *
   * Brukes kun i feilmeldingen når `ventPåKjedeSum` ikke finner noe å måle. Uten den må
   * man grave i loggene fra en annen kjøring for å se om årstallet man spurte om i det
   * hele tatt finnes i kjeden – det var nettopp det som skjulte at ett kallsted utledet
   * avregningsåret fra en periodeslutt som lå i neste kalenderår.
   *
   * Defensiv mot manglende felter: den kjører i en feilsti og skal aldri kaste selv.
   */
  private oppsummerAarIKjede(serier: Fakturaserie[]): string {
    const linjer = (serier ?? [])
      .flatMap(serie => serie?.faktura ?? [])
      .flatMap(faktura => faktura?.fakturaLinje ?? []);

    if (linjer.length === 0) {
      return `Kjeden har ${serier?.length ?? 0} serie(r), men ingen fakturalinjer i det hele tatt.`;
    }

    const linjerPerAar = new Map<string, number>();
    for (const linje of linjer) {
      const aar = String(linje?.periodeFra ?? '').slice(0, 4) || 'ukjent';
      linjerPerAar.set(aar, (linjerPerAar.get(aar) ?? 0) + 1);
    }

    const fordeling = [...linjerPerAar.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([aar, antall]) => `${aar} (${antall} linjer)`)
      .join(', ');

    return `Kjeden har ${serier.length} serie(r) med linjer for: ${fordeling}.`;
  }

  /**
   * Hører fakturalinjen til `aar`? Uten `aar` teller alle linjer.
   *
   * Delt mellom `antallFakturaLinjer` og `totalBelop` slik at teller og sum ikke kan
   * komme i utakt.
   */
  private matcherAar(linje: FakturaLinje, aar?: number): boolean {
    return aar === undefined
      || linje.periodeFra.startsWith(`${aar}-`)
      || linje.periodeTil.startsWith(`${aar}-`);
  }

  /**
   * Poll den sammenslåtte kjeden til den summerer til `forventetSum`.
   *
   * Bakgrunn: `waitForProcessInstances` svarer COMPLETED så snart den ser noe fullført
   * arbeid – også prosessinstanser fra forrige steg. Kalles den ~200 ms etter
   * annulleringsklikket, rekker den å svare «alle N ferdige» før annulleringens egen
   * instans er registrert, og da har ANNULLER_SAK-steget ikke kjørt ennå. Selve
   * krediteringen er derimot synkron: steget kaller faktureringskomponenten over REST
   * og blokkerer til den svarer, så når instansen er FERDIG er kreditserien commitet.
   * Det er altså registreringen vi må vente på, ikke en asynkron melding.
   * Observert på CI: sum 121482 i stedet for 0.
   *
   * Normaltilfellet ved timeout er å returnere siste brukbare kjede – ikke kaste – slik at
   * kalleren kan logge seriene og la `expect` produsere feilmeldingen. Metoden kaster i
   * tre tilfeller, fordi en sum-assertion da ville pekt feil vei:
   *
   * 1. Ugyldige argumenter (tom referanseliste, tom streng, eller ikke-tall som forventet
   *    sum, årstall, intervall eller timeout).
   * 2. Sentinel-referansen «Kansellert» – da ble ingenting kreditert, og en 0-sum er
   *    legitim uten å bety at avregningen gikk bra.
   * 3. Vi fikk aldri noe å måle på innen tiden. Feilmeldingen skiller to årsaker: enten
   *    svarte tjenesten aldri (siste forsøk feilet), eller så svarte den uten
   *    fakturalinjer. Det siste er farlig fordi endepunktet svarer 200 med `[]` for ukjent
   *    referanse, og `totalBelopKjede([])` er 0 – som tilfeldigvis er `forventetSum` i alle
   *    dagens kallsteder. Med `aar` satt gjelder det samme når kjeden mangler linjer i det
   *    året.
   *
   * Har vi derimot en målt kjede, returneres den selv om det aller siste forsøket feilet –
   * da logges feilen i stedet, siden kallerens `expect` gir en mer presis feilmelding enn
   * en avsluttende transient HTTP-feil.
   *
   * Transiente HTTP-feil underveis gir nytt forsøk så lenge det er tid igjen. Selve
   * utregningen skjer utenfor forsøks-håndteringen, så feil i vår egen kode bobler opp
   * umiddelbart i stedet for å bli prøvd på nytt som om det var tjenesten som svikter.
   *
   * Total ventetid holdes innenfor `timeoutMs`: hvert kall får kun resten av budsjettet,
   * og et nytt forsøk startes ikke når det gjenstår mindre enn `MIN_KALL_TIMEOUT_MS`.
   */
  async ventPåKjedeSum(
    referanser: string[],
    forventetSum: number,
    options: { timeoutMs?: number; intervallMs?: number; aar?: number } = {}
  ): Promise<Fakturaserie[]> {
    const { timeoutMs = 30_000, intervallMs = 500, aar } = options;

    if (!Array.isArray(referanser) || referanser.length === 0 || referanser.some(referanse => !referanse)) {
      throw new Error(
        `ventPåKjedeSum krever minst én gyldig fakturaserie-referanse (fikk: ${JSON.stringify(referanser)})`
      );
    }

    // Kansellering uten kreditering returnerer sentinel-strengen «Kansellert» i stedet for
    // en ULID, og melosys-api skriver den rått til behandlingsresultat.fakturaserieReferanse.
    // Uten denne sjekken ville vi pollet i 30 s og deretter klaget på «feil referanse».
    const sentinel = referanser.find(referanse => referanse === FAKTURASERIE_KANSELLERT_UTEN_KREDITERING);
    if (sentinel !== undefined) {
      throw new Error(
        `Fakturaserie-referansen er «${sentinel}» – faktureringskomponenten kansellerte uten å ` +
        'kreditere. Det skjer enten fordi ingen fakturalinjer var BESTILT, eller fordi de ' +
        'bestilte linjene allerede netter til 0 per år (kjeden er kreditert fra før).'
      );
    }

    if (!Number.isFinite(forventetSum)) {
      throw new Error(
        `ventPåKjedeSum krever et endelig tall som forventetSum ` +
        `(fikk: ${String(forventetSum)} av type ${typeof forventetSum})`
      );
    }

    if (aar !== undefined && !Number.isInteger(aar)) {
      throw new Error(`ventPåKjedeSum krever et helt årstall som aar (fikk: ${aar})`);
    }

    if (!Number.isFinite(intervallMs) || intervallMs <= 0) {
      throw new Error(`ventPåKjedeSum krever et positivt intervallMs (fikk: ${String(intervallMs)})`);
    }

    // Uten denne ville timeoutMs = NaN gjort «elapsedMs > timeoutMs» permanent usann og
    // sovetiden til 0 – altså en løkke som hamrer tjenesten til testen dør på timeout.
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error(`ventPåKjedeSum krever et positivt timeoutMs (fikk: ${String(timeoutMs)})`);
    }

    const maalSum = this.avrundBelop(forventetSum);
    const start = Date.now();
    // «Brukbar» = en kjede som faktisk har linjer å måle. Vi holder på den siste av dem,
    // slik at en avsluttende tom eller feilende runde ikke frarøver kalleren diagnostikken.
    let sisteBrukbareSerier: Fakturaserie[] | undefined;
    let sisteBrukbareSum: number | undefined;
    // Siste kjede vi klarte å hente, uansett om den hadde målbare linjer. Brukes kun til å
    // gjøre «fant ingen linjer»-feilen diagnostiserbar fra testrapporten alene.
    let sisteHentedeSerier: Fakturaserie[] | undefined;
    let sisteFeil: unknown;
    let harForsøkt = false;

    while (true) {
      let nyeSerier: Fakturaserie[] | undefined;
      const gjenstaendeMs = timeoutMs - (Date.now() - start);

      // Kallet får kun resten av budsjettet – uten eksplisitt timeout arver det
      // APIRequestContext-defaulten på 30 s og kan skyve faktisk ventetid til
      // timeoutMs + 30 s. Gjenstår det mindre enn MIN_KALL_TIMEOUT_MS starter vi ikke et
      // nytt forsøk i det hele tatt: et kall med lengre timeout enn budsjettet ville
      // overskredet timeoutMs, og et kall med kortere ville bare rukket å produsere en
      // kunstig «tjenesten svarte ikke»-feil. Første runde er unntatt, slik at en kaller
      // med et bittelite budsjett likevel får ett reelt forsøk.
      if (!harForsøkt || gjenstaendeMs >= MIN_KALL_TIMEOUT_MS) {
        harForsøkt = true;

        try {
          nyeSerier = await this.hentSammenslåttKjede(
            referanser,
            Math.max(MIN_KALL_TIMEOUT_MS, gjenstaendeMs)
          );
          sisteFeil = undefined;
        } catch (feil) {
          // Kun HENTINGEN prøves på nytt. Utregningen under ligger utenfor, så en feil der
          // (kontraktsbrudd i responsen) boblet opp med en gang i stedet for å bli
          // feilrapportert som «tjenesten svarer ikke».
          sisteFeil = feil;
        }
      }

      if (nyeSerier !== undefined) {
        sisteHentedeSerier = nyeSerier;

        if (this.antallFakturaLinjer(nyeSerier, aar) > 0) {
          // Alt-eller-ingenting: summen må høre til kjeden vi lagrer, ellers kan vi ende opp
          // med å logge én sum og returnere en kjede med en annen.
          sisteBrukbareSerier = nyeSerier;
          sisteBrukbareSum = this.avrundBelop(this.totalBelopKjede(nyeSerier, aar));
        }
      }

      const elapsedMs = Date.now() - start;

      if (sisteBrukbareSerier !== undefined && sisteBrukbareSum === maalSum) {
        console.log(`✅ Fakturaserie-kjede summerer til ${maalSum} etter ${elapsedMs} ms`);
        return sisteBrukbareSerier;
      }

      if (elapsedMs >= timeoutMs) {
        const sekunder = Math.round(elapsedMs / 1000);
        const aarSuffiks = aar !== undefined ? ` for ${aar}` : '';

        if (sisteBrukbareSerier === undefined) {
          // Vi har ingenting å asserte på. Da må feilen – hvis den finnes – lede meldingen:
          // «sjekk referansen» er aktivt villedende når tjenesten aldri svarte.
          if (sisteFeil !== undefined) {
            throw new Error(
              `Fikk aldri et brukbart svar fra faktureringskomponenten for ` +
              `${referanser.join(', ')} innen ${sekunder}s. Siste feil: ${sisteFeil}`,
              { cause: sisteFeil }
            );
          }

          throw new Error(
            `Fant ingen fakturalinjer${aarSuffiks} på referanse(r) ${referanser.join(', ')} innen ` +
            `${sekunder}s. ${this.oppsummerAarIKjede(sisteHentedeSerier ?? [])} ` +
            'En sum-assertion ville vært vakuøs – sjekk at fakturaserie-referansen og ' +
            'eventuelt årstallet er riktig.'
          );
        }

        // Vi HAR en målt kjede. Da returnerer vi den selv om siste forsøk feilet: kalleren
        // sin expect gir en langt mer presis feilmelding enn en avsluttende transient feil,
        // som ellers ville kastet bort hele diagnostikken.
        if (sisteFeil !== undefined) {
          console.log(`⚠️  Siste forsøk mot faktureringskomponenten feilet: ${sisteFeil}`);
        }

        console.log(
          `⚠️  Fakturaserie-kjede summerer til ${sisteBrukbareSum} (forventet ${maalSum}) etter ` +
          `${sekunder}s – gir opp. Merk at tallet er fra siste runde som hadde linjer å måle.`
        );
        return sisteBrukbareSerier;
      }

      // Klem sovetiden mot gjenstående budsjett, ellers overskrider vi timeoutMs med
      // inntil ett intervall.
      await new Promise(resolve => setTimeout(resolve, Math.min(intervallMs, timeoutMs - elapsedMs)));
    }
  }

  // --- Admin-endepunkter (krever NAIS_CLUSTER_NAME=dev-gcp i faktureringskomponenten) ---

  /**
   * Sett status på en enkelt-faktura via admin-endepunktet.
   *
   * Brukes typisk til å flippe en faktura til BESTILT, som er en forutsetning for
   * simulerManglendeInnbetaling. Endepunktet svarer 403 hvis faktureringskomponenten
   * ikke kjører med env NAIS_CLUSTER_NAME=dev-gcp (satt i begge compose-filene).
   *
   * @param fakturaReferanse - Faktura-referanse (ULID, fra Fakturaserie.faktura[].fakturaReferanse)
   * @param status - Ny status (default 'BESTILT')
   */
  async settFakturaStatus(fakturaReferanse: string, status: string = 'BESTILT'): Promise<void> {
    const response = await this.callEndpoint(
      'POST',
      `/admin/faktura/${fakturaReferanse}/status?status=${status}`
    );

    if (!response.ok()) {
      const text = await response.text();
      throw new Error(
        `Failed to set faktura ${fakturaReferanse} to status ${status}: ${response.status()} - ${text}`
      );
    }
    console.log(`✅ Faktura ${fakturaReferanse} satt til status ${status}`);
  }

  /**
   * Simuler at en faktura ikke er betalt innen forfall (manglende innbetaling).
   *
   * Faktureringskomponenten syntetiserer en EksternFakturaStatus MANGLENDE_INNBETALING
   * og publiserer ManglendeFakturabetalingMelding på Kafka. For frivillig medlemskap
   * oppretter melosys-api deretter en MANGLENDE_INNBETALING_TRYGDEAVGIFT-behandling.
   *
   * Forutsetning: fakturaen må ha status BESTILT (bruk settFakturaStatus først).
   * Endepunktet svarer 403 uten NAIS_CLUSTER_NAME=dev-gcp.
   *
   * @param fakturaReferanse - Faktura-referanse (ULID)
   * @param betaltBelop - Beløp som er betalt (default 0 = ingenting betalt)
   */
  async simulerManglendeInnbetaling(fakturaReferanse: string, betaltBelop: number = 0): Promise<void> {
    const response = await this.callEndpoint(
      'POST',
      `/admin/faktura/${fakturaReferanse}/manglende-innbetaling?betaltBelop=${betaltBelop}`
    );

    if (!response.ok()) {
      const text = await response.text();
      throw new Error(
        `Failed to simulate manglende innbetaling for faktura ${fakturaReferanse}: ${response.status()} - ${text}`
      );
    }
    console.log(`✅ Manglende innbetaling simulert for faktura ${fakturaReferanse} (betalt: ${betaltBelop})`);
  }

  // --- Convenience methods ---

  /**
   * Get total beløp for faktura-linjer, eventuelt filtrert på år
   */
  totalBelop(serie: Fakturaserie, aar?: number): number {
    return serie.faktura.reduce(
        (sum, f) => sum + f.fakturaLinje
            .filter(l => this.matcherAar(l, aar))
            .reduce((s, l) => s + l.belop, 0),
        0
    );
  }

  /**
   * Get fakturaer filtered by status
   */
  fakturaerMedStatus(serie: Fakturaserie, status: string): Faktura[] {
    return serie.faktura.filter(f => f.status === status);
  }

  /**
   * Log a human-readable summary of a fakturaserie
   */
  loggFakturaserie(serie: Fakturaserie): void {
    console.log(`\n📄 Fakturaserie: ${serie.fakturaserieReferanse}`);
    console.log(`   Status: ${serie.status} | Type: ${serie.fakturaGjelderInnbetalingstype}`);
    console.log(`   Fnr: ${serie.fodselsnummer} | Periode: ${serie.startdato} → ${serie.sluttdato}`);
    console.log(`   Intervall: ${serie.intervall} | Opprettet: ${serie.opprettetTidspunkt}`);
    console.log(`   Fakturaer: ${serie.faktura.length}`);

    for (const faktura of serie.faktura) {
      const linjeSum = faktura.fakturaLinje.reduce((s, l) => s + l.belop, 0);
      console.log(`     💰 ${faktura.fakturaReferanse} [${faktura.status}] ${faktura.periodeFra}→${faktura.periodeTil} = ${linjeSum.toFixed(2)} kr`);
      for (const linje of faktura.fakturaLinje) {
        console.log(`        ${linje.periodeFra}→${linje.periodeTil}: ${linje.belop.toFixed(2)} kr (${linje.beskrivelse.split('\n')[0]})`);
      }
    }

    const totalt = serie.faktura.reduce(
      (sum, f) => sum + f.fakturaLinje.reduce((s, l) => s + l.belop, 0),
      0
    );
    console.log(`   Totalt: ${totalt.toFixed(2)} kr\n`);
  }
}
