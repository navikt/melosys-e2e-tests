#!/usr/bin/env bash
# Skriver minne, disk og minne per container til jobbsammendraget og jobbloggen, så runnertyper
# kan sammenlignes. Loggen kan hentes med `gh run view --log`; sammendraget finnes bare i nettleseren.
# «Topp» er cgroup v2 memory.peak og tar med sidecache, så Oracle og Kafka ser større ut enn i
# «Minne nå». Stoppede containere er med, så en JVM som er OOM-drept, vises.
# Bruk: scripts/ressurs-oversikt.sh "<overskrift>"
set -uo pipefail

overskrift="${1:-Ressursbruk}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

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
  echo "| Container | Status | Minne nå | Topp inkl. sidecache (MiB) | OOM-drept |"
  echo "|---|---|---|---|---|"
  stats=$(docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}' 2>/dev/null)
  docker ps -aq 2>/dev/null \
    | xargs -r docker inspect --format '{{.Id}}{{"\t"}}{{.Name}}{{"\t"}}{{.State.Status}} ({{.State.ExitCode}}){{"\t"}}{{.State.OOMKilled}}' 2>/dev/null \
    | sort -t$'\t' -k2 \
    | while IFS=$'\t' read -r id name status oom; do
        name="${name#/}"
        mem=$(printf '%s\n' "$stats" | awk -F'\t' -v n="$name" '$1 == n { sub(/ \/.*/, "", $2); print $2 }')
        echo "| ${name} | ${status} | ${mem:--} | $(peak_mib "$id") | ${oom} |"
      done
  echo ""
  echo "</details>"
  echo ""
} | tee -a "$summary"
