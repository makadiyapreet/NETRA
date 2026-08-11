"""
Centralized configuration for the ingestion layer.

All settings are read from environment variables (with sensible defaults for
local development).  Never hardcode secrets.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from ingestion.key_pool import load_keys_from_env, load_key_pairs_from_env


@dataclass(frozen=True)
class Settings:
    """Application-wide settings read from environment variables."""

    # ── Kafka ────────────────────────────────────────────────────────────
    kafka_bootstrap_servers: str = field(
        default_factory=lambda: os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    )

    # ── Redis ────────────────────────────────────────────────────────────
    redis_url: str = field(
        default_factory=lambda: os.getenv("REDIS_URL", "redis://localhost:6379/0")
    )

    # ── PostgreSQL ───────────────────────────────────────────────────────
    database_url: str = field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL",
            "postgresql://netra:netrasecret@localhost:5432/netra_threat",
        )
    )

    # ── Simulator ────────────────────────────────────────────────────────
    simulator_mode: bool = field(
        default_factory=lambda: os.getenv("SIMULATOR_MODE", "false").lower() == "true"
    )

    # ── Twitter / X ──────────────────────────────────────────────────────
    twitter_bearer_token: str = field(
        default_factory=lambda: os.getenv("TWITTER_BEARER_TOKEN", "")
    )
    # Multi-key pool: TWITTER_BEARER_TOKEN_1, _2, ... (falls back to un-suffixed)
    twitter_bearer_tokens: tuple[str, ...] = field(
        default_factory=lambda: tuple(load_keys_from_env("TWITTER_BEARER_TOKEN"))
    )

    # ── YouTube ──────────────────────────────────────────────────────────
    youtube_api_key: str = field(
        default_factory=lambda: os.getenv("YOUTUBE_API_KEY", "")
    )
    # Multi-key pool: YOUTUBE_API_KEY_1, _2, ... (falls back to un-suffixed)
    youtube_api_keys: tuple[str, ...] = field(
        default_factory=lambda: tuple(load_keys_from_env("YOUTUBE_API_KEY"))
    )

    # ── Meta (Facebook / Instagram) ──────────────────────────────────────
    meta_access_token: str = field(
        default_factory=lambda: os.getenv("META_ACCESS_TOKEN", "")
    )
    # Multi-key pool: META_ACCESS_TOKEN_1, _2, ... (falls back to un-suffixed)
    meta_access_tokens: tuple[str, ...] = field(
        default_factory=lambda: tuple(load_keys_from_env("META_ACCESS_TOKEN"))
    )

    # ── Telegram ─────────────────────────────────────────────────────────
    # Multi-key pool: TELEGRAM_BOT_TOKEN_1, _2, ... (falls back to un-suffixed)
    telegram_bot_tokens: tuple[str, ...] = field(
        default_factory=lambda: tuple(load_keys_from_env("TELEGRAM_BOT_TOKEN"))
    )

    # ── Reddit (future) ──────────────────────────────────────────────────
    # Multi-key pool: REDDIT_CLIENT_ID_1/REDDIT_CLIENT_SECRET_1, _2, ...
    reddit_client_credentials: tuple[tuple[str, str], ...] = field(
        default_factory=lambda: tuple(
            load_key_pairs_from_env("REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET")
        )
    )

    # ── Crawl scheduling ─────────────────────────────────────────────────
    crawl_interval_seconds: int = field(
        default_factory=lambda: int(os.getenv("CRAWL_INTERVAL_SECONDS", "300"))
    )
    spike_detection_interval_seconds: int = field(
        default_factory=lambda: int(
            os.getenv("SPIKE_DETECTION_INTERVAL_SECONDS", "60")
        )
    )

    # ── Spike detection ──────────────────────────────────────────────────
    spike_window_size: int = field(
        default_factory=lambda: int(os.getenv("SPIKE_WINDOW_SIZE", "60"))
    )
    spike_z_threshold: float = field(
        default_factory=lambda: float(os.getenv("SPIKE_Z_THRESHOLD", "3.0"))
    )

    # ── Dedup ────────────────────────────────────────────────────────────
    dedup_ttl_seconds: int = field(
        default_factory=lambda: int(os.getenv("DEDUP_TTL_SECONDS", "86400"))
    )

    # ── Monitoring ───────────────────────────────────────────────────────
    metrics_port: int = field(
        default_factory=lambda: int(os.getenv("METRICS_PORT", "8000"))
    )


def get_settings() -> Settings:
    """Return a fresh ``Settings`` instance (reads env vars at call time)."""
    return Settings()
