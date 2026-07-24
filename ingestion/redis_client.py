"""
Redis client for deduplication and per-platform rate-limit tracking.

Uses a SET with TTL for post-ID dedup and a sliding-window counter for
API rate-limit awareness.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import redis

from ingestion.config import Settings, get_settings

logger = logging.getLogger(__name__)


class RedisClient:
    """Thin wrapper around ``redis.Redis`` for dedup + rate-limit ops."""

    _instance: Optional["RedisClient"] = None

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self._settings = settings or get_settings()
        self._conn = redis.Redis.from_url(
            self._settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
        )
        # Verify connectivity
        self._conn.ping()
        logger.info("Redis connected → %s", self._settings.redis_url)

    @classmethod
    def get_instance(cls, settings: Optional[Settings] = None) -> "RedisClient":
        """Return (or create) the singleton client."""
        if cls._instance is None:
            cls._instance = cls(settings)
        return cls._instance

    # ── Deduplication ────────────────────────────────────────────────────

    def is_duplicate(self, post_id: str) -> bool:
        """
        Check whether ``post_id`` has already been ingested.

        If not a duplicate, the ID is added to the set with a configurable TTL
        (default 24 h) so that it is automatically evicted.

        Returns:
            ``True`` if the post was already seen (duplicate), ``False`` otherwise.
        """
        key = f"dedup:{post_id}"
        # SET NX returns True if the key was set (new), None/False if it existed
        was_set = self._conn.set(
            key, "1", nx=True, ex=self._settings.dedup_ttl_seconds
        )
        is_dup = not bool(was_set)
        if is_dup:
            logger.debug("Duplicate detected: %s", post_id)
        return is_dup

    # ── Rate-limit tracking ──────────────────────────────────────────────

    def check_rate_limit(self, platform: str, max_calls: int, window_seconds: int = 60) -> bool:
        """
        Return ``True`` if the platform is within its rate limit.

        Uses a sliding-window counter keyed on the current time window.
        """
        window_key = f"ratelimit:{platform}:{int(time.time()) // window_seconds}"
        current = self._conn.get(window_key)
        if current is not None and int(current) >= max_calls:
            logger.warning(
                "Rate limit reached for %s: %s/%s in window",
                platform,
                current,
                max_calls,
            )
            return False
        return True

    def record_api_call(self, platform: str, window_seconds: int = 60) -> None:
        """Increment the sliding-window API-call counter for ``platform``."""
        window_key = f"ratelimit:{platform}:{int(time.time()) // window_seconds}"
        pipe = self._conn.pipeline()
        pipe.incr(window_key)
        pipe.expire(window_key, window_seconds * 2)  # expire after 2 windows
        pipe.execute()

    # ── Trending hashtag counters ────────────────────────────────────────

    def increment_hashtag(self, hashtag: str, geo_area: str, count: int = 1) -> int:
        """Increment the frequency counter for a hashtag in a geo area."""
        key = f"trending:{geo_area}:{hashtag}"
        val = self._conn.incrby(key, count)
        # Auto-expire after 1 hour so stale hashtags fall off
        self._conn.expire(key, 3600)
        return int(val)

    def get_hashtag_counts(self, geo_area: str) -> dict[str, int]:
        """Return all hashtag counts for a given geo area."""
        pattern = f"trending:{geo_area}:*"
        result: dict[str, int] = {}
        for key in self._conn.scan_iter(match=pattern, count=100):
            hashtag = key.split(":", 2)[2]  # trending:Gujarat:#riot → #riot
            val = self._conn.get(key)
            if val is not None:
                result[hashtag] = int(val)
        return result

    # ── Keyword frequency tracking (for spike detection) ─────────────────

    def record_keyword_occurrence(self, keyword: str, bucket_seconds: int = 60) -> None:
        """Record an occurrence of ``keyword`` in the current time bucket."""
        bucket = int(time.time()) // bucket_seconds
        key = f"kwfreq:{keyword}:{bucket}"
        pipe = self._conn.pipeline()
        pipe.incr(key)
        pipe.expire(key, bucket_seconds * 120)  # keep ~2 hours of history
        pipe.execute()

    def get_keyword_series(
        self, keyword: str, num_buckets: int = 60, bucket_seconds: int = 60
    ) -> list[int]:
        """
        Return the last ``num_buckets`` frequency counts for ``keyword``.

        Returns a list ordered oldest → newest.
        """
        now_bucket = int(time.time()) // bucket_seconds
        keys = [
            f"kwfreq:{keyword}:{now_bucket - i}"
            for i in range(num_buckets - 1, -1, -1)
        ]
        values = self._conn.mget(keys)
        return [int(v) if v is not None else 0 for v in values]

    # ── Health ───────────────────────────────────────────────────────────

    def ping(self) -> bool:
        """Return ``True`` if Redis is reachable."""
        try:
            return self._conn.ping()
        except redis.ConnectionError:
            return False
