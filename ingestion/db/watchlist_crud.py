"""
CRUD operations for watchlist management.

All functions accept an explicit ``Session`` so they are easy to test
with an in-memory SQLite database.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from ingestion.db.models import (
    CrawlJob,
    WatchlistGeoBox,
    WatchlistHashtag,
    WatchlistKeyword,
    WatchlistProfile,
)


# ─── Unified active-watchlist view ───────────────────────────────────────────


@dataclass
class ActiveWatchlist:
    """Aggregated view of every active watchlist entry."""

    keywords: list[WatchlistKeyword] = field(default_factory=list)
    hashtags: list[WatchlistHashtag] = field(default_factory=list)
    geo_boxes: list[WatchlistGeoBox] = field(default_factory=list)
    profiles: list[WatchlistProfile] = field(default_factory=list)

    @property
    def keyword_strings(self) -> list[str]:
        return [k.keyword for k in self.keywords]

    @property
    def hashtag_strings(self) -> list[str]:
        return [h.hashtag for h in self.hashtags]

    @property
    def geo_areas(self) -> list[str]:
        """Unique geo-area strings from keywords + hashtags."""
        areas: set[str] = set()
        for k in self.keywords:
            if k.geo_area:
                areas.add(k.geo_area)
        for h in self.hashtags:
            if h.geo_area:
                areas.add(h.geo_area)
        return sorted(areas)


# ─── Keywords ────────────────────────────────────────────────────────────────


def add_keyword(
    session: Session,
    keyword: str,
    platform_filter: Optional[str] = None,
    geo_area: Optional[str] = None,
) -> WatchlistKeyword:
    """Add a new keyword to the watchlist."""
    entry = WatchlistKeyword(
        keyword=keyword,
        platform_filter=platform_filter,
        geo_area=geo_area,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


def remove_keyword(session: Session, keyword_id: int) -> bool:
    """Soft-delete a keyword (set ``is_active = False``)."""
    entry = session.get(WatchlistKeyword, keyword_id)
    if entry is None:
        return False
    entry.is_active = False
    entry.updated_at = datetime.now(timezone.utc)
    session.commit()
    return True


def list_keywords(session: Session, active_only: bool = True) -> list[WatchlistKeyword]:
    """List watchlist keywords, optionally filtered to active only."""
    q = session.query(WatchlistKeyword)
    if active_only:
        q = q.filter(WatchlistKeyword.is_active == True)  # noqa: E712
    return q.all()


# ─── Hashtags ────────────────────────────────────────────────────────────────


def add_hashtag(
    session: Session,
    hashtag: str,
    platform_filter: Optional[str] = None,
    geo_area: Optional[str] = None,
) -> WatchlistHashtag:
    """Add a new hashtag to the watchlist."""
    entry = WatchlistHashtag(
        hashtag=hashtag,
        platform_filter=platform_filter,
        geo_area=geo_area,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


def remove_hashtag(session: Session, hashtag_id: int) -> bool:
    """Soft-delete a hashtag."""
    entry = session.get(WatchlistHashtag, hashtag_id)
    if entry is None:
        return False
    entry.is_active = False
    entry.updated_at = datetime.now(timezone.utc)
    session.commit()
    return True


def list_hashtags(session: Session, active_only: bool = True) -> list[WatchlistHashtag]:
    """List watchlist hashtags."""
    q = session.query(WatchlistHashtag)
    if active_only:
        q = q.filter(WatchlistHashtag.is_active == True)  # noqa: E712
    return q.all()


# ─── Geo Boxes ───────────────────────────────────────────────────────────────


def add_geo_box(
    session: Session,
    name: str,
    lat_min: float,
    lat_max: float,
    lng_min: float,
    lng_max: float,
) -> WatchlistGeoBox:
    """Add a geo-bounding-box to the watchlist."""
    entry = WatchlistGeoBox(
        name=name,
        lat_min=lat_min,
        lat_max=lat_max,
        lng_min=lng_min,
        lng_max=lng_max,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


def remove_geo_box(session: Session, geo_box_id: int) -> bool:
    """Soft-delete a geo box."""
    entry = session.get(WatchlistGeoBox, geo_box_id)
    if entry is None:
        return False
    entry.is_active = False
    entry.updated_at = datetime.now(timezone.utc)
    session.commit()
    return True


def list_geo_boxes(session: Session, active_only: bool = True) -> list[WatchlistGeoBox]:
    """List watchlist geo-bounding-boxes."""
    q = session.query(WatchlistGeoBox)
    if active_only:
        q = q.filter(WatchlistGeoBox.is_active == True)  # noqa: E712
    return q.all()


# ─── Profiles ────────────────────────────────────────────────────────────────


def add_profile(
    session: Session,
    platform: str,
    profile_id: str,
    handle: str,
) -> WatchlistProfile:
    """Add a tracked profile to the watchlist."""
    entry = WatchlistProfile(
        platform=platform,
        profile_id=profile_id,
        handle=handle,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


def remove_profile(session: Session, profile_db_id: int) -> bool:
    """Soft-delete a profile."""
    entry = session.get(WatchlistProfile, profile_db_id)
    if entry is None:
        return False
    entry.is_active = False
    entry.updated_at = datetime.now(timezone.utc)
    session.commit()
    return True


def list_profiles(session: Session, active_only: bool = True) -> list[WatchlistProfile]:
    """List tracked profiles."""
    q = session.query(WatchlistProfile)
    if active_only:
        q = q.filter(WatchlistProfile.is_active == True)  # noqa: E712
    return q.all()


# ─── Unified view ────────────────────────────────────────────────────────────


def get_active_watchlist(session: Session) -> ActiveWatchlist:
    """Return a unified snapshot of all active watchlist entries."""
    return ActiveWatchlist(
        keywords=list_keywords(session, active_only=True),
        hashtags=list_hashtags(session, active_only=True),
        geo_boxes=list_geo_boxes(session, active_only=True),
        profiles=list_profiles(session, active_only=True),
    )


# ─── Crawl-job logging ──────────────────────────────────────────────────────


def log_crawl_job(
    session: Session,
    platform: str,
    connector_type: str,
    status: str = "running",
    posts_fetched: int = 0,
    posts_published: int = 0,
    posts_deduped: int = 0,
    errors: int = 0,
    error_detail: Optional[str] = None,
) -> CrawlJob:
    """Create a crawl-job record."""
    job = CrawlJob(
        platform=platform,
        connector_type=connector_type,
        status=status,
        posts_fetched=posts_fetched,
        posts_published=posts_published,
        posts_deduped=posts_deduped,
        errors=errors,
        error_detail=error_detail,
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    return job


def complete_crawl_job(
    session: Session,
    job_id: int,
    status: str = "completed",
    posts_fetched: int = 0,
    posts_published: int = 0,
    posts_deduped: int = 0,
    errors: int = 0,
    error_detail: Optional[str] = None,
) -> Optional[CrawlJob]:
    """Mark a crawl job as completed/failed and update its stats."""
    job = session.get(CrawlJob, job_id)
    if job is None:
        return None
    job.status = status
    job.finished_at = datetime.now(timezone.utc)
    job.posts_fetched = posts_fetched
    job.posts_published = posts_published
    job.posts_deduped = posts_deduped
    job.errors = errors
    job.error_detail = error_detail
    session.commit()
    session.refresh(job)
    return job
