#!/bin/bash

echo "Venter til databasen er klar..."

while ! pg_isready -h postgres_felleskodeverk.melosys.docker-internal -p 5432 -U postgres; do
  echo "Postgres er fortsatt ikke klar.. Venter i ett sekund."
  sleep 1
done

exec java -XX:+UnlockExperimentalVMOptions -Dappdynamics.agent.applicationName=_ -Dappdynamics.agent.reuse.nodeName.prefix=__ -jar app.jar entrypoint.sh
