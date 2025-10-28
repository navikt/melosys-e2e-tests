# GitHub Actions E2E Tests Setup Report

## Overview

This document details the complete setup of GitHub Actions for running Melosys E2E tests, including all issues encountered and how they were resolved.

## Problem Statement

We needed to run Playwright E2E tests in GitHub Actions with a full Docker Compose stack (15+ services). The main challenges were:

1. **Platform Architecture Mismatch** - Images built locally on Mac (ARM64) didn't work on GitHub Actions runners (AMD64)
2. **Resource Constraints** - Multiple large Docker images needed to be pulled and started simultaneously
3. **Missing Dependencies** - Local file mounts and scripts that worked locally weren't available in CI
4. **Test Discovery** - Playwright test pattern matching needed adjustment for CI

## Solution Summary

✅ **Result**: E2E tests now run successfully in GitHub Actions with manual triggering (`workflow_dispatch`)

**Key Metrics:**
- Workflow timeout: 45 minutes
- Runner: `ubuntu-latest-8-cores`
- Images pre-pulled: 15 (9 NAIS custom + 6 base images)
- Services started: 15 containers
- Tests executed: example-workflow.spec.ts (3 test cases)

---

## Detailed Changes

### 1. Multi-Architecture Docker Images

**Problem**: Images were built locally on Mac (ARM64 only) and pushed to NAIS registry. GitHub Actions runs on AMD64, causing "no matching manifest for linux/amd64" errors.

**Solution**: Rebuilt all custom NAIS images with multi-architecture support using `docker buildx`.

#### Images Rebuilt:

##### 1. postgres-felleskodeverk-prepopulated

**Created new Dockerfile:**

Location: `/Users/rune/source/nav/melosys-docker-compose/postgres-felleskodeverk-prepopulated/Dockerfile`

```dockerfile
FROM postgres:13-alpine

# Copy the database dump
COPY dump.sql /docker-entrypoint-initdb.d/

# Set default database name
ENV POSTGRES_DB=felles-kodeverk
ENV POSTGRES_PASSWORD=mysecretpassword
```

**Build command:**
```bash
cd /Users/rune/source/nav/melosys-docker-compose/postgres-felleskodeverk-prepopulated
docker buildx build --platform linux/amd64,linux/arm64 \
  -t europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/postgres-felleskodeverk-prepopulated:latest \
  --push .
```

##### 2. felles-kodeverk

**Build command:**
```bash
cd /Users/rune/source/nav/melosys-docker-compose/felles-kodeverk
docker buildx build --platform linux/amd64,linux/arm64 \
  -t europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/felles-kodeverk:latest \
  --push .
```

##### 3. melosys-mock

**Build command:**
```bash
cd /Users/rune/source/nav/melosys-docker-compose/mock
docker buildx build --platform linux/amd64,linux/arm64 \
  -t europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/melosys-mock:latest \
  --push .
```

#### Verification:

To verify an image has multi-arch support:
```bash
docker manifest inspect europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/IMAGE_NAME:latest | grep -A3 "platform"
```

Expected output should show both:
- `"architecture": "amd64"`
- `"architecture": "arm64"`

---

### 2. GitHub Actions Workflow Configuration

**File**: `.github/workflows/e2e-tests.yml`

#### Key Configuration:

```yaml
on:
  workflow_dispatch:  # Manual trigger only

jobs:
  e2e-tests:
    runs-on: ubuntu-latest-8-cores  # 8-core runner for better performance
    timeout-minutes: 45  # Increased timeout for large stack
```

#### Optimization Steps:

**1. Pre-pull all Docker images in parallel with explicit platform:**

```yaml
- name: Pre-pull Docker images in parallel
  run: |
    echo "🐳 Pre-pulling Docker images to avoid timeout during compose up..."
    docker pull --platform linux/amd64 europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/melosys-api:latest &
    docker pull --platform linux/amd64 europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/melosys-web:latest &
    docker pull --platform linux/amd64 europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/faktureringskomponenten:latest &
    docker pull --platform linux/amd64 europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/melosys-dokgen:latest &
    docker pull --platform linux/amd64 europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/melosys-trygdeavgift-beregning:latest &
    docker pull --platform linux/amd64 europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/melosys-trygdeavtale:latest &
    docker pull --platform linux/amd64 europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/postgres-felleskodeverk-prepopulated:latest &
    docker pull --platform linux/amd64 europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/felles-kodeverk:latest &
    docker pull --platform linux/amd64 europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/melosys-mock:latest &
    docker pull --platform linux/amd64 gvenzl/oracle-xe:18.4.0-slim &
    docker pull --platform linux/amd64 postgres:13-alpine &
    docker pull --platform linux/amd64 confluentinc/cp-zookeeper:7.1.2 &
    docker pull --platform linux/amd64 confluentinc/cp-kafka:7.1.2 &
    docker pull --platform linux/amd64 ghcr.io/navikt/mock-oauth2-server:2.3.0 &
    docker pull --platform linux/amd64 ghcr.io/navikt/mock-oauth2-server:0.4.8 &
    wait
    echo "✅ All images pre-pulled successfully"
```

**Benefits:**
- Downloads happen in parallel (faster)
- Explicit platform selection ensures correct architecture
- Separates download phase from startup phase (better error messages)

**2. Environment variables for Oracle:**

```yaml
- name: Set environment variables for GitHub Actions
  run: |
    echo "MELOSYS_ORACLE_DB_NAME=XEPDB1" >> $GITHUB_ENV
    echo "ORACLE_IMAGE=gvenzl/oracle-xe:18.4.0-slim" >> $GITHUB_ENV
```

**3. Comprehensive health checks with retry logic:**

The workflow now checks multiple critical services before running tests:

```yaml
- name: Wait for services to be healthy
  run: |
    echo "⏳ Waiting for services to be ready..."

    max_attempts=60
    attempt=0

    # Wait for critical services to be ready
    while [ $attempt -lt $max_attempts ]; do
      attempt=$((attempt + 1))
      echo "⏳ Health check attempt $attempt/$max_attempts"

      # Check Kafka health (docker health status)
      kafka_health=$(docker inspect --format='{{.State.Health.Status}}' kafka 2>/dev/null || echo "unhealthy")
      echo "  Kafka: $kafka_health"

      # Check melosys-api health endpoint
      api_health=$(curl -sf http://localhost:8080/internal/health > /dev/null 2>&1 && echo "healthy" || echo "unhealthy")
      echo "  melosys-api: $api_health"

      # Check melosys-web
      web_health=$(curl -sf http://localhost:3000/melosys/ > /dev/null 2>&1 && echo "healthy" || echo "unhealthy")
      echo "  melosys-web: $web_health"

      # Check if all critical services are healthy
      if [ "$kafka_health" = "healthy" ] && [ "$api_health" = "healthy" ] && [ "$web_health" = "healthy" ]; then
        echo "✅ All critical services are healthy!"
        break
      fi

      if [ $attempt -eq $max_attempts ]; then
        echo "❌ Services failed to start within timeout"
        echo "📋 Docker compose status:"
        docker compose ps
        echo ""
        echo "📋 Docker compose logs (last 100 lines per service):"
        docker compose logs --tail=100
        exit 1
      fi

      sleep 10
    done

    # Give services a moment to fully stabilize
    echo ""
    echo "⏳ Waiting 10 seconds for services to fully stabilize..."
    sleep 10
    echo "✅ Ready to run tests!"
```

**Services Checked:**
- **Kafka**: Uses Docker's built-in health check status
- **melosys-api**: Checks `/internal/health` endpoint
- **melosys-web**: Checks homepage accessibility

This prevents tests from starting before critical backend services are fully ready, significantly reducing flakiness.

---

### 3. Docker Compose Fixes

**File**: `docker-compose.yml`

#### Changes Made:

**1. Added platform specification to ALL services:**

```yaml
services:
  zookeeper:
    platform: linux/amd64  # Added to all 15 services
    # ...
```

**2. Fixed melosys-mock service:**

**Before:**
```yaml
melosys-mock:
  build: europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/melosys-mock:latest  # Wrong!
  volumes:
    - ${PWD}/mock/src/main/resources:/files  # Not available in CI
```

**After:**
```yaml
melosys-mock:
  platform: linux/amd64
  image: europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/melosys-mock:latest  # Correct
  # Volume mount removed - not needed for CI
```

---

### 4. Added Required Scripts

**Problem**: Kafka and felles-kodeverk services used local file mounts for entrypoint scripts that didn't exist in GitHub Actions.

**Solution**: Copied scripts to e2e-tests repository.

#### Files Added:

**1. scripts/kafka-entrypoint.sh**
```bash
#!/bin/bash

echo "Venter til Zookeeper er oppe..."
until timeout 5 nc zookeeper 2181; do
    echo "Zookeeper er ikke oppe. Tester igjen om 2 sekunder..."
    sleep 2;
done

echo "ZooKeeper er oppe og kjører. Starter Kafka..."

# Start Kafka
exec /etc/confluent/docker/run
```

**2. felles-kodeverk/felles-kodeverk-entrypoint.sh**
```bash
#!/bin/bash

echo "Venter til databasen er klar..."

while ! pg_isready -h postgres_felleskodeverk.melosys.docker-internal -p 5432 -U postgres; do
  echo "Postgres er fortsatt ikke klar.. Venter i ett sekund."
  sleep 1
done

exec java -XX:+UnlockExperimentalVMOptions -Dappdynamics.agent.applicationName=_ -Dappdynamics.agent.reuse.nodeName.prefix=__ -jar app.jar entrypoint.sh
```

Both scripts are mounted in docker-compose.yml:
- `./scripts/kafka-entrypoint.sh:/scripts/kafka-entrypoint.sh`
- `./felles-kodeverk/felles-kodeverk-entrypoint.sh:/app/entrypoint.sh`

---

### 5. Playwright Test Command Fix

**Problem**: Test pattern matching didn't work in CI.

**Before:**
```bash
npx playwright test "should complete a basic workflow" --project=chromium
```
❌ Error: No tests found (pattern didn't match full test path with describe block)

**After:**
```bash
npx playwright test example-workflow.spec.ts --project=chromium
```
✅ Runs all tests in the file

---

## How to Rebuild Multi-Arch Images

When you need to rebuild images (after code changes), follow these steps:

### Prerequisites

1. **Enable Docker BuildX** (one-time setup):
```bash
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap
```

2. **Login to NAIS registry**:
```bash
# Using nais CLI
nais login --team teammelosys

# Or direct docker login
docker login europe-north1-docker.pkg.dev
```

### Rebuild Process

#### Option 1: Manual Rebuild (Recommended for testing)

```bash
# Navigate to the docker-compose directory
cd /Users/rune/source/nav/melosys-docker-compose

# Rebuild specific image
cd <service-directory>
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

#### Option 2: Automated GitHub Actions (Recommended for production)

Create individual workflows for each image in `.github/workflows/` of the **melosys-docker-compose** repository:

**Example: `.github/workflows/build-postgres-felleskodeverk.yml`**

```yaml
name: Build postgres-felleskodeverk-prepopulated

on:
  workflow_dispatch:
  push:
    paths:
      - 'postgres-felleskodeverk-prepopulated/**'
    branches:
      - main

permissions:
  contents: read
  packages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to NAIS registry
        uses: nais/login@v0
        with:
          team: teammelosys

      - name: Build and push multi-arch image
        uses: docker/build-push-action@v5
        with:
          context: ./postgres-felleskodeverk-prepopulated
          platforms: linux/amd64,linux/arm64
          push: true
          tags: europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/postgres-felleskodeverk-prepopulated:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**Create similar workflows for:**
- `build-felles-kodeverk.yml`
- `build-melosys-mock.yml`

### Verification After Rebuild

```bash
# Check image has both architectures
docker manifest inspect europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/<IMAGE_NAME>:latest | grep -A3 "platform"

# Should show:
# "architecture": "amd64"
# "architecture": "arm64"
```

---

## Troubleshooting

### Issue: "no matching manifest for linux/amd64"

**Cause**: Image only built for ARM64 (Mac)

**Solution**: Rebuild image with `--platform linux/amd64,linux/arm64`

### Issue: Docker Compose fails with "path not found"

**Cause**: Using `build:` instead of `image:` or missing volume mount path

**Solution**:
- Change `build:` to `image:` for pre-built images
- Ensure volume mount paths exist or remove them

### Issue: Services timeout during startup

**Cause**: Insufficient resources or slow image pulls

**Solution**:
- Use `ubuntu-latest-8-cores` runner
- Pre-pull images in parallel
- Increase timeout to 45 minutes

### Issue: Tests not found in CI

**Cause**: Test pattern doesn't match full test path

**Solution**: Use file name instead of test name pattern:
```bash
npx playwright test example-workflow.spec.ts
```

### Issue: Services show "health: starting" or tests fail intermittently

**Cause**: Tests start before backend services (Kafka, melosys-api) are fully ready

**Solution**:
Enhanced health check now verifies:
1. Kafka health status via Docker inspect
2. melosys-api `/internal/health` endpoint responds
3. melosys-web is accessible
4. 10-second stabilization delay after all services report healthy

**Debug commands:**
```bash
# Check service health in CI logs
docker compose ps

# Check specific service health
docker inspect --format='{{.State.Health.Status}}' kafka

# Test API health endpoint
curl http://localhost:8080/internal/health
```

---

## Running the Workflow

### From GitHub UI:

1. Go to **Actions** tab
2. Select **E2E Tests** workflow
3. Click **Run workflow** button
4. Select branch (usually `main` or your feature branch)
5. Click **Run workflow**

### View Results:

- **Test results**: Uploaded as artifacts (`playwright-results`)
- **Videos**: Uploaded as artifacts (`playwright-videos`)
- **Traces**: Uploaded as artifacts (`playwright-traces`)
- **Logs**: Available in workflow run details

### Download Artifacts:

```bash
# Using GitHub CLI
gh run download <run-id> -n playwright-traces
gh run download <run-id> -n playwright-videos

# View trace locally
npx playwright show-trace trace.zip
```

---

## Cost Considerations

### Runner Costs:
- `ubuntu-latest-8-cores` is a **paid runner** (uses more GitHub Actions minutes)
- Average run time: ~15-20 minutes (for successful runs)
- Consider using `ubuntu-latest` for development branches if cost is a concern

### Optimization Options:

1. **Conditional runs**: Only run on main branch or manual trigger
2. **Test sharding**: Split tests across multiple jobs
3. **Matrix strategy**: Test only critical paths in PR, full suite on main

---

## Future Improvements

### Recommended Enhancements:

1. **Test Sharding**: Split tests across multiple parallel jobs
   ```yaml
   strategy:
     matrix:
       shardIndex: [1, 2, 3, 4]
       shardTotal: [4]
   ```

2. **Docker Layer Caching**: Use GitHub Actions cache for Docker layers
   ```yaml
   - name: Cache Docker layers
     uses: actions/cache@v3
     with:
       path: /tmp/.buildx-cache
       key: ${{ runner.os }}-buildx-${{ github.sha }}
   ```

3. **Automatic Image Rebuilds**: Trigger E2E tests when new images are built
   ```yaml
   on:
     workflow_run:
       workflows: ["Build melosys-api", "Build melosys-web"]
       types: [completed]
   ```

4. **Test Result Comments**: Post results to PRs (when PR trigger is enabled)
5. **Slack Notifications**: Notify team of test failures
6. **Scheduled Runs**: Run nightly to catch issues early

---

## Summary

### What We Achieved:
✅ E2E tests running in GitHub Actions
✅ Multi-architecture Docker image support
✅ Robust pre-pulling and startup logic
✅ 15 services successfully orchestrated
✅ Full Playwright test execution with traces/videos
✅ Manual workflow triggering for controlled testing

### Key Files Created/Modified:
- `.github/workflows/e2e-tests.yml` - Main workflow
- `docker-compose.yml` - Platform specs and image fixes
- `scripts/kafka-entrypoint.sh` - Kafka startup script
- `felles-kodeverk/felles-kodeverk-entrypoint.sh` - Felles-kodeverk startup script
- `CLAUDE.md` - Documentation for future Claude Code instances
- `GITHUB-ACTIONS-SETUP.md` - This report

### Repository Locations:
- **E2E Tests**: `navikt/melosys-e2e-tests`
- **Docker Compose**: `melosys-docker-compose` (sibling directory)
- **NAIS Registry**: `europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/`

---

**Report Generated**: 2025-10-28
**Claude Code Session**: E2E Tests GitHub Actions Setup
