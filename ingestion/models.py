"""
Pydantic v2 models matching the shared schemas exactly.

Every ingested post is validated through ``PostMessage`` before publishing to
Kafka ``raw-posts``.  Trend spikes go through ``TrendSpike`` before publishing
to ``trend-spikes``.
"""

from __future__ import annotations

import json
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


# ─── Enums ───────────────────────────────────────────────────────────────────


class Platform(str, Enum):
    """Supported social-media platforms."""

    TWITTER = "twitter"
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    YOUTUBE = "youtube"


class LanguageHint(str, Enum):
    """Optional language hint attached during ingestion."""

    GU = "gu"
    HI = "hi"
    EN = "en"
    MIXED = "mixed"


# ─── Sub-models ──────────────────────────────────────────────────────────────


class GeoLocation(BaseModel):
    """Geographic coordinates with a human-readable place name."""

    lat: float
    lng: float
    place_name: str


class EngagementCounts(BaseModel):
    """Engagement metrics at time of ingestion."""

    likes: int = Field(ge=0, default=0)
    shares: int = Field(ge=0, default=0)
    comments: int = Field(ge=0, default=0)


class RawPayload(BaseModel):
    """
    Original API response payload.

    MUST include the four fields the downstream bot-detection layer depends on.
    Additional fields are preserved via ``model_config``.
    """

    account_created_at: Optional[str] = None
    follower_count: int = Field(ge=0, default=0)
    following_count: int = Field(ge=0, default=0)
    post_count: int = Field(ge=0, default=0)

    model_config = {"extra": "allow"}


# ─── Primary message models ─────────────────────────────────────────────────


class PostMessage(BaseModel):
    """
    Schema for the ``raw-posts`` Kafka topic.

    Mirrors ``shared/schemas/post_schema.json`` field-for-field.
    """

    post_id: str = Field(..., min_length=1, description="Globally unique post ID")
    platform: Platform
    author_id: str = Field(..., min_length=1)
    author_handle: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)
    language_hint: Optional[LanguageHint] = None
    created_at: datetime
    geo_location: Optional[GeoLocation] = None
    hashtags: list[str] = Field(default_factory=list)
    mentions: list[str] = Field(default_factory=list)
    media_urls: list[str] = Field(default_factory=list)
    engagement_counts: EngagementCounts = Field(default_factory=EngagementCounts)
    raw_payload: RawPayload = Field(default_factory=RawPayload)

    # ── serialization helpers ────────────────────────────────────────────

    def to_kafka_bytes(self) -> bytes:
        """Serialize to UTF-8 JSON bytes for Kafka publishing."""
        return self.model_dump_json().encode("utf-8")

    @classmethod
    def from_kafka_bytes(cls, data: bytes) -> "PostMessage":
        """Deserialize from Kafka message bytes."""
        return cls.model_validate_json(data)

    def to_dict(self) -> dict:
        """Return a plain dict (ISO-formatted datetimes)."""
        return json.loads(self.model_dump_json())


class TrendSpike(BaseModel):
    """
    Schema for the ``trend-spikes`` Kafka topic.

    Published by the spike detector whenever a keyword/hashtag frequency
    exceeds the rolling z-score threshold.
    """

    keyword: str = Field(..., min_length=1)
    geo_area: str = Field(..., min_length=1)
    current_frequency: int = Field(ge=0)
    z_score: float
    detected_at: datetime
    severity_hint: int = Field(ge=1, le=5)

    @field_validator("severity_hint", mode="before")
    @classmethod
    def _clamp_severity(cls, v: int) -> int:
        return max(1, min(5, int(v)))

    # ── serialization helpers ────────────────────────────────────────────

    def to_kafka_bytes(self) -> bytes:
        """Serialize to UTF-8 JSON bytes for Kafka publishing."""
        return self.model_dump_json().encode("utf-8")

    @classmethod
    def from_kafka_bytes(cls, data: bytes) -> "TrendSpike":
        """Deserialize from Kafka message bytes."""
        return cls.model_validate_json(data)

    def to_dict(self) -> dict:
        """Return a plain dict."""
        return json.loads(self.model_dump_json())


class TrendingHashtag(BaseModel):
    """Current trending hashtag entry (used by trending_hashtags.py)."""

    hashtag: str
    geo_area: str
    frequency: int = Field(ge=0)
    rank: int = Field(ge=1)
    observed_since: datetime
