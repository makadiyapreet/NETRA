"""
Telegram public channel connector for NETRA.

Monitors public Telegram channels via the Bot API.
Only reads public channel messages — never private chats/groups.

Requires TELEGRAM_BOT_TOKEN in .env.

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

    Requires: TELEGRAM_BOT_TOKEN environment variable.
    """

    @property
    def platform(self) -> str:
        return "telegram"

    @property
    def connector_type(self) -> str:
        return "telegram"

    def __init__(self) -> None:
        import os
        self._token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        self._base_url = f"https://api.telegram.org/bot{self._token}"
        self._last_update_id: dict[str, int] = {}

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
        if not self._token:
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
            try:
                async with aiohttp.ClientSession() as session:
                    # Use getUpdates for channels the bot is added to
                    url = f"{self._base_url}/getUpdates"
                    params = {
                        "offset": self._last_update_id.get(channel, 0),
                        "limit": min(max_results, 100),
                        "allowed_updates": '["channel_post"]',
                    }

                    api_calls.labels(platform="telegram").inc()

                    async with session.get(url, params=params) as resp:
                        if resp.status != 200:
                            api_errors.labels(platform="telegram").inc()
                            continue

                        data = await resp.json()

                        if not data.get("ok"):
                            continue

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

            except Exception as e:
                logger.error(f"Telegram fetch error for {channel}: {e}")
                api_errors.labels(platform="telegram").inc()

        return posts[:max_results]
