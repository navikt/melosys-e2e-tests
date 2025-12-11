import { APIRequestContext } from '@playwright/test';

/**
 * Configuration for creating a SED event
 *
 * This matches the SedHendelseDto expected by melosys-mock's /testdata/lagsak endpoint.
 * See: melosys-docker-compose/mock/src/main/kotlin/.../testdata/LagSedController.kt
 */
export interface SedConfig {
  /** Sector code, e.g., 'LA' for Applicable Legislation (default: 'LA') */
  sektorKode?: string;
  /** BUC type, e.g., 'LA_BUC_04' */
  bucType: string;
  /** SED type, e.g., 'A003', 'A009' */
  sedType: string;
  /** Sender institution ID, e.g., 'SE:123', 'DK' */
  avsenderId: string;
  /** Sender institution name, e.g., 'Försäkringskassan', 'DK trygd' */
  avsenderNavn?: string;
  /** Receiver institution ID, e.g., 'NO:NAV', '444' (default: 'NO:NAV') */
  mottakerId?: string;
  /** Receiver institution name (default: 'NAV') */
  mottakerNavn?: string;
  /** Optional RINA document ID (generated if not provided) */
  rinaDokumentId?: string;
  /** RINA document version (default: '1') */
  rinaDokumentVersjon?: string;
}

/**
 * Response from mock service after creating SED
 */
export interface SedResponse {
  success: boolean;
  rinaDokumentId?: string;
  message?: string;
}

/**
 * Helper class for working with SED (Structured Electronic Document) events
 *
 * This helper interacts with the melosys-mock service to simulate
 * incoming SED documents from EU/EØS partner countries.
 *
 * SED documents are published to Kafka and consumed by melosys-api,
 * triggering process types like MOTTAK_SED and ARBEID_FLERE_LAND_NY_SAK.
 *
 * @example Basic usage
 * ```typescript
 * const sedHelper = new SedHelper(request);
 * const result = await sedHelper.sendSed({
 *   bucType: 'LA_BUC_02',
 *   sedType: 'A003',
 *   avsenderId: 'SE:FK',
 *   avsenderNavn: 'Försäkringskassan',
 * });
 * expect(result.success).toBe(true);
 * await sedHelper.waitForSedProcessed();
 * ```
 *
 * @example Using predefined scenarios
 * ```typescript
 * const sedHelper = new SedHelper(request);
 * await sedHelper.sendSed(SED_SCENARIOS.A003_FRA_SVERIGE);
 * await sedHelper.waitForSedProcessed();
 * ```
 *
 * @see melosys-docker-compose/mock/src/main/kotlin/.../testdata/LagSedController.kt
 */
export class SedHelper {
  private readonly mockBaseUrl = 'http://localhost:8083';
  private readonly apiBaseUrl = 'http://localhost:8080';

  constructor(private readonly request: APIRequestContext) {}

  /**
   * Send a SED event via the mock service
   * This publishes a message to Kafka which melosys-api will consume
   *
   * The mock endpoint expects a RequestDto with sedHendelseDto wrapper:
   * { sedHendelseDto: { bucType, sedType, avsenderId, ... } }
   */
  async sendSed(config: SedConfig): Promise<SedResponse> {
    const rinaDokumentId = config.rinaDokumentId || this.generateRinaId();

    // Build the sedHendelseDto payload matching the mock API schema
    const sedHendelseDto = {
      sektorKode: config.sektorKode || 'LA',
      bucType: config.bucType,
      sedType: config.sedType,
      avsenderId: config.avsenderId,
      avsenderNavn: config.avsenderNavn || this.getDefaultSenderName(config.avsenderId),
      mottakerId: config.mottakerId || 'NO:NAV',
      mottakerNavn: config.mottakerNavn || 'NAV',
      rinaDokumentId: rinaDokumentId,
      rinaDokumentVersjon: config.rinaDokumentVersjon || '1',
    };

    try {
      const response = await this.request.post(`${this.mockBaseUrl}/testdata/lagsak`, {
        data: {
          sedHendelseDto: sedHendelseDto,
        },
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok()) {
        return {
          success: true,
          rinaDokumentId: rinaDokumentId,
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
   * Get a default sender name based on sender ID (country code)
   */
  private getDefaultSenderName(avsenderId: string): string {
    const countryCode = avsenderId.split(':')[0].toUpperCase();
    const countryNames: Record<string, string> = {
      SE: 'Försäkringskassan',
      DK: 'Udbetaling Danmark',
      DE: 'Deutsche Rentenversicherung',
      FI: 'Kela',
      NL: 'SVB',
      PL: 'ZUS',
      UK: 'HMRC',
      FR: 'CLEISS',
      NO: 'NAV',
    };
    return countryNames[countryCode] || `${countryCode} Social Security`;
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

  /**
   * Generate a unique RINA document ID
   */
  private generateRinaId(): string {
    return `RINA-DOC-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

/**
 * Predefined SED configurations for common test scenarios
 *
 * These match the SedHendelseDto format expected by melosys-mock.
 * avsenderId format: 'COUNTRY_CODE' or 'COUNTRY_CODE:INSTITUTION_ID'
 */
export const SED_SCENARIOS = {
  /**
   * A003 reply from Sweden about work in multiple countries
   * Triggers: MOTTAK_SED → ARBEID_FLERE_LAND_NY_SAK (if new case)
   */
  A003_FRA_SVERIGE: {
    bucType: 'LA_BUC_02',
    sedType: 'A003',
    avsenderId: 'SE:FK',
    avsenderNavn: 'Försäkringskassan',
    sektorKode: 'LA',
  } as SedConfig,

  /**
   * A009 information request from Germany
   * Triggers: MOTTAK_SED → information request handling
   */
  A009_FRA_TYSKLAND: {
    bucType: 'LA_BUC_02',
    sedType: 'A009',
    avsenderId: 'DE:DRV',
    avsenderNavn: 'Deutsche Rentenversicherung',
    sektorKode: 'LA',
  } as SedConfig,

  /**
   * A001 application from Denmark
   * Triggers: MOTTAK_SED → new application handling
   */
  A001_FRA_DANMARK: {
    bucType: 'LA_BUC_01',
    sedType: 'A001',
    avsenderId: 'DK:UD',
    avsenderNavn: 'Udbetaling Danmark',
    sektorKode: 'LA',
  } as SedConfig,

  /**
   * A003 for exception request (Artikkel 16)
   * BUC type LA_BUC_04 is for exception agreements
   */
  A003_UNNTAK_FRA_SVERIGE: {
    bucType: 'LA_BUC_04',
    sedType: 'A003',
    avsenderId: 'SE:FK',
    avsenderNavn: 'Försäkringskassan',
    sektorKode: 'LA',
  } as SedConfig,
} as const;
