# Repository Dispatch Trigger Guide

This guide explains how to configure source repositories (like `melosys-api`, `faktureringskomponenten`, etc.) to automatically trigger E2E tests when Docker images are pushed to GCP Artifact Registry.

---

## Overview

When a repository pushes a new Docker image to GCP, it can automatically trigger the E2E test suite in `melosys-e2e-tests` using GitHub's `repository_dispatch` event.

**Flow:**
1. Developer pushes code to `melosys-api` main branch
2. `melosys-api` workflow builds and pushes Docker image to GCP
3. `melosys-api` workflow triggers `melosys-e2e-tests` workflow
4. E2E tests run with the newly pushed image
5. Results are reported back

---

## Supported Event Types

The E2E workflow listens for these event types:

- `melosys-api-published`
- `faktureringskomponenten-published`
- `melosys-web-published`
- `melosys-trygdeavgift-beregning-published`
- `melosys-dokgen-published`
- `melosys-trygdeavtale-published`

---

## Setup Instructions

### Step 1: Add PAT Secret to Source Repository

Each source repository needs a Personal Access Token (PAT) to trigger the E2E workflow.

1. **Obtain PAT** - See [PAT Setup Guide](./PAT-SETUP.md) for creating the token
2. **Add to repository:**
   - Go to source repo (e.g., `melosys-api`) **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `E2E_TRIGGER_PAT`
   - Value: (paste the PAT token)
   - Click **Add secret**

### Step 2: Add Trigger Step to Build Workflow

Add this step to your build workflow **after** pushing the Docker image to GCP.

#### Option A: Using `peter-evans/repository-dispatch` Action (Recommended)

```yaml
jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      # ... existing build and push steps ...

      - name: Extract image tag
        id: image_tag
        run: echo "tag=${{ github.sha }}" >> $GITHUB_OUTPUT

      - name: Trigger E2E tests
        if: github.ref == 'refs/heads/main'  # Only trigger on main branch
        uses: peter-evans/repository-dispatch@v4
        with:
          token: ${{ secrets.E2E_TRIGGER_PAT }}
          repository: navikt/melosys-e2e-tests
          event-type: melosys-api-published  # Change to match your service
          client-payload: |
            {
              "repository": "melosys-api",
              "image_tag": "${{ steps.image_tag.outputs.tag }}",
              "commit_sha": "${{ github.sha }}",
              "commit_message": "${{ github.event.head_commit.message }}",
              "actor": "${{ github.actor }}"
            }
```

**Customize:**
- Change `event-type` to match your service (see list above)
- Change `repository` in `client-payload` to your repo name
- Adjust `image_tag` if you use different tagging strategy

#### Option B: Using `curl` (Simpler)

```yaml
- name: Trigger E2E tests
  if: github.ref == 'refs/heads/main'
  run: |
    curl -X POST \
      -H "Accept: application/vnd.github.v3+json" \
      -H "Authorization: token ${{ secrets.E2E_TRIGGER_PAT }}" \
      https://api.github.com/repos/navikt/melosys-e2e-tests/dispatches \
      -d '{
        "event_type": "melosys-api-published",
        "client_payload": {
          "repository": "melosys-api",
          "image_tag": "${{ github.sha }}",
          "commit_sha": "${{ github.sha }}",
          "actor": "${{ github.actor }}"
        }
      }'
```

---

## Client Payload Schema

The E2E workflow expects this payload structure:

```json
{
  "repository": "string",      // Source repo name (e.g., "melosys-api")
  "image_tag": "string",       // Docker image tag (e.g., commit SHA or "latest")
  "commit_sha": "string",      // Git commit SHA (optional)
  "commit_message": "string",  // Commit message (optional)
  "actor": "string"            // GitHub username who triggered (optional)
}
```

**Required fields:**
- `repository` - Used for logging and tracking
- `image_tag` - The Docker image tag to test

**Optional fields:**
- `commit_sha` - For reference in test reports
- `commit_message` - For context in test logs
- `actor` - For tracking who triggered the test

---

## Complete Example: melosys-api

Here's a complete example workflow for `melosys-api`:

```yaml
name: Build and Push Docker Image

on:
  push:
    branches:
      - main

jobs:
  build-and-push:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Login to NAIS registry
        uses: nais/login@v0
        with:
          team: teammelosys

      - name: Build and push Docker image
        run: |
          docker build -t europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/melosys-api:${{ github.sha }} .
          docker push europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/melosys-api:${{ github.sha }}

          # Also tag as latest
          docker tag europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/melosys-api:${{ github.sha }} \
                     europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/melosys-api:latest
          docker push europe-north1-docker.pkg.dev/nais-management-233d/teammelosys/melosys-api:latest

      - name: Trigger E2E tests
        if: success()  # Only trigger if build succeeded
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
              "commit_message": "${{ github.event.head_commit.message }}",
              "actor": "${{ github.actor }}"
            }
```

---

## Testing the Trigger

### Manual Test

Test the trigger without pushing code:

```bash
# Replace with your PAT token
export PAT="ghp_xxxxxxxxxxxx"

# Trigger E2E tests manually
curl -X POST \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Authorization: token $PAT" \
  https://api.github.com/repos/navikt/melosys-e2e-tests/dispatches \
  -d '{
    "event_type": "melosys-api-published",
    "client_payload": {
      "repository": "melosys-api",
      "image_tag": "test-trigger",
      "commit_sha": "abc123",
      "actor": "your-username"
    }
  }'
```

### Verify Trigger

1. Go to https://github.com/navikt/melosys-e2e-tests/actions
2. You should see a new workflow run
3. Check the workflow logs for:
   - "🔔 Triggered by repository_dispatch event"
   - Your source repository name
   - The image tag you sent

---

## Best Practices

### 1. Only Trigger on Main Branch

```yaml
if: github.ref == 'refs/heads/main'
```

This prevents triggering E2E tests on every feature branch push.

### 2. Only Trigger on Success

```yaml
if: success()
```

Only trigger E2E tests if the Docker image was successfully built and pushed.

### 3. Use Commit SHA as Image Tag

```yaml
image_tag: "${{ github.sha }}"
```

This ensures you test the exact image that was just built, not a `:latest` tag that might change.

### 4. Include Context in Payload

```yaml
commit_message: "${{ github.event.head_commit.message }}"
actor: "${{ github.actor }}"
```

This helps with debugging and tracking which changes triggered test failures.

---

## Troubleshooting

### Issue: E2E tests not triggering

**Check:**
1. PAT is correctly added to source repo secrets
2. Event type matches exactly (e.g., `melosys-api-published`)
3. PAT has correct permissions (see [PAT Setup Guide](./PAT-SETUP.md))
4. Workflow file is on the default branch (main)

**Debugging:**
```bash
# Check if trigger was sent (from source repo)
# Look for successful HTTP 204 response in workflow logs

# Check E2E repo Actions tab
# Verify new workflow run appeared
```

### Issue: E2E tests run but use wrong image tag

**Check:**
1. `client_payload.image_tag` is correctly set
2. E2E workflow logs show correct tag in "Determine image tags" step
3. Docker compose uses the correct environment variable

**Debug:**
```yaml
# Add to source repo workflow
- name: Debug payload
  run: |
    echo "Image tag: ${{ github.sha }}"
    echo "Event type: melosys-api-published"
```

### Issue: PAT authentication fails

**Error:** `401 Unauthorized` or `403 Forbidden`

**Solution:**
1. Regenerate PAT with correct permissions
2. Ensure PAT has `repo` scope (classic) or Actions read/write (fine-grained)
3. Update secret in source repository

---

## Security Considerations

### PAT Scope

- Use **fine-grained PATs** (preferred) scoped to only `melosys-e2e-tests`
- Grant minimal permissions: Actions (read/write), Contents (read)
- Set expiration date (e.g., 90 days)

### Payload Validation

The E2E workflow validates payload data:
- Image tags must be valid Docker tag format
- No arbitrary code execution from payload
- All payload data is logged for audit

### Branch Protection

Only trigger from `main` branch to prevent spam:
```yaml
if: github.ref == 'refs/heads/main'
```

---

## Adding New Services

To add a new service to trigger E2E tests:

1. **Add event type to E2E workflow** (already done for common services)
2. **Add trigger to new service's workflow** (follow examples above)
3. **Add PAT secret to new service repo**
4. **Test trigger manually** before pushing to main

---

## Related Documentation

- **PAT Setup Guide**: [PAT-SETUP.md](./PAT-SETUP.md) - How to create the Personal Access Token
- **GitHub Actions Guide**: [GITHUB-ACTIONS.md](./GITHUB-ACTIONS.md) - E2E workflow overview
- **GitHub Docs**: [repository_dispatch event](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#repository_dispatch)
