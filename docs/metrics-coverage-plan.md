# Prometheus Metrics Coverage Plan

## Problem Statement

We need visibility into what code paths our E2E tests actually exercise. This helps:
1. **Prioritize new tests** - See which process types have zero coverage
2. **Validate test changes** - Confirm a test actually triggers expected workflows
3. **Detect regressions** - If a metric that used to increment stops, something broke

## Available Metrics in melosys-api

### High-Value Business Metrics for Coverage Tracking

| Metric | Tags | What It Tells Us |
|--------|------|------------------|
| `melosys_prosessinstanser_opprettet_total` | `type` | Which process types (49 types) were triggered |
| `melosys_prosessinstanser_steg_utfoert_total` | `type`, `status` | Which steps (77 steps) completed/failed |
| `melosys_behandlingstemaer_opprettet_total` | `tema` | Which case topics were created |
| `melosys_behandlingstyper_opprettet_total` | `type` | Which case types were created |
| `melosys_saker_opprettet_total` | - | Total cases created |
| `melosys_behandlinger_avsluttet_total` | - | Total treatments completed |
| `melosys_svar_aou_total` | `resultat` | Decision outcomes (godkjent, avslag, etc.) |

**Endpoint:** `http://localhost:8080/internal/prometheus`

## Proposed Solution: Phased Implementation

### Phase 1: Basic Metrics Collection & Report (MVP)

**Goal:** Collect metrics before/after test run, show what was exercised

**Components:**
1. `helpers/metrics-helper.ts` - Fetch and parse Prometheus metrics
2. Global teardown - Capture final metrics snapshot
3. `playwright-report/metrics-coverage.json` - Raw data
4. `playwright-report/metrics-summary.md` - Human-readable report

**Report Output:**

```markdown
## E2E Test Coverage - Prometheus Metrics

### Process Types Exercised (12 of 49)
| Process Type | Count | Status |
|--------------|-------|--------|
| OPPRETT_SAK | 5 | ✅ |
| IVERKSETT_VEDTAK_FTRL | 3 | ✅ |
| ANMODNING_OM_UNNTAK | 2 | ✅ |
| ... | | |

### Process Types NOT Covered (37 of 49)
- VEDTAK_MEDLEMSKAP_UNNTAK
- REGISTRER_PAAKRAVD_MEDLEMSKAP
- ...

### Process Steps Exercised (23 of 77)
| Step | Success | Failed |
|------|---------|--------|
| OPPRETT_SAK_OG_BEH | 5 | 0 |
| HENT_REGISTEROPPLYSNINGER | 5 | 0 |
| ...

### Summary
- Cases created: 5
- Treatments completed: 3
- Process coverage: 24% (12/49 types)
- Step coverage: 30% (23/77 steps)
```

### Phase 2: Before/After Delta Tracking

**Goal:** Show only what the tests did, not pre-existing state

**Flow:**
1. Global setup: Capture metrics snapshot BEFORE tests
2. Global teardown: Capture metrics snapshot AFTER tests
3. Calculate deltas (after - before)
4. Report only the deltas

This distinguishes between:
- Metrics from test data setup
- Metrics from actual test execution

### Phase 3: Per-Test Attribution (Advanced)

**Goal:** Know which test triggered which metrics

**Approach:**
- Capture metrics snapshot before each test
- Capture after each test
- Attribute deltas to specific tests
- Show: "Test X exercises process types A, B, C"

**Use cases:**
- Find redundant tests (same coverage)
- Find which test to run when process X changes
- Gap analysis per test file

### Phase 4: CI Integration

**Goal:** Track coverage trends, alert on gaps

**Components:**
1. Upload metrics JSON as artifact
2. Compare with previous runs
3. PR comment showing coverage changes
4. Optional: Fail if coverage drops

---

## Implementation Details

### metrics-helper.ts

```typescript
interface PrometheusMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  help: string;
  values: Array<{
    labels: Record<string, string>;
    value: number;
  }>;
}

interface MetricsSnapshot {
  timestamp: string;
  metrics: PrometheusMetric[];
}

interface MetricsDelta {
  name: string;
  deltas: Array<{
    labels: Record<string, string>;
    before: number;
    after: number;
    delta: number;
  }>;
}

export class MetricsHelper {
  private baseUrl = 'http://localhost:8080';

  async fetchMetrics(): Promise<MetricsSnapshot> {
    const response = await fetch(`${this.baseUrl}/internal/prometheus`);
    const text = await response.text();
    return {
      timestamp: new Date().toISOString(),
      metrics: this.parsePrometheusText(text)
    };
  }

  parsePrometheusText(text: string): PrometheusMetric[] {
    // Parse Prometheus text format into structured data
    // Handle: metric_name{label="value"} 123.0
  }

  calculateDeltas(before: MetricsSnapshot, after: MetricsSnapshot): MetricsDelta[] {
    // Calculate differences for each metric
  }

  filterMelosysMetrics(metrics: PrometheusMetric[]): PrometheusMetric[] {
    // Filter to only melosys.* metrics
    return metrics.filter(m => m.name.startsWith('melosys_'));
  }
}
```

### Global Setup (Before Tests)

```typescript
// global-setup.ts
import { MetricsHelper } from './helpers/metrics-helper';
import * as fs from 'fs';

export default async function globalSetup() {
  const metrics = new MetricsHelper();

  try {
    const snapshot = await metrics.fetchMetrics();
    // Store for later comparison
    fs.writeFileSync(
      'test-results/.metrics-before.json',
      JSON.stringify(snapshot, null, 2)
    );
    console.log('📊 Captured initial metrics snapshot');
  } catch (error) {
    console.warn('⚠️ Could not capture metrics (API not running?)');
  }
}
```

### Global Teardown (After Tests)

```typescript
// global-teardown.ts
import { MetricsHelper } from './helpers/metrics-helper';
import { generateMetricsReport } from './lib/metrics-reporter';
import * as fs from 'fs';

export default async function globalTeardown() {
  const metrics = new MetricsHelper();

  try {
    // Fetch final metrics
    const after = await metrics.fetchMetrics();

    // Load before snapshot
    const beforeJson = fs.readFileSync('test-results/.metrics-before.json', 'utf-8');
    const before = JSON.parse(beforeJson);

    // Calculate deltas
    const deltas = metrics.calculateDeltas(before, after);

    // Generate reports
    const report = generateMetricsReport(deltas);

    fs.writeFileSync('playwright-report/metrics-coverage.json', JSON.stringify({
      before,
      after,
      deltas
    }, null, 2));

    fs.writeFileSync('playwright-report/metrics-summary.md', report);

    console.log('📊 Metrics coverage report generated');
  } catch (error) {
    console.warn('⚠️ Could not generate metrics report:', error);
  }
}
```

### Integration with Existing Reporter

Option A: Separate files (simpler)
- `metrics-coverage.json` and `metrics-summary.md` alongside existing reports

Option B: Integrate into test-summary.md (more cohesive)
- Add "Metrics Coverage" section to existing summary
- Requires modifying summary-generator.ts

**Recommendation:** Start with Option A (separate files), then integrate if valuable.

---

## Key Metrics to Track

### Must-Have (Phase 1)
1. `melosys_prosessinstanser_opprettet_total{type=...}` - Core workflow coverage
2. `melosys_prosessinstanser_steg_utfoert_total{type=..., status=...}` - Step coverage
3. `melosys_saker_opprettet_total` - Basic case creation

### Nice-to-Have (Phase 2+)
4. `melosys_behandlingstemaer_opprettet_total{tema=...}` - Case topic coverage
5. `melosys_behandlingstyper_opprettet_total{type=...}` - Case type coverage
6. `melosys_behandlinger_avsluttet_total` - Treatment completion
7. `melosys_svar_aou_total{resultat=...}` - Decision outcomes
8. `melosys_prosessinstanser_feilet` - Failure tracking

---

## Expected Output Example

```json
// metrics-coverage.json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "testDuration": 96720,
  "coverage": {
    "processTypes": {
      "exercised": ["OPPRETT_SAK", "IVERKSETT_VEDTAK_FTRL", "..."],
      "notExercised": ["VEDTAK_MEDLEMSKAP_UNNTAK", "..."],
      "percentage": 24.5
    },
    "processSteps": {
      "exercised": 23,
      "total": 77,
      "percentage": 29.9
    }
  },
  "deltas": {
    "melosys_saker_opprettet_total": 5,
    "melosys_behandlinger_avsluttet_total": 3,
    "melosys_prosessinstanser_opprettet_total": {
      "OPPRETT_SAK": 5,
      "IVERKSETT_VEDTAK_FTRL": 3
    }
  }
}
```

---

## Open Questions

1. **Per-test vs aggregate?**
   - Start with aggregate (simpler)
   - Add per-test if there's demand

2. **What to do with gaps?**
   - Just report (Phase 1)
   - CI warning (Phase 2)
   - Fail CI (probably never - too strict)

3. **Compare across runs?**
   - Store JSON artifacts in CI
   - Load previous run's JSON for comparison
   - Show: "Coverage increased from 24% to 28%"

4. **Integration with CLAUDE.md prioritization?**
   - Generate "recommended tests to add" based on gaps
   - Weight by business importance (if we can infer it)

---

## Next Steps

1. [ ] Implement `helpers/metrics-helper.ts` with Prometheus parser
2. [ ] Add global-teardown.ts to playwright.config.ts
3. [ ] Create metrics report generator
4. [ ] Run locally and validate output
5. [ ] Add to CI artifacts
6. [ ] Document in CLAUDE.md

**Estimated effort:** ~1 day for Phase 1 MVP
