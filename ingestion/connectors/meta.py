"""
Meta Graph API connector (Facebook Pages + Instagram Business).

Uses the official Graph API v22.0.  Requires a Page Access Token with
``pages_read_engagement`` and optionally ``instagram_basic`` permissions.

Supports multiple access tokens via the ``KeyPool`` rotation mechanism.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone
from typing import Optional

import requests

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

_GRAPH_API_VERSION = "v22.0"
_GRAPH_BASE = f"https://graph.facebook.com/{_GRAPH_API_VERSION}"
_HASHTAG_RE = re.compile(r"#(\w+)", re.UNICODE)
_MENTION_RE = re.compile(r"@(\w+)", re.UNICODE)

# Meta Graph API error codes indicating rate-limit / quota exhaustion
_META_RATE_LIMIT_CODES = {4, 17, 32, 613}
# Meta Graph API error code indicating invalid/expired token
_META_INVALID_TOKEN_CODE = 190


def _is_meta_quota_exhausted(resp: requests.Response) -> bool:
    """Check if a Meta Graph API response indicates rate-limit / quota exhaustion."""
    if resp.status_code == 429:
        return True
    if resp.status_code in (400, 403):
        try:
            body = resp.json()
            error_code = body.get("error", {}).get("code", 0)
            if error_code in _META_RATE_LIMIT_CODES:
                return True
        except (ValueError, KeyError):
            pass
    return False


def _is_meta_token_invalid(resp: requests.Response) -> bool:
    """Check if a Meta Graph API response indicates an invalid/expired token."""
    if resp.status_code in (400, 401, 403):
        try:
            body = resp.json()
            error_code = body.get("error", {}).get("code", 0)
            if error_code == _META_INVALID_TOKEN_CODE:
                return True
        except (ValueError, KeyError):
            pass
    return False


class MetaConnector(BaseConnector):
    """
    Connector for Meta platforms (Facebook Pages + Instagram Business).

    Pulls from page feeds using the Graph API with multi-token rotation.
    """

    @property
    def platform(self) -> str:
        return "facebook"  # primary; Instagram posts get platform="instagram"

    @property
    def connector_type(self) -> str:
        return "api"

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self._settings = settings or get_settings()

        # Build key pool from numbered env vars, falling back to single token
        keys = list(self._settings.meta_access_tokens)
        if not keys:
            if self._settings.meta_access_token:
                keys = [self._settings.meta_access_token]

        # Meta rate limits vary; use 1-hour cooldown as reasonable default
        self._key_pool = KeyPool(keys, cooldown_seconds=3600)

        if self._key_pool.size == 0:
            logger.warning("No META_ACCESS_TOKEN configured — Meta connector disabled")
        else:
            logger.info(
                "Meta KeyPool initialized: %d token(s) available", self._key_pool.size
            )

    @property
    def key_pool(self) -> KeyPool:
        """Expose the key pool for external status reporting."""
        return self._key_pool

    def fetch_posts(self, watchlist: ActiveWatchlist) -> list[PostMessage]:
        """Fetch posts from tracked Facebook Pages and Instagram accounts."""
        if self._key_pool.size == 0:
            logger.info("Meta connector skipped — no access tokens")
            return []

        active_key = self._key_pool.get_active_key()
        if active_key is None:
            logger.error(
                "Meta connector: all %d tokens exhausted — skipping this cycle",
                self._key_pool.size,
            )
            api_errors.labels(platform="facebook", error_type="all_keys_exhausted").inc()
            return []

        posts: list[PostMessage] = []

        # Pull from tracked profiles that are on facebook or instagram
        for profile in watchlist.profiles:
            if profile.platform in ("facebook", "instagram"):
                try:
                    page_posts = self._fetch_page_feed_with_rotation(
                        profile.profile_id,
                        profile.handle,
                        profile.platform,
                    )
                    posts.extend(page_posts)
                except Exception as exc:
                    logger.error(
                        "Error fetching %s page %s: %s",
                        profile.platform,
                        profile.profile_id,
                        exc,
                    )
                    api_errors.labels(
                        platform=profile.platform,
                        error_type=type(exc).__name__,
                    ).inc()

        return posts

    def _fetch_page_feed_with_rotation(
        self, page_id: str, handle: str, platform_name: str
    ) -> list[PostMessage]:
        """Fetch a page feed with token rotation on rate-limit errors."""
        attempts = self._key_pool.size

        for _ in range(attempts):
            token = self._key_pool.get_active_key()
            if token is None:
                logger.error("Meta: all tokens exhausted — cannot fetch page %s", page_id)
                return []

            posts, should_rotate, is_invalid = self._do_fetch_page_feed(
                token, page_id, handle, platform_name
            )

            if is_invalid:
                self._key_pool.mark_invalid(token)
                logger.warning("Meta token ...%s invalid — trying next", token[-4:])
                continue
            if should_rotate:
                self._key_pool.mark_exhausted(token)
                logger.warning("Meta token ...%s rate-limited — trying next", token[-4:])
                continue

            return posts

        return []

    def _do_fetch_page_feed(
        self, token: str, page_id: str, handle: str, platform_name: str
    ) -> tuple[list[PostMessage], bool, bool]:
        """
        Fetch the feed of a specific Facebook/Instagram page.

        Returns (posts, should_rotate, is_invalid).
        """
        posts: list[PostMessage] = []

        if platform_name == "instagram":
            url = f"{_GRAPH_BASE}/{page_id}/media"
            fields = "id,caption,timestamp,media_type,media_url,like_count,comments_count,permalink"
        else:
            url = f"{_GRAPH_BASE}/{page_id}/feed"
            fields = "id,message,created_time,full_picture,shares,likes.summary(true),comments.summary(true),from"

        params = {
            "access_token": token,
            "fields": fields,
            "limit": 50,
        }

        api_calls.labels(platform=platform_name).inc()
        resp = requests.get(url, params=params, timeout=30)

        # Check for token-level errors before parsing data
        if _is_meta_token_invalid(resp):
            return [], False, True  # is_invalid=True

        if _is_meta_quota_exhausted(resp):
            return [], True, False  # should_rotate=True

        resp.raise_for_status()
        data = resp.json()

        for item in data.get("data", []):
            try:
                if platform_name == "instagram":
                    post = self._normalize_instagram(item, page_id, handle)
                else:
                    post = self._normalize_facebook(item, page_id, handle)
                posts.append(post)
            except Exception as exc:
                logger.warning("Failed to normalize Meta post: %s", exc)

        return posts, False, False

    def _normalize_facebook(
        self, item: dict, page_id: str, handle: str
    ) -> PostMessage:
        """Normalize a Facebook page post."""
        text = item.get("message", "")
        from_data = item.get("from", {})

        likes_data = item.get("likes", {}).get("summary", {})
        comments_data = item.get("comments", {}).get("summary", {})
        shares_data = item.get("shares", {})

        media_urls: list[str] = []
        if item.get("full_picture"):
            media_urls.append(item["full_picture"])

        return PostMessage(
            post_id=f"fb-{item['id']}",
            platform=Platform.FACEBOOK,
            author_id=from_data.get("id", page_id),
            author_handle=from_data.get("name", handle),
            text=text or "(no text)",
            language_hint=None,
            created_at=item.get("created_time", datetime.now(timezone.utc).isoformat()),
            geo_location=None,
            hashtags=[f"#{m}" for m in _HASHTAG_RE.findall(text)],
            mentions=[f"@{m}" for m in _MENTION_RE.findall(text)],
            media_urls=media_urls,
            engagement_counts=EngagementCounts(
                likes=likes_data.get("total_count", 0),
                shares=shares_data.get("count", 0),
                comments=comments_data.get("total_count", 0),
            ),
            raw_payload=RawPayload(
                account_created_at=None,
                follower_count=0,
                following_count=0,
                post_count=0,
                page_id=page_id,
                facebook_post_id=item["id"],
            ),
        )

    def _normalize_instagram(
        self, item: dict, page_id: str, handle: str
    ) -> PostMessage:
        """Normalize an Instagram media post."""
        text = item.get("caption", "")

        media_urls: list[str] = []
        if item.get("media_url"):
            media_urls.append(item["media_url"])
        if item.get("permalink"):
            media_urls.append(item["permalink"])

        return PostMessage(
            post_id=f"ig-{item['id']}",
            platform=Platform.INSTAGRAM,
            author_id=page_id,
            author_handle=handle,
            text=text or "(no caption)",
            language_hint=None,
            created_at=item.get("timestamp", datetime.now(timezone.utc).isoformat()),
            geo_location=None,
            hashtags=[f"#{m}" for m in _HASHTAG_RE.findall(text)],
            mentions=[f"@{m}" for m in _MENTION_RE.findall(text)],
            media_urls=media_urls,
            engagement_counts=EngagementCounts(
                likes=item.get("like_count", 0),
                shares=0,
                comments=item.get("comments_count", 0),
            ),
            raw_payload=RawPayload(
                account_created_at=None,
                follower_count=0,
                following_count=0,
                post_count=0,
                ig_media_id=item["id"],
                media_type=item.get("media_type"),
            ),
        )
