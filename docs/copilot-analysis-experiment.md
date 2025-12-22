# Copilot Coding Agent - E2E Failure Analysis Experiment

**Date:** 2025-12-22
**Status:** Paused - Copilot limitations prevent effective use
**Revisit when:** Copilot gets "analyze only" mode or better cross-repo understanding

## Goal

Automatically analyze E2E test failures using GitHub Copilot Coding Agent to:
1. Identify root cause location (melosys-api vs melosys-web vs test code)
2. Link to existing issues (like #41 - SaksopplysningKilde race condition)
3. Classify issues with appropriate labels
4. Suggest fixes in the correct repository

## What We Tried

### Workflow Setup

1. **Issue Creation** - `analyze-e2e-failures.yml` creates issues for failed/flaky tests
2. **Rich Context** - Issues include error messages, Docker logs, image tags
3. **Copilot Assignment** - Auto-assign Copilot to analyze the issue
4. **Instructions** - Asked Copilot to "analyze only, don't create PR"

### Copilot Assignment Code

```bash
# Get issue node ID
ISSUE_NODE_ID=$(gh api graphql -f query="query {
  repository(owner: \"navikt\", name: \"melosys-e2e-tests\") {
    issue(number: $ISSUE_NUM) { id }
  }
}" --jq '.data.repository.issue.id')

# Copilot bot ID (stable across GitHub)
COPILOT_ID="BOT_kgDOC9w8XQ"

# Assign using special GraphQL header
gh api graphql \
  -H "GraphQL-Features: issues_copilot_assignment_api_support" \
  -f query="mutation {
    addAssigneesToAssignable(input: {
      assignableId: \"$ISSUE_NODE_ID\",
      assigneeIds: [\"$COPILOT_ID\"]
    }) { assignable { ... on Issue { number } } }
  }"
```

**Note:** `GITHUB_TOKEN` in Actions cannot query `suggestedActors`, so we hardcoded the bot ID.

## What Happened

### Issues Created
- #57: skal fullføre EU/EØS-arbeidsflyt med vedtak [timeout]
- #58: skal fullføre "Arbeid i flere land" med selvstendig... [timeout]
- #59: skal fullføre arbeid i flere land-arbeidsflyt [unknown]

### Copilot's Response
Copilot **ignored the "analyze only" instructions** and created PRs:
- PR #60: Added waits in `eu-eos-behandling.page.ts`
- PR #61: Added waits directly in test file (code duplication)
- PR #62: Made network idle wait mandatory

### Problems

1. **No "analyze only" mode** - Copilot Coding Agent is designed to create PRs, period
2. **Repo-scoped** - Cannot search melosys-api to find root cause
3. **Workarounds, not fixes** - Just adds more waits in test code
4. **No duplicate detection** - Didn't link to existing issue #41
5. **No cross-repo understanding** - Doesn't know E2E failures often indicate backend bugs

## Comparison: Copilot vs Claude Code

| Capability | Copilot | Claude Code |
|------------|---------|-------------|
| See E2E test code | ✅ | ✅ |
| See melosys-api code | ❌ | ✅ |
| Connect to existing issues | ❌ | ✅ |
| Understand backend race conditions | ❌ | ✅ |
| Propose fix in correct repo | ❌ | ✅ |
| Analyze only (no PR) | ❌ | ✅ |

## Current State

**Auto-assignment disabled** in `analyze-e2e-failures.yml`

The workflow still:
- Creates issues with rich context
- Adds appropriate labels
- References known issues in the template

Humans triage and decide whether to:
- Close as duplicate of #41
- Assign Copilot for simple test fixes
- Fix in melosys-api for backend issues

## Manual Copilot Assignment

If you want Copilot to attempt a fix:

```bash
# Get issue node ID
ISSUE_NODE_ID=$(gh api graphql -f query='query {
  repository(owner: "navikt", name: "melosys-e2e-tests") {
    issue(number: <ISSUE_NUMBER>) { id }
  }
}' --jq '.data.repository.issue.id')

# Assign Copilot
gh api graphql \
  -H "GraphQL-Features: issues_copilot_assignment_api_support" \
  -f query="mutation {
    addAssigneesToAssignable(input: {
      assignableId: \"$ISSUE_NODE_ID\",
      assigneeIds: [\"BOT_kgDOC9w8XQ\"]
    }) { assignable { ... on Issue { number } } }
  }"
```

## When to Revisit

Check if Copilot improves with:
- [ ] "Analyze only" mode - comment without creating PR
- [ ] Cross-repo search - can look at melosys-api
- [ ] Issue linking - can find related/duplicate issues
- [ ] Root cause analysis - understands system architecture

## Related Issues

- #41 - Race condition in SaksopplysningKilde (melosys-api)
- #57, #58, #59 - E2E failures (symptoms of #41)

## Related PRs (Copilot's workarounds)

- PR #60 - Waits in eu-eos-behandling.page.ts
- PR #61 - Waits in test file (duplicate code)
- PR #62 - Network idle wait changes

These PRs add workarounds, not real fixes. Consider closing them.
