"""
Twitter / X API v2 connector.

Uses ``tweepy`` for both search (recent tweets) and filtered streaming.
Normalizes the Twitter API response into the shared ``PostMessage`` schema,
ensuring ``raw_payload`` includes the four bot-detection fields.
"""

from __future__ import annotations

import hashlib
import logging
import re
import time
from datetime import datetime, timezone
from typing import Optional

import tweepy

from ingestion.config import Settings, get_settings
from ingestion.connectors.base import BaseConnector
from ingestion.db.watchlist_crud import ActiveWatchlist
from ingestion.models import (
    EngagementCounts,
    GeoLocation,
    Platform,
    PostMessage,
    RawPayload,
)
from ingestion.monitoring.metrics import api_calls, api_errors

logger = logging.getLogger(__name__)

# Regex to extract hashtags and mentions from tweet text
_HASHTAG_RE = re.compile(r"#(\w+)", re.UNICODE)
_MENTION_RE = re.compile(r"@(\w+)", re.UNICODE)


class TwitterConnector(BaseConnector):
    """Connector for X (Twitter) using the v2 API via tweepy."""

    @property
    def platform(self) -> str:
        return "twitter"

    @property
    def connector_type(self) -> str:
        return "api"

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self._settings = settings or get_settings()
        self._bearer_token = self._settings.twitter_bearer_token
        if not self._bearer_token:
            logger.warning("TWITTER_BEARER_TOKEN not set — Twitter connector disabled")

    def _get_client(self) -> tweepy.Client:
        """Create a new tweepy Client."""
        return tweepy.Client(
            bearer_token=self._bearer_token,
            wait_on_rate_limit=True,
        )

    def fetch_posts(self, watchlist: ActiveWatchlist) -> list[PostMessage]:
        """
        Search recent tweets matching the watchlist keywords/hashtags.

        Applies geo bounding-box filters if available.
        """
        if not self._bearer_token:
            logger.info("Twitter connector skipped — no bearer token")
            return []

        client = self._get_client()
        posts: list[PostMessage] = []

        # Build query from watchlist
        terms = watchlist.keyword_strings + watchlist.hashtag_strings
        if not terms:
            logger.info("Twitter: no keywords/hashtags in watchlist")
            return []

        # Twitter search query: OR-join all terms (max 512 chars)
        query = " OR ".join(terms[:15])  # limit to avoid query length issues
        if len(query) > 512:
            query = query[:512]

        try:
            api_calls.labels(platform="twitter").inc()
            response = client.search_recent_tweets(
                query=query,
                max_results=100,
                tweet_fields=[
                    "created_at",
                    "geo",
                    "lang",
                    "public_metrics",
                    "entities",
                ],
                expansions=["author_id", "geo.place_id"],
                user_fields=[
                    "created_at",
                    "public_metrics",
                    "username",
                ],
                place_fields=["full_name", "geo"],
            )

            if not response.data:
                return []

            # Build lookup maps for includes
            users_map: dict[str, tweepy.User] = {}
            if response.includes and "users" in response.includes:
                for user in response.includes["users"]:
                    users_map[user.id] = user

            places_map: dict[str, object] = {}
            if response.includes and "places" in response.includes:
                for place in response.includes["places"]:
                    places_map[place.id] = place

            for tweet in response.data:
                try:
                    post = self._normalize(tweet, users_map, places_map)
                    posts.append(post)
                except Exception as exc:
                    logger.warning("Failed to normalize tweet %s: %s", tweet.id, exc)
                    api_errors.labels(platform="twitter", error_type="normalization").inc()

        except tweepy.TooManyRequests:
            logger.warning("Twitter rate limit hit — backing off")
            api_errors.labels(platform="twitter", error_type="rate_limit").inc()
            time.sleep(15)
        except tweepy.TwitterServerError as exc:
            logger.error("Twitter server error: %s", exc)
            api_errors.labels(platform="twitter", error_type="server_error").inc()
        except Exception as exc:
            logger.error("Twitter connector error: %s", exc)
            api_errors.labels(platform="twitter", error_type="unknown").inc()

        return posts

    def _normalize(
        self,
        tweet: tweepy.Tweet,
        users_map: dict[str, tweepy.User],
        places_map: dict[str, object],
    ) -> PostMessage:
        """Convert a tweepy Tweet object into our PostMessage schema."""
        user = users_map.get(tweet.author_id)
        user_metrics = getattr(user, "public_metrics", {}) or {}

        # Geo location
        geo_location: Optional[GeoLocation] = None
        if tweet.geo and "place_id" in tweet.geo:
            place = places_map.get(tweet.geo["place_id"])
            if place:
                bbox = getattr(place, "geo", {}).get("bbox", [0, 0, 0, 0]) if hasattr(place, "geo") else [0, 0, 0, 0]
                if len(bbox) >= 4:
                    geo_location = GeoLocation(
                        lat=(bbox[1] + bbox[3]) / 2,
                        lng=(bbox[0] + bbox[2]) / 2,
                        place_name=getattr(place, "full_name", "Unknown"),
                    )

        # Engagement
        metrics = tweet.public_metrics or {}

        # Hashtags & mentions from entities or regex fallback
        hashtags: list[str] = []
        mentions: list[str] = []
        if tweet.entities:
            if "hashtags" in tweet.entities:
                hashtags = [f"#{h['tag']}" for h in tweet.entities["hashtags"]]
            if "mentions" in tweet.entities:
                mentions = [f"@{m['username']}" for m in tweet.entities["mentions"]]
        if not hashtags:
            hashtags = [f"#{m}" for m in _HASHTAG_RE.findall(tweet.text)]
        if not mentions:
            mentions = [f"@{m}" for m in _MENTION_RE.findall(tweet.text)]

        # Media URLs
        media_urls: list[str] = []
        if tweet.entities and "urls" in tweet.entities:
            media_urls = [u["expanded_url"] for u in tweet.entities["urls"] if "expanded_url" in u]

        # Language hint
        lang = getattr(tweet, "lang", None)
        language_hint = None
        if lang in ("gu", "hi", "en"):
            language_hint = lang
        elif lang and lang not in ("und", "qme", "qht"):
            language_hint = "mixed"

        return PostMessage(
            post_id=f"tw-{tweet.id}",
            platform=Platform.TWITTER,
            author_id=str(tweet.author_id),
            author_handle=f"@{user.username}" if user else f"@unknown-{tweet.author_id}",
            text=tweet.text,
            language_hint=language_hint,
            created_at=tweet.created_at or datetime.now(timezone.utc),
            geo_location=geo_location,
            hashtags=hashtags,
            mentions=mentions,
            media_urls=media_urls,
            engagement_counts=EngagementCounts(
                likes=metrics.get("like_count", 0),
                shares=metrics.get("retweet_count", 0),
                comments=metrics.get("reply_count", 0),
            ),
            raw_payload=RawPayload(
                account_created_at=(
                    user.created_at.isoformat() if user and user.created_at else None
                ),
                follower_count=user_metrics.get("followers_count", 0),
                following_count=user_metrics.get("following_count", 0),
                post_count=user_metrics.get("tweet_count", 0),
            ),
        )
