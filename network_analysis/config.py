"""
Central configuration for the Network Analysis layer.

Loads settings from environment variables with sensible defaults for fixture-mode
development.
"""

from __future__ import annotations

import os
from pathlib import Path
from dataclasses import dataclass, field
from typing import Literal

PROJECT_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class NetworkConfig:
    """Immutable configuration for the Network Analysis layer."""

    # --- Mode ---
    mode: Literal["fixture", "kafka"] = field(
        default_factory=lambda: os.getenv("MODE", "fixture")  # type: ignore[arg-type]
    )

    # --- Neo4j ---
    neo4j_uri: str = field(
        default_factory=lambda: os.getenv("NEO4J_URI", "bolt://localhost:7687")
    )
    neo4j_user: str = field(
        default_factory=lambda: os.getenv("NEO4J_USER", "neo4j")
    )
    neo4j_password: str = field(
        default_factory=lambda: os.getenv("NEO4J_PASSWORD", "netra")
    )

    # --- Kafka ---
    kafka_bootstrap_servers: str = field(
        default_factory=lambda: os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    )
    kafka_alerts_topic: str = "alerts"

    # --- Thresholds ---
    bot_score_threshold: float = field(
        default_factory=lambda: float(os.getenv("BOT_SCORE_THRESHOLD", "0.7"))
    )
    duplicate_similarity_threshold: float = field(
        default_factory=lambda: float(
            os.getenv("DUPLICATE_SIMILARITY_THRESHOLD", "0.8")
        )
    )
    coordination_alert_threshold: float = field(
        default_factory=lambda: float(
            os.getenv("COORDINATION_ALERT_THRESHOLD", "0.6")
        )
    )

    # --- Service ---
    host: str = field(
        default_factory=lambda: os.getenv("NETWORK_SERVICE_HOST", "0.0.0.0")
    )
    port: int = field(
        default_factory=lambda: int(os.getenv("NETWORK_SERVICE_PORT", "8001"))
    )

    # --- Paths ---
    @property
    def fixtures_dir(self) -> Path:
        return PROJECT_ROOT / "fixtures"

    @property
    def classified_output_path(self) -> Path:
        return self.fixtures_dir / "sample_classified_output.json"

    @property
    def sample_posts_path(self) -> Path:
        return self.fixtures_dir / "sample_posts.json"

    @property
    def alerts_output_path(self) -> Path:
        return self.fixtures_dir / "sample_alerts_output.json"


def get_config() -> NetworkConfig:
    """Return a fresh config instance (reads env vars at call time)."""
    return NetworkConfig()
