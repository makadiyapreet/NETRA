"""
Central configuration for the NLP Engine layer.

Loads settings from environment variables with sensible defaults for fixture-mode
development. All paths are relative to the project root.
"""

from __future__ import annotations

import os
from pathlib import Path
from dataclasses import dataclass, field
from typing import Literal

# Project root is two levels up from this file (nlp_engine/config.py → netra/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class NLPConfig:
    """Immutable configuration for the NLP Engine."""

    # --- Mode ---
    mode: Literal["fixture", "kafka"] = field(
        default_factory=lambda: os.getenv("MODE", "kafka")  # type: ignore[arg-type]
    )

    # --- Kafka ---
    kafka_bootstrap_servers: str = field(
        default_factory=lambda: os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    )
    kafka_group_id: str = field(
        default_factory=lambda: os.getenv("KAFKA_GROUP_ID", "nlp-engine-group")
    )
    kafka_input_topic: str = "raw-posts"
    kafka_output_topic: str = "classified-posts"
    kafka_alerts_topic: str = "alerts"

    # --- Model ---
    active_model: Literal["indicbert", "muril", "sarvam", "zeroshot"] = field(
        default_factory=lambda: os.getenv("ACTIVE_MODEL", "zeroshot")  # type: ignore[arg-type]
    )
    indicbert_model_path: str = field(
        default_factory=lambda: os.getenv(
            "INDICBERT_MODEL_PATH", "google/muril-base-cased"
        )
    )
    sarvam_model_path: str = field(
        default_factory=lambda: os.getenv(
            "SARVAM_MODEL_PATH", "sarvamai/sarvam-m"
        )
    )
    muril_model_path: str = field(
        default_factory=lambda: os.getenv(
            "MURIL_MODEL_PATH", "google/muril-base-cased"
        )
    )
    model_version: str = field(
        default_factory=lambda: os.getenv("MODEL_VERSION", "indicbert-v0.1.0-dev")
    )

    # --- Thresholds ---
    alert_confidence_threshold: float = field(
        default_factory=lambda: float(os.getenv("ALERT_CONFIDENCE_THRESHOLD", "0.7"))
    )
    alert_min_severity: int = field(
        default_factory=lambda: int(os.getenv("ALERT_MIN_SEVERITY", "2"))
    )
    uncertainty_threshold: float = field(
        default_factory=lambda: float(os.getenv("UNCERTAINTY_THRESHOLD", "0.5"))
    )

    # --- Service ---
    host: str = field(
        default_factory=lambda: os.getenv("NLP_SERVICE_HOST", "0.0.0.0")
    )
    port: int = field(
        default_factory=lambda: int(os.getenv("NLP_SERVICE_PORT", "8000"))
    )

    # --- Paths ---
    @property
    def fixtures_dir(self) -> Path:
        return PROJECT_ROOT / "fixtures"

    @property
    def sample_posts_path(self) -> Path:
        return self.fixtures_dir / "sample_posts.json"

    @property
    def classified_output_path(self) -> Path:
        return self.fixtures_dir / "sample_classified_output.json"

    @property
    def alerts_output_path(self) -> Path:
        return self.fixtures_dir / "sample_alerts_output.json"

    @property
    def uncertain_posts_path(self) -> Path:
        return self.fixtures_dir / "uncertain_posts.json"

    @property
    def schemas_dir(self) -> Path:
        return PROJECT_ROOT / "shared" / "schemas"

    # --- Labels ---
    threat_categories: tuple[str, ...] = (
        "Inflammatory",
        "IncitementToViolence",
        "FakeNews",
        "Neutral",
    )
    sentiment_labels: tuple[str, ...] = ("positive", "negative", "neutral")
    supported_languages: tuple[str, ...] = ("gu", "hi", "en", "mixed")
    num_labels: int = 4


def get_config() -> NLPConfig:
    """Return a fresh config instance (reads env vars at call time)."""
    return NLPConfig()
