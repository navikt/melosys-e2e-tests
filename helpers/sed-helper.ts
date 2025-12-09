import { APIRequestContext } from '@playwright/test';

/**
 * Configuration for creating a SED event
 */
export interface SedConfig {
  /** BUC type, e.g., 'LA_BUC_04' */
  bucType: string;
  /** SED type, e.g., 'A003', 'A009' */
  sedType: string;
  /** Sender country code, e.g., 'SE', 'DE' */
  avsenderLand: string;
  /** Receiver country code, e.g., 'NO' */
  mottakerLand: string;
  /** Optional RINA document ID (generated if not provided) */
  rinaDokumentId?: string;
  /** Optional RINA case ID */
  rinaSakId?: string;
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
 * SED documents are received via Kafka and trigger case creation
 * or treatment updates in melosys-api.
 *
 * @example
 * const sedHelper = new SedHelper(request);
 * await sedHelper.sendSed({
 *   bucType: 'LA_BUC_04',
 *   sedType: 'A003',
 *   avsenderLand: 'SE',
 *   mottakerLand: 'NO',
 * });
 * await sedHelper.waitForSedProcessed();
 */
export class SedHelper {
  private readonly mockBaseUrl = 'http://localhost:8083';
  private readonly apiBaseUrl = 'http://localhost:8080';

  constructor(private readonly request: APIRequestContext) {}

  /**
   * Send a SED event via the mock service
   * This publishes a message to Kafka which melosys-api will consume
   */
  async sendSed(config: SedConfig): Promise<SedResponse> {
    const rinaDokumentId = config.rinaDokumentId || this.generateRinaId();

    try {
      const response = await this.request.post(`${this.mockBaseUrl}/testdata/lagsak`, {
        data: {
          bucType: config.bucType,
          sedType: config.sedType,
          avsenderLand: config.avsenderLand,
          mottakerLand: config.mottakerLand,
          rinaDokumentId: rinaDokumentId,
          rinaSakId: config.rinaSakId || this.generateRinaSakId(),
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

  /**
   * Generate a unique RINA case ID
   */
  private generateRinaSakId(): string {
    return `RINA-SAK-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

/**
 * Predefined SED configurations for common test scenarios
 */
export const SED_SCENARIOS = {
  /**
   * A003 reply from Sweden about work in multiple countries
   */
  A003_FRA_SVERIGE: {
    bucType: 'LA_BUC_04',
    sedType: 'A003',
    avsenderLand: 'SE',
    mottakerLand: 'NO',
  } as SedConfig,

  /**
   * A009 information request from Germany
   */
  A009_FRA_TYSKLAND: {
    bucType: 'LA_BUC_02',
    sedType: 'A009',
    avsenderLand: 'DE',
    mottakerLand: 'NO',
  } as SedConfig,

  /**
   * A001 application from Denmark
   */
  A001_FRA_DANMARK: {
    bucType: 'LA_BUC_01',
    sedType: 'A001',
    avsenderLand: 'DK',
    mottakerLand: 'NO',
  } as SedConfig,
} as const;
