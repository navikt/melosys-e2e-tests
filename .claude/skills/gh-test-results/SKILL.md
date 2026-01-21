---
name: gh-test-results
description: Download and analyze GitHub Actions E2E test results from melosys-e2e-tests. Use when user asks about test results, CI failures, flaky tests, or wants to download artifacts from GitHub Actions runs.
---

# GitHub Actions Test Results Analyzer

Analyze E2E test results from GitHub Actions runs on navikt/melosys-e2e-tests.

## When to Use

- User asks about test results or CI status
- User wants to download artifacts from a GitHub Actions run
- User asks about flaky tests or test failures
- User mentions a branch and wants to see test results

## Workflow

### 1. Find Runs

List recent runs, optionally filtered by branch:

```bash
# All recent runs
gh run list --repo navikt/melosys-e2e-tests --limit 10 --json databaseId,headBranch,status,conclusion,createdAt,name

# Specific branch
gh run list --repo navikt/melosys-e2e-tests --branch <branch-name> --limit 5 --json databaseId,headBranch,status,conclusion,createdAt
```

### 2. View Run Details

Get run info including artifacts and annotations:

```bash
gh run view <run-id> --repo navikt/melosys-e2e-tests
```

Key info from output:
- **JOBS** section: Job status and duration
- **ANNOTATIONS**: Test failures, flaky tests, pass counts
- **ARTIFACTS**: Available downloads (playwright-results, test-summary, etc.)

### 3. Download Artifacts

```bash
mkdir -p /tmp/gh-artifacts
cd /tmp/gh-artifacts
rm -rf playwright-results test-summary 2>/dev/null
gh run download <run-id> --repo navikt/melosys-e2e-tests --name playwright-results --name test-summary
```

### 4. Analyze Results

Read these files in order of importance:

#### Primary: test-summary.json
Location: `/tmp/gh-artifacts/test-summary/test-summary.json`

```json
{
  "status": "passed|failed|flaky",
  "tests": [{
    "title": "test name",
    "status": "passed|failed|flaky",
    "totalAttempts": 2,
    "failedAttempts": 1,
    "duration": 56494,
    "dockerErrors": null
  }],
  "tags": {
    "melosys-api": "image-tag",
    "melosys-web": "latest"
  }
}
```

#### Secondary: test-summary.md
Location: `/tmp/gh-artifacts/test-summary/test-summary.md`

Human-readable summary with pass/fail counts and per-run results table.

#### For Flaky Tests: flaky-test-summary.md
Location: `/tmp/gh-artifacts/playwright-results/playwright-report/flaky-test-summary.md`

Shows success rate across multiple runs (used for flaky test stability checks).

#### For Failures: error-context.md
Location: `/tmp/gh-artifacts/playwright-results/test-results/<test-name>-chromium/error-context.md`

Contains page snapshot at failure time - useful for understanding UI state when test failed.

### 5. Present Summary

Always include:

| Metric | Value |
|--------|-------|
| Status | passed/failed/flaky |
| Total Attempts | N |
| Failed Attempts | N |
| Duration | Xs |

For flaky tests, include stability info:
- Pass rate (e.g., 5/5 = 100%)
- Which runs passed/failed

For failures, include:
- Error message from annotations
- Relevant snippet from error-context.md

Always mention:
- Docker image tags used (from `tags` in JSON)
- Artifact location: `/tmp/gh-artifacts/`

## Available Artifacts

| Artifact | Contents |
|----------|----------|
| `test-summary` | test-summary.md, test-summary.json |
| `playwright-results` | HTML report, traces, videos, screenshots, docker logs |
| `playwright-videos` | Test execution videos |
| `playwright-traces` | Playwright trace files for debugging |

## Docker Logs

Complete logs from all services are in:
`/tmp/gh-artifacts/playwright-results/playwright-report/<service>-complete.log`

Services: melosys-api, melosys-web, melosys-mock, faktureringskomponenten, melosys-dokgen, melosys-trygdeavgift-beregning, melosys-trygdeavtale
