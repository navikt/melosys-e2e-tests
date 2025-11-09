# Personal Access Token (PAT) Setup Guide

This guide explains how to create and manage the Personal Access Token (PAT) required for triggering E2E tests from other repositories.

---

## Overview

Source repositories (like `melosys-api`) need a PAT to trigger workflows in `melosys-e2e-tests` using the `repository_dispatch` event.

**Why needed?**
- The default `GITHUB_TOKEN` cannot trigger workflows in other repositories
- A PAT with appropriate permissions is required for cross-repo triggers
- Fine-grained PATs provide better security than classic tokens

---

## Option 1: Fine-Grained PAT (Recommended ✅)

Fine-grained PATs provide better security by limiting access to specific repositories.

### Step 1: Create Fine-Grained PAT

1. **Go to GitHub Settings**
   - Click your profile picture → **Settings**
   - Navigate to **Developer settings** → **Personal access tokens** → **Fine-grained tokens**
   - Or visit: https://github.com/settings/tokens?type=beta

2. **Generate New Token**
   - Click **Generate new token**

3. **Configure Token**

   **Token name:** `E2E-Trigger-PAT` (or descriptive name)

   **Description:** `Trigger E2E tests in melosys-e2e-tests from source repos`

   **Expiration:** `90 days` (recommended) or custom

   **Repository access:**
   - Select **Only select repositories**
   - Choose: `navikt/melosys-e2e-tests`

   **Permissions:**
   - **Repository permissions** → **Actions**: `Read and write`
   - **Repository permissions** → **Contents**: `Read-only`
   - **Repository permissions** → **Metadata**: `Read-only` (auto-selected)

4. **Generate Token**
   - Click **Generate token**
   - **⚠️ COPY THE TOKEN NOW** - You won't see it again!

### Step 2: Add PAT to Source Repositories

Add the PAT as a secret to **each repository** that will trigger E2E tests (e.g., `melosys-api`, `faktureringskomponenten`, etc.):

1. **Go to source repository settings**
   - Navigate to `navikt/melosys-api` (or other service repo)
   - Go to **Settings** → **Secrets and variables** → **Actions**

2. **Create new secret**
   - Click **New repository secret**
   - **Name:** `E2E_TRIGGER_PAT`
   - **Value:** Paste the PAT token
   - Click **Add secret**

3. **Repeat for each source repository**
   - `navikt/melosys-api`
   - `navikt/faktureringskomponenten`
   - `navikt/melosys-web`
   - `navikt/melosys-trygdeavgift-beregning`
   - (any other repos that will trigger E2E tests)

---

## Option 2: Classic PAT (Legacy)

Classic PATs have broader permissions and are less secure. Use only if fine-grained PATs don't work for your use case.

### Step 1: Create Classic PAT

1. **Go to GitHub Settings**
   - Click your profile picture → **Settings**
   - Navigate to **Developer settings** → **Personal access tokens** → **Tokens (classic)**
   - Or visit: https://github.com/settings/tokens

2. **Generate New Token**
   - Click **Generate new token** → **Generate new token (classic)**

3. **Configure Token**

   **Note:** `E2E-Trigger-PAT`

   **Expiration:** `90 days` (recommended)

   **Scopes:**
   - ✅ `repo` (Full control of private repositories)
     - This includes: `repo:status`, `repo_deployment`, `public_repo`, `repo:invite`, `security_events`

4. **Generate Token**
   - Click **Generate token**
   - **⚠️ COPY THE TOKEN NOW** - You won't see it again!

### Step 2: Add to Source Repositories

Same as fine-grained PAT (see above).

---

## Security Best Practices

### 1. Use Fine-Grained PATs

Fine-grained PATs provide:
- ✅ Specific repository access (only `melosys-e2e-tests`)
- ✅ Minimal permissions (only Actions read/write)
- ✅ Better audit trail
- ✅ Easier to revoke and rotate

### 2. Set Expiration

- **Recommended:** 90 days
- Set calendar reminder to rotate before expiration
- Never use tokens without expiration

### 3. Limit Scope

**Fine-grained PAT:**
- Only grant access to `melosys-e2e-tests`
- Only grant Actions (read/write) permission
- Do NOT grant admin or write permissions

**Classic PAT:**
- Only select `repo` scope (required for `repository_dispatch`)
- Do NOT select `admin:org`, `admin:repo_hook`, etc.

### 4. Rotate Regularly

- Rotate PATs every 90 days
- Rotate immediately if:
  - Team member leaves
  - Token may have been exposed
  - Suspicious activity detected

### 5. Store Securely

- **DO:** Store as GitHub repository secret
- **DON'T:** Commit to code
- **DON'T:** Share in chat/email
- **DON'T:** Store in plain text files

---

## Token Rotation Guide

When token expires or needs rotation:

### Step 1: Create New Token

Follow the creation steps above to generate a new token.

### Step 2: Update Secrets in All Source Repos

For each repository using the old token:

1. Go to repo **Settings** → **Secrets and variables** → **Actions**
2. Click on `E2E_TRIGGER_PAT` secret
3. Click **Update secret**
4. Paste new token value
5. Click **Update secret**

### Step 3: Verify New Token Works

Test the trigger from each repo:

```bash
# Replace with your new PAT
export NEW_PAT="ghp_xxxxxxxxxxxx"

curl -X POST \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Authorization: token $NEW_PAT" \
  https://api.github.com/repos/navikt/melosys-e2e-tests/dispatches \
  -d '{
    "event_type": "melosys-api-published",
    "client_payload": {
      "repository": "test",
      "image_tag": "test-rotation"
    }
  }'
```

Check https://github.com/navikt/melosys-e2e-tests/actions for new workflow run.

### Step 4: Revoke Old Token

1. Go to https://github.com/settings/tokens?type=beta (fine-grained) or https://github.com/settings/tokens (classic)
2. Find the old token
3. Click **Delete** or **Revoke**
4. Confirm deletion

---

## Troubleshooting

### Issue: "Bad credentials" (401 Error)

**Causes:**
- Token has expired
- Token was revoked
- Token not correctly copied to secret
- Wrong token format

**Solutions:**
1. Verify token hasn't expired: Check https://github.com/settings/tokens?type=beta
2. Regenerate token and update secret
3. Ensure no extra spaces when copying token
4. Verify token starts with `ghp_` (classic) or `github_pat_` (fine-grained)

### Issue: "Resource not accessible" (403 Error)

**Causes:**
- Insufficient permissions
- Token doesn't have access to target repository
- Actions permission not granted

**Solutions:**
1. **Fine-grained PAT:** Ensure `navikt/melosys-e2e-tests` is selected in repository access
2. **Fine-grained PAT:** Ensure Actions has "Read and write" permission
3. **Classic PAT:** Ensure `repo` scope is selected
4. Regenerate token with correct permissions

### Issue: "Not Found" (404 Error)

**Causes:**
- Repository name incorrect
- Target repository doesn't exist
- Token owner doesn't have access to target repo

**Solutions:**
1. Verify repository name: `navikt/melosys-e2e-tests` (not `melosys-e2e-tests`)
2. Ensure token owner has at least read access to target repo
3. Check organization/team permissions

### Issue: Token Expired

**Expiration warnings:**
- GitHub sends email 7 days before expiration
- Workflow fails with "Bad credentials" error

**Solutions:**
1. Create new token (follow rotation guide above)
2. Update secret in all source repositories
3. Test trigger works with new token

---

## Permissions Reference

### Fine-Grained PAT Permissions

**Required:**
- **Repository access:** `navikt/melosys-e2e-tests`
- **Actions:** Read and write (to trigger workflows)
- **Contents:** Read-only (to access repository)
- **Metadata:** Read-only (auto-selected, required)

**Not required:**
- Administration
- Code scanning alerts
- Commit statuses
- Dependabot alerts
- Deployments
- Environments
- Issues
- Pull requests
- Secrets
- Variables
- Webhooks
- Workflows (different from Actions)

### Classic PAT Scopes

**Required:**
- `repo` - Full control of private repositories

**Not required:**
- `workflow` (not needed for `repository_dispatch`)
- `admin:org`
- `admin:repo_hook`
- `admin:org_hook`
- `gist`
- `notifications`
- `user`
- `delete_repo`

---

## Verification Checklist

After creating and adding PAT:

- [ ] Token created with correct permissions
- [ ] Token copied immediately (can't view again)
- [ ] Token added to all source repository secrets
- [ ] Secret named exactly `E2E_TRIGGER_PAT`
- [ ] Token expiration date noted in calendar
- [ ] Test trigger sent and E2E workflow runs
- [ ] Old token revoked (if rotating)

---

## Multi-Repository Management

If managing multiple source repos, consider:

### Option 1: Same PAT for All Repos (Recommended)

**Pros:**
- ✅ Easy to manage and rotate
- ✅ One token to create and monitor
- ✅ Same expiration for all

**Cons:**
- ⚠️ If compromised, affects all repos

**Setup:**
1. Create one fine-grained PAT
2. Add same PAT to all source repo secrets
3. Rotate all at once when needed

### Option 2: Separate PAT per Repo

**Pros:**
- ✅ Isolated security (compromise affects one repo)
- ✅ Can revoke individual repos

**Cons:**
- ❌ More complex to manage
- ❌ Multiple tokens to rotate
- ❌ Higher maintenance burden

**Setup:**
1. Create separate fine-grained PAT for each source repo
2. Name tokens: `E2E-Trigger-PAT-melosys-api`, `E2E-Trigger-PAT-faktureringskomponenten`, etc.
3. Rotate individually when needed

---

## GitHub CLI Alternative

You can also create PATs using GitHub CLI:

```bash
# Login
gh auth login

# Create fine-grained token (requires manual steps in browser)
gh auth refresh -s repo

# Note: Fine-grained PATs cannot be created via CLI yet
# Use web interface for fine-grained PATs
```

---

## Related Documentation

- **Repository Dispatch Trigger Guide**: [REPOSITORY-DISPATCH-TRIGGER.md](./REPOSITORY-DISPATCH-TRIGGER.md)
- **GitHub Docs**: [Creating a personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- **GitHub Docs**: [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
