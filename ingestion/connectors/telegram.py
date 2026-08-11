"""
Telegram public channel connector for NETRA.

Monitors public Telegram channels via the Bot API.
Only reads public channel messages — never private chats/groups.

Supports multiple bot tokens via the ``KeyPool`` rotation mechanism.
Requires at least one TELEGRAM_BOT_TOKEN in .env.

Usage:
    from ingestion.connectors.telegram import TelegramConnector
    connector = TelegramConnector()
    posts = await connector.fetch(watchlist)
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional

from ingestion.connectors.base import BaseConnector
from ingestion.db.watchlist_crud import ActiveWatchlist
from ingestion.key_pool import KeyPool, load_keys_from_env
from ingestion.models import (
    EngagementCounts,
    PostMessage,
    RawPayload,
)
from ingestion.monitoring.metrics import api_calls, api_errors

logger = logging.getLogger(__name__)


class TelegramConnector(BaseConnector):
    """
    Telegram Bot API connector for public channel monitoring.

    Only monitors public channels specified in the watchlist.
    Private chats and groups are explicitly excluded.

    Supports multiple bot tokens with automatic failover.
    Requires: TELEGRAM_BOT_TOKEN (or TELEGRAM_BOT_TOKEN_1, _2, ...) environment variable(s).
    """

    @property
    def platform(self) -> str:
        return "telegram"

    @property
    def connector_type(self) -> str:
        return "telegram"

    def __init__(self) -> None:
        import os

        # Build key pool from numbered env vars, falling back to un-suffixed
        keys = load_keys_from_env("TELEGRAM_BOT_TOKEN")

        # Telegram rate limits: 30 messages/second, retry_after based cooldown
        # Use a short cooldown since Telegram limits are per-second, not daily
        self._key_pool = KeyPool(keys, cooldown_seconds=60)

        if self._key_pool.size == 0:
            logger.warning(
                "No TELEGRAM_BOT_TOKEN configured — Telegram connector disabled. "
                "Set it in .env to enable public channel monitoring."
            )
        else:
            logger.info(
                "Telegram KeyPool initialized: %d token(s) available",
                self._key_pool.size,
            )

        self._last_update_id: dict[str, int] = {}

    @property
    def key_pool(self) -> KeyPool:
        """Expose the key pool for external status reporting."""
        return self._key_pool

    def _get_base_url(self, token: str) -> str:
        """Build the Telegram Bot API base URL for a specific token."""
        return f"https://api.telegram.org/bot{token}"

    async def fetch(
        self,
        watchlist: ActiveWatchlist,
        max_results: int = 100,
    ) -> list[PostMessage]:
        """
        Fetch messages from public Telegram channels.

        Args:
            watchlist: Active watchlist with channel handles.
            max_results: Maximum messages to fetch per channel.

        Returns:
            List of PostMessage objects.
        """
        if self._key_pool.size == 0:
            logger.warning(
                "TELEGRAM_BOT_TOKEN not set — Telegram connector disabled. "
                "Set it in .env to enable public channel monitoring."
            )
            return []

        import aiohttp

        posts: list[PostMessage] = []

        # Get channel handles from watchlist profiles
        channels = [p for p in (watchlist.profiles or []) if p.startswith("@")]

        for channel in channels[:10]:  # Limit to 10 channels
            channel_posts = await self._fetch_channel_with_rotation(
                channel, max_results, watchlist
            )
            posts.extend(channel_posts)

        return posts[:max_results]

    async def _fetch_channel_with_rotation(
        self,
        channel: str,
        max_results: int,
        watchlist: ActiveWatchlist,
    ) -> list[PostMessage]:
        """Fetch a single channel, rotating tokens on rate-limit errors."""
        attempts = self._key_pool.size

        for _ in range(attempts):
            token = self._key_pool.get_active_key()
            if token is None:
                logger.error("Telegram: all tokens exhausted — cannot fetch %s", channel)
                api_errors.labels(platform="telegram").inc()
                return []

            try:
                return await self._do_fetch_channel(token, channel, max_results, watchlist)
            except _TelegramRateLimitError:
                self._key_pool.mark_exhausted(token)
                logger.warning("Telegram token ...%s rate-limited — trying next", token[-4:])
                continue
            except _TelegramAuthError:
                self._key_pool.mark_invalid(token)
                logger.warning("Telegram token ...%s invalid — trying next", token[-4:])
                continue
            except Exception as e:
                logger.error(f"Telegram fetch error for {channel}: {e}")
                api_errors.labels(platform="telegram").inc()
                return []

        return []

    async def _do_fetch_channel(
        self,
        token: str,
        channel: str,
        max_results: int,
        watchlist: ActiveWatchlist,
    ) -> list[PostMessage]:
        """Execute the actual Telegram API call with a specific token."""
        import aiohttp

        posts: list[PostMessage] = []
        base_url = self._get_base_url(token)

        async with aiohttp.ClientSession() as session:
            # Use getUpdates for channels the bot is added to
            url = f"{base_url}/getUpdates"
            params = {
                "offset": self._last_update_id.get(channel, 0),
                "limit": min(max_results, 100),
                "allowed_updates": '["channel_post"]',
            }

            api_calls.labels(platform="telegram").inc()

            async with session.get(url, params=params) as resp:
                if resp.status == 429:
                    # Rate limited — raise to trigger rotation
                    raise _TelegramRateLimitError("Telegram 429 Too Many Requests")

                if resp.status == 401:
                    # Invalid token
                    raise _TelegramAuthError("Telegram 401 Unauthorized")

                if resp.status != 200:
                    api_errors.labels(platform="telegram").inc()
                    return []

                data = await resp.json()

                # Check for rate-limit error in response body
                if not data.get("ok"):
                    error_code = data.get("error_code", 0)
                    if error_code == 429:
                        raise _TelegramRateLimitError(
                            f"Telegram rate limit: retry_after={data.get('parameters', {}).get('retry_after', 0)}"
                        )
                    if error_code == 401:
                        raise _TelegramAuthError("Telegram token invalid")
                    return []

                for update in data.get("result", []):
                    channel_post = update.get("channel_post")
                    if not channel_post:
                        continue

                    text = channel_post.get("text", "")
                    if not text:
                        continue

                    # Apply keyword filtering
                    if watchlist.keywords:
                        if not any(
                            kw.lower() in text.lower()
                            for kw in watchlist.keywords
                        ):
                            continue

                    msg_id = channel_post.get("message_id", 0)
                    chat = channel_post.get("chat", {})
                    date = channel_post.get("date", 0)

                    post_id = hashlib.sha256(
                        f"tg:{chat.get('id', '')}:{msg_id}".encode()
                    ).hexdigest()[:16]

                    post = PostMessage(
                        post_id=f"tg-{post_id}",
                        platform="telegram",
                        author_id=str(chat.get("id", "")),
                        author_handle=chat.get("username", channel),
                        text=text,
                        language_hint=None,
                        created_at=datetime.fromtimestamp(
                            date, tz=timezone.utc
                        ).isoformat(),
                        geo_location=None,
                        hashtags=[],
                        mentions=[],
                        media_urls=[],
                        engagement_counts=EngagementCounts(
                            likes=0, shares=0, comments=0
                        ),
                        raw_payload=RawPayload(
                            source="telegram_bot_api",
                            channel=channel,
                        ),
                    )
                    posts.append(post)

                    # Track last update ID
                    self._last_update_id[channel] = max(
                        self._last_update_id.get(channel, 0),
                        update.get("update_id", 0) + 1,
                    )

        return posts


class _TelegramRateLimitError(Exception):
    """Internal exception for Telegram rate-limit responses."""
    pass


class _TelegramAuthError(Exception):
    """Internal exception for Telegram auth errors."""
    pass
