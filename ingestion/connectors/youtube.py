"""
YouTube Data API v3 connector.

Searches public videos by keyword (within geo-radius when available),
fetches video metadata + top comments, and normalizes both video-level
and comment-level data into ``PostMessage``.

Supports multiple API keys via the ``KeyPool`` rotation mechanism.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Optional

from ingestion.config import Settings, get_settings
from ingestion.connectors.base import BaseConnector
from ingestion.db.watchlist_crud import ActiveWatchlist
from ingestion.key_pool import KeyPool, load_keys_from_env
from ingestion.models import (
    EngagementCounts,
    GeoLocation,
    Platform,
    PostMessage,
    RawPayload,
)
from ingestion.monitoring.metrics import api_calls, api_errors

logger = logging.getLogger(__name__)

_HASHTAG_RE = re.compile(r"#(\w+)", re.UNICODE)
_MENTION_RE = re.compile(r"@(\w+)", re.UNICODE)


def _is_yt_quota_exhausted(exc: Exception) -> bool:
    """Check if a YouTube API exception indicates quota exhaustion."""
    try:
        from googleapiclient.errors import HttpError

        if isinstance(exc, HttpError):
            # HTTP 403 with reason "quotaExceeded" or "rateLimitExceeded"
            if exc.resp.status == 403:
                error_content = exc.content.decode("utf-8", errors="replace").lower()
                return "quotaexceeded" in error_content or "ratelimitexceeded" in error_content
            # HTTP 429 (some API versions)
            if exc.resp.status == 429:
                return True
    except ImportError:
        pass
    return False


def _is_yt_key_invalid(exc: Exception) -> bool:
    """Check if a YouTube API exception indicates an invalid/revoked key."""
    try:
        from googleapiclient.errors import HttpError

        if isinstance(exc, HttpError):
            error_content = exc.content.decode("utf-8", errors="replace").lower()
            # keyInvalid reason on 400 or 403
            if exc.resp.status in (400, 403) and "keyinvalid" in error_content:
                return True
    except ImportError:
        pass
    return False


class YouTubeConnector(BaseConnector):
    """Connector for YouTube using the Data API v3 with multi-key rotation."""

    @property
    def platform(self) -> str:
        return "youtube"

    @property
    def connector_type(self) -> str:
        return "api"

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self._settings = settings or get_settings()

        # Build key pool from numbered env vars, falling back to single key
        keys = list(self._settings.youtube_api_keys)
        if not keys:
            # Last-resort backward compat: check the single-key field
            if self._settings.youtube_api_key:
                keys = [self._settings.youtube_api_key]

        # YouTube daily quota resets at midnight Pacific — ~86400s cooldown
        self._key_pool = KeyPool(keys, cooldown_seconds=86400)

        if self._key_pool.size == 0:
            logger.warning("No YouTube API keys configured — YouTube connector disabled")
        else:
            logger.info(
                "YouTube KeyPool initialized: %d key(s) available", self._key_pool.size
            )

    @property
    def key_pool(self) -> KeyPool:
        """Expose the key pool for external status reporting."""
        return self._key_pool

    def _get_service(self, api_key: str) -> Any:
        """Build the YouTube API service object for a specific key."""
        from googleapiclient.discovery import build

        return build("youtube", "v3", developerKey=api_key)

    def fetch_posts(self, watchlist: ActiveWatchlist) -> list[PostMessage]:
        """Search YouTube for videos matching the watchlist, fetch comments."""
        if self._key_pool.size == 0:
            logger.info("YouTube connector skipped — no API keys")
            return []

        active_key = self._key_pool.get_active_key()
        if active_key is None:
            logger.error(
                "YouTube connector: all %d keys exhausted — skipping this cycle",
                self._key_pool.size,
            )
            api_errors.labels(platform="youtube", error_type="all_keys_exhausted").inc()
            return []

        terms = watchlist.keyword_strings + watchlist.hashtag_strings
        if not terms:
            return []

        query = " | ".join(terms[:10])
        posts: list[PostMessage] = []

        # Use key rotation for the main search + video details flow
        try:
            posts = self._fetch_with_rotation(query, watchlist)
        except Exception as exc:
            logger.error("YouTube connector error: %s", exc)
            api_errors.labels(platform="youtube", error_type=type(exc).__name__).inc()

        return posts

    def _fetch_with_rotation(self, query: str, watchlist: ActiveWatchlist) -> list[PostMessage]:
        """Attempt the full fetch cycle, rotating keys on quota exhaustion."""
        posts: list[PostMessage] = []
        attempts = self._key_pool.size

        for _ in range(attempts):
            key = self._key_pool.get_active_key()
            if key is None:
                logger.error("YouTube: all keys exhausted during fetch cycle")
                api_errors.labels(platform="youtube", error_type="all_keys_exhausted").inc()
                return posts  # return whatever we got so far

            try:
                youtube = self._get_service(key)
                return self._do_fetch(youtube, query, key)
            except Exception as exc:
                if _is_yt_key_invalid(exc):
                    self._key_pool.mark_invalid(key)
                    logger.warning("YouTube key ...%s invalid — trying next", key[-4:])
                    continue
                if _is_yt_quota_exhausted(exc):
                    self._key_pool.mark_exhausted(key)
                    logger.warning("YouTube key ...%s quota exhausted — trying next", key[-4:])
                    continue
                # Not a quota/auth error — re-raise
                raise

        return posts

    def _do_fetch(self, youtube: Any, query: str, api_key: str) -> list[PostMessage]:
        """Execute the actual YouTube API calls with a specific service instance."""
        posts: list[PostMessage] = []

        # ── Search videos ────────────────────────────────────────────
        api_calls.labels(platform="youtube").inc()
        search_response = (
            youtube.search()
            .list(
                q=query,
                part="snippet",
                type="video",
                maxResults=25,
                relevanceLanguage="hi",
                order="date",
            )
            .execute()
        )

        video_ids = [
            item["id"]["videoId"]
            for item in search_response.get("items", [])
            if item["id"].get("videoId")
        ]

        if not video_ids:
            return []

        # ── Fetch video details (statistics + snippet) ───────────────
        api_calls.labels(platform="youtube").inc()
        videos_response = (
            youtube.videos()
            .list(
                id=",".join(video_ids),
                part="snippet,statistics,contentDetails",
            )
            .execute()
        )

        for video in videos_response.get("items", []):
            try:
                post = self._normalize_video(video)
                posts.append(post)
            except Exception as exc:
                logger.warning("Failed to normalize video %s: %s", video.get("id"), exc)

        # ── Fetch top comments for each video ────────────────────────
        for vid in video_ids[:10]:  # limit to avoid quota blow-up
            try:
                api_calls.labels(platform="youtube").inc()
                comments_response = (
                    youtube.commentThreads()
                    .list(
                        videoId=vid,
                        part="snippet",
                        maxResults=20,
                        textFormat="plainText",
                        order="relevance",
                    )
                    .execute()
                )
                for item in comments_response.get("items", []):
                    try:
                        post = self._normalize_comment(item, vid)
                        posts.append(post)
                    except Exception as exc:
                        logger.warning("Failed to normalize comment: %s", exc)
            except Exception as exc:
                # Check if this is a quota issue mid-comments
                if _is_yt_quota_exhausted(exc):
                    logger.warning(
                        "YouTube quota exhausted during comment fetch (key ...%s) — "
                        "returning %d posts collected so far",
                        api_key[-4:],
                        len(posts),
                    )
                    self._key_pool.mark_exhausted(api_key)
                    break
                # Comments may be disabled — non-fatal
                logger.debug("Could not fetch comments for %s: %s", vid, exc)

        return posts

    def _normalize_video(self, video: dict) -> PostMessage:
        """Convert a YouTube video resource into PostMessage."""
        snippet = video.get("snippet", {})
        stats = video.get("statistics", {})
        channel_id = snippet.get("channelId", "")
        channel_title = snippet.get("channelTitle", "unknown")

        text = f"{snippet.get('title', '')} — {snippet.get('description', '')}"
        published = snippet.get("publishedAt", datetime.now(timezone.utc).isoformat())

        hashtags = [f"#{m}" for m in _HASHTAG_RE.findall(text)]
        mentions = [f"@{m}" for m in _MENTION_RE.findall(text)]

        return PostMessage(
            post_id=f"yt-v-{video['id']}",
            platform=Platform.YOUTUBE,
            author_id=channel_id,
            author_handle=channel_title,
            text=text[:5000],  # cap long descriptions
            language_hint=None,
            created_at=published,
            geo_location=None,
            hashtags=hashtags,
            mentions=mentions,
            media_urls=[f"https://www.youtube.com/watch?v={video['id']}"],
            engagement_counts=EngagementCounts(
                likes=int(stats.get("likeCount", 0)),
                shares=0,  # YouTube API doesn't expose share count
                comments=int(stats.get("commentCount", 0)),
            ),
            raw_payload=RawPayload(
                account_created_at=None,  # would need a channels().list call
                follower_count=0,
                following_count=0,
                post_count=0,
                # Extra fields preserved via extra="allow"
                video_id=video["id"],
                view_count=int(stats.get("viewCount", 0)),
                channel_id=channel_id,
            ),
        )

    def _normalize_comment(self, item: dict, video_id: str) -> PostMessage:
        """Convert a YouTube comment thread item into PostMessage."""
        snippet = item["snippet"]["topLevelComment"]["snippet"]
        author = snippet.get("authorDisplayName", "unknown")
        author_channel = snippet.get("authorChannelId", {}).get("value", "")

        text = snippet.get("textDisplay", "")
        published = snippet.get("publishedAt", datetime.now(timezone.utc).isoformat())

        return PostMessage(
            post_id=f"yt-c-{item['id']}",
            platform=Platform.YOUTUBE,
            author_id=author_channel or f"yt-anon-{hash(author)}",
            author_handle=author,
            text=text,
            language_hint=None,
            created_at=published,
            geo_location=None,
            hashtags=[f"#{m}" for m in _HASHTAG_RE.findall(text)],
            mentions=[f"@{m}" for m in _MENTION_RE.findall(text)],
            media_urls=[f"https://www.youtube.com/watch?v={video_id}"],
            engagement_counts=EngagementCounts(
                likes=int(snippet.get("likeCount", 0)),
                shares=0,
                comments=0,
            ),
            raw_payload=RawPayload(
                account_created_at=None,
                follower_count=0,
                following_count=0,
                post_count=0,
                video_id=video_id,
                comment_id=item["id"],
            ),
        )

