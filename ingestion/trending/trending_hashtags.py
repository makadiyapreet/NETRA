"""
Geo-tagged trending-hashtag discovery.

Maintains hashtag frequency counters in Redis (grouped by geo area) and
exposes a ``get_trending()`` function that returns the top-K trending
hashtags for a given geo area.

Corresponds to PS Workflow Step 1 — Geo-Tagged Trend Discovery.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from ingestion.config import Settings, get_settings
from ingestion.models import PostMessage, TrendingHashtag
from ingestion.redis_client import RedisClient

logger = logging.getLogger(__name__)


def update_from_posts(
    posts: list[PostMessage],
    settings: Optional[Settings] = None,
) -> int:
    """
    Update hashtag frequency counters from a batch of ingested posts.

    Returns the total number of counter increments made.
    """
    redis = RedisClient.get_instance(settings)
    increments = 0

    for post in posts:
        geo_area = (
            post.geo_location.place_name if post.geo_location else "unknown"
        )
        for tag in post.hashtags:
            redis.increment_hashtag(tag, geo_area)
            increments += 1

    if increments:
        logger.info("Updated %d hashtag counters from %d posts", increments, len(posts))
    return increments


def get_trending(
    geo_area: str = "unknown",
    top_k: int = 20,
    settings: Optional[Settings] = None,
) -> list[TrendingHashtag]:
    """
    Return the top-K trending hashtags for a given geo area.

    Reads from Redis counters maintained by ``update_from_posts()``.
    """
    redis = RedisClient.get_instance(settings)
    counts = redis.get_hashtag_counts(geo_area)

    if not counts:
        return []

    # Sort by frequency descending
    sorted_tags = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:top_k]

    now = datetime.now(timezone.utc)
    return [
        TrendingHashtag(
            hashtag=tag,
            geo_area=geo_area,
            frequency=freq,
            rank=rank + 1,
            observed_since=now,  # approx — Redis keys expire after 1h
        )
        for rank, (tag, freq) in enumerate(sorted_tags)
    ]


def print_trending(geo_area: str = "unknown", top_k: int = 20) -> None:
    """Pretty-print current trending hashtags for a geo area."""
    trending = get_trending(geo_area, top_k)
    if not trending:
        print(f"No trending hashtags for geo area: {geo_area}")
        return

    print(f"\n{'─' * 60}")
    print(f" 🔥  Trending Hashtags — {geo_area}")
    print(f"{'─' * 60}")
    for t in trending:
        bar = "█" * min(t.frequency, 40)
        print(f"  {t.rank:>3}. {t.hashtag:<25} {t.frequency:>6}  {bar}")
    print(f"{'─' * 60}\n")
