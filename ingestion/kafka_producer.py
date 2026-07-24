"""
Thread-safe Kafka producer wrapper.

Publishes validated ``PostMessage`` instances to the ``raw-posts`` topic and
``TrendSpike`` instances to the ``trend-spikes`` topic.  Uses idempotent
producing to avoid duplicates on retries.
"""

from __future__ import annotations

import json
import logging
import threading
from typing import Optional

from confluent_kafka import KafkaError, Producer

from ingestion.config import Settings, get_settings
from ingestion.models import PostMessage, TrendSpike
from ingestion.monitoring.metrics import (
    kafka_publish_errors,
    kafka_publish_total,
)

logger = logging.getLogger(__name__)

# ── Kafka topic names (fixed by shared contract) ────────────────────────────
TOPIC_RAW_POSTS = "raw-posts"
TOPIC_TREND_SPIKES = "trend-spikes"


class KafkaProducerWrapper:
    """Singleton-ish, thread-safe Kafka producer."""

    _instance: Optional["KafkaProducerWrapper"] = None
    _lock = threading.Lock()

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self._settings = settings or get_settings()
        self._producer = Producer(
            {
                "bootstrap.servers": self._settings.kafka_bootstrap_servers,
                "enable.idempotence": True,
                "acks": "all",
                "retries": 5,
                "linger.ms": 10,
                "batch.size": 16384,
                "compression.type": "snappy",
                "client.id": "ps05-ingestion",
            }
        )
        logger.info(
            "Kafka producer initialized → %s",
            self._settings.kafka_bootstrap_servers,
        )

    # ── singleton accessor ───────────────────────────────────────────────

    @classmethod
    def get_instance(cls, settings: Optional[Settings] = None) -> "KafkaProducerWrapper":
        """Return (or create) the singleton producer instance."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls(settings)
        return cls._instance

    # ── delivery callback ────────────────────────────────────────────────

    @staticmethod
    def _on_delivery(err: Optional[KafkaError], msg) -> None:  # type: ignore[type-arg]
        """Called once per message after broker acknowledgement."""
        if err is not None:
            logger.error("Kafka delivery failed: %s", err)
            kafka_publish_errors.labels(topic=msg.topic()).inc()
        else:
            kafka_publish_total.labels(topic=msg.topic()).inc()
            logger.debug(
                "Published → %s [%d] @ %d",
                msg.topic(),
                msg.partition(),
                msg.offset(),
            )

    # ── publish helpers ──────────────────────────────────────────────────

    def publish_post(self, post: PostMessage) -> None:
        """Publish a validated post to ``raw-posts``."""
        self._producer.produce(
            topic=TOPIC_RAW_POSTS,
            key=post.post_id.encode("utf-8"),
            value=post.to_kafka_bytes(),
            callback=self._on_delivery,
        )
        self._producer.poll(0)  # trigger delivery reports

    def publish_trend_spike(self, spike: TrendSpike) -> None:
        """Publish a validated trend spike to ``trend-spikes``."""
        self._producer.produce(
            topic=TOPIC_TREND_SPIKES,
            key=spike.keyword.encode("utf-8"),
            value=spike.to_kafka_bytes(),
            callback=self._on_delivery,
        )
        self._producer.poll(0)

    # ── lifecycle ────────────────────────────────────────────────────────

    def flush(self, timeout: float = 10.0) -> int:
        """Block until all buffered messages are delivered or timeout."""
        remaining = self._producer.flush(timeout)
        if remaining > 0:
            logger.warning("%d messages still in queue after flush", remaining)
        return remaining

    def close(self) -> None:
        """Flush and release resources."""
        self.flush()
        logger.info("Kafka producer closed.")
