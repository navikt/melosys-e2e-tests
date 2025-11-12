#!/bin/bash

echo "Initialiserer Kafka i KRaft-modus..."

# Format storage hvis det ikke allerede er gjort
if [ ! -d "/var/lib/kafka/data/meta.properties" ]; then
    echo "Formaterer Kafka storage for KRaft-modus..."
    /usr/bin/kafka-storage format \
        -t ${CLUSTER_ID} \
        -c /etc/kafka/kafka.properties
else
    echo "Kafka storage er allerede formatert"
fi

echo "Starter Kafka i KRaft-modus..."

# Start Kafka
exec /etc/confluent/docker/run
