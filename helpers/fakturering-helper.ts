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
    path: string
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
  async hentFakturaserieKjede(referanse: string): Promise<Fakturaserie[]> {
    const response = await this.callEndpoint('GET', `/fakturaserier?referanse=${referanse}`);

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
  async hentSammenslåttKjede(...referanser: string[]): Promise<Fakturaserie[]> {
    const kjeder = await Promise.all(referanser.map(r => this.hentFakturaserieKjede(r)));
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
            .filter(l => aar === undefined || l.periodeFra.startsWith(`${aar}-`) || l.periodeTil.startsWith(`${aar}-`))
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
