#!/usr/bin/env bash
# Lister compose-containere som har dødd: status exited, exit-kode ulik 0 og ingen omstart
# igjen i restart-policyen. Uten --tjenester tas også containere som krasjer i løkke, med.
# Den som døde først står øverst, fordi den som regel er årsaken og resten følgefeil
# (run 38389042150: felles-kodeverk døde, deretter melosys-api fordi den ikke fant
# felles-kodeverk).
#
# Bruk:
#   scripts/doede-containere.sh               én linje per container: navn, tilstand, tidspunkt, årsak
#   scripts/doede-containere.sh --tjenester   bare tjenestenavnene til dem som ikke kommer tilbake
set -uo pipefail

modus="${1:-}"

# Første og dypeste unntak i loggen fra siste kjøring, uten pakkenavn. Det første sier hva
# som feilet, det dypeste hvorfor. Uten unntak: siste ikke-tomme linje.
aarsak() {
  local logg unntak forste siste
  if [ "$(docker inspect -f '{{.State.OOMKilled}}' "$1" 2>/dev/null)" = "true" ]; then
    echo "OOM-drept: runneren eller containeren gikk tom for minne"
    return
  fi
  # Uten --since blandes alle omstartene: første unntak fra én kjøring, dypeste fra en annen.
  logg=$(docker logs --since "$(docker inspect -f '{{.State.StartedAt}}' "$1")" "$1" 2>&1 \
    | sed -E $'s/\x1b\\[[0-9;]*m//g')
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

  if [ "$status" = "restarting" ]; then
    # Kan fortsatt komme opp, så den stopper ikke ventingen. Men når taket nås, er en
    # container som krasjer i løkke ofte årsaken, så den tas med i diagnosen.
    [ "$modus" = "--tjenester" ] && continue
    tilstand="exit $kode, krasjer fortsatt etter $antall omstart(er)"
  elif [ "$status" = "exited" ] && [ "$kode" != "0" ]; then
    case "$policy" in
      always|unless-stopped) continue ;;
      on-failure) { [ "$maks" = "0" ] || [ "$antall" -lt "$maks" ]; } && continue ;;
    esac
    tilstand="exit $kode"
  else
    continue
  fi
  linjer+="$slutt $navn $tjeneste $tilstand"$'\n'
done

[ -z "$linjer" ] && exit 0

printf '%s' "$linjer" | sort | while read -r slutt navn tjeneste tilstand; do
  if [ "$modus" = "--tjenester" ]; then
    echo "$tjeneste"
  else
    # FinishedAt er UTC i RFC 3339, for eksempel 2026-10-13T11:20:41.123Z.
    printf '%s (%s, kl. %s UTC): %s\n' "$navn" "$tilstand" "${slutt:11:8}" "$(aarsak "$navn")"
  fi
done
