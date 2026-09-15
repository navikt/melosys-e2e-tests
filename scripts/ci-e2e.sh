#!/usr/bin/env bash
# Starter «E2E Tests»-workflowen på GitHub for en branch, og venter på resultatet.
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
#   ./scripts/ci-e2e.sh --affected --branch min-branch  en annen branch enn den du står på
#   ./scripts/ci-e2e.sh --affected -p        skriver ut gh-kommandoen uten å starte noe
#
# Uten --branch spør scriptet om branchen du står på skal brukes, når det kjører i en terminal.
#
# --affected spør scripts/affected-tests.mjs, som følger importgrafen i stedet for å gjette, og
# som selv avgjør når hele suiten skal kjøres: ved endringer utenfor grafen, når ingen spec er
# påvirket, og når 80 % eller mer er påvirket.
set -euo pipefail

cd "$(dirname "$0")/.."

ENVIRONMENT="latest"
BRANCH=""
PREVIEW=0
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
    --branch)
      if [ -z "${2:-}" ]; then
        echo "❌ --branch krever et branchnavn." >&2
        exit 2
      fi
      BRANCH="$2"; shift 2 ;;
    --env)      ENVIRONMENT="$2"; shift 2 ;;
    --no-wait)  WAIT=0; shift ;;
    -p|--preview) PREVIEW=1; shift ;;
    --vis-filter) VIS_FILTER=1; shift ;;
    --retries)  RETRIES="false"; shift ;;
    -h|--help)  awk 'NR > 1 && !/^#/ { exit } NR > 1 { sub(/^# ?/, ""); print }' "$0"; exit 0 ;;
    *) echo "Ukjent flagg: $1" >&2; exit 2 ;;
  esac
done

GJELDENDE="$(git rev-parse --abbrev-ref HEAD)"
if [ -z "$BRANCH" ]; then
  BRANCH="$GJELDENDE"
  # Spør bare i en terminal. Kalt fra et annet script eller en test brukes branchen du står på.
  if [ -t 0 ]; then
    read -r -p "Kjør mot branchen du står på, «${GJELDENDE}»? [J/n] " SVAR || { echo "" >&2; echo "❌ Avbrutt." >&2; exit 2; }
    case "$SVAR" in
      [nN]*)
        read -r -p "Branch: " BRANCH || { echo "" >&2; echo "❌ Avbrutt." >&2; exit 2; }
        if [ -z "$BRANCH" ]; then
          echo "❌ Ingen branch oppgitt." >&2
          exit 2
        fi ;;
    esac
  fi
fi

# Hent main og branchen før noe annet: utvalget regnes mot origin/main, og sjekkene under leser
# origin/$BRANCH. Uten fetch sammenligner begge mot det som tilfeldigvis lå lokalt.
git fetch --quiet origin main "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" 2>/dev/null || git fetch --quiet origin main 2>/dev/null || true

if ! git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  echo "❌ Branchen $BRANCH finnes ikke på origin. Push den først — workflowen leser fra ref-en." >&2
  exit 1
fi

SAMMENDRAG=""
if [ "$AFFECTED" -eq 1 ]; then
  # Tom utdata betyr hele suiten. Utvalget regnes fra origin/$BRANCH, fordi CI bare ser det som
  # er pushet. Sammendraget på stderr vises i startblokken under.
  SAMMENDRAG_FIL="$(mktemp)"
  trap 'rm -f "$SAMMENDRAG_FIL"' EXIT
  if ! GREP="$(node scripts/affected-tests.mjs --kun-committet --head "origin/$BRANCH" 2>"$SAMMENDRAG_FIL")"; then
    cat "$SAMMENDRAG_FIL" >&2
    exit 2
  fi
  SAMMENDRAG="$(cat "$SAMMENDRAG_FIL")"
fi

REMOTE="$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")"
# Arbeidstreet og HEAD gjelder bare når du kjører branchen du står på.
if [ "$BRANCH" = "$GJELDENDE" ]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "⚠️  Du har ucommittede endringer. CI kjører koden som ligger på origin/$BRANCH." >&2
  fi
  if [ "$(git rev-parse HEAD)" != "$REMOTE" ]; then
    echo "⚠️  origin/$BRANCH peker på en annen commit enn HEAD. CI kjører remote-versjonen." >&2
  fi
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

if [ "$PREVIEW" -eq 1 ]; then echo "🔍 Forhåndsvisning av E2E Tests"; else echo "🚀 Starter E2E Tests"; fi
echo "   branch:      $BRANCH"
echo "   environment: $ENVIRONMENT"
if [ -z "$GREP" ]; then
  echo "   filter:      <hele suiten>"
else
  ANTALL_MONSTRE="$(printf '%s' "$GREP" | tr '|' '\n' | grep -c '')"
  echo "   filter:      ${#GREP} tegn, $ANTALL_MONSTRE mønstre (vis med --vis-filter)"
  [ "${VIS_FILTER:-0}" -eq 1 ] && printf '%s\n' "$GREP"
fi
if [ -n "$SAMMENDRAG" ]; then
  printf '%s\n' "$SAMMENDRAG" | sed 's/^/   /'
fi

ARGS=(--ref "$BRANCH" -f environment="$ENVIRONMENT" -f disable_retries="$RETRIES")
[ -n "$GREP" ] && ARGS+=(-f test_grep="$GREP")

if [ "$PREVIEW" -eq 1 ]; then
  # %q gir en linje du kan lime rett inn i skallet.
  echo ""
  printf 'gh workflow run %q' "E2E Tests"
  printf ' %q' "${ARGS[@]}"
  echo ""
  exit 0
fi

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
