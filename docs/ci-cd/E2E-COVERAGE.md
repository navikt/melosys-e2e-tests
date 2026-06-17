# E2E Code Coverage

This document explains how E2E code coverage is collected for melosys-api and provides recommendations for future improvements.

## Overview

E2E (End-to-End) tests in this repository exercise the full application stack through the UI, which means they also execute backend code in melosys-api. By instrumenting melosys-api with JaCoCo during test runs, we can measure which parts of the backend codebase are covered by E2E tests vs unit/integration tests.

**Key Benefits:**
- **Identify gaps**: See which modules/classes are never exercised by E2E tests
- **Validate critical paths**: Ensure user workflows test important business logic
- **Complement unit tests**: E2E coverage shows REAL user scenarios, not isolated unit tests
- **Guide test writing**: Focus new E2E tests on uncovered modules

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ GitHub Actions Workflow (workflow_dispatch only)           │
├─────────────────────────────────────────────────────────────┤
│ 1. Download JaCoCo agent (jacocoagent.jar + jacococli.jar) │
│ 2. Checkout melosys-api source code                        │
│ 3. Build melosys-api (mvn package) → get .class files      │
│ 4. Start melosys-api with JaCoCo agent via Docker         │
│    JACOCO_AGENT_OPTS=-javaagent:/jacoco/jacocoagent.jar   │
│ 5. Run Playwright E2E tests → exercises melosys-api        │
│ 6. Dump coverage data (jacococli.jar dump)                 │
│ 7. Generate reports (mvn jacoco:report)                    │
│ 8. Display summary in GitHub Step Summary                  │
└─────────────────────────────────────────────────────────────┘
```

### Components

1. **JaCoCo Agent** (`jacocoagent.jar`)
   - Java agent that instruments classes at runtime
   - Tracks which lines/branches are executed
   - Runs in melosys-api JVM via `-javaagent` flag
   - Exposes coverage data via TCP server (port 6300)

2. **JaCoCo CLI** (`jacococli.jar`)
   - Command-line tool for dumping and reporting
   - Dumps coverage from running JVM to `.exec` file
   - No need to restart melosys-api to collect data

3. **Maven JaCoCo Plugin**
   - Generates HTML/CSV/XML reports from `.exec` file
   - Requires compiled `.class` files (from build step)
   - Produces reports per module in `target/site/jacoco/`

4. **Docker Volume Mount**
   - `./jacoco:/jacoco:ro` - mounts JaCoCo agent into container
   - Read-only mount (security best practice)
   - Only exists when coverage is enabled

### Workflow Steps

#### 1. Setup (Only on Manual Runs)
```yaml
- name: Download JaCoCo agent for E2E coverage
  if: github.event_name == 'workflow_dispatch'
  run: |
    curl -L https://repo1.maven.org/maven2/org/jacoco/jacoco/0.8.14/jacoco-0.8.14.zip -o jacoco.zip
    unzip -q jacoco.zip -d jacoco-temp
    cp jacoco-temp/lib/jacocoagent.jar jacoco/
    cp jacoco-temp/lib/jacococli.jar jacoco/
```

#### 2. Build melosys-api
```yaml
- name: Checkout melosys-api for coverage report generation
  if: github.event_name == 'workflow_dispatch'
  uses: actions/checkout@v4
  with:
    repository: navikt/melosys-api

- name: Build melosys-api for coverage class files
  if: github.event_name == 'workflow_dispatch'
  run: mvn clean package -DskipTests
```

**Why build melosys-api?**
- JaCoCo report generation needs compiled `.class` files
- Docker image contains only the JAR (classes are bundled inside)
- Building from source gives us access to individual class files

#### 3. Start with Coverage Enabled
```yaml
- name: Start Docker Compose services
  env:
    JACOCO_AGENT_OPTS: ${{ github.event_name == 'workflow_dispatch' &&
      '-javaagent:/jacoco/jacocoagent.jar=output=tcpserver,address=*,port=6300' || '' }}
```

**Key points:**
- Only sets `JACOCO_AGENT_OPTS` on manual runs
- Automatic runs (repository_dispatch) have empty value → no overhead
- TCP server allows dumping without restarting melosys-api

#### 4. Collect and Report
```yaml
- name: Dump JaCoCo coverage from melosys-api
  if: always() && github.event_name == 'workflow_dispatch'
  run: |
    java -jar jacoco/jacococli.jar dump \
      --address localhost \
      --port 6300 \
      --destfile e2e-coverage.exec

- name: Generate E2E coverage reports
  if: always() && github.event_name == 'workflow_dispatch'
  run: |
    EXEC_FILE="$(pwd)/e2e-coverage.exec"
    cd melosys-api
    mvn jacoco:report -Djacoco.dataFile="$EXEC_FILE" -B
```

**Why absolute path?**
- Maven reactor processes multiple modules
- Each module needs to find the same `.exec` file
- Relative paths break when cd'ing into modules

#### 5. Display Summary
```yaml
# Inside "Generate test summary" step, after Docker Log Analysis
if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
  echo "## 📊 E2E Coverage per Module" >> $GITHUB_STEP_SUMMARY
  # ... iterate through all modules, show coverage ...
fi
```

**Summary shows:**
- ALL modules (not just those with coverage)
- Modules with 0% coverage (not exercised by E2E tests)
- Total coverage across all modules
- Appears after Docker Log Analysis section

## Current Configuration

### When Coverage Runs
- ✅ **Manual runs** (`workflow_dispatch`) - Coverage enabled
- ❌ **Automatic runs** (`repository_dispatch`) - Coverage disabled

### Why Not Always Run?

**Performance Impact:**
1. Download JaCoCo (~2.5 MB): +5s
2. Checkout melosys-api: +3s
3. Set up JDK 21 (Temurin) + restore Maven cache: +5-15s
4. Build melosys-api: ~4 min (warm Maven cache) / ~11 min (cold cache)
5. Runtime overhead: ~5-10% slower execution
6. Generate reports: +15-30s

**Total overhead: ~5 minutes warm, ~12 minutes cold.** Because of this, the job
`timeout-minutes` is raised to **120 min** when `collect_coverage=true` (normal
runs keep the tight 60-min ceiling). The melosys-api build uses **JDK 21** — the
project moved to Java 21 / Spring Boot 4, and building on the runner default JDK
17 fails maven-enforcer. The build step is `continue-on-error`, so if it ever
breaks again the test suite still runs (only the `jacoco:report` is lost) rather
than the whole run being skipped.

For automatic runs triggered by every melosys-api/melosys-web push, this adds unnecessary CI time. Coverage is more useful for manual validation runs.

## Usage

### Running with Coverage

1. **Manual trigger:**
   - Go to Actions → E2E Tests
   - Click "Run workflow"
   - Select branch
   - Click "Run workflow"

2. **View results:**
   - Check "🎭 Playwright Test Results" section
   - Scroll to "📊 E2E Coverage per Module" (after Docker logs)
   - Download `e2e-coverage-report` artifact for HTML reports

### Example Output

Real numbers from a full-suite run against `latest` (run 27495344776, 2026-06-14):

```markdown
## 📊 E2E Coverage per Module

Module              | Lines   | Branches | Methods
--------------------|---------|----------|--------
app                 | 33.3%   | 19.0%    | 45.0%
config              | 53.6%   | 27.1%    | 53.3%
domain              | 63.8%   | 35.4%    | 60.1%
feil                | 30.4%   | N/A      | 36.0%
frontend-api        | 61.6%   | 41.1%    | 63.6%
integrasjon         | 69.8%   | 34.1%    | 65.2%
repository          | 45.8%   | 32.1%    | 33.3%
saksflyt            | 62.8%   | 41.3%    | 62.0%
saksflyt-api        | 72.7%   | 55.5%    | 46.5%
service             | 59.9%   | 38.0%    | 60.2%
sikkerhet           | 76.6%   | 56.2%    | 75.7%
soknad-altinn       | 0.0%    | 0.0%     | 0.0%
statistikk          | 75.8%   | 54.8%    | 84.6%
**TOTAL**           | **62.0%** | **38.0%** | **59.8%**
```

**Interpretation:**
- ~62% line coverage overall (24 306 / 39 175 lines); 12 of 13 modules covered
- The suite exercises the full stack: `frontend-api` → `service`/`saksflyt` → `domain`/`repository`
- Only true gap: **`soknad-altinn` at 0%** — the digital Altinn form-intake path isn't driven by the UI E2E tests (separate ingress, expected)
- `app` (33%) and `feil` (30%) are low — bootstrap/wiring and error-handling branches, also expected for UI-driven E2E

> Historical note: an earlier version of this doc showed ~41.8% with most modules
> at 0%. That reflected a period when the coverage report was effectively broken
> (the melosys-api build failed, so most classes never made it into the report).
> The numbers above are the healthy, working state.

## Configuration Options

### Option 1: Add Workflow Input (Recommended)

Allow users to choose whether to collect coverage on manual runs:

```yaml
on:
  workflow_dispatch:
    inputs:
      collect_coverage:
        description: 'Collect E2E code coverage'
        required: false
        type: boolean
        default: false  # or true if you want it on by default
```

Then update conditions:
```yaml
if: github.event_name == 'workflow_dispatch' && inputs.collect_coverage == 'true'
```

**Pros:**
- Users control when coverage runs
- Fast test runs when coverage not needed
- Single workflow handles both cases

**Cons:**
- Extra click to enable coverage
- Users might forget to enable it

### Option 2: Separate Workflow

Create `.github/workflows/e2e-tests-with-coverage.yml`:

```yaml
name: E2E Tests with Coverage

on:
  workflow_dispatch:
  schedule:
    - cron: '0 2 * * 1'  # Weekly on Mondays at 2 AM

jobs:
  e2e-with-coverage:
    # ... coverage collection steps ...
```

Keep existing workflow for fast test runs without coverage.

**Pros:**
- Clear separation of concerns
- Fast workflow stays fast
- Coverage workflow can run on schedule
- Easier to understand purpose of each workflow

**Cons:**
- Duplicate code between workflows
- Need to keep both in sync

### Option 3: Reusable Workflow

Create `.github/workflows/reusable-e2e-tests.yml`:

```yaml
name: Reusable E2E Tests

on:
  workflow_call:
    inputs:
      collect_coverage:
        required: true
        type: boolean
```

Then create two caller workflows:

**`.github/workflows/e2e-tests.yml`** (fast):
```yaml
jobs:
  run-tests:
    uses: ./.github/workflows/reusable-e2e-tests.yml
    with:
      collect_coverage: false
```

**`.github/workflows/e2e-tests-coverage.yml`** (with coverage):
```yaml
jobs:
  run-tests:
    uses: ./.github/workflows/reusable-e2e-tests.yml
    with:
      collect_coverage: true
```

**Pros:**
- DRY (Don't Repeat Yourself)
- Single source of truth
- Easy to add more variations (e.g., smoke tests only)

**Cons:**
- More complex workflow structure
- Harder to debug (steps in separate file)
- GitHub Actions reusable workflows have limitations

## Recommendations

### Short Term (Do Now)

**1. Add workflow input for coverage control:**

```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Image tag for melosys-api (other services use latest)'
        required: true
        default: 'latest'
      collect_coverage:  # ADD THIS
        description: 'Collect E2E code coverage (adds ~4 min)'
        required: false
        type: boolean
        default: false
```

Update all coverage step conditions:
```yaml
if: github.event_name == 'workflow_dispatch' && inputs.collect_coverage
```

**Why:**
- Gives users control
- No duplicate workflows
- Easy to implement (~5 min)

**2. Document coverage insights:**

Create a monthly ticket to review E2E coverage and identify:
- Modules with 0% E2E coverage (should they be tested?)
- Critical paths not covered by E2E tests
- Opportunities to increase coverage

### Medium Term (Next Quarter)

**1. Create scheduled coverage workflow:**

```yaml
name: Weekly E2E Coverage Report

on:
  schedule:
    - cron: '0 3 * * 1'  # Mondays at 3 AM
  workflow_dispatch:

jobs:
  coverage:
    # ... collect coverage and post to Slack/Teams ...
```

**Why:**
- Regular visibility into coverage trends
- No manual triggering needed
- Can track coverage over time

**2. Add coverage trend tracking:**

Store coverage data in GitHub Pages or external dashboard:
- Track coverage % over time
- Alert on coverage drops
- Identify modules gaining/losing coverage

### Long Term (Future)

**1. Merge E2E and unit test coverage:**

Currently melosys-api has unit test coverage and we have E2E coverage separately. Consider:
- Merging `.exec` files (JaCoCo supports this)
- Combined report showing both unit + E2E coverage
- Identify code only tested by E2E (risky if E2E breaks)

**2. Coverage-driven test prioritization:**

Use coverage data to:
- Prioritize E2E tests that cover critical uncovered code
- Skip E2E tests that duplicate unit test coverage
- Focus on integration points (service → repository)

**3. Differential coverage:**

Show coverage only for changed files in PRs:
- "This PR is covered 78% by E2E tests"
- Require minimum E2E coverage for new features
- Block PRs with no E2E coverage for UI changes

## Troubleshooting

### "Skipping JaCoCo execution due to missing execution data file"

**Problem:** JaCoCo can't find the `.exec` file.

**Solution:**
- Ensure absolute path is used: `EXEC_FILE="$(pwd)/e2e-coverage.exec"`
- Check file exists: `ls -lh e2e-coverage.exec`
- Verify dump succeeded (check "Dump JaCoCo coverage" step output)

### "No CSV files found"

**Problem:** Reports weren't generated.

**Solution:**
- Check melosys-api build succeeded
- Verify Maven JaCoCo plugin is configured in pom.xml
- Look for Maven errors in "Generate E2E coverage reports" step

### Coverage shows 0% for all modules

**Problem:** No coverage data was collected.

**Solution:**
- Check `JACOCO_AGENT_OPTS` was set (should see in Docker logs)
- Verify JaCoCo agent loaded: `docker logs melosys-api | grep jacoco`
- Ensure port 6300 is exposed in docker-compose.yml
- Check dump didn't timeout (melosys-api must be running)

### Coverage much lower than expected

**Problem:** Expected higher coverage.

**Reality check:**
- E2E tests only exercise UI-triggered code paths
- Background jobs, scheduled tasks → not covered
- Admin endpoints, internal APIs → not covered
- Error handling, edge cases → often not covered

**This is normal!** E2E coverage supplements unit tests, not replaces them.

## Files Modified

### Workflow Changes
- `.github/workflows/e2e-tests.yml` - Main workflow with coverage collection

### Docker Compose Changes
- `docker-compose.yml`:
  - Added `./jacoco:/jacoco:ro` volume mount
  - Added `JACOCO_AGENT_OPTS` environment variable
  - Exposed port `6300:6300` for JaCoCo TCP server

### Documentation
- `docs/ci-cd/E2E-COVERAGE.md` - This document
- `CLAUDE.md` - Updated to clarify docker-compose usage

## References

- [JaCoCo Documentation](https://www.jacoco.org/jacoco/trunk/doc/)
- [JaCoCo Maven Plugin](https://www.jacoco.org/jacoco/trunk/doc/maven.html)
- [GitHub Actions: Reusable Workflows](https://docs.github.com/en/actions/using-workflows/reusing-workflows)
- [madrapps/jacoco-report Action](https://github.com/marketplace/actions/jacoco-report)

## Questions?

- **Why not collect coverage on every run?** Performance overhead (~4-5 min) adds up on frequent runs
- **Why build melosys-api from source?** JaCoCo needs `.class` files, Docker image only has JAR
- **Why TCP server instead of file output?** Can dump without restarting melosys-api
- **Why show 0% modules?** Highlights gaps, shows which modules E2E tests ignore
- **Can we use this locally?** Yes! See CLAUDE.md for local setup instructions
