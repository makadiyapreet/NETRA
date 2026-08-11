"""
Celery tasks for periodic crawling and spike detection.

All tasks use ``self.retry()`` with exponential backoff on transient failures.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from celery import shared_task

from ingestion.config import get_settings
from ingestion.connectors.base import CrawlResult
from ingestion.connectors.simulator import SimulatorConnector
from ingestion.db.watchlist_crud import ActiveWatchlist, get_active_watchlist
from ingestion.monitoring.metrics import start_metrics_server

logger = logging.getLogger(__name__)


def _get_connectors(settings=None):
    """Build the list of active connectors based on config."""
    s = settings or get_settings()
    connectors = []

    if s.simulator_mode:
        connectors.append(SimulatorConnector(count=100))
    else:
        # Import real connectors only when needed
        # Connectors now manage their own KeyPools internally;
        # check for any available keys (multi-key or single-key)
        if s.twitter_bearer_tokens or s.twitter_bearer_token:
            from ingestion.connectors.twitter import TwitterConnector

            connectors.append(TwitterConnector(s))

        if s.youtube_api_keys or s.youtube_api_key:
            from ingestion.connectors.youtube import YouTubeConnector

            connectors.append(YouTubeConnector(s))

        if s.meta_access_tokens or s.meta_access_token:
            from ingestion.connectors.meta import MetaConnector

            connectors.append(MetaConnector(s))
        else:
            # Meta Graph API unavailable — use Playwright scraper as fallback
            # for Facebook/Instagram public page coverage
            from ingestion.connectors.scraper import FallbackScraper

            logger.info("META_ACCESS_TOKEN not set — using FallbackScraper for Facebook/Instagram")
            connectors.append(FallbackScraper())

    if not connectors:
        logger.warning("No connectors available — enable SIMULATOR_MODE or provide API keys")

    return connectors


def _get_watchlist() -> ActiveWatchlist:
    """
    Get the active watchlist from Postgres.

    Falls back to a default watchlist if the DB is not available.
    """
    try:
        from ingestion.db.engine import get_session

        session = get_session()
        try:
            return get_active_watchlist(session)
        finally:
            session.close()
    except Exception as exc:
        logger.warning("Could not load watchlist from DB (%s) — using defaults", exc)
        return ActiveWatchlist()


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
)
def crawl_all(self) -> dict:
    """
    Run all active connectors to crawl every platform.

    Returns a summary dict of results.
    """
    settings = get_settings()
    connectors = _get_connectors(settings)
    watchlist = _get_watchlist()

    results: list[dict] = []
    for connector in connectors:
        try:
            result = connector.run(watchlist, settings)
            results.append({
                "platform": result.platform,
                "connector_type": result.connector_type,
                "posts_fetched": result.posts_fetched,
                "posts_published": result.posts_published,
                "posts_deduped": result.posts_deduped,
                "errors": result.errors,
                "duration_seconds": round(result.duration_seconds, 2),
            })
        except Exception as exc:
            logger.error("Connector %s failed: %s", connector.platform, exc)
            results.append({
                "platform": connector.platform,
                "error": str(exc),
            })

    total_published = sum(r.get("posts_published", 0) for r in results)
    logger.info("crawl_all complete: %d total posts published", total_published)
    return {"results": results, "total_published": total_published}


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def crawl_platform(self, platform: str) -> dict:
    """Crawl a single platform."""
    settings = get_settings()
    watchlist = _get_watchlist()

    connectors = _get_connectors(settings)
    for connector in connectors:
        if connector.platform == platform:
            result = connector.run(watchlist, settings)
            return {
                "platform": result.platform,
                "posts_published": result.posts_published,
                "errors": result.errors,
            }

    return {"error": f"No connector found for platform: {platform}"}


@shared_task(
    bind=True,
    max_retries=2,
    default_retry_delay=15,
    autoretry_for=(Exception,),
)
def run_spike_detection(self) -> dict:
    """
    Run spike detection on all tracked keywords/hashtags.
    """
    from ingestion.trending.spike_detector import detect_spikes

    settings = get_settings()
    watchlist = _get_watchlist()

    # Combine keywords and hashtags for spike checking
    all_terms = list(set(
        watchlist.keyword_strings + watchlist.hashtag_strings
    ))

    if not all_terms:
        return {"spikes_detected": 0, "message": "No keywords/hashtags to check"}

    geo_areas = watchlist.geo_areas or ["Gujarat"]

    total_spikes = 0
    spike_details: list[dict] = []

    for geo_area in geo_areas:
        spikes = detect_spikes(
            keywords=all_terms,
            geo_area=geo_area,
            settings=settings,
            publish=True,
        )
        total_spikes += len(spikes)
        for s in spikes:
            spike_details.append(s.to_dict())

    logger.info("Spike detection complete: %d spikes found", total_spikes)
    return {"spikes_detected": total_spikes, "details": spike_details}
