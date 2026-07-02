/**
 * Global setup - runs once before all tests
 *
 * Captures initial metrics snapshot for coverage tracking
 */
import * as fs from 'fs';
import * as path from 'path';
import { MetricsHelper } from './helpers/metrics-helper';

const EESSI_BASE_URL = process.env.EESSI_BASE_URL || 'http://localhost:8081';

/**
 * Precondition-gate: melosys-eessi er en PÅKREVD tjeneste for suiten (SED-mottak m.m.).
 * Vi sjekker den ÉN gang her og aborter hele kjøringen umiddelbart om den er nede — i stedet
 * for at en enkelt @eessi-test timer ut 90 s uti løpet med en kryptisk feil. Korte forsøk
 * tåler en liten oppstarts-forsinkelse uten å maskere en faktisk nede tjeneste.
 *
 * Lokal rømningsluke: sett SKIP_EESSI_GATE=true for fokuserte ikke-eessi-kjøringer uten full
 * stack (jf. IntelliJ/delvis-stack-mønsteret i CLAUDE.md). CI setter den aldri → fortsatt fail-hard.
 */
async function assertEessiAvailable(): Promise<void> {
  if (process.env.SKIP_EESSI_GATE === 'true') {
    console.log('⏭️  SKIP_EESSI_GATE=true → hopper over eessi precondition-gate (kun lokalt tiltenkt)');
    return;
  }
  const url = `${EESSI_BASE_URL}/internal/health`;
  const attempts = 3;
  let lastError = 'ukjent feil';
  for (let i = 1; i <= attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) {
        console.log(`✅ melosys-eessi er tilgjengelig (${url})`);
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      lastError = (e as Error).message;
    } finally {
      clearTimeout(timer); // unngå at en pending timer holder event-loopen i live på feilstien
    }
    if (i < attempts) await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `❌ melosys-eessi svarer ikke på ${url} (${lastError}). ` +
      'Det er en PÅKREVD tjeneste — hele E2E-kjøringen avbrytes. ' +
      'Start stacken (lokalt: cd ../melosys-docker-compose && make dev-eessi) og prøv igjen.'
  );
}

export default async function globalSetup() {
  console.log('🚀 Global setup: Docker log monitoring enabled for each test');
  console.log(
    '   Import test from fixtures/docker-log-fixture.ts to enable per-test log checking'
  );

  // PÅKREVD tjeneste-gate — kaster (aborter hele kjøringen) om eessi er nede.
  await assertEessiAvailable();

  // Capture metrics snapshot before tests
  const metrics = new MetricsHelper();
  const resultsDir = path.join(process.cwd(), 'test-results');

  // Ensure test-results directory exists
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  try {
    const snapshot = await metrics.fetchMetrics();
    const snapshotPath = path.join(resultsDir, '.metrics-before.json');
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    console.log('📊 Captured initial metrics snapshot');
  } catch (error) {
    console.warn('⚠️  Could not capture metrics (API not running?):', (error as Error).message);
  }
}
