# E2E Failure Analysis Workflows

This document describes the automated E2E test failure analysis workflows that help identify and triage test failures.

## Overview

The system consists of three interconnected workflows:

1. **E2E Tests** (`.github/workflows/e2e-tests.yml`) - Runs tests and reports status
2. **Analyze E2E Failures** (`.github/workflows/analyze-e2e-failures.yml`) - Automatically creates/updates GitHub issues for failures
3. **Copilot Analyze Failure** (`.github/workflows/copilot-analyze-failure.yml`) - Triggers Copilot analysis on labeled issues

## Workflow 1: E2E Tests

### What Changed

The E2E Tests workflow now includes:

**Outputs:**
- `test-status` - Overall test status (passed/failed/unknown)
- `has-failures` - Boolean indicating if there are real test failures
- `has-flaky` - Boolean indicating if there are flaky tests

**New Step:**
- "Set test status outputs" - Analyzes `test-summary.json` and sets outputs for downstream workflows

### How It Works

After tests complete, the workflow:
1. Reads `playwright-report/test-summary.json`
2. Counts failed and flaky tests
3. Sets outputs that can trigger the analysis workflow
4. Uploads `test-summary` artifact for analysis

## Workflow 2: Analyze E2E Failures

### Triggers

**Automatic (workflow_run):**
```yaml
on:
  workflow_run:
    workflows: ["E2E Tests"]
    types:
      - completed
```

Runs automatically when E2E Tests workflow completes (regardless of success/failure).

**Manual (workflow_dispatch):**
```yaml
on:
  workflow_dispatch:
    inputs:
      run_id:
        description: 'Workflow run ID to analyze'
        required: true
        type: string
```

Can be manually triggered to re-analyze a specific workflow run.

### What It Does

1. **Downloads test summary artifact**
   - Gets `test-summary` artifact from the E2E test run
   - Contains `test-summary.json` with all test results

2. **Checks for failures/flaky tests**
   - Exits early if no failures or flaky tests found
   - Only processes tests with `status: "failed"` or `status: "flaky"`

3. **For each failed/flaky test:**
   - Searches for existing open issue with title: `E2E Failure: {test title}`
   - If issue exists: Adds comment with new failure occurrence
   - If no issue exists: Creates new issue with labels:
     - `e2e-failure` - All E2E test failure issues
     - `needs-triage` - New issues needing review

### Issue Format

**Title:**
```
E2E Failure: {test title}
```

**Body includes:**
- Test file path
- Test status (failed/flaky)
- Link to failed workflow run
- Number of attempts (e.g., "3/3" or "2/3" for flaky)
- Error message and stack trace
- Docker log errors by service (if any)
- Docker image tags used in the run
- Instructions to add `copilot-analyze` label

**Example Issue:**
```markdown
## Test Failure Details

**Test File:** `tests/example-workflow.spec.ts`
**Status:** failed
**Workflow Run:** [https://github.com/.../actions/runs/12345](...)
**Attempts:** 3/3

### Error Message

\```
TimeoutError: Timeout 30000ms exceeded.
  at Locator.click
\```

### 🐳 Docker Log Errors

#### melosys-api

- [2025-01-15T10:05:00.000Z] ERROR: Database connection failed

### 🏷️ Docker Image Tags

- melosys-api: abc123
- melosys-web: def456

---

### 🤖 Analysis Needed

This issue has been automatically created from an E2E test failure.

**Next Steps:**
1. Review the error details and workflow run above
2. Add the `copilot-analyze` label to trigger automated analysis
3. Copilot will search relevant repositories and suggest whether this is:
   - A test bug (issue in test code)
   - A production bug (issue in application code)
   - A flaky test (timing/race condition)

---
*This issue was automatically created by the E2E failure analysis workflow.*
```

## Workflow 3: Copilot Analyze Failure

### Trigger

```yaml
on:
  issues:
    types: [labeled]
```

Runs when an issue is labeled with `copilot-analyze`.

### What It Does

Adds a comment to the issue that:
1. Mentions `@copilot` to trigger GitHub Copilot
2. Provides detailed analysis instructions
3. Requests specific tasks:
   - Review error details, Docker logs, workflow run
   - Search `navikt/melosys-api` for relevant backend code
   - Search `navikt/melosys-web` for relevant frontend code
   - Classify issue type (test bug, production bug, flaky test, environment issue)
   - Suggest fixes or workarounds
   - Recommend labels to add

### Analysis Request Format

The comment includes:
- **Review Error Details** - Instructions to examine error messages and logs
- **Search Related Code** - Instructions to search melosys-api and melosys-web repositories
- **Determine Issue Type** - Classification criteria
- **Provide Recommendations** - Expected output format
- **Additional Context** - Information about the Melosys tech stack

## Usage

### For Test Failures

1. **Automatic** - When E2E tests fail:
   - Issue is automatically created with `e2e-failure` and `needs-triage` labels
   - Issue contains full error details and context

2. **Manual Re-analysis** - To re-analyze a specific run:
   ```bash
   # Go to Actions -> Analyze E2E Failures -> Run workflow
   # Enter the workflow run ID from the E2E Tests run
   ```

### For Copilot Analysis

1. Go to the auto-created issue
2. Review the error details
3. Add the `copilot-analyze` label
4. Copilot will automatically add an analysis comment
5. Review Copilot's findings and apply recommendations

### Labels

The workflows use these labels:

- **`e2e-failure`** - All E2E test failure issues (auto-applied)
- **`needs-triage`** - New issues needing review (auto-applied)
- **`copilot-analyze`** - Trigger for Copilot analysis (manual)
- **`test-bug`** - Issue in test code (recommended by Copilot)
- **`production-bug`** - Issue in application code (recommended by Copilot)
- **`flaky-test`** - Timing/race condition issue (recommended by Copilot)

## Permissions

All workflows require these permissions:

```yaml
permissions:
  contents: read    # Read repository content
  actions: read     # Download artifacts from other workflows
  issues: write     # Create and comment on issues
```

The E2E Tests workflow also requires:
```yaml
permissions:
  packages: read    # Pull Docker images from NAIS registry
  id-token: write   # NAIS login
```

## Technical Details

### Test Summary Format

The `test-summary.json` follows the `TestSummaryData` interface from `lib/types.ts`:

```typescript
interface TestSummaryData {
  status: 'passed' | 'failed';
  startTime?: Date;
  duration: number;
  tests: TestData[];
  tags?: Record<string, string>;
}

interface TestData {
  title: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped' | 'flaky' | 'known-error-failed' | 'known-error-passed';
  isKnownError: boolean;
  totalAttempts: number;
  failedAttempts: number;
  duration: number;
  error?: string;
  dockerErrors?: DockerError[];
  processErrors?: string;
}
```

### Docker Errors

Docker errors are captured per-service:
```typescript
interface DockerError {
  service: string;
  errors: Array<{
    timestamp: string;
    message: string;
  }>;
}
```

### Known Errors

Tests tagged with `@known-error` are:
- Excluded from failure counts in CI
- Still tracked in test summary
- NOT processed by the analysis workflow (status is `known-error-failed` or `known-error-passed`, not `failed`)

## Troubleshooting

### Issue Not Created

Check:
1. Did the E2E Tests workflow upload `test-summary` artifact?
2. Does `test-summary.json` contain failed/flaky tests?
3. Check the "Analyze E2E Failures" workflow run logs

### Copilot Not Responding

Check:
1. Is the label exactly `copilot-analyze`?
2. Check the "Copilot Analyze Failure" workflow run logs
3. Verify the comment was added to the issue

### Duplicate Issues

The workflow searches for existing issues by title. If you rename an issue, it might create a duplicate on next failure.

To avoid:
- Don't modify issue titles created by the workflow
- Close old issues before re-running analysis

## Examples

### Example 1: New Failure Creates Issue

```
E2E Tests run → fails
  ↓
Analyze E2E Failures runs → creates issue
  ↓
Issue #123 created with labels: e2e-failure, needs-triage
```

### Example 2: Recurring Failure Updates Issue

```
E2E Tests run → fails (same test)
  ↓
Analyze E2E Failures runs → finds existing issue #123
  ↓
Adds comment to issue #123 with new failure details
```

### Example 3: Copilot Analysis

```
Developer adds copilot-analyze label to issue #123
  ↓
Copilot Analyze Failure runs → adds comment
  ↓
@copilot analyzes and responds with:
  - Issue type classification
  - Root cause analysis
  - Suggested fixes
  - Recommended labels
```

## Future Enhancements

Potential improvements:
- Auto-close issues when tests pass consistently
- Track failure frequency/history
- Integration with Slack notifications
- Automatic label application based on Copilot analysis
- Link to related PRs that might have introduced the failure
