"""
SQLAlchemy ORM models for the watchlist and crawl-job tables.

These mirror the tables created by ``infra/postgres/init.sql`` so that
SQLAlchemy can also auto-create them for unit tests (SQLite in-memory).
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""

    pass


class WatchlistKeyword(Base):
    """Tracked keyword entry."""

    __tablename__ = "watchlist_keywords"

    id = Column(Integer, primary_key=True, autoincrement=True)
    keyword = Column(String(255), nullable=False)
    platform_filter = Column(String(50), nullable=True)
    geo_area = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class WatchlistHashtag(Base):
    """Tracked hashtag entry."""

    __tablename__ = "watchlist_hashtags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    hashtag = Column(String(255), nullable=False)
    platform_filter = Column(String(50), nullable=True)
    geo_area = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class WatchlistGeoBox(Base):
    """Geo-bounding-box for location-based monitoring."""

    __tablename__ = "watchlist_geo_boxes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    lat_min = Column(Float, nullable=False)
    lat_max = Column(Float, nullable=False)
    lng_min = Column(Float, nullable=False)
    lng_max = Column(Float, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class WatchlistProfile(Base):
    """Tracked social-media profile / account."""

    __tablename__ = "watchlist_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    platform = Column(String(50), nullable=False)
    profile_id = Column(String(255), nullable=False)
    handle = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("platform", "profile_id", name="uq_profile_platform_id"),
    )


class CrawlJob(Base):
    """Crawl-job metadata — every crawl cycle logs a row."""

    __tablename__ = "crawl_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    platform = Column(String(50), nullable=False)
    connector_type = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="running")
    started_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    finished_at = Column(DateTime(timezone=True), nullable=True)
    posts_fetched = Column(Integer, nullable=False, default=0)
    posts_published = Column(Integer, nullable=False, default=0)
    posts_deduped = Column(Integer, nullable=False, default=0)
    errors = Column(Integer, nullable=False, default=0)
    error_detail = Column(Text, nullable=True)
