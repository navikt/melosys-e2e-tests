# Test Summary Reporter - Format Documentation

This document explains the current test summary format and how to modify it.

## Current Format Overview

The test summary generates an HTML table with the following features:

### Table Structure

**Columns (6):**
1. **Test** - Test name
2. **Status** - ✅/❌ emoji only
3. **Attempts** - Number of attempts (e.g., "3 (3 failed)")
4. **Playwright** - ✅ if test framework worked, ❌ if playwright error
5. **Docker Logs** - ✅ if no errors, ❌ with service names if errors
6. **Duration** - Time in seconds (e.g., "24s")

**Row Types:**
1. **Header row** - Column names
2. **Folder/File row** - Merged cell spanning all 6 columns with `colspan="6"`
   - Format: `📁 folder / filename (x/y failed)` if failures exist
   - Format: `📁 folder / filename` if no failures
3. **Test rows** - Individual test results with 6 cells

### Key Features

#### 1. Global File Sorting (Priority-Based)
Files are sorted globally, not by folder:
- **Files with failures appear FIRST** (regardless of folder)
- Then files without failures (alphabetically)

Example order:
```
utenfor-avtaleland/komplett-sak-2-8a.spec.ts (2/2 failed)    ← Has failures
utenfor-avtaleland/nyvurdering-endring-skattestatus.spec.ts (1/2 failed)  ← Has failures
eu-eos/eu-eos-fullfort-vedtak.spec.ts              ← No failures
tests/tools/rengjoer-database.spec.ts                     ← No failures
```

#### 2. Test Sorting Within Files
Within each file, tests are sorted:
- **Failed tests appear FIRST**
- Then passed tests

#### 3. Failure Counts
File headers show failure counts when applicable:
- `(2/2 failed)` - All tests failed
- `(1/2 failed)` - Some tests failed
- No count shown if all tests passed

#### 4. Emoji-Only Format
- Status column: Just ✅ or ❌ (no "passed"/"failed" text)
- Playwright column: ✅ or ❌
- Docker Logs column: ✅ or ❌ service-name (count)

#### 5. Smart Error Detection

**Playwright Column:**
- ✅ = Test framework executed successfully (even if test failed on assertions)
- ❌ = Test framework itself failed (syntax errors, timeouts, etc.)
- Logic: Check if error message contains "Docker error" or "process instance"
  - If yes → Playwright worked (✅), business logic failed
  - If no → Playwright failed (❌)

**Docker Logs Column:**
- ✅ = No Docker service errors detected
- ❌ service-name (count) = Errors found in Docker logs
- Example: `❌ melosys-api (1)` means 1 error in melosys-api service
- Multiple services: `❌ melosys-api (2), faktureringskomponenten (1)`

## File Structure

```
reporters/
├── test-summary.ts          # Playwright reporter (runs during tests)
└── README.md                # This file

scripts/
└── generate-summary-from-json.js  # Standalone script (generates from JSON)
```

## How It Works

### During Test Execution (test-summary.ts)

1. **onTestEnd()** - Collects results for each test attempt
2. **onEnd()** - Generates summary after all tests complete

**Data Flow:**
```
Test Results → Group by file → Sort globally → Sort tests → Generate HTML
```

### Key Code Sections (test-summary.ts)

**Grouping by folder/file:**
```typescript
// Lines 160-176
const byFolder = new Map<string, FolderInfo>();
for (const test of tests) {
  const filePath = test.test.location.file;
  const parts = filePath.split('/');
  const fileName = parts[parts.length - 1];
  const folderName = parts[parts.length - 2] || 'root';
  // ... group tests by folder/file
}
```

**Global sorting (files with failures first):**
```typescript
// Lines 192-213
const allFiles: FileWithFolder[] = [];
byFolder.forEach((files, folderName) => {
  files.forEach((tests, fileName) => {
    allFiles.push({ folderName, fileName, tests });
  });
});

const sortedAllFiles = allFiles.sort((a, b) => {
  const aHasFailures = a.tests.some(test => test.finalStatus === 'failed');
  const bHasFailures = b.tests.some(test => test.finalStatus === 'failed');

  if (aHasFailures && !bHasFailures) return -1;  // Failed files first
  if (!aHasFailures && bHasFailures) return 1;
  return `${a.folderName}/${a.fileName}`.localeCompare(`${b.folderName}/${b.fileName}`);
});
```

**Test sorting within files:**
```typescript
// Lines 216-221
const sortedTests = fileTests.sort((a, b) => {
  if (a.finalStatus === 'failed' && b.finalStatus !== 'failed') return -1;
  if (a.finalStatus !== 'failed' && b.finalStatus === 'failed') return 1;
  return 0;
});
```

**Playwright status detection:**
```typescript
// Lines 245-252
let playwrightStatus = '✅';
if (testInfo.finalStatus === 'failed') {
  const hasPlaywrightError = testInfo.results.some(r =>
    r.status === 'failed' && r.error &&
    !r.error.message.includes('Docker error') &&
    !r.error.message.includes('process instance')
  );
  playwrightStatus = hasPlaywrightError ? '❌' : '✅';
}
```

**Docker Logs status:**
```typescript
// Lines 254-261
let dockerStatus = '✅';
if (testInfo.finalStatus === 'failed') {
  if (testInfo.dockerErrors && Array.isArray(testInfo.dockerErrors) && testInfo.dockerErrors.length > 0) {
    const services = testInfo.dockerErrors.map((de: any) =>
      `${de.service} (${de.errors.length})`
    ).join(', ');
    dockerStatus = `❌ ${services}`;
  }
}
```

## How to Modify

### Change Column Order
Edit the table header and row generation (lines 182-187, 263-270):
```typescript
// Header
md += '<th>Test</th>\n';
md += '<th>Status</th>\n';
md += '<th>Attempts</th>\n';
md += '<th>Playwright</th>\n';
md += '<th>Docker Logs</th>\n';
md += '<th>Duration</th>\n';

// Row
md += `<td>${testInfo.test.title}</td>\n`;
md += `<td>${statusEmoji}</td>\n`;
md += `<td>${attempts}</td>\n`;
md += `<td>${playwrightStatus}</td>\n`;
md += `<td>${dockerStatus}</td>\n`;
md += `<td>${duration}</td>\n`;
```

### Add/Remove Columns
1. Update colspan in folder/file header row (line 230):
   ```typescript
   md += `<td colspan="6">...` // Change "6" to new column count
   ```
2. Add column header (lines 182-187)
3. Add cell to each test row (lines 263-270)

### Change Sorting Logic

**File sorting:**
```typescript
// Lines 206-212
const sortedAllFiles = allFiles.sort((a, b) => {
  // Your custom sorting logic here
  // Current: failures first, then alphabetically
});
```

**Test sorting:**
```typescript
// Lines 216-221
const sortedTests = fileTests.sort((a, b) => {
  // Your custom sorting logic here
  // Current: failed tests first
});
```

### Change Emoji Format
Update status emojis (lines 235-237, 265):
```typescript
const statusEmoji = testInfo.finalStatus === 'passed' ? '✅' :
                   testInfo.finalStatus === 'failed' ? '❌' :
                   testInfo.finalStatus === 'flaky' ? '🔄' : '⏭️';
```

### Modify Failure Count Display
Edit failure info generation (lines 223-226):
```typescript
const failedCount = fileTests.filter(t => t.finalStatus === 'failed').length;
const totalCount = fileTests.length;
const failureInfo = failedCount > 0 ? ` (${failedCount}/${totalCount} failed)` : '';
```

## Testing Changes

### Using the Standalone Script (Quick Iteration)

1. Make changes to `scripts/generate-summary-from-json.js`
2. Run: `node scripts/generate-summary-from-json.js`
3. Check `test-summary.md` for results
4. Iterate until format is correct
5. Copy changes to `reporters/test-summary.ts`

### Using the Reporter (Final Testing)

1. Make changes to `reporters/test-summary.ts`
2. Run tests: `npm test`
3. Check `playwright-report/test-summary.md`
4. Verify format in GitHub Actions

## Report Layout (current: "domain groups")

> **Source of truth:** all summary markdown is produced by `lib/summary-generator.ts`
> (shared by this reporter and `scripts/generate-summary-from-json.ts`). The
> line numbers in older sections of this README are historical — edit the named
> functions in that module instead.
>
> Prototype alternative layouts in `docs/report-ideas/index.html` (renders a real
> run in several candidate layouts using only the HTML GitHub job summaries allow).

The `## 📊 Test Results` section renders **one collapsible `<details>` per
top-level domain folder** (e.g. `eu-eos`, `aarsavregning`), not one flat table:

- **Failures on top, twice over** — a compact `## ❗ Needs Attention` panel lists
  every failed/flaky test above the table; failing domains then sort first and
  render **expanded** (`<details open>`), while all-green domains stay collapsed.
- **Duration rollup** — each domain (and each file sub-header) shows its summed
  duration in its summary line.
- **No folder/file duplication** — file labels strip the redundant `<domain>-`
  prefix and `.spec.ts` (so `eu-eos/eu-eos-art13-….spec.ts` → `📄 art13-…`).

### Example Output

```html
## ❗ Needs Attention (1)
<table>
<thead><tr><th>Test</th><th>Where</th><th>Why</th><th>Duration</th></tr></thead>
<tbody>
<tr><td>❌ skal fullføre "Arbeid i flere land"…</td><td><code>eu-eos/art13-arbeid-flere-land-fullfort-vedtak</code></td><td><code>expect(received).toBe(expected)</code></td><td>26s</td></tr>
</tbody>
</table>

## 📊 Test Results

<details open>
<summary>❌ <strong>eu-eos</strong> — 28 ✅ · 1 ❌ · ⏱️ 11m 02s</summary>
<table>
<thead><tr><th>Test</th><th>Status</th><th>Attempts</th><th>Duration</th></tr></thead>
<tbody>
<tr><td colspan="4"><sub>📄 art13-arbeid-flere-land-fullfort-vedtak · 26s</sub></td></tr>
<tr><td>skal fullføre "Arbeid i flere land"…</td><td>❌</td><td>3 (3 failed)</td><td>26s</td></tr>
</tbody>
</table>
</details>

<details>
<summary>✅ <strong>ftrl</strong> — 8 ✅ · ⏱️ 5m 40s</summary>
…collapsed…
</details>
```

### Key functions in `lib/summary-generator.ts`

| Function | Responsibility |
|----------|----------------|
| `generateNeedsAttentionPanel` | The top failures/flaky panel |
| `generateTestResultsTable` / `generateDomainGroup` | Collapsible per-domain sections |
| `groupTestsByDomain` / `groupTestsByFile` | Grouping + failing-first sort |
| `parseTestPath` | Domain extraction + file-label de-duplication |
| `formatDuration` | `8s` / `4m 12s` formatting (used by all rollups) |

Docker errors are shown as an inline `🐳 service (n)` badge under the test
title, plus the full `## 🐳 Docker Log Errors by Service` section lower down.

## Testing Changes

Iterate against the unit suite (millisecond feedback, no E2E run):

```bash
npm run test:unit   # lib/summary-generator.test.ts — 55+ scenarios
```

## Related Files

- `fixtures/docker-logs.ts` - Captures the Docker errors shown as badges/section
- `playwright.config.ts` - Configures this reporter
- `.github/workflows/e2e-tests.yml` - Uses the generated summary in PR comments
- `docs/report-ideas/index.html` - Layout prototyping sandbox
