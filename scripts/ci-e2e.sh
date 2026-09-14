#!/usr/bin/env bash
# Starter «E2E Tests»-workflowen på GitHub for branchen du står på, og venter på resultatet.
#
# Workflowen er dispatch-only, så en push starter ingenting — du må sende inn image-tagger og
# eventuelt et testfilter for hånd. Det er fire gh-kall og en pollesløyfe å huske, og filteret
# er lett å sette for smalt. Dette scriptet gjør begge deler for deg.
#
#   ./scripts/ci-e2e.sh                      hele suiten mot latest
#   ./scripts/ci-e2e.sh --affected           kun testene endringen din rører
#   ./scripts/ci-e2e.sh --grep "8163"        eget filter
#   ./scripts/ci-e2e.sh --env melosys-api:min-tag,melosys-web:min-tag
#   ./scripts/ci-e2e.sh --affected --no-wait starter og returnerer med én gang
#   ./scripts/ci-e2e.sh --affected --vis-filter  skriver ut hele filteret
#
# --affected spør scripts/affected-tests.mjs, som følger importgrafen i stedet for å gjette, og
# som selv avgjør når hele suiten skal kjøres: ved endringer utenfor grafen, når ingen spec er
# påvirket, og når 80 % eller mer er påvirket.
set -euo pipefail

cd "$(dirname "$0")/.."

ENVIRONMENT="latest"
GREP=""
AFFECTED=0
WAIT=1
RETRIES="true"   # disable_retries: uten retries ser du ekte flakiness

while [ $# -gt 0 ]; do
  case "$1" in
    --affected) AFFECTED=1; shift ;;
    --grep)
      if [ -z "${2:-}" ]; then
        echo "❌ --grep krever et mønster. Bruk make ci for hele suiten." >&2
        exit 2
      fi
      GREP="$2"; shift 2 ;;
    --env)      ENVIRONMENT="$2"; shift 2 ;;
    --no-wait)  WAIT=0; shift ;;
    --vis-filter) VIS_FILTER=1; shift ;;
    --retries)  RETRIES="false"; shift ;;
    -h|--help)  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Ukjent flagg: $1" >&2; exit 2 ;;
  esac
done

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# Hent main og branchen før noe annet: utvalget regnes mot origin/main, og sjekkene under leser
# origin/$BRANCH. Uten fetch sammenligner begge mot det som tilfeldigvis lå lokalt.
git fetch --quiet origin main "$BRANCH" 2>/dev/null || git fetch --quiet origin main 2>/dev/null || true

if [ "$AFFECTED" -eq 1 ]; then
  # Tom utdata betyr hele suiten; begrunnelsen skrives til stderr.
  GREP="$(node scripts/affected-tests.mjs)"
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "⚠️  Du har ucommittede endringer. CI kjører koden som ligger på origin/$BRANCH." >&2
fi
if ! git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  echo "❌ Branchen $BRANCH finnes ikke på origin. Push den først — workflowen leser fra ref-en." >&2
  exit 1
fi
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")"
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "⚠️  origin/$BRANCH peker på en annen commit enn HEAD. CI kjører remote-versjonen." >&2
fi
# CI tester branchen, ikke resultatet av merge. Mangler branchen commits fra main i dette repoet,
# kan en grønn kjøring bli rød etter merge. Endringer i images på latest fanges ikke her.
# Finnes ikke origin/main lokalt (for eksempel i en --single-branch-klon), hoppes sjekken over.
if [ -n "$REMOTE" ] && git rev-parse --verify --quiet origin/main >/dev/null \
  && ! git merge-base --is-ancestor origin/main "$REMOTE"; then
  BAK="$(git rev-list --count "$REMOTE..origin/main")"
  echo "⚠️  origin/$BRANCH mangler $BAK commit(s) fra origin/main. Grønt her betyr ikke grønt etter merge." >&2
  echo "   Merge inn main først: git merge origin/main && git push" >&2
fi

echo "🚀 Starter E2E Tests"
echo "   branch:      $BRANCH"
echo "   environment: $ENVIRONMENT"
if [ -z "$GREP" ]; then
  echo "   filter:      <hele suiten>"
else
  ANTALL_MONSTRE="$(printf '%s' "$GREP" | tr '|' '\n' | grep -c '')"
  echo "   filter:      ${#GREP} tegn, $ANTALL_MONSTRE mønstre (vis med --vis-filter)"
  [ "${VIS_FILTER:-0}" -eq 1 ] && printf '%s\n' "$GREP"
fi

ARGS=(--ref "$BRANCH" -f environment="$ENVIRONMENT" -f disable_retries="$RETRIES")
[ -n "$GREP" ] && ARGS+=(-f test_grep="$GREP")

# Dispatch gir ingen run-id tilbake. Vi ser etter den eldste workflow_dispatch-kjøringen fra deg
# på branchen som er opprettet etter dette tidspunktet, så en eldre kjøring eller en
# repository_dispatch fra et image-bygg ikke blir fulgt i stedet.
GH_USER="$(gh api user --jq .login)"
START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gh workflow run "E2E Tests" "${ARGS[@]}"

RUN_ID=""
for _ in $(seq 1 20); do
  sleep 3
  RUN_ID="$(gh run list --workflow "E2E Tests" --branch "$BRANCH" --event workflow_dispatch \
    --user "$GH_USER" --limit 20 --json databaseId,createdAt \
    --jq "[.[] | select(.createdAt >= \"$START\")] | last | .databaseId // empty")"
  [ -n "$RUN_ID" ] && break
done
if [ -z "$RUN_ID" ]; then
  echo "❌ Fant ikke kjøringen etter 60 sekunder. Se gh run list --workflow \"E2E Tests\" --branch $BRANCH" >&2
  exit 1
fi
URL="$(gh run view "$RUN_ID" --json url --jq .url)"
echo "   run:         $URL"

if [ "$WAIT" -eq 0 ]; then exit 0; fi

echo "⏳ Venter..."
while :; do
  STATUS="$(gh run view "$RUN_ID" --json status --jq .status)"
  [ "$STATUS" = "completed" ] && break
  sleep 30
done

CONCLUSION="$(gh run view "$RUN_ID" --json conclusion --jq .conclusion)"
echo ""
gh run view "$RUN_ID" --log 2>/dev/null \
  | grep -E "Run Playwright tests" \
  | grep -oE "[0-9]+ (passed|failed|flaky|skipped).*" \
  | tail -4 || true
echo ""
if [ "$CONCLUSION" = "success" ]; then
  echo "✅ $CONCLUSION — $URL"
else
  echo "❌ $CONCLUSION — $URL"
  exit 1
fi
