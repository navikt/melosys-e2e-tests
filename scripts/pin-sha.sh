#!/usr/bin/env bash
# Skriver commit-sha-en på default-branchen som har samme image som `latest` i GAR. Det er
# verdien `tag` skal ha i .github/e2e-pins.json (se docs/ci-cd/KOBLEDE-ENDRINGER.md).
#
#   scripts/pin-sha.sh <tjeneste>      for eksempel scripts/pin-sha.sh melosys-web
#
# Feiler når ingen av de siste 100 commitene på default-branchen har samme digest som `latest`,
# for eksempel fordi deploy-manuelt har tagget `latest` fra en annen branch.
#
# Krever docker med tilgang til GAR (gcloud auth configure-docker europe-north1-docker.pkg.dev)
# og gh innlogget mot navikt. Oppslaget gjøres av lib/e2e-pins.mjs, samme kode som jobben
# `pinner` i e2e-for-merge.yml bruker.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Bruk: $0 <tjeneste>" >&2
  exit 2
fi

ROT="$(cd "$(dirname "$0")/.." && pwd)"
GH_TOKEN="${GH_TOKEN:-$(gh auth token)}"
export GH_TOKEN
exec node "$ROT/lib/e2e-pins.mjs" sha-bak-latest "$1"
