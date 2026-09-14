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
# --affected spør scripts/affected-tests.mjs, som følger importgrafen i stedet for å gjette.
# Endrer du en fellesmodul svarer det gjerne «nesten hele suiten» — det er riktig svar, ikke
# en feil: fixtures importeres av nær sagt hver spec. Over 80 % dropper scriptet filteret og
# kjører alt, fordi et filter som dekker nesten alt bare er en skjør kjempestreng.
set -euo pipefail

cd "$(dirname "$0")/.."

ENVIRONMENT="latest"
GREP=""
AFFECTED=0
# Over denne andelen er «kun påvirkede» ikke lenger et utvalg. Å sende et filter som dekker
# nesten alt gir bare en skjør kjempestreng av filstier, uten å spare kjøretid.
FULL_SUITE_TERSKEL=80
WAIT=1
RETRIES="true"   # disable_retries: uten retries ser du ekte flakiness

while [ $# -gt 0 ]; do
  case "$1" in
    --affected) AFFECTED=1; shift ;;
    --grep)     GREP="$2"; shift 2 ;;
    --env)      ENVIRONMENT="$2"; shift 2 ;;
    --no-wait)  WAIT=0; shift ;;
    --vis-filter) VIS_FILTER=1; shift ;;
    --retries)  RETRIES="false"; shift ;;
    -h|--help)  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Ukjent flagg: $1" >&2; exit 2 ;;
  esac
done

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [ "$AFFECTED" -eq 1 ]; then
  RAPPORT="$(node scripts/affected-tests.mjs --json)"
  ANDEL="$(printf '%s' "$RAPPORT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).sharePercent))')"
  ANTALL="$(printf '%s' "$RAPPORT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).specs.length))')"
  if [ "$ANDEL" -ge "$FULL_SUITE_TERSKEL" ]; then
    echo "ℹ️  $ANTALL spec-filer ($ANDEL %) er påvirket — kjører hele suiten i stedet for å filtrere."
    GREP=""
  else
    GREP="$(printf '%s' "$RAPPORT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).grep))')"
  fi
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

echo "🚀 Starter E2E Tests"
echo "   branch:      $BRANCH"
echo "   environment: $ENVIRONMENT"
if [ -z "$GREP" ]; then
  echo "   filter:      <hele suiten>"
else
  ANTALL_MONSTRE="$(printf '%s' "$GREP" | tr '|' '\n' | grep -c '')"
  echo "   filter:      ${#GREP} tegn, $ANTALL_MONSTRE spec-filer (vis med --vis-filter)"
  [ "${VIS_FILTER:-0}" -eq 1 ] && printf '%s\n' "$GREP"
fi

ARGS=(--ref "$BRANCH" -f environment="$ENVIRONMENT" -f disable_retries="$RETRIES")
[ -n "$GREP" ] && ARGS+=(-f test_grep="$GREP")
gh workflow run "E2E Tests" "${ARGS[@]}"

# Dispatch gir ingen run-id tilbake, så vi henter den nyeste kjøringen på denne branchen.
sleep 6
RUN_ID="$(gh run list --workflow "E2E Tests" --branch "$BRANCH" --limit 1 --json databaseId --jq '.[0].databaseId')"
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
