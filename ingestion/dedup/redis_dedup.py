"""
Redis-based post deduplication.

Re-exports the dedup functionality from ``ingestion.redis_client`` to
match the target directory structure (``ingestion/dedup/redis_dedup.py``).

The actual implementation lives in ``redis_client.RedisClient.is_duplicate()``.
"""

from __future__ import annotations

from ingestion.redis_client import RedisClient

__all__ = ["RedisDedup"]


class RedisDedup:
    """
    Thin wrapper around ``RedisClient`` focused on dedup operations.

    Matches the target structure contract for ``ingestion/dedup/redis_dedup.py``.
    """

    def __init__(self, redis_client: RedisClient | None = None):
        self._client = redis_client or RedisClient.get_instance()

    def is_duplicate(self, post_id: str) -> bool:
        """
        Check if a post ID has already been ingested.

        If not a duplicate, marks it as seen with a configurable TTL.

        Returns:
            True if the post was already seen (duplicate).
        """
        return self._client.is_duplicate(post_id)

    def ping(self) -> bool:
        """Check Redis connectivity."""
        return self._client.ping()
