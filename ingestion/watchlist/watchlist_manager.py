"""
Watchlist manager — convenience wrapper around watchlist CRUD operations.

Provides a simple API for managing the monitoring watchlist:
  - Keywords, hashtags, geo-bounding-boxes, tracked profiles
  - Supports PostgreSQL-backed persistent storage
  - Falls back to in-memory storage for development

This module re-exports from ``ingestion.db.watchlist_crud`` for the
target directory structure contract.
"""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session

from ingestion.db.watchlist_crud import (
    ActiveWatchlist,
    add_geo_box,
    add_hashtag,
    add_keyword,
    add_profile,
    get_active_watchlist,
    list_geo_boxes,
    list_hashtags,
    list_keywords,
    list_profiles,
    remove_geo_box,
    remove_hashtag,
    remove_keyword,
    remove_profile,
)

logger = logging.getLogger(__name__)

__all__ = [
    "WatchlistManager",
    "ActiveWatchlist",
]


class WatchlistManager:
    """
    High-level watchlist management interface.

    Wraps the CRUD functions with a session-managed API.
    """

    def __init__(self, session: Session):
        self._session = session

    @property
    def active(self) -> ActiveWatchlist:
        """Get a snapshot of all active watchlist entries."""
        return get_active_watchlist(self._session)

    # ── Keywords ──────────────────────────────────────────────────────────

    def add_keyword(
        self,
        keyword: str,
        platform_filter: Optional[str] = None,
        geo_area: Optional[str] = None,
    ) -> int:
        """Add a keyword to the watchlist. Returns the entry ID."""
        entry = add_keyword(self._session, keyword, platform_filter, geo_area)
        logger.info(f"Added keyword: '{keyword}' (id={entry.id})")
        return entry.id

    def remove_keyword(self, keyword_id: int) -> bool:
        """Soft-delete a keyword."""
        return remove_keyword(self._session, keyword_id)

    def list_keywords(self, active_only: bool = True):
        """List all keywords."""
        return list_keywords(self._session, active_only)

    # ── Hashtags ──────────────────────────────────────────────────────────

    def add_hashtag(
        self,
        hashtag: str,
        platform_filter: Optional[str] = None,
        geo_area: Optional[str] = None,
    ) -> int:
        """Add a hashtag. Returns the entry ID."""
        entry = add_hashtag(self._session, hashtag, platform_filter, geo_area)
        logger.info(f"Added hashtag: '{hashtag}' (id={entry.id})")
        return entry.id

    def remove_hashtag(self, hashtag_id: int) -> bool:
        return remove_hashtag(self._session, hashtag_id)

    def list_hashtags(self, active_only: bool = True):
        return list_hashtags(self._session, active_only)

    # ── Geo Boxes ─────────────────────────────────────────────────────────

    def add_geo_box(
        self,
        name: str,
        lat_min: float,
        lat_max: float,
        lng_min: float,
        lng_max: float,
    ) -> int:
        entry = add_geo_box(
            self._session, name, lat_min, lat_max, lng_min, lng_max
        )
        logger.info(f"Added geo box: '{name}' (id={entry.id})")
        return entry.id

    def remove_geo_box(self, geo_box_id: int) -> bool:
        return remove_geo_box(self._session, geo_box_id)

    def list_geo_boxes(self, active_only: bool = True):
        return list_geo_boxes(self._session, active_only)

    # ── Profiles ──────────────────────────────────────────────────────────

    def add_profile(self, platform: str, profile_id: str, handle: str) -> int:
        entry = add_profile(self._session, platform, profile_id, handle)
        logger.info(f"Added profile: {platform}/{handle} (id={entry.id})")
        return entry.id

    def remove_profile(self, profile_db_id: int) -> bool:
        return remove_profile(self._session, profile_db_id)

    def list_profiles(self, active_only: bool = True):
        return list_profiles(self._session, active_only)

    # ── Summary ───────────────────────────────────────────────────────────

    def summary(self) -> dict:
        """Return a human-readable summary of the watchlist."""
        wl = self.active
        return {
            "keywords": len(wl.keywords),
            "hashtags": len(wl.hashtags),
            "geo_boxes": len(wl.geo_boxes),
            "profiles": len(wl.profiles),
            "geo_areas": wl.geo_areas,
        }
