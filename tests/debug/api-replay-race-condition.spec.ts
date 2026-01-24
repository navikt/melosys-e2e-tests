import { test, expect } from '../../fixtures';
import { ApiReplayHelper, extractRaceConditionSequence } from '../../helpers/api-replay-helper';
import { ApiTraceRecorder } from '../../helpers/api-trace-helper';
import { waitForProcessInstances } from '../../helpers/api-helper';
import * as path from 'path';
import * as fs from 'fs';

/**
 * API Replay Tests for Race Condition Debugging
 *
 * These tests replay recorded API traces WITHOUT the frontend to determine
 * if race conditions are caused by:
 * 1. Frontend behavior (e.g., extra requests, timing)
 * 2. The API call sequence itself
 *
 * Usage:
 * 1. First, record a trace from the real test:
 *    RECORD_API_TRACE=true npm test tests/eu-eos/eu-eos-13.1-arbeid-flere-land-fullfort-vedtak.spec.ts
 *
 * 2. Then run this replay test:
 *    npm test tests/debug/api-replay-race-condition.spec.ts
 *
 * 3. If replay is stable but real test is flaky → investigate frontend
 *    If replay is also flaky → the API sequence itself causes the race
 */

// Path to the recorded trace file
const TRACE_FILE = path.join(
  process.cwd(),
  'playwright-report/api-traces/skal-fullf-re-arbeid-i-flere-land-arbeidsflyt-med-vedtak.json'
);

test.describe('API Replay - Race Condition Investigation', () => {

  test.skip(!fs.existsSync(TRACE_FILE), 'No trace file found - run with RECORD_API_TRACE=true first');

  test('should analyze the recorded trace', async ({ request }) => {
    const trace = ApiReplayHelper.loadTrace(TRACE_FILE);

    console.log('\n📊 Trace Analysis');
    console.log('='.repeat(60));
    console.log(`Test: ${trace.testName}`);
    console.log(`Total requests: ${trace.entries.length}`);
    console.log(`Duration: ${trace.startTime} → ${trace.endTime}`);

    const analysis = ApiReplayHelper.analyzeTrace(trace);

    console.log(`\nUnique endpoints: ${analysis.uniqueEndpoints.length}`);
    console.log(`POST endpoints: ${analysis.postEndpoints.length}`);
    console.log(`Race condition endpoints: ${analysis.raceConditionEndpoints.length}`);

    if (analysis.raceConditionEndpoints.length > 0) {
      console.log('\n⚠️  Race Condition Endpoints:');
      for (const endpoint of analysis.raceConditionEndpoints) {
        console.log(`   - ${endpoint}`);
      }
    }

    // Find calls around the race condition endpoint
    const raceSequence = extractRaceConditionSequence(trace, 2000);
    console.log(`\n📍 Requests within 2s of race condition endpoints (${raceSequence.length}):`);
    for (const entry of raceSequence) {
      const marker = entry.isRaceConditionEndpoint ? ' ← RACE' : '';
      console.log(`   [${(entry.elapsed / 1000).toFixed(1)}s] ${entry.method} ${entry.pathname}${marker}`);
    }

    expect(trace.entries.length).toBeGreaterThan(0);
  });

  test('should replay full trace without frontend', async ({ request }) => {
    const trace = ApiReplayHelper.loadTrace(TRACE_FILE);

    // Get auth token from environment (same as used by tests)
    const authToken = process.env.LOCAL_AUTH_TOKEN;

    const replay = new ApiReplayHelper(request, {
      baseUrl: 'http://localhost:8080',
      preserveTiming: false, // Run as fast as possible
      minDelay: 10, // Small delay between requests
      authToken,
      verbose: true,
      // Skip GraphQL calls without bodies (we can't replay them)
      skipPattern: /^\/graphql\//,
      // Skip frontend-only endpoints
      filterPattern: /^\/api\//
    });

    const result = await replay.replayTrace(trace);

    console.log('\n📊 Replay Results:');
    console.log(`   Success rate: ${result.successfulRequests}/${result.totalRequests}`);

    // Check for failures
    const failures = result.entries.filter(e => e.error);
    if (failures.length > 0) {
      console.log('\n❌ Failed requests:');
      for (const f of failures) {
        console.log(`   ${f.original.method} ${f.original.pathname}: ${f.error}`);
      }
    }

    // The replay should complete without 5xx errors
    const serverErrors = result.entries.filter(e => e.replayStatus >= 500);
    expect(serverErrors.length).toBe(0);
  });

  test('should replay race-critical sequence multiple times', async ({ request }) => {
    const trace = ApiReplayHelper.loadTrace(TRACE_FILE);
    const authToken = process.env.LOCAL_AUTH_TOKEN;

    // Extract just the calls around the race condition
    const raceSequence = extractRaceConditionSequence(trace, 1000);

    if (raceSequence.length === 0) {
      console.log('No race condition endpoints found in trace');
      return;
    }

    console.log(`\n🔄 Replaying ${raceSequence.length} requests around race condition`);
    console.log('   Running 5 iterations to check for flakiness...\n');

    const iterations = 5;
    const results: Array<{ iteration: number; errors: number; duration: number }> = [];

    for (let i = 0; i < iterations; i++) {
      console.log(`\n--- Iteration ${i + 1}/${iterations} ---`);

      const replay = new ApiReplayHelper(request, {
        baseUrl: 'http://localhost:8080',
        preserveTiming: true, // Preserve original timing
        maxDelay: 500, // Cap delays at 500ms
        authToken,
        verbose: false,
        skipPattern: /^\/graphql\//,
        filterPattern: /^\/api\//
      });

      // Create a mini-trace with just the race sequence
      const miniTrace = {
        ...trace,
        entries: raceSequence
      };

      const result = await replay.replayTrace(miniTrace);
      results.push({
        iteration: i + 1,
        errors: result.failedRequests,
        duration: result.totalDuration
      });

      // Wait for any async processes to complete before next iteration
      await waitForProcessInstances(request, 10);

      // Small delay between iterations
      await new Promise(r => setTimeout(r, 500));
    }

    console.log('\n📊 Iteration Results:');
    for (const r of results) {
      const status = r.errors > 0 ? '❌' : '✅';
      console.log(`   ${status} Iteration ${r.iteration}: ${r.errors} errors, ${Math.round(r.duration)}ms`);
    }

    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
    console.log(`\nTotal errors across ${iterations} iterations: ${totalErrors}`);

    // If we see errors in any iteration, the API sequence itself is problematic
    if (totalErrors > 0) {
      console.log('\n⚠️  FLAKY: Errors occurred during API-only replay');
      console.log('   This suggests the API call sequence itself can trigger race conditions');
    } else {
      console.log('\n✅ STABLE: No errors during API-only replay');
      console.log('   If the real test is flaky, the issue is likely in frontend behavior');
    }
  });

  test('should check for missing waitForProcessInstances', async ({ request }) => {
    const trace = ApiReplayHelper.loadTrace(TRACE_FILE);

    // Endpoints that trigger sagas and should be followed by waitForProcessInstances
    const sagaTriggers = [
      '/api/saksflyt/vedtak/',  // vedtak/fatt triggers HENT_REGISTEROPPLYSNINGER
      '/api/fagsaker',          // Creating fagsak might trigger processes
      '/api/behandlinger/',     // Some behandling updates trigger processes
    ];

    console.log('\n🔍 Checking for potential missing waitForProcessInstances calls\n');

    const potentialIssues: Array<{
      trigger: ApiTraceEntry;
      followingCalls: ApiTraceEntry[];
      timeToNextCall: number;
    }> = [];

    for (let i = 0; i < trace.entries.length; i++) {
      const entry = trace.entries[i];

      // Check if this is a saga-triggering POST
      const isSagaTrigger = entry.method === 'POST' &&
        sagaTriggers.some(pattern => entry.pathname.includes(pattern));

      if (!isSagaTrigger) continue;

      // Look at what happens in the next 5 seconds
      const followingCalls = trace.entries
        .slice(i + 1)
        .filter(e => e.elapsed - entry.elapsed < 5000);

      if (followingCalls.length > 0) {
        const timeToNextCall = followingCalls[0].elapsed - entry.elapsed;

        // If next call is very quick (< 100ms), there's no time for waitForProcessInstances
        if (timeToNextCall < 100) {
          potentialIssues.push({
            trigger: entry,
            followingCalls: followingCalls.slice(0, 3),
            timeToNextCall
          });
        }
      }
    }

    if (potentialIssues.length > 0) {
      console.log(`⚠️  Found ${potentialIssues.length} potential issues:\n`);

      for (const issue of potentialIssues) {
        console.log(`   Saga trigger: ${issue.trigger.method} ${issue.trigger.pathname}`);
        console.log(`   Time to next call: ${Math.round(issue.timeToNextCall)}ms`);
        console.log(`   Following calls:`);
        for (const call of issue.followingCalls) {
          const delta = call.elapsed - issue.trigger.elapsed;
          console.log(`      [+${Math.round(delta)}ms] ${call.method} ${call.pathname}`);
        }
        console.log('');
      }

      console.log('💡 Consider adding waitForProcessInstances() after these saga triggers');
    } else {
      console.log('✅ No obvious missing waitForProcessInstances patterns found');
    }
  });
});
