"""
Celery application configuration.

Broker: Redis (same instance used for dedup/rate-limits).
Beat schedule: periodic crawl-all and spike detection.
"""

from __future__ import annotations

from celery import Celery

from ingestion.config import get_settings

_settings = get_settings()

app = Celery(
    "ingestion",
    broker=_settings.redis_url,
    backend=_settings.redis_url,
    include=["ingestion.scheduler.tasks"],
)

app.conf.update(
    timezone="UTC",
    enable_utc=True,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "crawl-all-platforms": {
            "task": "ingestion.scheduler.tasks.crawl_all",
            "schedule": float(_settings.crawl_interval_seconds),
        },
        "detect-spikes": {
            "task": "ingestion.scheduler.tasks.run_spike_detection",
            "schedule": float(_settings.spike_detection_interval_seconds),
        },
    },
)
