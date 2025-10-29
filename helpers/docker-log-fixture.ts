import { test as base } from '@playwright/test';
import { execSync } from 'child_process';
import { DockerLogError } from './check-docker-logs';

/**
 * Extended test fixture that checks docker logs after each test
 * Only shows errors that occurred during the test execution
 */
export const test = base.extend<{
  dockerLogChecker: void;
}>({
  dockerLogChecker: [async ({}, use, testInfo) => {
    // Record the start time of this test
    const testStartTime = new Date();

    console.log(`\n🏁 Starting test: ${testInfo.title}`);
    console.log(`⏰ Test start time: ${testStartTime.toISOString()}`);

    // Run the actual test
    await use();

    // After test completes, check logs
    console.log(`\n🔍 Checking docker logs for: ${testInfo.title}`);

    try {
      const errors = getDockerLogsSince('melosys-api', testStartTime);

      if (errors.length === 0) {
        console.log(`✅ No errors found in melosys-api logs during this test`);
      } else {
        console.log(`\n⚠️  Found ${errors.length} error(s) in melosys-api during test:\n`);

        const categories = categorizeErrors(errors);

        if (categories.sqlErrors.length > 0) {
          console.log(`📊 SQL Errors (${categories.sqlErrors.length}):`);
          categories.sqlErrors.forEach(err => {
            console.log(`  [${err.timestamp}] ${err.message.substring(0, 120)}`);
          });
          console.log('');
        }

        if (categories.connectionErrors.length > 0) {
          console.log(`🔌 Connection Errors (${categories.connectionErrors.length}):`);
          categories.connectionErrors.forEach(err => {
            console.log(`  [${err.timestamp}] ${err.message.substring(0, 120)}`);
          });
          console.log('');
        }

        if (categories.otherErrors.length > 0) {
          console.log(`❌ Other Errors (${categories.otherErrors.length}):`);
          categories.otherErrors.forEach(err => {
            console.log(`  [${err.timestamp}] ${err.message.substring(0, 120)}`);
          });
          console.log('');
        }

        // Attach errors to the test report
        await testInfo.attach('docker-logs-errors', {
          body: JSON.stringify(errors, null, 2),
          contentType: 'application/json'
        });
      }
    } catch (error) {
      console.error('Failed to check docker logs:', error);
    }
  }, { auto: true }]
});

/**
 * Gets docker logs since a specific timestamp
 */
function getDockerLogsSince(containerName: string, since: Date): DockerLogError[] {
  try {
    // Format: 2025-10-29T18:30:00
    const sinceStr = since.toISOString().split('.')[0];
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

/**
 * Categorizes errors by type
 */
function categorizeErrors(errors: DockerLogError[]) {
  const categories = {
    sqlErrors: [] as DockerLogError[],
    connectionErrors: [] as DockerLogError[],
    otherErrors: [] as DockerLogError[]
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

export { expect } from '@playwright/test';
