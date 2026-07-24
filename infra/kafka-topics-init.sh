#!/bin/bash
# ============================================================
# Create Kafka topics for NETRA
# Run this after Kafka broker is up and healthy.
# ============================================================

set -e

BOOTSTRAP=${KAFKA_BOOTSTRAP_SERVERS:-localhost:9092}

echo "Creating Kafka topics on ${BOOTSTRAP}..."

kafka-topics --create --if-not-exists \
  --bootstrap-server "$BOOTSTRAP" \
  --partitions 3 --replication-factor 1 \
  --topic raw-posts

kafka-topics --create --if-not-exists \
  --bootstrap-server "$BOOTSTRAP" \
  --partitions 3 --replication-factor 1 \
  --topic trend-spikes

kafka-topics --create --if-not-exists \
  --bootstrap-server "$BOOTSTRAP" \
  --partitions 3 --replication-factor 1 \
  --topic classified-posts

kafka-topics --create --if-not-exists \
  --bootstrap-server "$BOOTSTRAP" \
  --partitions 3 --replication-factor 1 \
  --topic alerts

echo ""
echo "Topics created:"
kafka-topics --list --bootstrap-server "$BOOTSTRAP"
echo ""
echo "Done."
