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
from typing import Optional, Any

try:
    from sqlalchemy.orm import Session  # type: ignore[import-not-found]
except ImportError:
    Session = Any  # type: ignore[misc,assignment]

try:
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
except ImportError:
    # Define a minimal ActiveWatchlist for in-memory mode
    from dataclasses import dataclass, field

    @dataclass
    class ActiveWatchlist:  # type: ignore[no-redef]
        keywords: list = field(default_factory=list)
        hashtags: list = field(default_factory=list)
        geo_boxes: list = field(default_factory=list)
        profiles: list = field(default_factory=list)

    # Stubs — never called when session is None
    add_geo_box = add_hashtag = add_keyword = add_profile = None  # type: ignore
    get_active_watchlist = list_geo_boxes = list_hashtags = None  # type: ignore
    list_keywords = list_profiles = remove_geo_box = None  # type: ignore
    remove_hashtag = remove_keyword = remove_profile = None  # type: ignore

logger = logging.getLogger(__name__)

__all__ = [
    "WatchlistManager",
    "ActiveWatchlist",
]


class WatchlistManager:
    """
    High-level watchlist management interface.

    Wraps the CRUD functions with a session-managed API.
    Falls back gracefully to in-memory store if session is None or unavailable.
    """

    _mock_keywords = [
        {"id": 1, "keyword": "danga", "platform_filter": None, "geo_area": "Surat", "is_active": True},
        {"id": 2, "keyword": "protest", "platform_filter": None, "geo_area": "Ahmedabad", "is_active": True},
    ]
    _mock_hashtags = [
        {"id": 1, "hashtag": "#GujaratRiots", "platform_filter": None, "geo_area": "Gujarat", "is_active": True},
        {"id": 2, "hashtag": "#Strike2026", "platform_filter": None, "geo_area": "Ahmedabad", "is_active": True},
    ]
    _mock_geo_boxes = [
        {"id": 1, "name": "Surat Sensitive Zone", "lat_min": 21.1, "lat_max": 21.3, "lng_min": 72.7, "lng_max": 72.9, "is_active": True},
    ]
    _mock_profiles = [
        {"id": 1, "platform": "twitter", "profile_id": "1001", "handle": "@threat_account_1", "is_active": True},
    ]

    def __init__(self, session: Optional[Session] = None):
        self._session = session

    @property
    def active(self) -> ActiveWatchlist:
        """Get a snapshot of all active watchlist entries."""
        if not self._session:
            return ActiveWatchlist()
        return get_active_watchlist(self._session)

    # ── Keywords ──────────────────────────────────────────────────────────

    def add_keyword(
        self,
        keyword: str,
        platform_filter: Optional[str] = None,
        geo_area: Optional[str] = None,
    ) -> int:
        """Add a keyword to the watchlist. Returns the entry ID."""
        if not self._session:
            new_id = len(self._mock_keywords) + 1
            self._mock_keywords.append({"id": new_id, "keyword": keyword, "platform_filter": platform_filter, "geo_area": geo_area or "Gujarat", "is_active": True})
            return new_id
        entry = add_keyword(self._session, keyword, platform_filter, geo_area)
        logger.info(f"Added keyword: '{keyword}' (id={entry.id})")
        return entry.id

    def remove_keyword(self, keyword_id: int) -> bool:
        """Soft-delete a keyword."""
        if not self._session:
            self._mock_keywords = [k for k in self._mock_keywords if k["id"] != keyword_id]
            return True
        return remove_keyword(self._session, keyword_id)

    def list_keywords(self, active_only: bool = True):
        """List all keywords."""
        if not self._session:
            return self._mock_keywords
        return list_keywords(self._session, active_only)

    # ── Hashtags ──────────────────────────────────────────────────────────

    def add_hashtag(
        self,
        hashtag: str,
        platform_filter: Optional[str] = None,
        geo_area: Optional[str] = None,
    ) -> int:
        """Add a hashtag. Returns the entry ID."""
        if not self._session:
            new_id = len(self._mock_hashtags) + 1
            self._mock_hashtags.append({"id": new_id, "hashtag": hashtag, "platform_filter": platform_filter, "geo_area": geo_area or "Gujarat", "is_active": True})
            return new_id
        entry = add_hashtag(self._session, hashtag, platform_filter, geo_area)
        logger.info(f"Added hashtag: '{hashtag}' (id={entry.id})")
        return entry.id

    def remove_hashtag(self, hashtag_id: int) -> bool:
        if not self._session:
            self._mock_hashtags = [h for h in self._mock_hashtags if h["id"] != hashtag_id]
            return True
        return remove_hashtag(self._session, hashtag_id)

    def list_hashtags(self, active_only: bool = True):
        if not self._session:
            return self._mock_hashtags
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
        if not self._session:
            new_id = len(self._mock_geo_boxes) + 1
            self._mock_geo_boxes.append({"id": new_id, "name": name, "lat_min": lat_min, "lat_max": lat_max, "lng_min": lng_min, "lng_max": lng_max, "is_active": True})
            return new_id
        entry = add_geo_box(
            self._session, name, lat_min, lat_max, lng_min, lng_max
        )
        logger.info(f"Added geo box: '{name}' (id={entry.id})")
        return entry.id

    def remove_geo_box(self, geo_box_id: int) -> bool:
        if not self._session:
            self._mock_geo_boxes = [g for g in self._mock_geo_boxes if g["id"] != geo_box_id]
            return True
        return remove_geo_box(self._session, geo_box_id)

    def list_geo_boxes(self, active_only: bool = True):
        if not self._session:
            return self._mock_geo_boxes
        return list_geo_boxes(self._session, active_only)

    # ── Profiles ──────────────────────────────────────────────────────────

    def add_profile(self, platform: str, profile_id: str, handle: str) -> int:
        if not self._session:
            new_id = len(self._mock_profiles) + 1
            self._mock_profiles.append({"id": new_id, "platform": platform, "profile_id": profile_id, "handle": handle, "is_active": True})
            return new_id
        entry = add_profile(self._session, platform, profile_id, handle)
        logger.info(f"Added profile: {platform}/{handle} (id={entry.id})")
        return entry.id

    def remove_profile(self, profile_db_id: int) -> bool:
        if not self._session:
            self._mock_profiles = [p for p in self._mock_profiles if p["id"] != profile_db_id]
            return True
        return remove_profile(self._session, profile_db_id)

    def list_profiles(self, active_only: bool = True):
        if not self._session:
            return self._mock_profiles
        return list_profiles(self._session, active_only)

    # ── Summary ───────────────────────────────────────────────────────────

    def summary(self) -> dict:
        """Return a human-readable summary of the watchlist."""
        return {
            "keywords": len(self.list_keywords()),
            "hashtags": len(self.list_hashtags()),
            "geo_boxes": len(self.list_geo_boxes()),
            "profiles": len(self.list_profiles()),
        }
