"""
Pytest configuration and shared fixtures for NETRA tests.

Adds the project root to sys.path so that nlp_engine and
network_analysis packages are importable.
"""

import json
import sys
from pathlib import Path

# pyrefly: ignore [missing-import]
import pytest

# Project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Add project root to path
sys.path.insert(0, str(PROJECT_ROOT))




# ── Shared Fixtures ─────────────────────────────────────────────────────────

@pytest.fixture
def sample_posts() -> list[dict]:
    """Load sample posts from fixtures."""
    posts_path = PROJECT_ROOT / "fixtures" / "sample_posts.json"
    with open(posts_path) as f:
        return json.load(f)


@pytest.fixture
def sample_post_neutral(sample_posts) -> dict:
    """A single neutral post (Rajkot hospital news)."""
    return sample_posts[1]  # tw-20260720-002


@pytest.fixture
def sample_post_inflammatory(sample_posts) -> dict:
    """A single inflammatory post."""
    return sample_posts[4]  # fb-20260720-005


@pytest.fixture
def sample_post_fakenews(sample_posts) -> dict:
    """A single fake news post (Mumbai water poisoned)."""
    return sample_posts[8]  # fb-20260720-009


@pytest.fixture
def sample_post_hinglish(sample_posts) -> dict:
    """A Hinglish (mixed language) post."""
    return sample_posts[15]  # ig-20260720-016


@pytest.fixture
def sample_bot_posts(sample_posts) -> list[dict]:
    """Posts from bot-like accounts (near-duplicate cluster)."""
    bot_ids = {"tw-20260720-026", "tw-20260720-027", "tw-20260720-028"}
    return [p for p in sample_posts if p["post_id"] in bot_ids]


@pytest.fixture
def schemas_dir() -> Path:
    """Path to shared schemas directory."""
    return PROJECT_ROOT / "shared" / "schemas"
