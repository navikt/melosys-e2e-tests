#!/bin/bash

echo "Venter til databasen er klar..."

while ! pg_isready -h postgres_felleskodeverk.melosys.docker-internal -p 5432 -U postgres; do
  echo "Postgres er fortsatt ikke klar.. Venter i ett sekund."
  sleep 1
done

# Appen henter JWKS fra OAuth-mocken én gang ved oppstart og dør hvis den ikke svarer
# (run 38389042150: «Couldn't retrieve remote JWK set: Read timed out»). Etter 120 s
# startes den likevel, og restart-policyen i docker-compose.yml tar resten.
echo "Venter på OAuth-mocken..."
frist=$((SECONDS + 120))
until curl -sf --max-time 5 -o /dev/null http://host.docker.internal:8082/isso/jwks; do
  [ "$SECONDS" -ge "$frist" ] && { echo "OAuth-mocken svarer ikke - starter likevel."; break; }
  sleep 2
done

exec java -XX:+UnlockExperimentalVMOptions -Dappdynamics.agent.applicationName=_ -Dappdynamics.agent.reuse.nodeName.prefix=__ -jar app.jar entrypoint.sh
