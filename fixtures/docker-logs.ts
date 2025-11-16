import { test as base } from '@playwright/test';
import { execSync } from 'child_process';

/**
 * Docker log checking fixture - checks for errors in docker logs after each test
 * Captures errors that occurred during test execution and attaches them to the test report
 */

interface DockerLogError {
  timestamp: string;
  level: 'ERROR' | 'WARN';
  message: string;
}

interface ErrorCategories {
  sqlErrors: DockerLogError[];
  connectionErrors: DockerLogError[];
  otherErrors: DockerLogError[];
}

function getDockerLogsSince(containerName: string, since: Date): DockerLogError[] {
  try {
    // Use full RFC3339 format with timezone (Docker requires this for accurate time filtering)
    const sinceStr = since.toISOString();
    const command = `docker logs ${containerName} --since ${sinceStr} 2>&1`;

    const logs = execSync(command, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    const errors: DockerLogError[] = [];
    const lines = logs.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      // Look for ERROR level logs
      if (line.includes('ERROR') || line.includes('[1;31mERROR[0;39m')) {
        const timestampMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})/);
        const timestamp = timestampMatch ? timestampMatch[1] : 'unknown';

        errors.push({
          timestamp,
          level: 'ERROR',
          message: line.trim()
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
          message: line.trim()
        });
      }
    }

    return errors;
  } catch (error) {
    console.error(`Failed to check docker logs for ${containerName}:`, error);
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
  'faktureringskomponenten',
  'melosys-dokgen',
  'melosys-trygdeavgift-beregning',
  'melosys-trygdeavtale'
];

export const dockerLogsFixture = base.extend<{ dockerLogChecker: void }>({
  dockerLogChecker: [async ({}, use, testInfo) => {
    // Record the start time of this test
    const testStartTime = new Date();

    console.log(`\n🏁 Starting test: ${testInfo.title}`);
    console.log(`⏰ Test start time: ${testStartTime.toISOString()}`);

    // Run the actual test
    await use();

    // After test completes, check logs from all services
    console.log(`\n🔍 Checking docker logs for: ${testInfo.title}`);

    try {
      const allErrors: { service: string; errors: DockerLogError[] }[] = [];
      let totalErrors = 0;

      // Check each service
      for (const service of MONITORED_SERVICES) {
        const errors = getDockerLogsSince(service, testStartTime);
        if (errors.length > 0) {
          allErrors.push({ service, errors });
          totalErrors += errors.length;
        }
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
              const msg = `    [${err.timestamp}] ${err.message.substring(0, 120)}`;
              console.log(msg);
              errorSummary += msg + '\n';
            });
          }

          if (categories.connectionErrors.length > 0) {
            console.log(`  🔌 Connection Errors (${categories.connectionErrors.length}):`);
            errorSummary += `  🔌 Connection Errors (${categories.connectionErrors.length}):\n`;
            categories.connectionErrors.forEach(err => {
              const msg = `    [${err.timestamp}] ${err.message.substring(0, 120)}`;
              console.log(msg);
              errorSummary += msg + '\n';
            });
          }

          if (categories.otherErrors.length > 0) {
            console.log(`  ❌ Other Errors (${categories.otherErrors.length}):`);
            errorSummary += `  ❌ Other Errors (${categories.otherErrors.length}):\n`;
            categories.otherErrors.forEach(err => {
              const msg = `    [${err.timestamp}] ${err.message.substring(0, 120)}`;
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
