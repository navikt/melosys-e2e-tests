#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read test-summary.json
const summaryPath = path.join(__dirname, '..', 'test-summary.json');
const data = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

// Calculate stats
const passed = data.tests.filter(t => t.status === 'passed').length;
const failed = data.tests.filter(t => t.status === 'failed').length;
const skipped = data.tests.filter(t => t.status === 'skipped').length;
const flaky = data.tests.filter(t => t.status === 'flaky').length;
const totalTests = data.tests.length;
const totalAttempts = data.tests.reduce((sum, t) => sum + t.totalAttempts, 0);
const retries = totalAttempts - totalTests;
const durationSeconds = Math.round(data.duration / 1000);

let md = '# E2E Test Summary\n\n';
md += `**Generated:** ${new Date().toISOString()}\n\n`;

// Overall results
md += '## Overall Results\n\n';
md += `- ✅ Passed: ${passed}\n`;
md += `- ❌ Failed: ${failed}\n`;
md += `- ⏭️ Skipped: ${skipped}\n`;
md += `- 🔄 Flaky: ${flaky}\n`;
md += `- **Total Tests:** ${totalTests}\n`;
md += `- **Total Attempts:** ${totalAttempts}${retries > 0 ? ` (including ${retries} retries)` : ''}\n`;
md += `- **Duration:** ${durationSeconds}s\n`;
md += `- **Status:** ${data.status}\n\n`;

// Group by folder and file
const byFolder = new Map();

data.tests.forEach(test => {
  const parts = test.file.split('/');
  const fileName = parts[parts.length - 1];

  // Find "tests" directory index and extract complete path after it
  const testsIndex = parts.indexOf('tests');
  let folderPath = 'root';

  if (testsIndex !== -1 && testsIndex < parts.length - 1) {
    // Get all folders between 'tests' and the filename
    const foldersAfterTests = parts.slice(testsIndex + 1, parts.length - 1);
    folderPath = foldersAfterTests.length > 0 ? foldersAfterTests.join('/') : 'root';
  }

  if (!byFolder.has(folderPath)) {
    byFolder.set(folderPath, new Map());
  }

  const folder = byFolder.get(folderPath);
  if (!folder.has(fileName)) {
    folder.set(fileName, []);
  }

  folder.get(fileName).push(test);
});

// Test results in ONE big HTML table with real colspan
if (totalTests > 0) {
  md += '## 📊 Test Results\n\n';

  // HTML table with proper colspan
  md += '<table>\n';
  md += '<thead>\n';
  md += '<tr>\n';
  md += '<th>Test</th>\n';
  md += '<th>Status</th>\n';
  md += '<th>Attempts</th>\n';
  md += '<th>Playwright</th>\n';
  md += '<th>Docker Logs</th>\n';
  md += '<th>Duration</th>\n';
  md += '</tr>\n';
  md += '</thead>\n';
  md += '<tbody>\n';

  // Flatten all files with their folder info
  const allFiles = [];
  byFolder.forEach((files, folderName) => {
    files.forEach((tests, fileName) => {
      allFiles.push({ folderName, fileName, tests });
    });
  });

  // Sort ALL files: files with failures first, then alphabetically
  const sortedAllFiles = allFiles.sort((a, b) => {
    const aHasFailures = a.tests.some(test => test.status === 'failed');
    const bHasFailures = b.tests.some(test => test.status === 'failed');

    if (aHasFailures && !bHasFailures) return -1;
    if (!aHasFailures && bHasFailures) return 1;
    return `${a.folderName}/${a.fileName}`.localeCompare(`${b.folderName}/${b.fileName}`);
  });

  sortedAllFiles.forEach(({ folderName, fileName, tests }) => {
      // Sort tests: failed first, then passed
      const sortedTests = tests.sort((a, b) => {
        if (a.status === 'failed' && b.status !== 'failed') return -1;
        if (a.status !== 'failed' && b.status === 'failed') return 1;
        return 0;
      });

      // Count failures
      const failedCount = tests.filter(t => t.status === 'failed').length;
      const totalCount = tests.length;
      const failureInfo = failedCount > 0 ? ` (${failedCount}/${totalCount} failed)` : '';

      // Folder/File header row (TRUE colspan spanning all 6 columns, left-aligned)
      md += '<tr>\n';
      md += `<td colspan="6"><strong>📁 ${folderName} / <code>${fileName}</code>${failureInfo}</strong></td>\n`;
      md += '</tr>\n';

      // Test rows
      sortedTests.forEach((test) => {
        const statusEmoji = test.status === 'passed' ? '✅' :
                           test.status === 'failed' ? '❌' :
                           test.status === 'flaky' ? '🔄' : '⏭️';

        const attempts = test.totalAttempts > 1
          ? `${test.totalAttempts} (${test.failedAttempts} failed)`
          : '1';

        const duration = Math.round(test.duration / 1000) + 's';

        // Playwright status (check if error is playwright-related vs process/docker)
        let playwrightStatus = '✅';
        if (test.status === 'failed') {
          const hasPlaywrightError = test.error &&
            !test.error.includes('Docker error') &&
            !test.error.includes('process instance');
          playwrightStatus = hasPlaywrightError ? '❌' : '✅';
        }

        // Docker logs status
        let dockerStatus = '✅';
        if (test.status === 'failed') {
          if (test.dockerErrors && test.dockerErrors.length > 0) {
            const services = test.dockerErrors.map(de => `${de.service} (${de.errors.length})`).join(', ');
            dockerStatus = `❌ ${services}`;
          }
        }

        md += '<tr>\n';
        md += `<td>${test.title}</td>\n`;
        md += `<td>${statusEmoji}</td>\n`;
        md += `<td>${attempts}</td>\n`;
        md += `<td>${playwrightStatus}</td>\n`;
        md += `<td>${dockerStatus}</td>\n`;
        md += `<td>${duration}</td>\n`;
        md += '</tr>\n';
      });
  });

  md += '</tbody>\n';
  md += '</table>\n\n';
}

// Failed tests section
const failedTests = data.tests.filter(t => t.status === 'failed');
if (failedTests.length > 0) {
  md += `## ❌ Failed Tests (${failedTests.length})\n\n`;

  failedTests.forEach(test => {
    const parts = test.file.split('/');
    const fileName = parts[parts.length - 1];

    // Find "tests" directory index and extract complete path after it
    const testsIndex = parts.indexOf('tests');
    let folderPath = 'root';

    if (testsIndex !== -1 && testsIndex < parts.length - 1) {
      // Get all folders between 'tests' and the filename
      const foldersAfterTests = parts.slice(testsIndex + 1, parts.length - 1);
      folderPath = foldersAfterTests.length > 0 ? foldersAfterTests.join('/') : 'root';
    }

    md += `### ${test.title}\n\n`;
    md += `**Folder:** \`${folderPath}\`  \n`;
    md += `**File:** \`${fileName}\`  \n`;
    md += `**Attempts:** ${test.totalAttempts} (${test.failedAttempts} failed)  \n`;
    md += `**Duration:** ${Math.round(test.duration / 1000)}s\n\n`;

    if (test.error) {
      md += '**Error:**\n```\n';
      // Clean ANSI codes
      const cleanError = test.error.replace(/\u001b\[\d+;\d+m|\u001b\[\d+m/g, '');
      md += cleanError + '\n';
      md += '```\n\n';
    }

    if (test.dockerErrors && test.dockerErrors.length > 0) {
      md += '**Docker Log Errors:**\n\n';
      test.dockerErrors.forEach(dockerError => {
        md += `- 🐳 **${dockerError.service}** (${dockerError.errors.length} error(s))\n`;
        dockerError.errors.slice(0, 3).forEach(err => {
          const cleanMsg = err.message.replace(/\u001b\[\d+;\d+m|\u001b\[\d+m/g, '');
          md += `  - \`[${err.timestamp}]\` ${cleanMsg.substring(0, 100)}\n`;
        });
        if (dockerError.errors.length > 3) {
          md += `  - _(${dockerError.errors.length - 3} more errors...)_\n`;
        }
      });
      md += '\n';
    }

    md += '---\n\n';
  });
}

// Docker errors by service
const dockerErrorServices = new Set();
data.tests.forEach(test => {
  if (test.dockerErrors) {
    test.dockerErrors.forEach(de => dockerErrorServices.add(de.service));
  }
});

if (dockerErrorServices.size > 0) {
  md += '## 🐳 Docker Log Errors by Service\n\n';
  const sortedServices = Array.from(dockerErrorServices).sort();
  sortedServices.forEach(service => {
    const errorCount = data.tests.reduce((count, test) => {
      if (test.dockerErrors) {
        const serviceError = test.dockerErrors.find(de => de.service === service);
        if (serviceError) {
          return count + serviceError.errors.length;
        }
      }
      return count;
    }, 0);
    md += `- **${service}:** ${errorCount} error(s)\n`;
  });
  md += '\n';
}

// Process errors
const processErrorTests = data.tests.filter(t => t.processErrors);
if (processErrorTests.length > 0) {
  md += '## ⚙️ Process Instance Failures\n\n';
  md += `**Tests with process failures:** ${processErrorTests.length}\n\n`;
  processErrorTests.forEach(test => {
    const fileName = test.file.split('/').pop();
    md += `- ${test.title} (\`${fileName}\`)\n`;
  });
  md += '\n';
}

// Artifacts
md += '## 📎 Artifacts\n\n';
md += 'The following artifacts are available for download:\n\n';
md += '- `playwright-report/` - HTML test report\n';
md += '- `test-results/` - Individual test results, traces, videos, screenshots\n';
md += '- `playwright-report/*-complete.log` - Complete Docker logs for each service\n';
md += '- `playwright-report/test-summary.json` - Machine-readable test summary\n';

// Write to file
const outputPath = path.join(__dirname, '..', 'test-summary.md');
fs.writeFileSync(outputPath, md, 'utf8');

console.log(`✅ Generated test-summary.md`);
console.log(`   Tests: ${passed} passed, ${failed} failed, ${skipped} skipped`);
console.log(`   Duration: ${durationSeconds}s`);
