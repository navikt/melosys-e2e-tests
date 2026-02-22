# Melosys E2E Testing Infrastructure
## Building Production-Grade End-to-End Testing with AI-Assisted Development

---

# Executive Summary

This document presents the complete end-to-end (E2E) testing infrastructure built for NAV's Melosys system - a complex Norwegian social security and insurance management system. The project demonstrates how AI-assisted development (Claude Code) can accelerate the creation of sophisticated testing infrastructure.

**Key Achievements:**
- Built comprehensive E2E test suite covering 17 critical workflows
- Created 19 Page Object Models for maintainable test code
- Developed 9 reusable helper classes (2,400+ lines of utility code)
- Implemented automatic Docker log monitoring across 9 services
- Integrated Prometheus metrics coverage tracking
- Established CI/CD pipeline with automatic triggers from 8 source repositories

---

# Part 1: Project Context

## What is Melosys?

Melosys (Medlems og Lovvalgssystem) is NAV's system for:
- Managing membership in the Norwegian National Insurance Scheme (folketrygden)
- Determining applicable social security legislation for cross-border workers within EU/EEA
- Processing A1 certificate applications
- Integration with EESSI (Electronic Exchange of Social Security Information)

## The Testing Challenge

The Melosys ecosystem consists of multiple interconnected services:
- **melosys-api**: Main backend API (Kotlin/Java, Spring Boot)
- **melosys-web**: Frontend application (React, Redux, TypeScript)
- **melosys-eessi**: EU social security exchange integration
- **faktureringskomponenten**: Billing component
- **melosys-trygdeavgift-beregning**: Tax calculation service
- **melosys-trygdeavtale**: Insurance agreement service
- Plus 10+ additional supporting services

**Problem**: How do you test complex multi-step workflows that span multiple services, databases, message queues, and external integrations?

**Solution**: A comprehensive E2E testing infrastructure that orchestrates all services, validates end-to-end workflows, and monitors the entire system for errors.

---

# Part 2: Technical Architecture

## Infrastructure Overview

The E2E test suite orchestrates 17 Docker containers:

**Frontend & Backend:**
- melosys-web (port 3000) - React frontend
- melosys-api (port 8080) - Main API
- melosys-eessi (port 8081) - EESSI integration
- faktureringskomponenten (port 8084) - Billing
- melosys-dokgen (port 8888) - Document generation
- melosys-trygdeavgift-beregning (port 8095) - Tax calculation
- melosys-trygdeavtale (port 8088) - Insurance agreements

**Data Layer:**
- Oracle database (port 1521) - Main application database
- PostgreSQL (port 5432) - Services database
- PostgreSQL Felles-kodeverk (port 5433) - Code tables

**Messaging & Auth:**
- Kafka with KRaft mode (ports 9092, 29092)
- mock-oauth2-server (ports 8082, 8086)
- Unleash feature toggles (port 4242)
- melosys-mock (port 8083) - Mock external services

## Technology Stack

**Testing Framework:**
- Playwright 1.40 - Browser automation
- TypeScript 5.9 - Strong typing throughout
- Vitest - Unit testing for test infrastructure

**Database Access:**
- OracleDB driver - Direct database verification
- SQL queries for validation

**Environment:**
- Docker Compose orchestration
- GitHub Actions CI/CD
- NAIS platform integration

---

# Part 3: Key Innovations

## Innovation 1: Docker Log Error Detection

**Problem**: Traditional E2E tests only check UI assertions. Backend errors that don't immediately surface in the UI go undetected.

**Solution**: Automatic Docker log monitoring

The system captures logs from 9 monitored services during each test:
- melosys-api, melosys-web, melosys-mock, melosys-eessi
- faktureringskomponenten, melosys-dokgen
- melosys-trygdeavgift-beregning, melosys-trygdeavtale
- melosys-inngangsvilkar

**How It Works:**
1. Before each test, record the start timestamp
2. After test execution, fetch Docker logs from all services
3. Filter logs to only the test's time window using RFC3339 timestamps
4. Categorize errors: SQL Errors, Connection Errors, Warnings, Other
5. Attach error summary to test report
6. Optionally fail the test if errors detected

**Impact**: Catches backend issues that traditional UI testing misses - database errors, connection problems, null pointer exceptions, and more.

## Innovation 2: Process Instance Tracking

**Problem**: Melosys uses async business processes (saksflyt). Tests need to wait for these to complete before making assertions.

**Solution**: API polling for process completion

The ApiHelper class:
- Polls the `/api/behandlinginstanser` endpoint
- Tracks process status (running, completed, failed)
- Detects stuck or failed processes
- Prevents cleanup while processes are running
- Fails tests if async processes don't complete

**Impact**: Eliminates race conditions and ensures tests validate the complete workflow, not just the initial UI action.

## Innovation 3: Metrics-Based Coverage Analysis

**Problem**: How do you know which business processes your E2E tests actually exercise?

**Solution**: Prometheus metrics integration

The MetricsHelper class:
- Captures Prometheus metrics before test run
- Captures metrics after test run
- Calculates deltas to show what was triggered
- Tracks 50+ process types
- Shows coverage percentage
- Identifies untested process types

**Tracked Metrics Include:**
- OPPRETT_SAK, OPPRETT_BEHANDLING
- VEDTAK_MEDLEMSKAP_UNNTAK
- LOVVALG_AVGJOERELSE, OPPHOER_LOVVALG
- MOTTA_A001, MOTTA_A003, MOTTA_A009, MOTTA_A010
- FERDIGSTILL_OPPGAVE, DISTRIBUER_BREV
- And 40+ more

**Impact**: Data-driven test prioritization - know exactly which business processes need more test coverage.

## Innovation 4: Automatic Test Isolation

**Problem**: Tests must not interfere with each other. Previous test data can cause false failures.

**Solution**: Comprehensive fixture system

Before each test, the cleanup fixture:
1. Cleans database tables (TRUNCATE for performance)
2. Resets Oracle sequences
3. Clears mock service data (journalposter, oppgaver)
4. Resets Unleash feature toggles to defaults
5. Clears JPA/Hibernate caches
6. Clears Spring cache regions

**Default Feature Toggle State:**
- All toggles enabled by default
- Exception: `melosys.arsavregning.uten.flyt` (disabled)

**Impact**: Every test starts with a clean slate. No "works on my machine" issues.

## Innovation 5: Known Error Tracking

**Problem**: Known bugs shouldn't block CI, but you want to track when they're fixed.

**Solution**: @known-error test tag

Tests tagged with @known-error:
- Run normally during test execution
- Results shown in reports
- If test fails: Marked as "Known Error (Failed)" - doesn't fail CI
- If test passes: Marked as "Known Error (Passed)" - might be fixed!
- Always include issue reference: `@known-error #MELOSYS-1234`

**Impact**: Track known bugs in CI without blocking deployments. Get notified when bugs are potentially fixed.

---

# Part 4: Page Object Model Architecture

## Design Philosophy

The test suite uses a strict Actions/Assertions separation pattern:

**Actions** (what you CAN DO):
```typescript
// opprett-ny-sak.page.ts
export class OpprettNySakPage extends BasePage {
  async fyllInnBrukerID(fnr: string) { /* action */ }
  async velgSakstype(type: string) { /* action */ }
  async klikkOpprettNyBehandling() { /* action */ }
  readonly assertions: OpprettNySakAssertions;
}
```

**Assertions** (what you EXPECT):
```typescript
// opprett-ny-sak.assertions.ts
export class OpprettNySakAssertions {
  async verifiserBehandlingOpprettet() { /* verify */ }
  async verifiserSakIDatabase(fnr: string) { /* verify */ }
}
```

## Implemented Page Objects (19 total)

**Core Pages:**
- HovedsidePage - Main navigation
- OpprettNySakPage - Create new case
- BehandlingPage - Case treatment

**Workflow Pages:**
- MedlemskapPage - Membership handling
- LovvalgPage - Legal choice
- ArbeidsforholdPage - Employment relationships
- TrygdeavgiftPage - Tax calculation
- VedtakPage - Decision making

**EU/EOS Pages:**
- EUEOSBehandlingPage - EU/EEA handling
- EUEOSSkipBehandlingPage - Skip functionality
- UnntagAnmodningPage - Exception requests

**Utility Pages:**
- JournalforingPage - Document journaling
- KlagePage - Appeals
- OppgaverPage - Task management
- SokPage - Search

## Benefits

1. **80% less code duplication** - Selectors defined once
2. **Single point of change** - UI changes require updating one file
3. **Readable tests** - Tests read like documentation
4. **Composable** - Combine POMs for complex workflows
5. **Type-safe** - TypeScript catches errors at compile time

---

# Part 5: Helper Library

## 9 Reusable Helper Classes (2,400+ lines)

| Helper | Lines | Purpose |
|--------|-------|---------|
| UnleashHelper | 460 | Feature toggle management across all services |
| SedHelper | 574 | EESSI/SED message handling and parsing |
| MetricsHelper | 378 | Prometheus metrics collection and analysis |
| ApiHelper | 332 | Process instance tracking and cache clearing |
| DatabaseHelper | 294 | Oracle queries, cleanup, and debugging |
| CheckDockerLogs | 153 | Docker log analysis utilities |
| MockHelper | 121 | Mock service data creation and clearing |
| AuthStateHelper | 50 | OAuth state persistence |
| AuthHelper | 49 | Login/logout workflows |

## UnleashHelper - Feature Toggle Control

```typescript
const unleash = new UnleashHelper(request);

// Disable specific toggle for test scenario
await unleash.disableFeature('melosys.faktureringskomponenten.ikke-tidligere-perioder');

// Enable toggle
await unleash.enableFeature('melosys.some.feature');

// All toggles reset automatically before next test
```

**Features:**
- Controls toggles across all services
- Auto-creates missing toggles
- Waits for API propagation
- Automatic reset between tests

## DatabaseHelper - Oracle Verification

```typescript
await withDatabase(async (db) => {
  // Query database
  const sak = await db.queryOne(
    'SELECT * FROM SAK WHERE personnummer = :pnr',
    { pnr: fnr }
  );
  expect(sak).not.toBeNull();

  // Show all tables (debugging)
  await db.showAllData();

  // Clean manually
  await db.cleanDatabase();
});
```

## MetricsHelper - Coverage Tracking

```typescript
const metrics = new MetricsHelper();

// Get current metrics
const before = await metrics.fetchMetrics();

// ... run test ...

// Get final metrics
const after = await metrics.fetchMetrics();

// Calculate what was triggered
const delta = metrics.calculateDelta(before, after);

// Show exercised process types
console.log(delta.processTypes);
```

---

# Part 6: Test Coverage

## Test Organization

**Tier 1 - Core Workflows (Critical):**
- Task management (oppgaver)
- Search and navigation
- Document journaling
- EU social security message receipt

**Tier 2 - FTRL Workflows:**
- Appeals handling (klage)

**Tier 3 - EU/EOS Workflows:**
- Work in multiple countries
- Exported worker scenarios
- Self-employed across countries
- Skip functionality
- Article 16 exemption requests

**Tier 4 - Outside Agreement:**
- Annual settlement (non-taxable)
- Complete case (2-8a clause)
- Multiple countries/income sources
- Reassessment with tax status change

**Tier 4 - Insurance Agreements:**
- Complete insurance agreement workflow

## Test Statistics

- **17 test specifications** covering complex workflows
- **53 total commits** in project history
- **91 TypeScript files** (excluding node_modules)
- **33 documentation files** for comprehensive guides

---

# Part 7: GitHub Actions CI/CD

## Workflow Triggers

**Manual Trigger (workflow_dispatch):**
- Run from GitHub UI
- Specify image tags for testing
- Option to collect E2E code coverage

**Automatic Triggers (repository_dispatch):**
When any of these repositories push new Docker images, E2E tests run automatically:
- melosys-api-published
- faktureringskomponenten-published
- melosys-web-published
- melosys-trygdeavgift-beregning-published
- melosys-dokgen-published
- melosys-trygdeavtale-published
- melosys-inngangsvilkar-published
- melosys-eessi-published

## Workflow Steps

1. **Checkout** - Get test code
2. **Setup Node.js** - Install dependencies
3. **Cache Playwright** - Reuse browser binaries
4. **NAIS Login** - Authenticate to registry
5. **Determine Tags** - Parse which images to use
6. **Pre-pull Images** - Download all 17 images in parallel
7. **Start Services** - Docker Compose up
8. **Health Checks** - Verify all services ready
9. **Run Tests** - Execute Playwright suite
10. **Generate Summary** - Create markdown report
11. **Upload Artifacts** - Traces, videos, reports
12. **Capture Logs** - Complete Docker logs

## Test Summary Report

The custom reporter generates:

**Markdown Summary:**
- Test counts (passed, failed, flaky, known errors)
- Per-test Docker error categorization
- Image tags used
- Duration per test

**JSON Summary:**
- Machine-readable format
- CI status calculation (excludes @known-error from failures)
- Detailed test metadata

**Example Output:**
```
## Test Results

| Status | Count |
|--------|-------|
| Passed | 15 |
| Failed | 1 |
| Flaky | 1 |
| Known Error (Failed) | 2 |
| Known Error (Passed) | 1 |

### Failures
- should complete vedtak workflow - melosys-api: 3 SQL errors
```

## Analyzing GitHub Actions Runs

The melosys-e2e-playwright agent can analyze GitHub Actions workflow runs:

**Capabilities:**
1. **Download workflow runs** - Fetch run data from GitHub API
2. **Parse test results** - Extract pass/fail status
3. **Identify patterns** - Find flaky tests, common failures
4. **Docker log analysis** - Review service errors
5. **Metrics extraction** - Process coverage data

**Common Analysis Tasks:**
- Why did a specific test fail?
- What errors occurred in which service?
- Is this a new failure or a known issue?
- What changed between passing and failing runs?

---

# Part 8: Metrics Coverage Reporting

## How It Works

**Global Setup:**
1. Capture initial Prometheus metrics snapshot
2. Store metrics in test context

**Test Execution:**
1. Tests run and exercise various process types
2. Each process type increments a Prometheus counter

**Global Teardown:**
1. Capture final Prometheus metrics
2. Calculate deltas (what was triggered)
3. Generate coverage report

## Coverage Report Contents

**Summary Statistics:**
- Cases created during tests
- Treatments completed
- Process types exercised (count and percentage)
- Process steps exercised (count)

**Process Types Tracked (50+):**
- OPPRETT_SAK - Case creation
- OPPRETT_BEHANDLING - Treatment creation
- VEDTAK_MEDLEMSKAP_UNNTAK - Membership exception decisions
- LOVVALG_AVGJOERELSE - Legal choice determinations
- MOTTA_A001/A003/A009/A010 - EESSI message handling
- FERDIGSTILL_OPPGAVE - Task completion
- DISTRIBUER_BREV - Letter distribution
- And many more...

## Value for Test Planning

**Identify Coverage Gaps:**
- Which process types have 0 coverage?
- Which are exercised multiple times (good)?
- Where should new tests focus?

**Track Progress:**
- Coverage percentage increases over time
- New process types automatically detected
- Compare runs to see improvements

---

# Part 9: AI-Assisted Development

## Role of Claude Code

This entire testing infrastructure was built with Claude Code (Claude AI assistant). Here's how AI-assisted development accelerated the project:

**Architecture Decisions:**
- Recommended Actions/Assertions separation pattern
- Suggested fixture-based cleanup approach
- Designed metrics coverage tracking strategy

**Code Generation:**
- Generated Page Object Model implementations
- Created helper classes with TypeScript types
- Built GitHub Actions workflow from scratch

**Documentation:**
- Wrote CLAUDE.md for project guidance
- Created comprehensive guides (33 markdown files)
- Generated this presentation document

**Debugging:**
- Analyzed Docker log patterns
- Identified race conditions in tests
- Fixed flaky test issues

**Key Benefits:**
- Faster development (days instead of weeks)
- Consistent coding patterns
- Comprehensive documentation
- Knowledge transfer built-in

---

# Part 10: Results and Impact

## Quantitative Results

**Codebase Size:**
- 91 TypeScript files
- 19 Page Object implementations
- 9 helper classes (2,400+ lines)
- 17 test specifications
- 33 documentation files

**Infrastructure:**
- 17 Docker containers orchestrated
- 9 services monitored for errors
- 50+ business process types tracked
- 8 repositories with automatic triggers

**Test Capabilities:**
- Database verification (Oracle)
- Docker log monitoring
- Feature toggle control
- Prometheus metrics tracking
- E2E code coverage collection

## Qualitative Impact

**Developer Experience:**
- Page Objects make tests readable
- Helpers eliminate boilerplate
- Fixtures ensure test isolation
- Comprehensive debugging tools

**Quality Assurance:**
- Backend errors detected (not just UI)
- Async process completion verified
- Known bugs tracked without blocking CI
- Coverage gaps identified

**CI/CD Integration:**
- Automatic testing on image push
- Flexible image tag management
- Detailed reporting in GitHub
- Artifacts for debugging

## Future Enhancements

**Planned:**
- Test sharding for parallel execution
- Docker layer caching
- Slack notifications
- Scheduled nightly runs

**Potential:**
- Visual regression testing
- Performance benchmarking
- Multi-environment testing
- Production smoke tests

---

# Summary

## What We Built

A production-grade E2E testing infrastructure for a complex multi-service government system, featuring:

1. **Comprehensive Service Orchestration** - 17 Docker containers working together
2. **Intelligent Error Detection** - Docker log monitoring catches backend issues
3. **Business Process Tracking** - Prometheus metrics show what's tested
4. **Automatic Test Isolation** - Database, cache, and toggle cleanup
5. **Maintainable Test Code** - Page Object Model with 19 pages
6. **Rich Debugging Tools** - Traces, videos, screenshots, logs
7. **CI/CD Integration** - Automatic triggers from 8 source repositories
8. **AI-Assisted Development** - Claude Code accelerated development

## Key Takeaways

**For Test Engineers:**
- E2E tests can and should monitor more than just the UI
- Proper test isolation is essential for reliable tests
- Page Object Model with Actions/Assertions separation works well
- Metrics-based coverage helps prioritize test development

**For Development Teams:**
- AI-assisted development can significantly accelerate infrastructure projects
- Comprehensive documentation is achievable with AI help
- Automatic testing on image push catches issues early
- Known error tracking keeps CI green while acknowledging bugs

**For Organizations:**
- Quality infrastructure requires investment
- The ROI comes from catching bugs before production
- Proper tooling makes testing sustainable
- AI assistants can multiply developer productivity

---

# Appendix: Quick Reference

## Running Tests Locally

```bash
# Start infrastructure
cd ../melosys-docker-compose
make start-all

# Run all tests
npm test

# Run specific test
npm test tests/core/oppgaver.spec.ts

# Interactive UI mode
npm run test:ui
```

## GitHub Actions

```bash
# View recent runs
gh run list --repo navikt/melosys-e2e-tests

# Download artifacts
gh run download <run-id> -n playwright-results
gh run download <run-id> -n playwright-traces

# View trace
npx playwright show-trace trace.zip
```

## Key Files

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Playwright configuration |
| `fixtures/index.ts` | Main test fixture |
| `fixtures/cleanup.ts` | Database/mock cleanup |
| `fixtures/docker-logs.ts` | Docker log monitoring |
| `reporters/test-summary.ts` | Custom reporter |
| `pages/shared/base.page.ts` | POM base class |
| `.github/workflows/e2e-tests.yml` | CI/CD workflow |

## Documentation

| Guide | Location |
|-------|----------|
| Project Overview | CLAUDE.md |
| Quick Start | QUICK-START.md |
| Fixtures | docs/guides/FIXTURES.md |
| Helpers | docs/guides/HELPERS.md |
| POM Pattern | docs/pom/MIGRATION-PLAN.md |
| GitHub Actions | docs/ci-cd/GITHUB-ACTIONS.md |
| Troubleshooting | docs/guides/TROUBLESHOOTING.md |

---

# Contact

**Team**: Team Melosys
**Platform**: NAIS (nav.no Kubernetes)
**Repository**: navikt/melosys-e2e-tests
