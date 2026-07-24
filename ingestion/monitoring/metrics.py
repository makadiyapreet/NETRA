"""
Prometheus metrics for the ingestion pipeline.

Exposes counters, histograms, and a lightweight HTTP server on
``METRICS_PORT`` (default 8000) for Prometheus to scrape.
"""

from __future__ import annotations

import logging
import threading
from typing import Optional

from prometheus_client import (
    Counter,
    Histogram,
    start_http_server,
)

logger = logging.getLogger(__name__)

# ─── Counters ────────────────────────────────────────────────────────────────

posts_ingested = Counter(
    "posts_ingested_total",
    "Total posts successfully ingested and published to Kafka",
    ["platform"],
)

posts_deduplicated = Counter(
    "posts_deduplicated_total",
    "Total posts skipped due to deduplication",
    ["platform"],
)

api_errors = Counter(
    "api_errors_total",
    "Total API errors encountered during crawling",
    ["platform", "error_type"],
)

api_calls = Counter(
    "api_calls_total",
    "Total API calls made to external platforms",
    ["platform"],
)

kafka_publish_total = Counter(
    "kafka_publish_total",
    "Total messages successfully published to Kafka",
    ["topic"],
)

kafka_publish_errors = Counter(
    "kafka_publish_errors_total",
    "Total Kafka publish failures",
    ["topic"],
)

spike_detected = Counter(
    "spike_detected_total",
    "Total trend spikes detected",
)

# ─── Histograms ──────────────────────────────────────────────────────────────

crawl_duration = Histogram(
    "crawl_duration_seconds",
    "Time taken to complete a crawl cycle",
    ["platform"],
    buckets=(0.5, 1, 2, 5, 10, 30, 60, 120, 300),
)

# ─── Metrics server ─────────────────────────────────────────────────────────

_server_started = False
_server_lock = threading.Lock()


def start_metrics_server(port: Optional[int] = None) -> None:
    """Start the Prometheus metrics HTTP server (idempotent)."""
    global _server_started
    if _server_started:
        return
    with _server_lock:
        if _server_started:
            return
        from ingestion.config import get_settings

        _port = port or get_settings().metrics_port
        start_http_server(_port)
        _server_started = True
        logger.info("Prometheus metrics server started on :%d", _port)
