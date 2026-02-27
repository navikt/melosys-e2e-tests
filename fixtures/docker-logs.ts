import { test as base } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Docker log checking fixture - checks for errors in docker logs after each test
 * Captures errors that occurred during test execution and attaches them to the test report
 *
 * Configuration (via .env or .env.local):
 * - SKIP_DOCKER_LOG_SERVICES: Comma-separated list of services to skip, or 'all' to skip all
 *   Example: SKIP_DOCKER_LOG_SERVICES=melosys-api,melosys-web,melosys-eessi,melosys-mock
 *   Example: SKIP_DOCKER_LOG_SERVICES=all
 *
 * - LOG_FILES_DIR: Directory containing log files as alternative to Docker logs
 *   When set, will read from {service}.log files instead of docker logs
 *   Example: LOG_FILES_DIR=/tmp/melosys-logs
 *   Files expected: melosys-api.log, melosys-web.log, etc.
 */

interface DockerLogError {
  timestamp: string;
  level: 'ERROR' | 'WARN';
  message: string;
  source: 'docker' | 'file';
}

/**
 * Clean ANSI escape codes and other terminal formatting from a string.
 */
function cleanAnsiCodes(text: string): string {
  return text
    // Standard ANSI escape sequences (hex and unicode escape)
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    // Broken encoding showing as replacement character (�)
    .replace(/�\[[0-9;]*m/g, '')
    // Literal bracket color codes (e.g., [1;31mERROR[0;39m)
    .replace(/\[([0-9;]+)m/g, '')
    // Clean up any leftover escape sequences
    .replace(/\x1b\[[\d;]*[A-Za-z]/g, '')
    .replace(/\u001b\[[\d;]*[A-Za-z]/g, '');
}

interface ErrorCategories {
  sqlErrors: DockerLogError[];
  connectionErrors: DockerLogError[];
  otherErrors: DockerLogError[];
}

// Get services to skip from environment
function getSkippedServices(): Set<string> {
  const skipEnv = process.env.SKIP_DOCKER_LOG_SERVICES;
  if (!skipEnv) return new Set();
  if (skipEnv.toLowerCase() === 'all') return new Set(['all']);
  return new Set(skipEnv.split(',').map(s => s.trim()));
}

// Check if a Docker container exists and is running
function isContainerRunning(containerName: string): boolean {
  try {
    const result = execSync(`docker ps --filter "name=^${containerName}$" --format "{{.Names}}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim() === containerName;
  } catch {
    return false;
  }
}

// Parse log lines for errors (shared between docker and file sources)
function parseLogLinesForErrors(lines: string[], source: 'docker' | 'file'): DockerLogError[] {
  const errors: DockerLogError[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Look for ERROR level logs
    if (line.includes('ERROR') || line.includes('[1;31mERROR[0;39m')) {
      const timestampMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})/);
      const timestamp = timestampMatch ? timestampMatch[1] : 'unknown';

      errors.push({
        timestamp,
        level: 'ERROR',
        message: line.trim(),
        source
      });
    }
    // Also capture critical WARN messages
    else if (
      line.includes('SQL Error') ||
      line.includes('SQLSyntaxErrorException') ||
      line.includes('tabellen eller utsnittet finnes ikke') ||
      (line.includes('HikariPool') && line.includes('Exception'))
    ) {
      const timestampMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})/);
      const timestamp = timestampMatch ? timestampMatch[1] : 'unknown';

      errors.push({
        timestamp,
        level: 'WARN',
        message: line.trim(),
        source
      });
    }
  }

  return errors;
}

// Read logs from a file (alternative to Docker logs for IntelliJ/jar runs)
function getLogsFromFile(serviceName: string, since: Date, logDir: string): DockerLogError[] {
  const logFile = path.join(logDir, `${serviceName}.log`);

  if (!fs.existsSync(logFile)) {
    // File doesn't exist - not an error, service might not be running or logging elsewhere
    return [];
  }

  try {
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n');

    // Filter lines by timestamp (basic filtering - assumes ISO format or HH:MM:SS at start)
    const sinceTime = since.getTime();
    const filteredLines = lines.filter(line => {
      // Try to extract timestamp from line
      const isoMatch = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
      if (isoMatch) {
        const lineTime = new Date(isoMatch[1]).getTime();
        return lineTime >= sinceTime;
      }
      // If no timestamp found, include the line (better safe than sorry)
      return true;
    });

    return parseLogLinesForErrors(filteredLines, 'file');
  } catch (error) {
    console.warn(`Could not read log file ${logFile}:`, error);
    return [];
  }
}

function getDockerLogsSince(containerName: string, since: Date): DockerLogError[] {
  // Check for alternative log file directory
  const logFilesDir = process.env.LOG_FILES_DIR;
  if (logFilesDir) {
    return getLogsFromFile(containerName, since, logFilesDir);
  }

  // Check if container is running before trying to get logs
  if (!isContainerRunning(containerName)) {
    // Container not running - silently skip (likely running in IntelliJ)
    return [];
  }

  try {
    // Use full RFC3339 format with timezone (Docker requires this for accurate time filtering)
    const sinceStr = since.toISOString();
    const command = `docker logs ${containerName} --since ${sinceStr} 2>&1`;

    const logs = execSync(command, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    return parseLogLinesForErrors(logs.split('\n'), 'docker');
  } catch (error) {
    // Only log if this is an unexpected error (container exists but logs failed)
    if (isContainerRunning(containerName)) {
      console.error(`Failed to check docker logs for ${containerName}:`, error);
    }
    return [];
  }
}

function categorizeErrors(errors: DockerLogError[]): ErrorCategories {
  const categories: ErrorCategories = {
    sqlErrors: [],
    connectionErrors: [],
    otherErrors: []
  };

  for (const error of errors) {
    if (
      error.message.includes('SQL') ||
      error.message.includes('ORA-') ||
      error.message.includes('tabellen eller utsnittet finnes ikke')
    ) {
      categories.sqlErrors.push(error);
    } else if (
      error.message.includes('HikariPool') ||
      error.message.includes('connection') ||
      error.message.includes('Listener refused')
    ) {
      categories.connectionErrors.push(error);
    } else {
      categories.otherErrors.push(error);
    }
  }

  return categories;
}

// Services to monitor
const MONITORED_SERVICES = [
  'melosys-api',
  'melosys-web',
  'melosys-mock',
  'melosys-eessi',
  'faktureringskomponenten',
  'melosys-dokgen',
  'melosys-trygdeavgift-beregning',
  'melosys-trygdeavtale',
  'melosys-inngangsvilkar'
];

export const dockerLogsFixture = base.extend<{ dockerLogChecker: void }>({
  dockerLogChecker: [async ({}, use, testInfo) => {
    // Record the start time of this test
    const testStartTime = new Date();

    console.log(`\n🏁 Starting test: ${testInfo.title}`);
    console.log(`⏰ Test start time: ${testStartTime.toISOString()}`);

    // Run the actual test
    await use();

    // Check which services to skip
    const skippedServices = getSkippedServices();
    const skipAll = skippedServices.has('all');

    if (skipAll) {
      console.log(`\n⏭️  Skipping docker log check (SKIP_DOCKER_LOG_SERVICES=all)`);
      return;
    }

    // Tests tagged with @expect-docker-errors intentionally trigger backend errors
    // (e.g., navigating to non-existent resources to test error handling)
    if (testInfo.title.includes('@expect-docker-errors')) {
      console.log(`\n⏭️  Skipping docker log check (@expect-docker-errors tag)`);
      return;
    }

    // After test completes, check logs from all services
    console.log(`\n🔍 Checking docker logs for: ${testInfo.title}`);

    try {
      const allErrors: { service: string; errors: DockerLogError[] }[] = [];
      let totalErrors = 0;
      const checkedServices: string[] = [];
      const skippedList: string[] = [];

      // Check each service
      for (const service of MONITORED_SERVICES) {
        if (skippedServices.has(service)) {
          skippedList.push(service);
          continue;
        }
        checkedServices.push(service);
        const errors = getDockerLogsSince(service, testStartTime);
        if (errors.length > 0) {
          allErrors.push({ service, errors });
          totalErrors += errors.length;
        }
      }

      if (skippedList.length > 0) {
        console.log(`⏭️  Skipped services: ${skippedList.join(', ')}`);
      }

      if (totalErrors === 0) {
        console.log(`✅ No errors found in any service logs during this test`);
      } else {
        console.log(`\n⚠️  Found ${totalErrors} error(s) across ${allErrors.length} service(s) during test:\n`);

        // Build error summary
        let errorSummary = `Docker Log Errors for test: ${testInfo.title}\n\n`;

        // Report errors by service
        for (const { service, errors } of allErrors) {
          console.log(`\n🐳 ${service} (${errors.length} error(s)):`);
          errorSummary += `🐳 ${service} (${errors.length} error(s)):\n`;

          const categories = categorizeErrors(errors);

          if (categories.sqlErrors.length > 0) {
            console.log(`  📊 SQL Errors (${categories.sqlErrors.length}):`);
            errorSummary += `  📊 SQL Errors (${categories.sqlErrors.length}):\n`;
            categories.sqlErrors.forEach(err => {
              const cleanMsg = cleanAnsiCodes(err.message).substring(0, 120);
              const msg = `    [${err.timestamp}] ${cleanMsg}`;
              console.log(msg);
              errorSummary += msg + '\n';
            });
          }

          if (categories.connectionErrors.length > 0) {
            console.log(`  🔌 Connection Errors (${categories.connectionErrors.length}):`);
            errorSummary += `  🔌 Connection Errors (${categories.connectionErrors.length}):\n`;
            categories.connectionErrors.forEach(err => {
              const cleanMsg = cleanAnsiCodes(err.message).substring(0, 120);
              const msg = `    [${err.timestamp}] ${cleanMsg}`;
              console.log(msg);
              errorSummary += msg + '\n';
            });
          }

          if (categories.otherErrors.length > 0) {
            console.log(`  ❌ Other Errors (${categories.otherErrors.length}):`);
            errorSummary += `  ❌ Other Errors (${categories.otherErrors.length}):\n`;
            categories.otherErrors.forEach(err => {
              const cleanMsg = cleanAnsiCodes(err.message).substring(0, 120);
              const msg = `    [${err.timestamp}] ${cleanMsg}`;
              console.log(msg);
              errorSummary += msg + '\n';
            });
          }
          errorSummary += '\n';
        }
        console.log('');

        // Attach detailed errors to the test report (JSON)
        await testInfo.attach('docker-logs-errors', {
          body: JSON.stringify(allErrors, null, 2),
          contentType: 'application/json'
        });

        // Attach human-readable summary (Text)
        await testInfo.attach('docker-logs-summary', {
          body: errorSummary,
          contentType: 'text/plain'
        });

        // FAIL THE TEST - Docker errors should not be ignored
        throw new Error(
          `Test failed due to ${totalErrors} Docker error(s) across ${allErrors.length} service(s). ` +
          `See attached 'docker-logs-errors' for details.`
        );
      }
    } catch (error) {
      console.error('Failed to check docker logs:', error);
    }
  }, { auto: true }]
});
