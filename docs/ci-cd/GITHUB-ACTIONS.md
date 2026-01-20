# GitHub Actions CI/CD Guide

Complete guide for running E2E tests in GitHub Actions with Docker Compose stack.

---

## Quick Start

### Running Tests

**From GitHub UI:**
1. Go to **Actions** tab
2. Select **E2E Tests** workflow
3. Click **Run workflow** button
4. Select branch (usually `main`)
5. Click **Run workflow**

**View Results:**
- **Summary** - Test counts, Docker log analysis (on summary page)
- **Test artifacts** - Download `playwright-results`, `playwright-videos`, `playwright-traces`
- **Annotations** - Failed tests shown inline in workflow view

**Automatic Triggers:**

The workflow can also be **automatically triggered** when source repositories push new Docker images:

- When `melosys-api` pushes a new image → E2E tests run automatically
- When `faktureringskomponenten` pushes a new image → E2E tests run automatically
- And more...

See [Repository Dispatch Trigger Guide](./REPOSITORY-DISPATCH-TRIGGER.md) for setup instructions.

---

## Running Selected Tests (Race Condition Testing)

For debugging race conditions or running specific tests multiple times, use the `test_grep` and `repeat_each` inputs.

### Workflow Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `environment` | Image tags for services | `latest` |
| `collect_coverage` | Collect E2E code coverage | `false` |
| `test_grep` | Filter tests by pattern (name, file, or tag) | `` (all tests) |
| `repeat_each` | Run each test N times | `1` |
| `disable_retries` | Disable test retries (for accurate race condition detection) | `false` |

### Using GitHub CLI (`gh`)

The `gh` CLI offers the same capabilities as the web UI, plus scriptability:

```bash
# Run specific test 10 times (for race condition testing)
gh workflow run e2e-tests.yml -f test_grep="step-transition" -f repeat_each=10

# Run all @smoke tagged tests 5 times
gh workflow run e2e-tests.yml -f test_grep="@smoke" -f repeat_each=5

# Run specific file 20 times
gh workflow run e2e-tests.yml -f test_grep="arbeid-flere-land" -f repeat_each=20

# Combine with environment selection
gh workflow run e2e-tests.yml \
  -f environment="melosys-api:feature-branch" \
  -f test_grep="step-transition" \
  -f repeat_each=15

# Race condition testing (no retries = accurate failure count)
gh workflow run e2e-tests.yml \
  -f test_grep="step-transition" \
  -f repeat_each=10 \
  -f disable_retries=true
```

### Using Web UI

1. Go to **Actions** → **E2E Tests** → **Run workflow**
2. Fill in **test_grep**: `step-transition` (or your pattern)
3. Fill in **repeat_each**: `10` (number of times to run each test)
4. Click **Run workflow**

### Intensive Race Condition Testing

For intensive testing, run multiple workflows in sequence:

```bash
# Run 5 separate workflow runs, each running tests 10 times
for i in {1..5}; do
  echo "Starting workflow run $i..."
  gh workflow run e2e-tests.yml -f test_grep="step-transition" -f repeat_each=10
  sleep 30  # Avoid rate limiting
done
```

### Pattern Examples

| Pattern | What it matches |
|---------|-----------------|
| `step-transition` | Tests with "step-transition" in name |
| `arbeid-flere-land` | Tests in arbeid-flere-land.spec.ts |
| `@smoke` | Tests tagged with @smoke |
| `@known-error` | Tests tagged with @known-error |
| `should complete` | Tests with "should complete" in name |

---

## Automatic Triggers (repository_dispatch)

### Overview

Source repositories (like `melosys-api`, `faktureringskomponenten`) can automatically trigger E2E tests when they push new Docker images to GCP Artifact Registry.

**How it works:**
1. Source repo builds and pushes Docker image
2. Source repo sends trigger to this E2E workflow
3. E2E tests run with the newly pushed image
4. Results are reported

**Supported triggers:**
- `melosys-api-published`
- `faktureringskomponenten-published`
- `melosys-web-published`
- `melosys-trygdeavgift-beregning-published`
- `melosys-dokgen-published`
- `melosys-trygdeavtale-published`

### Example Workflow Trigger

From `melosys-api` build workflow:

```yaml
- name: Trigger E2E tests
  if: github.ref == 'refs/heads/main'
  uses: peter-evans/repository-dispatch@v4
  with:
    token: ${{ secrets.E2E_TRIGGER_PAT }}
    repository: navikt/melosys-e2e-tests
    event-type: melosys-api-published
    client-payload: |
      {
        "repository": "melosys-api",
        "image_tag": "${{ github.sha }}",
        "commit_sha": "${{ github.sha }}",
        "actor": "${{ github.actor }}"
      }
```

### Workflow Logs

When triggered by `repository_dispatch`, the workflow logs show:

```
🔔 Triggered by repository_dispatch event
📦 Event type: melosys-api-published
📌 Source repository: melosys-api
🏷️  Image tag: abc123def456
📝 Commit: abc123def456
👤 Actor: username

📋 Image tags to be used:
  melosys-api: abc123def456
  faktureringskomponenten: latest
```

### Setup Guide

**For source repositories:**

See complete setup guide: [Repository Dispatch Trigger Guide](./REPOSITORY-DISPATCH-TRIGGER.md)

**Quick steps:**
1. Create Personal Access Token (PAT) - See [PAT Setup Guide](./PAT-SETUP.md)
2. Add PAT secret to source repo
3. Add trigger step to source repo's build workflow
4. Test trigger

---

## Workflow Configuration

**File**: `.github/workflows/e2e-tests.yml`

### Key Features

```yaml
on:
  workflow_dispatch:  # Manual trigger only

jobs:
  e2e-tests:
    runs-on: ubuntu-latest-8-cores  # 8-core runner for performance
    timeout-minutes: 45  # Timeout for large stack
```

### What the Workflow Does

1. **Setup** - Node.js 20, npm dependencies, Playwright browsers
2. **Login** - NAIS registry authentication
3. **Pre-pull images** - All 15 Docker images in parallel (faster startup)
4. **Start services** - Docker Compose with 17 containers
5. **Health checks** - Verify Kafka, melosys-api, melosys-web are ready
6. **Run tests** - Execute Playwright tests
7. **Generate summary** - Test results and Docker log analysis
8. **Upload artifacts** - Traces, videos, HTML report

---

## Test Results Summary

When you open a workflow run, the summary page automatically shows:

### 🎭 Playwright Test Results

**Table with:**
- Total tests run
- Passed/Failed counts
- Failed test names (if any)
- Link to download full HTML report

**Example:**
```
| Metric | Count |
|--------|-------|
| Total  | 3     |
| Passed | 2     |
| Failed | 1     |

Failed tests:
- should complete entire workflow from oppgave to vedtak
```

### 🐳 Docker Log Analysis

**Shows:**
- Time window checked (entire test run duration)
- ERROR and WARN counts per service
- All monitored services in a table format
- Expandable error/warning samples grouped by service

**Monitored Services:**
- melosys-api, melosys-web, melosys-mock, melosys-eessi
- faktureringskomponenten, melosys-dokgen
- melosys-trygdeavgift-beregning, melosys-trygdeavtale, melosys-inngangsvilkar

**Example service table:**
```
| Service | Errors | Warnings |
|---------|--------|----------|
| ❌ melosys-api | 3 | 1 |
| ✅ melosys-web | 0 | 0 |
| ⚠️ melosys-eessi | 0 | 2 |
```

**Example expandable error section:**
```
🐳 melosys-api (4 error/warning lines)
  [18:45:27.362] ORA-00942: tabellen eller utsnittet finnes ikke
  [18:45:28.123] SQL Error: 942, SQLState: 42000
```

**Click to expand each service and view error details with clean formatting (ANSI codes removed)!**

---

## Architecture

### Services Stack (17 containers)

**Frontend:**
- melosys-web (port 3000)

**Backend:**
- melosys-api (port 8080)
- faktureringskomponenten (port 8084)
- melosys-dokgen (port 8888)
- melosys-trygdeavgift-beregning (port 8095)
- melosys-trygdeavtale (port 8088)
- felles-kodeverk (port 8050)

**Databases:**
- Oracle (port 1521)
- PostgreSQL (port 5432)
- PostgreSQL Felles-kodeverk (port 5433)

**Messaging:**
- Kafka (ports 9092, 29092)
- Zookeeper (port 2181)

**Mock Services:**
- mock-oauth2-server (ISSO) (port 8082)
- mock-oauth2-server (STS) (port 8086)
- melosys-mock (ports 8083, 8389)

### Key Metrics

- **Workflow timeout**: 45 minutes
- **Runner**: ubuntu-latest-8-cores (paid)
- **Images**: 15 (9 NAIS custom + 6 base)
- **Average run time**: 15-20 minutes
- **Pre-pull time**: ~5 minutes
- **Startup time**: ~5 minutes
- **Test execution**: ~5 minutes

---

## Multi-Architecture Docker Images

### Why Multi-Arch?

GitHub Actions runs on **AMD64** (Intel) architecture, while local Mac development uses **ARM64** (Apple Silicon). All custom images must support both architectures.

### Affected Images

These NAIS custom images have been rebuilt with multi-arch support:

1. **postgres-felleskodeverk-prepopulated**
2. **felles-kodeverk**
3. **melosys-mock**

### How to Rebuild

#### Prerequisites (one-time setup)

```bash
# 1. Enable Docker BuildX
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap

# 2. Login to NAIS registry
nais login --team teammelosys
# Or: docker login europe-north1-docker.pkg.dev
```

#### Rebuild Process

**Manual rebuild:**

```bash
cd /Users/rune/source/nav/melosys-docker-compose/<service-directory>

docker buildx build --platform linux/amd64,linux/arm64 \
  -t europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/<IMAGE_NAME>:latest \
  --push .
```

**Example for all custom images:**

```bash
# postgres-felleskodeverk-prepopulated
cd postgres-felleskodeverk-prepopulated
docker buildx build --platform linux/amd64,linux/arm64 \
  -t europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/postgres-felleskodeverk-prepopulated:latest \
  --push .

# felles-kodeverk
cd ../felles-kodeverk
docker buildx build --platform linux/amd64,linux/arm64 \
  -t europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/felles-kodeverk:latest \
  --push .

# melosys-mock
cd ../mock
docker buildx build --platform linux/amd64,linux/arm64 \
  -t europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/melosys-mock:latest \
  --push .
```

#### Verification

Check image has both architectures:

```bash
docker manifest inspect europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/<IMAGE_NAME>:latest | grep -A3 "platform"
```

**Expected output:**
```json
"platform": {
  "architecture": "amd64",
  "os": "linux"
}
...
"platform": {
  "architecture": "arm64",
  "os": "linux"
}
```

---

## Health Checks

The workflow verifies services are ready before running tests:

### Services Checked

1. **Kafka** - Docker health status via `docker inspect`
2. **melosys-api** - `/internal/health` endpoint responds with 200
3. **melosys-web** - Homepage accessible at `http://localhost:3000/melosys/`

### How It Works

```bash
# Retries up to 60 times (10 minutes)
# Checks every 10 seconds
# Waits 10 extra seconds after all healthy for stabilization
```

**Success output:**
```
⏳ Health check attempt 5/60
  Kafka: healthy
  melosys-api: healthy
  melosys-web: healthy
✅ All critical services are healthy!
⏳ Waiting 10 seconds for services to fully stabilize...
✅ Ready to run tests!
```

**Failure output:**
```
❌ Services failed to start within timeout
📋 Docker compose status:
[shows container status]
📋 Docker compose logs (last 100 lines per service):
[shows logs]
```

This prevents tests from running before backend is ready, reducing flakiness.

---

## Optimization Strategies

### 1. Pre-pull Images in Parallel

All 15 images are downloaded simultaneously (not sequentially):

```yaml
- name: Pre-pull Docker images in parallel
  run: |
    docker pull --platform linux/amd64 image1:latest &
    docker pull --platform linux/amd64 image2:latest &
    docker pull --platform linux/amd64 image3:latest &
    # ... (15 images total)
    wait
```

**Benefits:**
- 5x faster than sequential pulls
- Explicit platform selection ensures correct architecture
- Better error messages if image missing

### 2. Platform Specification

All services in `docker-compose.yml` specify platform:

```yaml
services:
  melosys-api:
    platform: linux/amd64
    image: europe-north1-docker.pkg.dev/.../melosys-api:latest
```

**Prevents:** "no matching manifest" errors

### 3. 8-Core Runner

Uses `ubuntu-latest-8-cores` for faster execution:

- **Standard runner**: 2 cores, ~25-30 min
- **8-core runner**: 8 cores, ~15-20 min
- **Cost**: Higher (uses more GitHub Actions minutes)

**Cost optimization:** Use standard runner for development branches, 8-core for main.

---

## Troubleshooting

### Issue: "no matching manifest for linux/amd64"

**Cause**: Image only built for ARM64 (Mac)

**Solution**: Rebuild image with `--platform linux/amd64,linux/arm64`

### Issue: Docker Compose fails with "path not found"

**Cause**: Using `build:` instead of `image:` or missing volume mount

**Solution**:
- Change `build:` to `image:` for pre-built images
- Ensure volume mount paths exist or remove them

**Example fix:**
```yaml
# ❌ Wrong
melosys-mock:
  build: europe-north1-docker.pkg.dev/.../melosys-mock:latest
  volumes:
    - ./local-only-path:/files

# ✅ Correct
melosys-mock:
  platform: linux/amd64
  image: europe-north1-docker.pkg.dev/.../melosys-mock:latest
  # Volume removed - not needed in CI
```

### Issue: Services timeout during startup

**Cause**: Insufficient resources or slow image pulls

**Solutions**:
- Use `ubuntu-latest-8-cores` runner
- Pre-pull images in parallel
- Increase timeout to 45 minutes

### Issue: Tests not found

**Cause**: Test pattern doesn't match full test path

**Solution**: Use file name instead of test name:
```bash
# ❌ Doesn't work in CI
npx playwright test "should complete workflow"

# ✅ Works
npx playwright test example-workflow.spec.ts
```

### Issue: Services show "health: starting"

**Cause**: Tests start before backend fully ready

**Solution**: Enhanced health check verifies:
1. Kafka health status
2. melosys-api endpoint responds
3. melosys-web accessible
4. 10-second stabilization delay

**Debug commands:**
```bash
# Check service health
docker compose ps

# Check specific service
docker inspect --format='{{.State.Health.Status}}' kafka

# Test API endpoint
curl http://localhost:8080/internal/health
```

### Issue: High costs from 8-core runner

**Solution**: Use conditional runners:

```yaml
jobs:
  e2e-tests:
    runs-on: ${{ github.ref == 'refs/heads/main' && 'ubuntu-latest-8-cores' || 'ubuntu-latest' }}
```

---

## Downloading Artifacts

### Using GitHub UI

1. Go to workflow run
2. Scroll to bottom
3. Click artifact name to download

### Using GitHub CLI

```bash
# List artifacts
gh run list --repo navikt/melosys-e2e-tests

# Download specific artifact
gh run download <run-id> -n playwright-traces
gh run download <run-id> -n playwright-videos
gh run download <run-id> -n playwright-results

# View trace locally
npx playwright show-trace trace.zip
```

---

## Per-Test Docker Log Checking

Tests automatically check Docker logs after each test execution.

### How It Works

**File**: `fixtures/docker-logs.ts`

1. **Before test** - Record start timestamp
2. **Test runs** - Normal execution
3. **After test** - Check logs from start time to now
4. **Report errors** - Categorize by type (SQL, Connection, Other)

### Console Output

**Success:**
```
🔍 Checking docker logs for errors during: should create new behandling
✅ No docker errors during test
```

**Errors found:**
```
🔍 Checking docker logs for errors during: should create new behandling

⚠️  Found 3 error(s) in melosys-api logs:

📊 SQL Errors (2):
  [18:45:27.362] ORA-00942: tabellen eller utsnittet finnes ikke...

🔌 Connection Errors (1):
  [18:45:30.005] HikariPool-1 - Exception during pool initialization...

💡 To see full logs, run: docker logs melosys-api
```

### HTML Report Integration

Docker errors are attached to each test result:

1. Download `playwright-results` artifact
2. Open `playwright-report/index.html`
3. Click on any test
4. View "docker-logs-errors" attachment

---

## Cost Considerations

### Runner Costs

**ubuntu-latest-8-cores** is a paid runner (higher GitHub Actions minutes consumption)

**Average costs:**
- Standard runner: ~25-30 min/run
- 8-core runner: ~15-20 min/run (but higher $/min)

### Optimization Options

**1. Conditional runs:**
```yaml
on:
  workflow_dispatch:  # Manual only
  push:
    branches:
      - main  # Only on main branch
```

**2. Conditional runner:**
```yaml
runs-on: ${{ github.ref == 'refs/heads/main' && 'ubuntu-latest-8-cores' || 'ubuntu-latest' }}
```

**3. Test sharding:**
```yaml
strategy:
  matrix:
    shardIndex: [1, 2, 3, 4]
    shardTotal: [4]
```

Split tests across 4 parallel jobs (4x faster, but 4x cost).

---

## Future Improvements

### Recommended Enhancements

**1. Test Sharding**
```yaml
strategy:
  matrix:
    shardIndex: [1, 2, 3, 4]
    shardTotal: [4]
```

**2. Docker Layer Caching**
```yaml
- name: Cache Docker layers
  uses: actions/cache@v3
  with:
    path: /tmp/.buildx-cache
    key: ${{ runner.os }}-buildx-${{ github.sha }}
```

**3. PR Comments**
Post test results as PR comments automatically

**4. Slack Notifications**
Notify team of test failures

**5. Scheduled Runs**
Run nightly to catch issues early

**6. Automatic Image Rebuilds**
Trigger E2E tests when new images are built:
```yaml
on:
  workflow_run:
    workflows: ["Build melosys-api", "Build melosys-web"]
    types: [completed]
```

---

## Files Structure

### GitHub Actions
```
.github/workflows/
└── e2e-tests.yml  # Main workflow
```

### Scripts (in this repo)
```
scripts/
└── kafka-entrypoint.sh  # Kafka startup with Zookeeper wait

felles-kodeverk/
└── felles-kodeverk-entrypoint.sh  # Felles-kodeverk startup
```

### Docker Compose (sibling repo)
```
melosys-docker-compose/
├── docker-compose.yml  # Service definitions
├── postgres-felleskodeverk-prepopulated/
│   ├── Dockerfile
│   └── dump.sql
├── felles-kodeverk/
│   └── Dockerfile
└── mock/
    └── Dockerfile
```

---

## Summary

### What We Achieved

✅ E2E tests running in GitHub Actions
✅ Multi-architecture Docker image support
✅ Robust pre-pulling and startup logic
✅ 17 services successfully orchestrated
✅ Full Playwright test execution with traces/videos
✅ Automatic test result summaries
✅ Per-test Docker log checking
✅ Manual workflow triggering for controlled testing

### Key Benefits

- **Visible results** - Test summary and Docker logs in workflow page
- **No downloads needed** - See results immediately
- **Per-test errors** - Correlate Docker errors with specific tests
- **Comprehensive artifacts** - Traces, videos, HTML report
- **Fast execution** - Parallel image pulls, 8-core runner
- **Reliable startup** - Health checks prevent flaky tests

### Repository Locations

- **E2E Tests**: `navikt/melosys-e2e-tests`
- **Docker Compose**: `melosys-docker-compose` (sibling directory)
- **NAIS Registry**: `europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/`

---

## Related Documentation

- **Fixtures Guide**: `docs/guides/FIXTURES.md` - Automatic cleanup and Docker log checking
- **Helpers Guide**: `docs/guides/HELPERS.md` - Test helper utilities
- **Troubleshooting Guide**: `docs/guides/TROUBLESHOOTING.md` - Common issues and solutions
- **POM Guide**: `docs/pom/QUICK-START.md` - Page Object Model usage
