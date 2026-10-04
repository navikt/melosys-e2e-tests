#!/usr/bin/env bash
# Skriver hvem som startet kjøringen som markdown på stdout, for jobbsammendraget i shard-jobben
# og merge-jobben i e2e-tests.yml.
#
#   scripts/trigger-summary.sh <trigger-context.json>
#
# Leser EVENT_NAME og PAYLOAD_* fra miljøet. Payload-verdiene kommer via env, ikke ${{ }} i
# skriptet — se «Determine image tags» i workflowen.
set -uo pipefail

CONTEXT_FILE="${1:-}"

if [ "${EVENT_NAME:-}" = "repository_dispatch" ]; then
  REPO="${PAYLOAD_REPOSITORY:-}"
  COMMIT_SHA="${PAYLOAD_COMMIT_SHA:-}"
  COMMIT_URL="https://github.com/navikt/${REPO}/commit/${COMMIT_SHA}"

  echo "### 📦 Triggered by: [\`$REPO\`](https://github.com/navikt/$REPO)"
  echo ""
  echo "- **Image tag:** \`${PAYLOAD_IMAGE_TAG:-}\`"
  echo "- **Commit:** [\`${COMMIT_SHA:0:7}\`]($COMMIT_URL)"
  echo "- **Message:** ${PAYLOAD_COMMIT_MESSAGE:-}"
  echo "- **Actor:** @${PAYLOAD_ACTOR:-}"
  echo ""
fi

# Kjøring fra e2e-gate.yml: GitHub viser e2e-repoets main og eieren av E2E_TRIGGER_PAT øverst på
# siden, så kilden skrives her. Gate-feltene i trigger-context.json er alt validert (tegnsett,
# 40 hex, heltall).
if [ -n "$CONTEXT_FILE" ] && [ -f "$CONTEXT_FILE" ]; then
  jq -r '
    select(.sourceRepo != null)
    | "https://github.com/navikt/\(.sourceRepo)" as $repo
    | "### 📦 Startet av e2e-gate fra [`\(.sourceRepo)`](\($repo))",
      "",
      (if .prNumber != null then "- **PR:** [#\(.prNumber)](\($repo)/pull/\(.prNumber))" else empty end),
      (if .headSha != null then "- **PR-head:** [`\(.headSha[0:7])`](\($repo)/commit/\(.headSha))" else empty end),
      "- **Image:** `\(.sourceRepo):\(.sourceSha[0:7])`"
        + (if .gateTrigger == "pr-label" then " (PR-en flettet inn i master)" else " (commit fra merge queue)" end),
      "- **Tree:** `\(.tree[0:7])`",
      (if .gateActor != null then "- **Startet av:** @\(.gateActor)" else empty end),
      "",
      "> Commiten og aktøren øverst på siden er e2e-repoets `main` og eieren av tokenet gaten bruker, ikke kilden.",
      ""
  ' "$CONTEXT_FILE" || true

  # Kjøring fra e2e-brancher.yml. Feltene er validert i e2e-tests.yml (tegnsett, 40 hex).
  jq -r '
    select(.branchContext != null) | .branchContext
    | "### 🌿 Startet med brancher",
      "",
      (.branches[] | "- `\(.repo)` ← `\(.branch)` ([`\(.sha[0:7])`](https://github.com/navikt/\(.repo)/commit/\(.sha)))"),
      (if .requestedBy != null then "- **Bestilt av:** \(.requestedBy)" else empty end),
      (if .orchestratorRunId != null then "- **Bestilling:** [E2E med brancher](https://github.com/navikt/melosys-e2e-tests/actions/runs/\(.orchestratorRunId))" else empty end),
      ""
  ' "$CONTEXT_FILE" || true
fi
echo ""
