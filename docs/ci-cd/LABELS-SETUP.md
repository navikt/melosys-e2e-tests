# GitHub Labels Setup for E2E Failure Analysis

The E2E failure analysis workflows require specific GitHub labels to be created in the repository.

## Required Labels

Before using the failure analysis workflows, create the following labels in your repository:

### Labels Created by Workflows (Automatic)

These labels are automatically applied by the workflows:

1. **`e2e-failure`**
   - **Description:** E2E test failure detected by automated analysis
   - **Color:** `#d73a4a` (red)
   - **Applied by:** `analyze-e2e-failures.yml` workflow
   - **Usage:** All issues created for E2E test failures

2. **`needs-triage`**
   - **Description:** New issue that needs review and classification
   - **Color:** `#fbca04` (yellow)
   - **Applied by:** `analyze-e2e-failures.yml` workflow
   - **Usage:** New issues that haven't been reviewed yet

### Labels Applied Manually (Triggers)

This label is added manually by developers to trigger Copilot analysis:

3. **`copilot-analyze`**
   - **Description:** Trigger Copilot AI analysis for this issue
   - **Color:** `#7057ff` (purple)
   - **Applied by:** Developer (manual)
   - **Usage:** Triggers the `copilot-analyze-failure.yml` workflow

### Labels Suggested by Copilot (Optional)

These labels are recommended by Copilot but must be created manually if you want to use them:

4. **`test-bug`**
   - **Description:** Issue in test code (not production code)
   - **Color:** `#0075ca` (blue)
   - **Suggested by:** Copilot analysis
   - **Usage:** Issue is caused by incorrect test implementation

5. **`production-bug`**
   - **Description:** Issue in production application code
   - **Color:** `#d73a4a` (red)
   - **Suggested by:** Copilot analysis
   - **Usage:** Issue is caused by application code bug

6. **`flaky-test`**
   - **Description:** Test that fails intermittently due to timing/race conditions
   - **Color:** `#f9d0c4` (light orange)
   - **Suggested by:** Copilot analysis
   - **Usage:** Test has timing or race condition issues

## Creating Labels

### Option 1: Using GitHub Web Interface

1. Go to your repository on GitHub
2. Click on **Issues** tab
3. Click on **Labels**
4. Click **New label**
5. Enter the label name, description, and color
6. Click **Create label**
7. Repeat for each label

### Option 2: Using GitHub CLI

```bash
# Required labels (used by workflows)
gh label create "e2e-failure" --description "E2E test failure detected by automated analysis" --color "d73a4a"
gh label create "needs-triage" --description "New issue that needs review and classification" --color "fbca04"
gh label create "copilot-analyze" --description "Trigger Copilot AI analysis for this issue" --color "7057ff"

# Optional labels (suggested by Copilot)
gh label create "test-bug" --description "Issue in test code (not production code)" --color "0075ca"
gh label create "production-bug" --description "Issue in production application code" --color "d73a4a"
gh label create "flaky-test" --description "Test that fails intermittently due to timing/race conditions" --color "f9d0c4"
```

### Option 3: Using GitHub API

```bash
# Set your repository details
OWNER="navikt"
REPO="melosys-e2e-tests"

# Required labels
curl -X POST "https://api.github.com/repos/$OWNER/$REPO/labels" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"e2e-failure","description":"E2E test failure detected by automated analysis","color":"d73a4a"}'

curl -X POST "https://api.github.com/repos/$OWNER/$REPO/labels" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"needs-triage","description":"New issue that needs review and classification","color":"fbca04"}'

curl -X POST "https://api.github.com/repos/$OWNER/$REPO/labels" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"copilot-analyze","description":"Trigger Copilot AI analysis for this issue","color":"7057ff"}'

# Optional labels
curl -X POST "https://api.github.com/repos/$OWNER/$REPO/labels" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-bug","description":"Issue in test code (not production code)","color":"0075ca"}'

curl -X POST "https://api.github.com/repos/$OWNER/$REPO/labels" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"production-bug","description":"Issue in production application code","color":"d73a4a"}'

curl -X POST "https://api.github.com/repos/$OWNER/$REPO/labels" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"flaky-test","description":"Test that fails intermittently due to timing/race conditions","color":"f9d0c4"}'
```

## Verification

After creating the labels, verify they exist:

```bash
gh label list
```

You should see all the labels listed.

## Workflow Behavior Without Labels

If labels don't exist when the workflows run:

- **`analyze-e2e-failures.yml`**: Will fail when trying to apply `e2e-failure` or `needs-triage` labels
- **`copilot-analyze-failure.yml`**: Will not trigger if `copilot-analyze` label doesn't exist

**Important:** Create at least the required labels (`e2e-failure`, `needs-triage`, `copilot-analyze`) before the workflows run for the first time.

## References

- [GitHub Labels Documentation](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels)
- [GitHub CLI Labels Reference](https://cli.github.com/manual/gh_label)
- [E2E Failure Analysis Workflow Guide](./E2E-FAILURE-ANALYSIS.md)
