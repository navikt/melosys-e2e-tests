import { test as base } from '@playwright/test';
import { execSync } from 'child_process';
import { DockerLogError } from './check-docker-logs';
import { DatabaseHelper } from './db-helper';
import { clearMockDataSilent } from './mock-helper';

/**
 * Extended test fixture that checks docker logs and cleans up after each test
 * Features:
 * - Automatic database cleanup after each test
 * - Automatic mock service cleanup after each test
 * - Docker log error checking after each test
 */
export const test = base.extend<{
  dockerLogChecker: void;
  autoCleanup: void;
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
  }, { auto: true }],

  // Auto-cleanup - runs before and after each test
  autoCleanup: [async ({ page }, use) => {
    // BEFORE test: clean database and mock data
    console.log('\n🧹 Cleaning test data before test...');

    // Clean database
    let db = new DatabaseHelper();
    try {
      await db.connect();
      const result = await db.cleanDatabase(true); // silent = true

      if (result.cleanedCount > 0 || result.totalRowsDeleted > 0) {
        console.log(`   ✅ Database: ${result.cleanedCount} tables cleaned (${result.totalRowsDeleted} rows)`);
      }
    } catch (error: any) {
      console.log(`   ⚠️  Database cleanup failed: ${error.message || error}`);
    } finally {
      await db.close();
    }

    // Clean mock data
    try {
      const mockResult = await clearMockDataSilent(page.request);
      const totalCleared = (Number(mockResult.journalpostCleared) || 0) + (Number(mockResult.oppgaveCleared) || 0);
      if (totalCleared > 0) {
        console.log(`   ✅ Mock data: ${totalCleared} items cleared`);
      }
    } catch (error: any) {
      console.log(`   ⚠️  Mock cleanup failed: ${error.message || error}`);
    }

    console.log('');

    // Run the test
    await use();

    // AFTER test: clean database and mock data
    console.log('\n🧹 Cleaning up test data after test...');

    // Clean database
    db = new DatabaseHelper();
    try {
      await db.connect();
      const result = await db.cleanDatabase(true); // silent = true

      if (result.cleanedCount > 0 || result.totalRowsDeleted > 0) {
        console.log(`   ✅ Database: ${result.cleanedCount} tables cleaned (${result.totalRowsDeleted} rows)`);
      }
    } catch (error: any) {
      console.log(`   ⚠️  Database cleanup failed: ${error.message || error}`);
    } finally {
      await db.close();
    }

    // Clean mock data
    try {
      const mockResult = await clearMockDataSilent(page.request);
      const totalCleared = (Number(mockResult.journalpostCleared) || 0) + (Number(mockResult.oppgaveCleared) || 0);
      if (totalCleared > 0) {
        console.log(`   ✅ Mock data: ${totalCleared} items cleared`);
      }
    } catch (error: any) {
      console.log(`   ⚠️  Mock cleanup failed: ${error.message || error}`);
    }

    console.log('');
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
