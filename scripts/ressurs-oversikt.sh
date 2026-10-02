#!/usr/bin/env bash
# Skriver minne, disk og minne per container til jobbsammendraget, så runnertyper kan sammenlignes.
# «Topp» er containerens høyeste minnebruk så langt (cgroup v2 memory.peak), ikke bare nå.
# Bruk: scripts/ressurs-oversikt.sh "<overskrift>"
set -uo pipefail

overskrift="${1:-Ressursbruk}"
out="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

peak_mib() {
  local id="$1" f
  for f in "/sys/fs/cgroup/system.slice/docker-${id}.scope/memory.peak" \
           "/sys/fs/cgroup/docker/${id}/memory.peak"; do
    [ -r "$f" ] && { echo $(( $(cat "$f") / 1024 / 1024 )); return; }
  done
  echo "?"
}

{
  echo "<details><summary>🧮 ${overskrift}</summary>"
  echo ""
  echo '```'
  echo "Runner: ${RUNNER_NAME:-?} · $(nproc) kjerner"
  free -m
  echo ""
  df -h / /mnt 2>/dev/null
  echo '```'
  echo ""
  echo "| Container | Minne nå | Topp (MiB) | OOM-drept |"
  echo "|---|---|---|---|"
  docker stats --no-stream --format '{{.ID}}\t{{.Name}}\t{{.MemUsage}}' 2>/dev/null | sort -k2 \
    | while IFS=$'\t' read -r id name mem; do
        full_id=$(docker inspect --format '{{.Id}}' "$id" 2>/dev/null)
        oom=$(docker inspect --format '{{.State.OOMKilled}}' "$id" 2>/dev/null)
        echo "| ${name} | ${mem%% /*} | $(peak_mib "$full_id") | ${oom:-?} |"
      done
  echo ""
  echo "</details>"
  echo ""
} >> "$out"
