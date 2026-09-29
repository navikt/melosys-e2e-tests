import { APIRequestContext } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'node:path';

// Load .env (required, checked in with dev config)
dotenv.config({ path: path.resolve(__dirname, '../.env') });
// Load .env.local (optional, for local overrides - not on CI/CD)
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });

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

// Toggles som enableFeature/disableFeature har endret siden forrige reset. Ligger på modulnivå
// fordi hver test lager sin egen UnleashHelper; mengden gjelder én worker-prosess.
const endredeToggles = new Set<string>();
// Første reset i en worker-prosess setter alle standardtoggles: vi vet ikke hva en tidligere
// kjøring, en krasjet worker eller Unleash-UI-et har etterlatt.
let fullResetGjort = false;
let advartOmApiSjekk = false;

/** Bare for enhetstester: nullstill sporingen som om worker-prosessen var ny. */
export function _nullstillSporingForTest(): void {
  endredeToggles.clear();
  fullResetGjort = false;
}

export class UnleashHelper {
  private baseUrl: string;
  private apiToken: string;
  private project: string;
  private environment: string;
  private melosysApiBaseUrl: string;
  private authToken: string;

  constructor(
    private request: APIRequestContext,
    config?: {
      baseUrl?: string;
      apiToken?: string;
      project?: string;
      environment?: string;
      melosysApiBaseUrl?: string;
    }
  ) {
    this.baseUrl = config?.baseUrl || 'http://localhost:4242';
    this.apiToken = config?.apiToken || '*:*.unleash-insecure-api-token';
    this.project = config?.project || 'default';
    this.environment = config?.environment || 'development';

    // Direct API access to melosys-api (without /melosys web app prefix)
    // Set MELOSYS_API_BASE_URL in .env to override
    this.melosysApiBaseUrl = config?.melosysApiBaseUrl ||
                             process.env.MELOSYS_API_BASE_URL ||
                             'http://localhost:8080/api';

    // Get auth token from environment (required for authenticated endpoints)
    this.authToken = process.env.LOCAL_AUTH_TOKEN || '';
  }

  /**
   * Enable a feature toggle for all services
   * @param featureName - The name of the feature toggle
   * @param silent - If true, suppresses logging (default: false)
   * @param skipFrontendCheck - If true, only waits for Admin API (faster, for cleanup)
   */
  async enableFeature(featureName: string, silent: boolean = false, skipFrontendCheck: boolean = false): Promise<void> {
    endredeToggles.add(featureName);
    await this.setEnabled(featureName, silent, skipFrontendCheck);
  }

  /**
   * Disable a feature toggle for all services
   * @param featureName - The name of the feature toggle
   * @param silent - If true, suppresses logging (default: false)
   * @param skipFrontendCheck - If true, only waits for Admin API (faster, for cleanup)
   */
  async disableFeature(featureName: string, silent: boolean = false, skipFrontendCheck: boolean = false): Promise<void> {
    endredeToggles.add(featureName);
    await this.setDisabled(featureName, silent, skipFrontendCheck);
  }

  private async setEnabled(featureName: string, silent: boolean = false, skipFrontendCheck: boolean = false): Promise<void> {
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

    if (!silent) {
      console.log(`✅ Unleash: Enabled feature '${featureName}'`);
    }

    // Wait for Unleash cache to propagate the change
    await this.waitForToggleState(featureName, true, silent, skipFrontendCheck);
  }

  private async setDisabled(featureName: string, silent: boolean = false, skipFrontendCheck: boolean = false): Promise<void> {
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
      if (!silent) {
        console.log(`✅ Unleash: Created and disabled feature '${featureName}'`);
      }
      await this.waitForToggleState(featureName, false, silent, skipFrontendCheck);
      return;
    }

    if (!silent) {
      console.log(`✅ Unleash: Disabled feature '${featureName}'`);
    }

    // Wait for Unleash cache to propagate the change
    await this.waitForToggleState(featureName, false, silent, skipFrontendCheck);
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
      await this.setEnabled(featureName);
    }
  }

  /**
   * Get the current state of a feature toggle
   */
  async isFeatureEnabled(featureName: string): Promise<boolean> {
    try {
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
    } catch (error: any) {
      // If browser/context is closed, return false to stop polling
      if (error.message?.includes('closed') || error.message?.includes('disposed')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Wait for a toggle to reach the expected state
   * Polls the toggle state until it matches expectedState or timeout is reached
   * This is necessary because Unleash has server-side caching and the frontend also caches
   * toggle responses; melosys-api polls Unleash every 15 s (unleash-client-java default).
   *
   * @param silent - If true, suppresses confirmation logging (default: false)
   * @param skipFrontendCheck - If true, only checks Admin API (for cleanup before page exists)
   */
  private async waitForToggleState(
    featureName: string,
    expectedState: boolean,
    silent: boolean = false,
    skipFrontendCheck: boolean = false,
    timeoutMs: number = 30000,
    pollIntervalMs: number = 500
  ): Promise<void> {
    const startTime = Date.now();

    // Give melosys-api cache a moment to start refreshing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Poll Admin API (always required)
    let adminState = await this.isFeatureEnabled(featureName);

    // If skipFrontendCheck is true, only wait for Admin API (for cleanup before test starts)
    if (skipFrontendCheck) {
      while (adminState !== expectedState) {
        if (Date.now() - startTime > timeoutMs) {
          console.log(
            `   ⚠️  Unleash: Timeout waiting for '${featureName}' to be ${expectedState ? 'enabled' : 'disabled'} (Admin API only)`
          );
          console.log(`       Admin API state: ${adminState}`);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        adminState = await this.isFeatureEnabled(featureName);
      }
      return; // Exit early - don't check frontend
    }

    // Poll both Admin API and Frontend API to ensure both caches are updated
    let frontendState = await this.getFrontendToggleState(featureName);

    while (adminState !== expectedState || (frontendState !== null && frontendState !== expectedState)) {
      if (Date.now() - startTime > timeoutMs) {
        // Always log warnings, even in silent mode
        console.log(
          `   ⚠️  Unleash: Timeout waiting for '${featureName}' to be ${expectedState ? 'enabled' : 'disabled'}`
        );
        console.log(`       Admin API state: ${adminState}, Frontend API state: ${frontendState}`);
        return; // Don't throw, just warn - the test might still work
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      adminState = await this.isFeatureEnabled(featureName);
      frontendState = await this.getFrontendToggleState(featureName);

      // If frontend API becomes unavailable (page closed), just check admin API
      if (frontendState === null) {
        if (adminState === expectedState) {
          break;
        }
      }
    }

    if (!silent) {
      console.log(
        `   ✅ Unleash: Confirmed '${featureName}' is ${expectedState ? 'enabled' : 'disabled'} (took ${Date.now() - startTime}ms)`
      );
    }
  }

  /**
   * Get toggle state from the frontend API endpoint (melosys-api/featuretoggle)
   * This is what the frontend actually sees
   *
   * @param featureName - The name of the feature toggle to check
   * @returns The toggle state (true/false) or null if unavailable
   */
  async getFrontendToggleState(featureName: string): Promise<boolean | null> {
    try {
      // Build URL with feature name and cache-busting parameter
      const cacheBust = Date.now();
      const url = `${this.melosysApiBaseUrl}/featuretoggle?features=${encodeURIComponent(featureName)}&_=${cacheBust}`;

      const options: any = {};
      if (this.authToken) {
        options.headers = {
          'Authorization': `Bearer ${this.authToken}`,
        };
      }

      const response = await this.request.get(url, options);

      if (!response.ok()) {
        // Uten dette svaret venter resetten bare på Unleash, ikke på at melosys-api ser endringen.
        if (!advartOmApiSjekk) {
          advartOmApiSjekk = true;
          console.log(`   ⚠️  Unleash: melosys-api /featuretoggle svarte ${response.status()} — venter bare på Unleash`);
        }
        return null; // Return null to indicate we couldn't fetch (different from false)
      }

      const data = await response.json();
      return data[featureName] === true;
    } catch (error: any) {
      // If browser/context is closed, skip frontend check
      if (error.message?.includes('closed') || error.message?.includes('disposed')) {
        return null;
      }
      return null;
    }
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
   * Standardtilstanden fixturen setter toggles tilbake til, med overstyringene fra
   * UNLEASH_FORCE_ENABLE / UNLEASH_FORCE_DISABLE (kommaseparert) lagt oppå. Overstyringene
   * gjelder også toggles som ikke står i standardlista.
   * Eksempel: UNLEASH_FORCE_DISABLE=melosys.trygdeavgift.25-prosentregel
   */
  private effectiveDefaults(): Map<string, boolean> {
    const defaultToggles = [
      { name: 'melosys.behandlingstype.klage', enabled: true },
      { name: 'melosys.send_melding_om_vedtak', enabled: true },
      { name: 'melosys.11_3_a_Norge_er_utpekt', enabled: true },
      { name: 'melosys.skattehendelse.consumer', enabled: true },
      { name: 'melosys.arsavregning', enabled: true },
      { name: 'melosys.arsavregning.uten.flyt', enabled: false },
      { name: 'melosys.arsavregning.eos_pensjonist', enabled: true },
      // Denne oppføringen er den eneste grunnen til at togglen finnes i Unleash. Den står ikke i
      // melosys-api sin ToggleName.kt, så api oppretter den aldri — og lokalt regner api en
      // toggle den ikke finner i Unleash som på (DefaultEnabledUnleash, bare koblet inn under
      // profilen «!nais & !test»; i prod er ukjent toggle av). Uten linja under ser altså
      // art11-3b-testen en påslått flyt i stedet for den blokkerende meldingen. Verdien er av
      // fordi flyten ikke er rullet ut. Det samme gjelder melosys.11_3_a_Norge_er_utpekt og
      // melosys.trygdeavgift.25-prosentregel: heller ikke de finnes i ToggleName.kt, så ingen
      // av de tre kan fjernes herfra i den tro at api synkroniserer dem.
      { name: 'melosys.arsavregning.eos_tjenesteperson', enabled: false },
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
      { name: 'melosys.oppgave_nokkelord', enabled: true },
      // 25 %-regelen er på i produksjon. Tester som trenger ordinær sats må slå den av selv;
      // uten standardverdi arvet testene tilstanden fra forrige test som rørte den.
      { name: 'melosys.trygdeavgift.25-prosentregel', enabled: true },
      // Testene slår disse på selv. Uten standardverdi ble de stående på etter første test som
      // rørte dem. På er også det api svarer før de finnes i Unleash (ukjent toggle = på lokalt).
      { name: 'melosys.cdm-4-4', enabled: true },
      { name: 'melosys.trygdeavgift.vis_beregningsforklaring', enabled: true },
      { name: 'melosys.vis_pensjonsopptjening_popp', enabled: true },
      { name: 'melosys.vis-pensjonsopptjening-popp', enabled: true },
    ];

    const parseList = (value?: string): string[] =>
      (value || '').split(',').map(s => s.trim()).filter(Boolean);
    const forceEnable = parseList(process.env.UNLEASH_FORCE_ENABLE);
    const forceDisable = parseList(process.env.UNLEASH_FORCE_DISABLE);

    const effective = new Map<string, boolean>();
    for (const toggle of defaultToggles) effective.set(toggle.name, toggle.enabled);
    for (const name of forceEnable) effective.set(name, true);
    for (const name of forceDisable) effective.set(name, false);

    // Always log overrides (even in silent cleanup mode) so it is visible in the
    // run output - both locally and on CI - that toggles were pinned for this run.
    if (forceEnable.length || forceDisable.length) {
      console.log(
        `   ⚙️  Unleash override: force-enable=[${forceEnable.join(', ')}] force-disable=[${forceDisable.join(', ')}]`
      );
    }
    return effective;
  }

  /**
   * Setter ALLE standardtoggles (se effectiveDefaults) samtidig, pluss toggles endret siden
   * forrige reset.
   *
   * @param silent - If true, suppresses individual toggle logging (default: false)
   * @param skipFrontendCheck - If true, only waits for Admin API, not for melosys-api
   * @returns antall toggles som ble satt
   */
  async resetToDefaults(silent: boolean = false, skipFrontendCheck: boolean = false): Promise<number> {
    const effective = this.effectiveDefaults();
    const antall = await this.resetToggles([...effective.keys()], effective, silent, skipFrontendCheck);
    fullResetGjort = true;
    return antall;
  }

  /**
   * Setter tilbake toggles som enableFeature/disableFeature har endret siden forrige reset,
   * og standardtoggles som står feil i Unleash. Første kall i en worker-prosess gjør full
   * reset (resetToDefaults).
   *
   * @returns antall toggles som ble satt (0 når ingen var endret)
   */
  async resetChangedToggles(silent: boolean = false, skipFrontendCheck: boolean = false): Promise<number> {
    if (!fullResetGjort) {
      return this.resetToDefaults(silent, skipFrontendCheck);
    }
    const effective = this.effectiveDefaults();
    const avvik = await this.togglesSomAvvikerFraStandard(effective);
    return this.resetToggles(avvik, effective, silent, skipFrontendCheck);
  }

  /**
   * Standardtoggles som står feil i Unleash, også når de er endret utenom UnleashHelper
   * (Unleash-UI, curl, en annen kjøring). Ett kall; feiler det, nøyer vi oss med sporingen.
   */
  private async togglesSomAvvikerFraStandard(effective: Map<string, boolean>): Promise<string[]> {
    try {
      const response = await this.request.get(
        `${this.baseUrl}/api/admin/projects/${this.project}/features`,
        { headers: { Authorization: this.apiToken } }
      );
      if (!response.ok()) throw new Error(`${response.status()}`);
      const faktisk = new Map<string, boolean>();
      for (const feature of (await response.json()).features ?? []) {
        const env = feature.environments?.find((e: any) => e.name === this.environment);
        faktisk.set(feature.name, env?.enabled === true);
      }
      return [...effective].filter(([name, enabled]) => faktisk.get(name) !== enabled).map(([name]) => name);
    } catch (error: any) {
      console.log(`   ⚠️  Unleash: kunne ikke lese toggle-lista, setter bare sporede toggles: ${error.message || error}`);
      return [];
    }
  }

  /**
   * Setter `names` pluss alle sporede endringer til standardverdien, parallelt. En toggle
   * fjernes fra sporingen først når den er satt, så en feilet reset prøves igjen neste gang.
   */
  private async resetToggles(
    names: string[],
    effective: Map<string, boolean>,
    silent: boolean,
    skipFrontendCheck: boolean
  ): Promise<number> {
    const alle = [...new Set([...names, ...endredeToggles])];
    const utenStandard = alle.filter(name => !effective.has(name));
    for (const name of utenStandard) {
      console.log(
        `   ⚠️  Unleash: '${name}' ble endret av testen, men har ingen standardverdi i ` +
        `unleash-helper.ts — tilstanden lekker til neste test. Legg den inn i standardlista.`
      );
      endredeToggles.delete(name);
    }

    const medStandard = alle.filter(name => effective.has(name));
    const resultater = await Promise.allSettled(medStandard.map(async name => {
      if (effective.get(name)) {
        await this.setEnabled(name, silent, skipFrontendCheck);
      } else {
        await this.setDisabled(name, silent, skipFrontendCheck);
      }
      endredeToggles.delete(name);
    }));

    const feil = resultater.flatMap(r => (r.status === 'rejected' ? [r.reason] : []));
    if (feil.length > 0) {
      throw new Error(
        `Unleash-reset feilet for ${feil.length} av ${medStandard.length} toggles: ` +
        feil.map(e => e?.message || String(e)).join('; ')
      );
    }
    return medStandard.length;
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

  /**
   * Log all feature toggles from the frontend API (what the web app sees)
   * This is useful for debugging when the web app shows unexpected toggle states
   *
   * @param featureNames - Optional list of feature names to request. If not provided, uses default list.
   * @returns The toggle states as returned by the API
   */
  async logFrontendToggleStates(featureNames?: string[]): Promise<Record<string, boolean>> {
    try {
      // Default feature names that melosys-web typically requests
      const defaultFeatures = [
        'melosys.faktureringskomponent.vis_referanse',
        'melosys.ftrl.begrense_periode_vedtak',
        'melosys.11_3_a_Norge_er_utpekt',
        'melosys.pensjonist',
        'melosys.pensjonist_eos',
        'standardvedlegg_eget_vedlegg_avtaleland',
        'melosys.arsavregning',
        'melosys.arsavregning.uten.flyt',
        'melosys.faktureringskomponenten.ikke-tidligere-perioder',
      ];

      const features = featureNames || defaultFeatures;

      // Build query string: ?features=toggle1&features=toggle2&...
      const queryParams = features.map(f => `features=${encodeURIComponent(f)}`).join('&');
      const cacheBust = Date.now();
      const url = `${this.melosysApiBaseUrl}/featuretoggle?${queryParams}&_=${cacheBust}`;

      console.log(`🔍 Unleash: Fetching frontend toggle states for ${features.length} toggles...`);
      console.log(`   URL: ${url}`);

      const options: any = {};
      if (this.authToken) {
        options.headers = {
          'Authorization': `Bearer ${this.authToken}`,
        };
        console.log(`   Using authentication: Bearer ${this.authToken.substring(0, 20)}...`);
      } else {
        console.log(`   ⚠️  No auth token found - request may fail if endpoint requires authentication`);
      }

      const response = await this.request.get(url, options);

      if (!response.ok()) {
        console.error(`❌ Unleash: Frontend API returned ${response.status()}`);
        console.error(`   Response: ${await response.text()}`);
        return {};
      }

      const data = await response.json();

      console.log('🔧 Unleash: Frontend API response (what web app sees):');
      for (const [key, value] of Object.entries(data)) {
        const emoji = value ? '✅' : '❌';
        console.log(`   ${emoji} ${key}: ${value}`);
      }

      return data;
    } catch (error: any) {
      console.error(`❌ Unleash: Error fetching frontend toggles: ${error.message}`);
      return {};
    }
  }
}
