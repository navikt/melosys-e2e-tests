#!/usr/bin/env bash
# Lister compose-containere som har dødd og ikke kommer tilbake: status exited, exit-kode
# ulik 0, og ingen omstart igjen i restart-policyen. Den som døde først står øverst, fordi
# den som regel er årsaken og resten følgefeil (run 38389042150: felles-kodeverk døde,
# deretter melosys-api fordi den ikke fant felles-kodeverk).
#
# Bruk:
#   scripts/doede-containere.sh          én linje per container: navn, exit-kode, tidspunkt, årsak
#   scripts/doede-containere.sh --tjenester   bare compose-tjenestenavnene
set -uo pipefail

modus="${1:-}"

# Første og dypeste unntak i loggen, uten pakkenavn. Det første sier hva som feilet, det
# dypeste hvorfor. Uten unntak: siste ikke-tomme linje.
aarsak() {
  local logg unntak forste siste
  logg=$(docker logs "$1" 2>&1 | sed -E $'s/\x1b\\[[0-9;]*m//g')
  unntak=$(printf '%s\n' "$logg" \
    | grep -E '^(Caused by: )?[a-z][A-Za-z0-9_$]*(\.[A-Za-z0-9_$]+)*\.[A-Z][A-Za-z0-9_$]*(Exception|Error)(: |$)' \
    | sed -E 's/^Caused by: //; s/^([a-z][A-Za-z0-9_$]*\.)+//')
  if [ -z "$unntak" ]; then
    printf '%s\n' "$logg" | grep -v '^[[:space:]]*$' | tail -1 | cut -c1-200
    return
  fi
  forste=$(printf '%s\n' "$unntak" | head -1 | cut -c1-200)
  siste=$(printf '%s\n' "$unntak" | tail -1 | cut -c1-200)
  if [ "$forste" = "$siste" ]; then
    printf '%s\n' "$forste"
  else
    printf '%s ← %s\n' "$forste" "$siste"
  fi
}

linjer=""
for c in $(docker compose ps -aq 2>/dev/null); do
  # Feltene: navn, tjeneste, status, exit-kode, sluttidspunkt, policy, maks omstarter, omstarter.
  info=$(docker inspect -f '{{.Name}} {{with index .Config.Labels "com.docker.compose.service"}}{{.}}{{else}}-{{end}} {{.State.Status}} {{.State.ExitCode}} {{.State.FinishedAt}} {{.HostConfig.RestartPolicy.Name}} {{.HostConfig.RestartPolicy.MaximumRetryCount}} {{.RestartCount}}' "$c" 2>/dev/null) || continue
  read -r navn tjeneste status kode slutt policy maks antall <<< "$info"
  navn="${navn#/}"

  [ "$status" = "exited" ] && [ "$kode" != "0" ] || continue
  case "$policy" in
    always|unless-stopped) continue ;;
    on-failure) { [ "$maks" = "0" ] || [ "$antall" -lt "$maks" ]; } && continue ;;
  esac
  linjer+="$slutt $navn $tjeneste $kode"$'\n'
done

[ -z "$linjer" ] && exit 0

printf '%s' "$linjer" | sort | while read -r slutt navn tjeneste kode; do
  if [ "$modus" = "--tjenester" ]; then
    echo "$tjeneste"
  else
    # FinishedAt er UTC i RFC 3339, for eksempel 2026-10-13T11:20:41.123Z.
    printf '%s (exit %s kl. %s UTC): %s\n' "$navn" "$kode" "${slutt:11:8}" "$(aarsak "$navn")"
  fi
done
