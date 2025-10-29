#!/bin/bash

echo "Venter til Zookeeper er oppe..."
until timeout 5 nc zookeeper 2181; do
    echo "Zookeeper er ikke oppe. Tester igjen om 2 sekunder..."
    sleep 2;
done

echo "ZooKeeper er oppe og kjører. Starter Kafka..."

# Start Kafka
exec /etc/confluent/docker/run
