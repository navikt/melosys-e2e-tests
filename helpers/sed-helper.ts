import { APIRequestContext } from '@playwright/test';

/**
 * Configuration for creating a MelosysEessiMelding
 *
 * This matches MelosysEessiMeldingRequestDto in melosys-mock's
 * /testdata/lag-melosys-eessi-melding endpoint.
 *
 * All fields are optional - the endpoint provides sensible defaults.
 * Only specify what you need to override.
 *
 * @see melosys-docker-compose/mock/src/main/kotlin/.../testdata/LagMelosysEessiMeldingController.kt
 */
export interface SedConfig {
  /** Unique SED identifier (auto-generated if not provided) */
  sedId?: string;
  /** Sequence ID for ordering multiple SEDs (default: 1) */
  sequenceId?: number;
  /** RINA case number (auto-generated if not provided) */
  rinaSaksnummer?: string;
  /** Sender institution ID, e.g., 'DK:1000', 'SE:FK' (default: DK:1000) */
  avsenderId?: string;
  /** Sender country code, e.g., 'DK', 'SE' (default: DK) */
  landkode?: string;
  /** Journal post ID reference (auto-generated if not provided) */
  journalpostId?: string;
  /** Document ID reference */
  dokumentId?: string;
  /** GSAK case number */
  gsakSaksnummer?: number;
  /** Person's fødselsnummer for journalpost (default: 30056928150) */
  fnr?: string;
  /** Person's aktør ID (default: 1111111111111) */
  aktoerId?: string;
  /** List of citizenship country codes, e.g., ['DK', 'NO'] */
  statsborgerskap?: string[];
  /** List of work country codes, e.g., ['NO', 'SE'] */
  arbeidsland?: string[];
  /** Period start date (ISO format, default: today) */
  periodeFom?: string;
  /** Period end date (ISO format, default: 1 year from today) */
  periodeTom?: string;
  /** Applicable legislation country code (default: DK) */
  lovvalgsland?: string;
  /** Article/provision reference (default: 13_1_a) */
  artikkel?: string;
  /** Whether this is a change to existing determination */
  erEndring?: boolean;
  /** Whether temporary determination applies */
  midlertidigBestemmelse?: boolean;
  /** Whether NAV was removed in X006 */
  x006NavErFjernet?: boolean;
  /** Additional information text */
  ytterligereInformasjon?: string;
  /** BUC type: LA_BUC_01, LA_BUC_02, LA_BUC_04, LA_BUC_05 (default: LA_BUC_02) */
  bucType?: string;
  /** SED type: A001, A003, A008, A009, A010, A011, X001, X006, X007, X008 (default: A003) */
  sedType?: string;
  /** SED version (default: 1) */
  sedVersjon?: string;
}

/**
 * Response from mock service after creating MelosysEessiMelding
 */
export interface SedResponse {
  success: boolean;
  sedId?: string;
  rinaSaksnummer?: string;
  journalpostId?: string;
  message?: string;
}

/**
 * Configuration for sending SedHendelse (triggers melosys-eessi flow)
 *
 * This matches SedHendelseDto in melosys-mock's /testdata/lagsak endpoint.
 * Used for real E2E testing through melosys-eessi.
 */
export interface SedHendelseConfig {
  /** BUC type: LA_BUC_01, LA_BUC_02, LA_BUC_04, LA_BUC_05 */
  bucType: string;
  /** SED type: A001, A003, A008, A009, A010, A011, X001, X006, X007, X008 */
  sedType: string;
  /** Sender institution ID (e.g., 'DK:1000', 'SE:FK') */
  avsenderId?: string;
  /** Sender institution name */
  avsenderNavn?: string;
  /** Receiver institution ID (default: 'NO:NAV') */
  mottakerId?: string;
  /** Receiver institution name (default: 'NAV') */
  mottakerNavn?: string;
  /** RINA document ID (auto-generated if not provided) */
  rinaDokumentId?: string;
  /** RINA document version (default: '1') */
  rinaDokumentVersjon?: string;
  /** Sector code (default: 'LA') */
  sektorKode?: string;
  /** RINA case ID (auto-generated if not provided) */
  rinaSakId?: string;
}

/**
 * Helper class for working with SED (Structured Electronic Document) events
 *
 * This helper interacts with the melosys-mock service to simulate
 * incoming SED documents from EU/EØS partner countries.
 *
 * SED documents are published to Kafka (teammelosys.eessi.v1-local) and
 * consumed by melosys-api, triggering process types like:
 * - MOTTAK_SED
 * - ARBEID_FLERE_LAND_NY_SAK
 * - MOTTAK_SED_JOURNALFØRING
 *
 * The mock endpoint automatically creates a journalpost in SAF mock,
 * so melosys-api can fetch it during processing.
 *
 * @example Basic usage (all fields optional - defaults provided)
 * ```typescript
 * const sedHelper = new SedHelper(request);
 * const result = await sedHelper.sendSed({
 *   sedType: 'A003',
 *   bucType: 'LA_BUC_02',
 *   landkode: 'SE',
 * });
 * expect(result.success).toBe(true);
 * await sedHelper.waitForSedProcessed();
 * ```
 *
 * @example With specific person and period
 * ```typescript
 * const sedHelper = new SedHelper(request);
 * await sedHelper.sendSed({
 *   sedType: 'A003',
 *   bucType: 'LA_BUC_02',
 *   fnr: '30056928150',
 *   lovvalgsland: 'DK',
 *   periodeFom: '2025-01-01',
 *   periodeTom: '2025-12-31',
 * });
 * ```
 *
 * @example Using predefined scenarios
 * ```typescript
 * const sedHelper = new SedHelper(request);
 * await sedHelper.sendSed(SED_SCENARIOS.A003_FRA_SVERIGE);
 * await sedHelper.waitForSedProcessed();
 * ```
 *
 * @see melosys-docker-compose/mock/src/main/kotlin/.../testdata/LagMelosysEessiMeldingController.kt
 */
export class SedHelper {
  private readonly mockBaseUrl = 'http://localhost:8083';
  private readonly apiBaseUrl = 'http://localhost:8080';

  constructor(private readonly request: APIRequestContext) {}

  /**
   * Send a SED event via the mock service
   *
   * This publishes a MelosysEessiMelding to Kafka (teammelosys.eessi.v1-local)
   * which melosys-api consumes to trigger MOTTAK_SED and related processes.
   *
   * The mock endpoint automatically:
   * - Generates IDs for sedId, rinaSaksnummer, journalpostId if not provided
   * - Creates a mock journalpost in SAF
   * - Uses sensible defaults for all fields
   *
   * @param config - Configuration for the SED. All fields optional.
   */
  async sendSed(config: SedConfig = {}): Promise<SedResponse> {
    try {
      const response = await this.request.post(
        `${this.mockBaseUrl}/testdata/lag-melosys-eessi-melding`,
        {
          data: config,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok()) {
        const data = await response.json();
        return {
          success: true,
          sedId: data.sedId,
          rinaSaksnummer: data.rinaSaksnummer,
          journalpostId: data.journalpostId,
          message: data.message,
        };
      } else {
        const text = await response.text();
        return {
          success: false,
          message: `Failed to send SED: ${response.status()} - ${text}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error sending SED: ${error}`,
      };
    }
  }

  /**
   * Wait for SED to be processed by melosys-api
   * Polls the API to check if the SED has been processed
   *
   * @param timeoutMs Maximum time to wait (default: 30000ms)
   * @param pollIntervalMs Interval between polls (default: 2000ms)
   */
  async waitForSedProcessed(timeoutMs: number = 30000, pollIntervalMs: number = 2000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      // Check if there are any pending process instances
      const pending = await this.getPendingProcessInstances();

      if (pending === 0) {
        // All processes completed
        return true;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    console.warn(`SED processing did not complete within ${timeoutMs}ms`);
    return false;
  }

  /**
   * Send SedHendelse via mock service to trigger melosys-eessi flow (RECOMMENDED)
   *
   * This publishes a SedHendelse to Kafka (eessibasis-sedmottatt-v1-local)
   * which melosys-eessi consumes. melosys-eessi then:
   * 1. Fetches the SED content from EUX mock API
   * 2. Identifies the person via PDL
   * 3. Creates a journalpost
   * 4. Publishes MelosysEessiMelding to melosys-api
   *
   * This is the recommended method for real E2E testing as it exercises
   * the full melosys-eessi integration.
   *
   * NOTE: Requires melosys-eessi to be running (docker-compose --profile eessi)
   *
   * @param config - SedHendelse configuration
   * @returns Result with generated IDs
   *
   * @example
   * ```typescript
   * const result = await sedHelper.sendSedViaEessi({
   *   bucType: 'LA_BUC_02',
   *   sedType: 'A003',
   *   avsenderId: 'DK:1000',
   * });
   * expect(result.success).toBe(true);
   * await sedHelper.waitForSedProcessed(60000); // Longer timeout for eessi flow
   * ```
   */
  async sendSedViaEessi(config: SedHendelseConfig): Promise<SedResponse> {
    const rinaSakId = config.rinaSakId || this.generateId();
    const rinaDokumentId = config.rinaDokumentId || this.generateId();

    try {
      const response = await this.request.post(
        `${this.mockBaseUrl}/testdata/lagsak`,
        {
          data: {
            sedHendelseDto: {
              bucType: config.bucType,
              sedType: config.sedType,
              avsenderId: config.avsenderId || 'DK:1000',
              avsenderNavn: config.avsenderNavn || this.getInstitutionName(config.avsenderId || 'DK:1000'),
              mottakerId: config.mottakerId || 'NO:NAV',
              mottakerNavn: config.mottakerNavn || 'NAV',
              rinaDokumentId: rinaDokumentId,
              rinaDokumentVersjon: config.rinaDokumentVersjon || '1',
              sektorKode: config.sektorKode || 'LA',
              rinaSakId: rinaSakId,
            }
          },
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok()) {
        return {
          success: true,
          sedId: rinaDokumentId,
          rinaSaksnummer: rinaSakId,
          message: 'SedHendelse published to eessibasis-sedmottatt-v1-local (melosys-eessi flow)',
        };
      } else {
        const text = await response.text();
        return {
          success: false,
          message: `Failed to send SedHendelse: ${response.status()} - ${text}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error sending SedHendelse: ${error}`,
      };
    }
  }

  /**
   * Generate a unique ID for RINA documents/cases
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get institution name based on ID
   */
  private getInstitutionName(institutionId: string): string {
    const names: Record<string, string> = {
      'DK:1000': 'Udbetaling Danmark',
      'DK:UD': 'Udbetaling Danmark',
      'SE:FK': 'Försäkringskassan',
      'DE:DRV': 'Deutsche Rentenversicherung',
      'NO:NAV': 'NAV',
      'FI:KELA': 'Kela',
      'NL:SVB': 'Sociale Verzekeringsbank',
    };
    return names[institutionId] || institutionId;
  }

  /**
   * Get count of pending process instances
   */
  async getPendingProcessInstances(): Promise<number> {
    try {
      // Check for process instances that are still running
      const response = await this.request.get(`${this.apiBaseUrl}/admin/prosessinstanser/pending`, {
        failOnStatusCode: false,
      });

      if (response.ok()) {
        const data = await response.json();
        return Array.isArray(data) ? data.length : 0;
      }

      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Check if a specific SED has been journaled
   */
  async isSedJournaled(rinaDokumentId: string): Promise<boolean> {
    try {
      // Query the admin endpoint to check journaling status
      const response = await this.request.get(
        `${this.apiBaseUrl}/admin/sed/${rinaDokumentId}/status`,
        { failOnStatusCode: false }
      );

      if (response.ok()) {
        const data = await response.json();
        return data.journalført === true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get list of common SED types for testing
   */
  static getSedTypes() {
    return {
      /** Application for determination of applicable legislation */
      A001: 'A001',
      /** Reply to application for determination */
      A003: 'A003',
      /** Certification of applicable legislation (A1 certificate) */
      A008: 'A008',
      /** Request for information */
      A009: 'A009',
      /** Provisional determination notification */
      A010: 'A010',
      /** Notification of end of applicable legislation */
      A011: 'A011',
    } as const;
  }

  /**
   * Get list of common BUC types for testing
   */
  static getBucTypes() {
    return {
      /** Applicable Legislation - Determination */
      LA_BUC_01: 'LA_BUC_01',
      /** Applicable Legislation - Request for Information */
      LA_BUC_02: 'LA_BUC_02',
      /** Applicable Legislation - Request for Exception */
      LA_BUC_04: 'LA_BUC_04',
      /** Applicable Legislation - Notification */
      LA_BUC_05: 'LA_BUC_05',
    } as const;
  }

}

/**
 * Predefined SED configurations for common test scenarios
 *
 * These match the MelosysEessiMeldingRequestDto format.
 * All fields are optional - the mock provides sensible defaults.
 *
 * Common patterns:
 * - landkode: Country code (DK, SE, DE, etc.) - used to derive avsenderId if not specified
 * - avsenderId: Full sender ID like 'SE:FK' or 'DK:1000'
 * - lovvalgsland: Which country has applicable legislation
 * - arbeidsland: Countries where person works (for multi-country scenarios)
 */
export const SED_SCENARIOS = {
  /**
   * A003 reply from Sweden about work in multiple countries
   * Triggers: MOTTAK_SED → ARBEID_FLERE_LAND_NY_SAK (if new case)
   */
  A003_FRA_SVERIGE: {
    bucType: 'LA_BUC_02',
    sedType: 'A003',
    landkode: 'SE',
    avsenderId: 'SE:FK',
    lovvalgsland: 'SE',
  } as SedConfig,

  /**
   * A009 information request from Germany
   * Triggers: MOTTAK_SED → information request handling
   */
  A009_FRA_TYSKLAND: {
    bucType: 'LA_BUC_02',
    sedType: 'A009',
    landkode: 'DE',
    avsenderId: 'DE:DRV',
    lovvalgsland: 'DE',
  } as SedConfig,

  /**
   * A001 application from Denmark
   * Triggers: MOTTAK_SED → new application handling
   */
  A001_FRA_DANMARK: {
    bucType: 'LA_BUC_01',
    sedType: 'A001',
    landkode: 'DK',
    avsenderId: 'DK:UD',
    lovvalgsland: 'DK',
  } as SedConfig,

  /**
   * A003 for exception request (Artikkel 16)
   * BUC type LA_BUC_04 is for exception agreements
   */
  A003_UNNTAK_FRA_SVERIGE: {
    bucType: 'LA_BUC_04',
    sedType: 'A003',
    landkode: 'SE',
    avsenderId: 'SE:FK',
    lovvalgsland: 'SE',
  } as SedConfig,

  /**
   * Minimal A003 - uses all defaults
   * Good for quick smoke tests
   */
  A003_MINIMAL: {
    sedType: 'A003',
    bucType: 'LA_BUC_02',
  } as SedConfig,

  /**
   * A003 with specific person (fnr)
   * Use when you need to verify case is created for specific person
   */
  A003_MED_PERSON: {
    sedType: 'A003',
    bucType: 'LA_BUC_02',
    fnr: '30056928150', // Default test person
    landkode: 'DK',
    lovvalgsland: 'DK',
    arbeidsland: ['NO'],
  } as SedConfig,
} as const;

/**
 * Predefined SedHendelse configurations for melosys-eessi flow
 *
 * These are used with sendSedViaEessi() method which triggers
 * the full melosys-eessi processing pipeline.
 *
 * Use these when you need real E2E testing through melosys-eessi.
 * The melosys-eessi service must be running (docker-compose --profile eessi).
 */
export const EESSI_SED_SCENARIOS = {
  /**
   * A003 reply from Denmark
   * Flow: SedHendelse → melosys-eessi → EUX mock → PDL mock → MelosysEessiMelding → melosys-api
   */
  A003_EESSI_FRA_DANMARK: {
    bucType: 'LA_BUC_02',
    sedType: 'A003',
    avsenderId: 'DK:1000',
    avsenderNavn: 'Udbetaling Danmark',
  } as SedHendelseConfig,

  /**
   * A003 reply from Sweden
   */
  A003_EESSI_FRA_SVERIGE: {
    bucType: 'LA_BUC_02',
    sedType: 'A003',
    avsenderId: 'SE:FK',
    avsenderNavn: 'Försäkringskassan',
  } as SedHendelseConfig,

  /**
   * A009 information request from Germany
   */
  A009_EESSI_FRA_TYSKLAND: {
    bucType: 'LA_BUC_02',
    sedType: 'A009',
    avsenderId: 'DE:DRV',
    avsenderNavn: 'Deutsche Rentenversicherung',
  } as SedHendelseConfig,

  /**
   * A001 application from Denmark
   */
  A001_EESSI_FRA_DANMARK: {
    bucType: 'LA_BUC_01',
    sedType: 'A001',
    avsenderId: 'DK:1000',
    avsenderNavn: 'Udbetaling Danmark',
  } as SedHendelseConfig,

  /**
   * A003 exception request (LA_BUC_04)
   */
  A003_EESSI_UNNTAK_FRA_SVERIGE: {
    bucType: 'LA_BUC_04',
    sedType: 'A003',
    avsenderId: 'SE:FK',
    avsenderNavn: 'Försäkringskassan',
  } as SedHendelseConfig,

  /**
   * Minimal A003 for quick tests
   */
  A003_EESSI_MINIMAL: {
    bucType: 'LA_BUC_02',
    sedType: 'A003',
  } as SedHendelseConfig,
} as const;
