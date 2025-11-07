import { APIRequestContext } from '@playwright/test';

/**
 * UnleashHelper - Control feature toggles in Unleash server during E2E tests
 *
 * This helper provides methods to enable/disable feature toggles for all services
 * (melosys-api, faktureringskomponenten, melosys-trygdeavgift-beregning) at once.
 *
 * @example
 * ```typescript
 * const unleash = new UnleashHelper(request);
 *
 * // Enable a specific feature
 * await unleash.enableFeature('melosys.new-feature');
 *
 * // Disable a specific feature
 * await unleash.disableFeature('melosys.old-feature');
 *
 * // Reset all toggles to default state
 * await unleash.resetToDefaults();
 * ```
 */
export class UnleashHelper {
  private baseUrl: string;
  private apiToken: string;
  private project: string;
  private environment: string;

  constructor(
    private request: APIRequestContext,
    config?: {
      baseUrl?: string;
      apiToken?: string;
      project?: string;
      environment?: string;
    }
  ) {
    this.baseUrl = config?.baseUrl || 'http://localhost:4242';
    this.apiToken = config?.apiToken || '*:*.unleash-insecure-api-token';
    this.project = config?.project || 'default';
    this.environment = config?.environment || 'development';
  }

  /**
   * Enable a feature toggle for all services
   */
  async enableFeature(featureName: string): Promise<void> {
    const url = `${this.baseUrl}/api/admin/projects/${this.project}/features/${featureName}/environments/${this.environment}/on`;

    const response = await this.request.post(url, {
      headers: {
        Authorization: this.apiToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok()) {
      // Feature might not exist, try to create it first
      await this.createFeatureIfNotExists(featureName);
      // Try enabling again
      const retryResponse = await this.request.post(url, {
        headers: {
          Authorization: this.apiToken,
          'Content-Type': 'application/json',
        },
      });

      if (!retryResponse.ok()) {
        throw new Error(
          `Failed to enable feature '${featureName}': ${retryResponse.status()} ${await retryResponse.text()}`
        );
      }
    }

    console.log(`✅ Unleash: Enabled feature '${featureName}'`);
  }

  /**
   * Disable a feature toggle for all services
   */
  async disableFeature(featureName: string): Promise<void> {
    const url = `${this.baseUrl}/api/admin/projects/${this.project}/features/${featureName}/environments/${this.environment}/off`;

    const response = await this.request.post(url, {
      headers: {
        Authorization: this.apiToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok()) {
      // Feature might not exist, try to create it first (disabled)
      await this.createFeatureIfNotExists(featureName, false);
      console.log(`✅ Unleash: Created and disabled feature '${featureName}'`);
      return;
    }

    console.log(`✅ Unleash: Disabled feature '${featureName}'`);
  }

  /**
   * Create a feature toggle if it doesn't exist
   */
  private async createFeatureIfNotExists(
    featureName: string,
    enabled: boolean = true
  ): Promise<void> {
    // Create the feature
    const createUrl = `${this.baseUrl}/api/admin/projects/${this.project}/features`;
    const createResponse = await this.request.post(createUrl, {
      headers: {
        Authorization: this.apiToken,
        'Content-Type': 'application/json',
      },
      data: {
        name: featureName,
        description: `Test feature toggle: ${featureName}`,
        type: 'release',
        impressionData: false,
      },
    });

    if (!createResponse.ok() && createResponse.status() !== 409) {
      // 409 = already exists
      throw new Error(
        `Failed to create feature '${featureName}': ${createResponse.status()} ${await createResponse.text()}`
      );
    }

    console.log(`📝 Unleash: Created feature '${featureName}'`);

    // Enable/disable in the environment
    if (enabled) {
      await this.enableFeature(featureName);
    }
  }

  /**
   * Get the current state of a feature toggle
   */
  async isFeatureEnabled(featureName: string): Promise<boolean> {
    const url = `${this.baseUrl}/api/admin/projects/${this.project}/features/${featureName}`;

    const response = await this.request.get(url, {
      headers: {
        Authorization: this.apiToken,
      },
    });

    if (!response.ok()) {
      return false;
    }

    const data = await response.json();
    const envConfig = data.environments?.find(
      (env: any) => env.name === this.environment
    );
    return envConfig?.enabled || false;
  }

  /**
   * Enable multiple features at once
   */
  async enableFeatures(featureNames: string[]): Promise<void> {
    for (const featureName of featureNames) {
      await this.enableFeature(featureName);
    }
  }

  /**
   * Disable multiple features at once
   */
  async disableFeatures(featureNames: string[]): Promise<void> {
    for (const featureName of featureNames) {
      await this.disableFeature(featureName);
    }
  }

  /**
   * Reset all toggles to their default state (from seed script)
   * Default state: all toggles enabled except 'melosys.arsavregning.uten.flyt'
   */
  async resetToDefaults(): Promise<void> {
    const defaultToggles = [
      { name: 'melosys.behandlingstype.klage', enabled: true },
      { name: 'melosys.send_melding_om_vedtak', enabled: true },
      { name: 'melosys.11_3_a_Norge_er_utpekt', enabled: true },
      { name: 'melosys.skattehendelse.consumer', enabled: true },
      { name: 'melosys.arsavregning', enabled: true },
      { name: 'melosys.arsavregning.uten.flyt', enabled: false },
      { name: 'melosys.arsavregning.eos_pensjonist', enabled: true },
      { name: 'melosys.pensjonist', enabled: true },
      { name: 'melosys.pensjonist_eos', enabled: true },
      {
        name: 'standardvedlegg_eget_vedlegg_avtaleland',
        enabled: true,
      },
      {
        name: 'melosys.faktureringskomponenten.ikke-tidligere-perioder',
        enabled: true,
      },
      { name: 'melosys.send_popp_hendelse', enabled: true },
    ];

    console.log('🔄 Unleash: Resetting all toggles to default state...');

    for (const toggle of defaultToggles) {
      if (toggle.enabled) {
        await this.enableFeature(toggle.name);
      } else {
        await this.disableFeature(toggle.name);
      }
    }

    console.log('✅ Unleash: All toggles reset to defaults');
  }

  /**
   * List all feature toggles
   */
  async listFeatures(): Promise<string[]> {
    const url = `${this.baseUrl}/api/admin/projects/${this.project}/features`;

    const response = await this.request.get(url, {
      headers: {
        Authorization: this.apiToken,
      },
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to list features: ${response.status()} ${await response.text()}`
      );
    }

    const data = await response.json();
    return data.features?.map((f: any) => f.name) || [];
  }
}
