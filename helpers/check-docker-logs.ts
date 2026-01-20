import { execSync } from 'child_process';

export interface DockerLogError {
  timestamp: string;
  level: 'ERROR' | 'WARN';
  message: string;
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

/**
 * Checks docker logs for a container and extracts errors
 * @param containerName Name of the docker container
 * @param sinceMinutes How many minutes back to check logs (default: 5)
 * @returns Array of errors found
 */
export function checkDockerLogs(
  containerName: string,
  sinceMinutes: number = 5
): DockerLogError[] {
  try {
    // Get logs from the last N minutes
    const since = `${sinceMinutes}m`;
    const command = `docker logs ${containerName} --since ${since} 2>&1`;

    const logs = execSync(command, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    const errors: DockerLogError[] = [];
    const lines = logs.split('\n');

    for (const line of lines) {
      // Look for ERROR level logs
      if (line.includes('ERROR') || line.includes('[1;31mERROR[0;39m')) {
        // Extract timestamp if present (format: HH:MM:SS.mmm)
        const timestampMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})/);
        const timestamp = timestampMatch ? timestampMatch[1] : 'unknown';

        errors.push({
          timestamp,
          level: 'ERROR',
          message: line.trim()
        });
      }
      // Also capture critical WARN messages (SQL errors, connection issues)
      else if (
        line.includes('SQL Error') ||
        line.includes('SQLSyntaxErrorException') ||
        line.includes('tabellen eller utsnittet finnes ikke') ||
        line.includes('HikariPool') && line.includes('Exception')
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
 * Categorizes errors by type for better reporting
 */
export function categorizeErrors(errors: DockerLogError[]) {
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

/**
 * Formats errors for console output
 */
export function formatErrorReport(
  containerName: string,
  errors: DockerLogError[]
): string {
  if (errors.length === 0) {
    return `✅ No errors found in ${containerName} logs`;
  }

  const categories = categorizeErrors(errors);
  const lines: string[] = [];

  lines.push(`\n⚠️  Found ${errors.length} error(s) in ${containerName} logs:\n`);

  if (categories.sqlErrors.length > 0) {
    lines.push(`📊 SQL Errors (${categories.sqlErrors.length}):`);
    categories.sqlErrors.slice(0, 3).forEach(err => {
      const cleanMsg = cleanAnsiCodes(err.message).substring(0, 120);
      lines.push(`  [${err.timestamp}] ${cleanMsg}...`);
    });
    if (categories.sqlErrors.length > 3) {
      lines.push(`  ... and ${categories.sqlErrors.length - 3} more SQL errors`);
    }
    lines.push('');
  }

  if (categories.connectionErrors.length > 0) {
    lines.push(`🔌 Connection Errors (${categories.connectionErrors.length}):`);
    categories.connectionErrors.slice(0, 3).forEach(err => {
      const cleanMsg = cleanAnsiCodes(err.message).substring(0, 120);
      lines.push(`  [${err.timestamp}] ${cleanMsg}...`);
    });
    if (categories.connectionErrors.length > 3) {
      lines.push(`  ... and ${categories.connectionErrors.length - 3} more connection errors`);
    }
    lines.push('');
  }

  if (categories.otherErrors.length > 0) {
    lines.push(`❌ Other Errors (${categories.otherErrors.length}):`);
    categories.otherErrors.slice(0, 3).forEach(err => {
      const cleanMsg = cleanAnsiCodes(err.message).substring(0, 120);
      lines.push(`  [${err.timestamp}] ${cleanMsg}...`);
    });
    if (categories.otherErrors.length > 3) {
      lines.push(`  ... and ${categories.otherErrors.length - 3} more errors`);
    }
    lines.push('');
  }

  lines.push(`💡 To see full logs, run: docker logs ${containerName}`);

  return lines.join('\n');
}
