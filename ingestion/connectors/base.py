"""
Abstract base connector defining the contract every platform connector must
implement.

Flow:  fetch_posts() → deduplicate (Redis) → publish (Kafka) → log (Postgres).
"""

from __future__ import annotations

import logging
import time
import traceback
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from ingestion.config import Settings, get_settings
from ingestion.db.watchlist_crud import ActiveWatchlist
from ingestion.kafka_producer import KafkaProducerWrapper
from ingestion.models import PostMessage
from ingestion.monitoring.metrics import (
    api_errors,
    crawl_duration,
    posts_deduplicated,
    posts_ingested,
)
from ingestion.redis_client import RedisClient

logger = logging.getLogger(__name__)


@dataclass
class CrawlResult:
    """Summary returned by a connector run."""

    platform: str
    connector_type: str
    posts_fetched: int = 0
    posts_published: int = 0
    posts_deduped: int = 0
    errors: int = 0
    error_detail: Optional[str] = None
    duration_seconds: float = 0.0


class BaseConnector(ABC):
    """
    Abstract base class for platform connectors.

    Subclasses implement ``platform``, ``connector_type``, and
    ``fetch_posts()``.  The ``run()`` method orchestrates the full
    fetch → dedup → publish → metrics pipeline.
    """

    @property
    @abstractmethod
    def platform(self) -> str:
        """Return the platform name (e.g. 'twitter')."""
        ...

    @property
    def connector_type(self) -> str:
        """Return the connector type (e.g. 'api', 'scraper', 'simulator')."""
        return "api"

    @abstractmethod
    def fetch_posts(self, watchlist: ActiveWatchlist) -> list[PostMessage]:
        """
        Fetch posts from the platform based on the active watchlist.

        Must return a list of validated ``PostMessage`` instances.
        """
        ...

    def run(
        self,
        watchlist: ActiveWatchlist,
        settings: Optional[Settings] = None,
    ) -> CrawlResult:
        """
        Execute a full crawl cycle:

        1. Fetch posts via ``fetch_posts()``.
        2. Deduplicate via Redis.
        3. Publish to Kafka ``raw-posts``.
        4. Record Prometheus metrics.

        Returns a ``CrawlResult`` summary.
        """
        _settings = settings or get_settings()
        result = CrawlResult(
            platform=self.platform,
            connector_type=self.connector_type,
        )
        start = time.monotonic()

        try:
            redis_client = RedisClient.get_instance(_settings)
            kafka_producer = KafkaProducerWrapper.get_instance(_settings)

            # 1. Fetch
            posts = self.fetch_posts(watchlist)
            result.posts_fetched = len(posts)
            logger.info(
                "[%s] Fetched %d posts", self.platform, result.posts_fetched
            )

            # 2. Dedup + 3. Publish
            for post in posts:
                if redis_client.is_duplicate(post.post_id):
                    result.posts_deduped += 1
                    posts_deduplicated.labels(platform=self.platform).inc()
                    continue

                kafka_producer.publish_post(post)
                result.posts_published += 1
                posts_ingested.labels(platform=self.platform).inc()

                # Track keyword/hashtag frequencies for spike detection
                for tag in post.hashtags:
                    geo = (
                        post.geo_location.place_name
                        if post.geo_location
                        else "unknown"
                    )
                    redis_client.increment_hashtag(tag, geo)
                    redis_client.record_keyword_occurrence(tag)

                # Also track raw text keywords from watchlist
                text_lower = post.text.lower()
                for kw in watchlist.keyword_strings:
                    if kw.lower() in text_lower:
                        redis_client.record_keyword_occurrence(kw)

            # Flush Kafka to ensure all messages are delivered
            kafka_producer.flush(timeout=5.0)

        except Exception as exc:
            result.errors += 1
            result.error_detail = traceback.format_exc()
            api_errors.labels(
                platform=self.platform, error_type=type(exc).__name__
            ).inc()
            logger.error("[%s] Crawl error: %s", self.platform, exc)

        finally:
            result.duration_seconds = time.monotonic() - start
            crawl_duration.labels(platform=self.platform).observe(
                result.duration_seconds
            )
            logger.info(
                "[%s] Crawl complete: fetched=%d published=%d deduped=%d "
                "errors=%d duration=%.2fs",
                self.platform,
                result.posts_fetched,
                result.posts_published,
                result.posts_deduped,
                result.errors,
                result.duration_seconds,
            )

        return result
