# Debugging melosys-api with Docker Logs

This guide explains how to debug timing issues, race conditions, and async process behavior in melosys-api by analyzing Docker logs.

## Overview

When E2E tests interact with melosys-api, many operations happen asynchronously through process instances (ProsessinstansService). Understanding the timing and state of these operations is crucial for debugging flaky tests.

## Docker Log Files

After test runs, logs are saved in the `playwright-report/` directory:

```bash
# Per-test logs (created when errors/warnings detected)
playwright-report/docker-logs-{test-name}.log

# Complete logs (always created, contains all logs from entire run)
playwright-report/melosys-api-complete.log
playwright-report/melosys-web-complete.log
playwright-report/faktureringskomponenten-complete.log
playwright-report/melosys-dokgen-complete.log
playwright-report/melosys-trygdeavgift-beregning-complete.log
playwright-report/melosys-trygdeavtale-complete.log
```

## Log Format

All logs include RFC3339 timestamps for precise timing analysis:

```
2025-11-20T12:20:34.450873819Z 13:20:34.450 | request-id | class.name | INFO | Message
└─────────────────────────────┘ └──────────┘   └─────────┘  └────────┘  └──┘   └──────┘
      Docker timestamp          Local time      Request ID   Class      Level  Message
```

## Common Debugging Scenarios

### 1. Race Conditions with Process Instances

**Problem:** Test triggers a job/query before async process completes.

**Example:** Job queries for `behandling.status = 'AVSLUTTET'` but process instance hasn't committed yet.

**How to Debug:**

```bash
# Search for process instance events around a specific timestamp
grep "2025-11-20T12:20:3" playwright-report/melosys-api-complete.log | grep -i "prosessinstans"

# Look for specific process instance type
grep "IVERKSETT_VEDTAK_FTRL" playwright-report/melosys-api-complete.log
```

**Key Log Patterns:**

```
# Process starts
Saksbehandler=Z123456 har opprettet prosessinstans {id} av type IVERKSETT_VEDTAK_FTRL

# Process executes steps
Starter behandling av prosessinstans {id}
Utfører steg LAGRE_MEDLEMSKAPSPERIODE_MEDL for prosessinstans {id}
Utfører steg AVSLUTT_SAK_OG_BEHANDLING for prosessinstans {id}

# Process completes (transaction commits here!)
Process instance {id} completed successfully
```

**Solution Pattern:**
```typescript
// ❌ Wrong: Query runs before process commits
await vedtak.fattVedtak();
await someJobThatQueriesDatabase(); // Too soon!

// ✅ Correct: Wait for process to complete first
await vedtak.fattVedtak();
await waitForProcessInstances(page.request, 30); // Waits for commit
await someJobThatQueriesDatabase(); // Now safe!
```

### 2. Finding Job Execution Timing

**Problem:** Background jobs (like ÅrsavregningIkkeSkattepliktigeFinner) not finding expected data.

**How to Debug:**

```bash
# Find all job executions
grep "JobMonitor" playwright-report/melosys-api-complete.log

# Find specific job with stats
grep -A 15 "FinnSakerForÅrsavregningIkkeSkattepliktige" playwright-report/melosys-api-complete.log
```

**Example Output:**
```
2025-11-20T12:20:37.557Z Job 'FinnSakerForÅrsavregningIkkeSkattepliktige' completed. Runtime: 297 ms
Stats: {
  "jobName" : "FinnSakerForÅrsavregningIkkeSkattepliktige",
  "isRunning" : false,
  "startedAt" : "2025-11-20T13:20:37.259323335",
  "runtime" : "297 ms",
  "antallFunnet" : 0,          <-- ❌ Found 0 cases
  "antallProsessert" : 0,
  "errorCount" : 0
}
```

**Analysis Steps:**
1. Note the job start time: `13:20:37.259`
2. Search backwards for relevant vedtak/behandling events
3. Check if database updates happened before job ran

```bash
# Search for events before job started
grep "2025-11-20T12:20:3[0-6]" playwright-report/melosys-api-complete.log | grep "behandling"
```

### 3. Database State Changes

**Problem:** Need to verify when database state changes (behandling status, medlemskapsperiode, etc.)

**Key Log Patterns:**

```
# Behandling status changes
Oppdaterer status for behandling 11 fra UNDER_BEHANDLING til IVERKSETTER_VEDTAK

# Behandling closed
Avslutter behandling 11, og setter saksstatus til LOVVALG_AVKLART

# MEDL period updates
Oppdaterer MEDL-periode 926042 for medlemskapsperiode

# Fakturaserie created
Oppretter fakturaserie for behandling: 11
```

**Example Timeline Analysis:**

```bash
# Extract all events for a specific behandling
grep "behandling 11" playwright-report/melosys-api-complete.log | head -50

# Output shows sequence:
# 12:20:34.450 - Fatter vedtak for behandling 11
# 12:20:34.460 - Status: UNDER_BEHANDLING → IVERKSETTER_VEDTAK
# 12:20:34.605 - Avslutter behandling 11
# 12:20:34.702 - Brev journalført
# 12:20:37.259 - Job triggered (2.8s later)
```

### 4. Finding API Endpoint Calls

**Problem:** Need to see when frontend/test calls specific API endpoints.

```bash
# Search for audit logs (shows API calls)
grep "AUDIT:" playwright-report/melosys-api-complete.log

# Find specific endpoint
grep "request=/api/behandlinger" playwright-report/melosys-api-complete.log

# Find all endpoints called by a test user
grep "suid=Z123456" playwright-report/melosys-api-complete.log
```

**Example:**
```
AUDIT: 13:20:30.899 | request-id | auditLogger | INFO |
CEF:0|melosys|Auditlog|1.0|audit:update|Medlemskap og lovvalg|INFO|
suid=Z123456 duid=1111111111111 end=1763641230899
requestMethod=GET request=/api/behandlinger/11
msg=Saksbehandling og endringer for sak MEL-8 (behandling 11)
```

### 5. Comparing Failed vs Successful Runs

**Problem:** Flaky test - need to understand what's different between runs.

**Process:**

1. **Get multiple log files** from GitHub Actions artifacts
2. **Extract specific events** with timestamps
3. **Compare timing**

```bash
# Failed run
grep "FinnSakerFor" failed-run/melosys-api-complete.log -A 10

# Successful run
grep "FinnSakerFor" successful-run/melosys-api-complete.log -A 10

# Compare timestamps
# Failed: Job at 12:20:37.259, Vedtak at 12:20:34.450 (2.8s gap)
# Success: Job at 12:21:27.393, Vedtak at 12:21:25.615 (1.8s gap)
# Conclusion: Not about absolute time - it's about transaction commit!
```

## Useful Grep Commands

### Find All Process Instance Types
```bash
grep "opprettet prosessinstans" playwright-report/melosys-api-complete.log | \
  grep -o "av type [A-Z_]*" | sort | uniq -c
```

### Timeline of Events Around Specific Time
```bash
# Show events ±5 seconds around 12:20:37
grep "2025-11-20T12:20:3[2-9]\|2025-11-20T12:20:4[0-2]" \
  playwright-report/melosys-api-complete.log
```

### Find All Jobs That Ran
```bash
grep "Job '" playwright-report/melosys-api-complete.log | \
  grep "completed\|started"
```

### Extract Full Process Instance Flow
```bash
# Replace {id} with actual prosessinstans ID
grep "8b06b884-f27b-4f87-8183-d89696a50bba" \
  playwright-report/melosys-api-complete.log
```

### Find Errors and Warnings
```bash
# Errors only
grep "ERROR" playwright-report/melosys-api-complete.log

# Warnings
grep "WARN" playwright-report/melosys-api-complete.log

# SQL errors
grep "ORA-\|SQLException" playwright-report/melosys-api-complete.log
```

## Understanding waitForProcessInstances

The `waitForProcessInstances` helper (api-helper.ts:213) calls `/internal/e2e/process-instances/await` which:

1. Polls for all active process instances
2. Waits until they complete (max 30s default)
3. Returns when all are finished and **transactions committed**

**Use this BEFORE:**
- Database queries that depend on process results
- Triggering jobs that query database
- Assertions that check database state

**Example:**
```typescript
// Trigger vedtak (starts async process)
await vedtak.fattVedtak();

// Wait for process to complete and commit
await waitForProcessInstances(page.request, 30);

// Now database state is guaranteed to be updated
await someJobThatQueriesDatabase();
```

## Debugging Checklist

When debugging flaky tests:

- [ ] Get logs from both failed and successful runs
- [ ] Identify the test assertion that's failing
- [ ] Find relevant log events around failure time
- [ ] Map out the timeline of events
- [ ] Check if async process instances are involved
- [ ] Verify if `waitForProcessInstances` is called at right time
- [ ] Look for database transaction commit timing
- [ ] Compare timing between failed/successful runs
- [ ] Check if job queries depend on uncommitted data

## Real-World Example: Race Condition Fix

**Problem:** Test `skal endre skattestatus fra skattepliktig til ikke-skattepliktig` was flaky.

**Investigation:**
1. Downloaded logs from failed GitHub Actions run
2. Searched for job stats: `grep "FinnSakerForÅrsavregningIkkeSkattepliktige"`
3. Found: Job reported `antallFunnet: 0` (should be 1)
4. Searched backwards for vedtak: `grep "Fatter vedtak"`
5. Found: Vedtak started at 12:20:34, Job ran at 12:20:37 (2.8s gap)
6. Searched for process completion: No completion log before job!

**Root Cause:** Job queried database before `IVERKSETT_VEDTAK_FTRL` process committed.

**Fix:** Added `waitForProcessInstances` between vedtak and job trigger.

**Verification:**
```bash
# After fix, process completes before job
12:21:25.615 - Fatter vedtak
12:21:25.826 - Brev journalført (process complete)
12:21:27.393 - Job starts
12:21:27.716 - Found 1 case ✅
```

## Tools and Scripts

### Quick Log Viewer
```bash
# View logs with color highlighting
less -R playwright-report/melosys-api-complete.log

# Follow logs in real-time (during test run)
docker logs -f melosys-api
```

### Extract Timeline Script
Create `scripts/extract-timeline.sh`:
```bash
#!/bin/bash
# Extract timeline of events for a behandling

BEHANDLING_ID=$1
LOG_FILE=${2:-playwright-report/melosys-api-complete.log}

echo "Timeline for behandling $BEHANDLING_ID:"
grep "behandling $BEHANDLING_ID" "$LOG_FILE" | \
  awk '{print $1, $2, substr($0, index($0,$4))}' | \
  head -50
```

Usage:
```bash
chmod +x scripts/extract-timeline.sh
./scripts/extract-timeline.sh 11
```

## Additional Resources

- **Docker Logs Fixture:** `fixtures/docker-logs.ts` - Auto-captures logs per test
- **Process Instance Helper:** `helpers/api-helper.ts:213` - waitForProcessInstances
- **GitHub Actions Guide:** `docs/ci-cd/GITHUB-ACTIONS.md` - CI/CD log access
- **Fixtures Guide:** `docs/guides/FIXTURES.md` - Auto-cleanup and log checking

## Tips

1. **Always check complete logs first** - Per-test logs only contain errors/warnings
2. **Use timestamps to build timelines** - Essential for understanding async behavior
3. **Look for process instance IDs** - Follow the full lifecycle of operations
4. **Compare multiple runs** - Flaky tests show different timing patterns
5. **Search backwards from failures** - Find what should have happened before
6. **Check transaction boundaries** - Process completion = transaction commit
7. **Use grep context flags** - `-A 10` (after), `-B 10` (before), `-C 10` (context)

## Common Pitfalls

❌ **Don't assume immediate completion** - Most operations are async
❌ **Don't rely on sleep/timeout** - Use proper wait mechanisms
❌ **Don't ignore process instances** - They control transaction commits
❌ **Don't query database too early** - Wait for processes to complete

✅ **Do use waitForProcessInstances** - Ensures commits complete
✅ **Do check timestamps in logs** - Understand actual timing
✅ **Do compare failed/successful runs** - Find timing differences
✅ **Do follow process instance lifecycle** - From creation to completion
