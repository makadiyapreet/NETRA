"""
Rolling z-score spike detection on keyword/hashtag frequency.

Monitors time-bucketed keyword frequencies stored in Redis and publishes
``TrendSpike`` messages to the Kafka ``trend-spikes`` topic whenever a
keyword's current frequency exceeds the rolling z-score threshold.

Severity hint mapping:
    z ≥ 3 → severity 1
    z ≥ 4 → severity 2
    z ≥ 5 → severity 3
    z ≥ 6 → severity 4
    z ≥ 7 → severity 5
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

import numpy as np

from ingestion.config import Settings, get_settings
from ingestion.kafka_producer import KafkaProducerWrapper
from ingestion.models import TrendSpike
from ingestion.monitoring.metrics import spike_detected
from ingestion.redis_client import RedisClient

logger = logging.getLogger(__name__)


def z_score_from_series(series: list[int]) -> float:
    """
    Compute the z-score of the **last element** relative to the preceding
    window.

    Args:
        series: Ordered frequency counts (oldest → newest).  Must have
                at least 3 elements.

    Returns:
        The z-score of the last element.  Returns ``0.0`` if the standard
        deviation is zero (flat series).
    """
    if len(series) < 3:
        return 0.0

    arr = np.array(series[:-1], dtype=np.float64)
    current = float(series[-1])
    mean = np.mean(arr)
    std = np.std(arr, ddof=1)  # sample std

    if std < 1e-9:
        # Baseline is perfectly flat.  If the current value differs from
        # the mean, the deviation is effectively infinite — return a large
        # finite z-score to correctly signal the spike.
        if abs(current - mean) > 1e-9:
            return 100.0 if current > mean else -100.0
        return 0.0

    return (current - mean) / std


def severity_from_z(z: float) -> int:
    """Map a z-score to a severity hint (1-5)."""
    if z >= 7:
        return 5
    elif z >= 6:
        return 4
    elif z >= 5:
        return 3
    elif z >= 4:
        return 2
    else:
        return 1


def detect_spikes(
    keywords: list[str],
    geo_area: str = "unknown",
    settings: Optional[Settings] = None,
    publish: bool = True,
) -> list[TrendSpike]:
    """
    Check all ``keywords`` for frequency spikes and optionally publish
    detected spikes to Kafka.

    Args:
        keywords: Keywords/hashtags to check.
        geo_area: Geo-area label for the spike message.
        settings: Optional settings override.
        publish: If ``True`` (default), publish spikes to Kafka.

    Returns:
        List of detected ``TrendSpike`` objects.
    """
    _settings = settings or get_settings()
    redis = RedisClient.get_instance(_settings)
    threshold = _settings.spike_z_threshold
    window = _settings.spike_window_size

    spikes: list[TrendSpike] = []
    now = datetime.now(timezone.utc)

    for keyword in keywords:
        series = redis.get_keyword_series(keyword, num_buckets=window)
        z = z_score_from_series(series)

        if z >= threshold:
            spike = TrendSpike(
                keyword=keyword,
                geo_area=geo_area,
                current_frequency=series[-1] if series else 0,
                z_score=round(z, 4),
                detected_at=now,
                severity_hint=severity_from_z(z),
            )
            spikes.append(spike)
            spike_detected.inc()
            logger.warning(
                "🚨 SPIKE DETECTED: '%s' z=%.2f severity=%d freq=%d",
                keyword,
                z,
                spike.severity_hint,
                spike.current_frequency,
            )

            if publish:
                try:
                    producer = KafkaProducerWrapper.get_instance(_settings)
                    producer.publish_trend_spike(spike)
                except Exception as exc:
                    logger.error("Failed to publish spike to Kafka: %s", exc)

    if spikes:
        logger.info("Detected %d spikes out of %d keywords", len(spikes), len(keywords))

    return spikes


def detect_spikes_from_series(
    keyword_counts: dict[str, list[int]],
    threshold: float = 3.0,
) -> list[TrendSpike]:
    """
    Pure-function variant: detect spikes from pre-built time series.

    Useful for unit testing without Redis/Kafka dependencies.

    Args:
        keyword_counts: Map of keyword → list of frequency counts.
        threshold: Z-score threshold for spike detection.

    Returns:
        List of detected ``TrendSpike`` objects (not published to Kafka).
    """
    spikes: list[TrendSpike] = []
    now = datetime.now(timezone.utc)

    for keyword, series in keyword_counts.items():
        z = z_score_from_series(series)
        if z >= threshold:
            spikes.append(
                TrendSpike(
                    keyword=keyword,
                    geo_area="test",
                    current_frequency=series[-1] if series else 0,
                    z_score=round(z, 4),
                    detected_at=now,
                    severity_hint=severity_from_z(z),
                )
            )

    return spikes
