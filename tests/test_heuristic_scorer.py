"""
Tests for the heuristic bot scorer.

All tests are self-contained — no external services or model downloads needed.
"""

import pytest
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from network_analysis.bot_detection.heuristic_scorer import (
    BotScoreResult,
    compute_bot_score,
    score_account_age,
    score_follower_ratio,
    score_posting_frequency,
    score_engagement_anomaly,
)

# Fixed reference time for reproducible tests
REF_TIME = datetime(2026, 7, 20, 12, 0, 0, tzinfo=timezone.utc)


class TestAccountAgeScoring:
    """Test account age signal."""

    def test_brand_new_account_high_score(self):
        """Account created today should score very high (suspicious)."""
        created = (REF_TIME - timedelta(days=1)).isoformat()
        score = score_account_age(created, REF_TIME)
        assert score > 0.7, f"1-day old account should score >0.7, got {score}"

    def test_week_old_account(self):
        """Account created 7 days ago should score high."""
        created = (REF_TIME - timedelta(days=7)).isoformat()
        score = score_account_age(created, REF_TIME)
        assert score > 0.5, f"7-day old account should score >0.5, got {score}"

    def test_year_old_account_low_score(self):
        """Account created 1 year ago should score low (trusted)."""
        created = (REF_TIME - timedelta(days=365)).isoformat()
        score = score_account_age(created, REF_TIME)
        assert score < 0.3, f"1-year old account should score <0.3, got {score}"

    def test_very_old_account(self):
        """Account created 5+ years ago should score very low."""
        created = (REF_TIME - timedelta(days=2000)).isoformat()
        score = score_account_age(created, REF_TIME)
        assert score < 0.15, f"5-year old account should score <0.15, got {score}"

    def test_invalid_date_returns_moderate(self):
        """Invalid date string should return 0.5 (unknown)."""
        score = score_account_age("not-a-date", REF_TIME)
        assert score == 0.5


class TestFollowerRatioScoring:
    """Test follower/following ratio signal."""

    def test_bot_like_ratio(self):
        """Following >> followers should score high."""
        score = score_follower_ratio(follower_count=10, following_count=2000)
        assert score > 0.7, f"Bot-like ratio should score >0.7, got {score}"

    def test_influencer_ratio(self):
        """Followers >> following should score low."""
        score = score_follower_ratio(follower_count=50000, following_count=200)
        assert score < 0.3, f"Influencer ratio should score <0.3, got {score}"

    def test_balanced_ratio(self):
        """Roughly equal following/followers should score moderate."""
        score = score_follower_ratio(follower_count=1000, following_count=1200)
        assert 0.1 < score < 0.7, f"Balanced ratio should be moderate, got {score}"

    def test_zero_followers_zero_following(self):
        """Zero/zero should return 0.5 (no data)."""
        score = score_follower_ratio(0, 0)
        assert score == 0.5


class TestPostingFrequencyScoring:
    """Test posting frequency signal."""

    def test_extreme_posting_frequency(self):
        """50+ posts/day should score very high."""
        created = (REF_TIME - timedelta(days=5)).isoformat()
        score = score_posting_frequency(
            post_count=300, account_created_at=created, reference_time=REF_TIME
        )
        assert score > 0.8, f"60 posts/day should score >0.8, got {score}"

    def test_normal_posting_frequency(self):
        """3 posts/day should score low."""
        created = (REF_TIME - timedelta(days=365)).isoformat()
        score = score_posting_frequency(
            post_count=1000, account_created_at=created, reference_time=REF_TIME
        )
        assert score < 0.3, f"~3 posts/day should score <0.3, got {score}"


class TestEngagementAnomalyScoring:
    """Test engagement anomaly signal."""

    def test_high_shares_low_organic(self):
        """High shares but very low likes/comments is suspicious."""
        score = score_engagement_anomaly(likes=5, shares=890, comments=2)
        assert score > 0.7, f"High shares + low organic should score >0.7, got {score}"

    def test_normal_engagement(self):
        """Balanced engagement should score low."""
        score = score_engagement_anomaly(likes=500, shares=200, comments=100)
        assert score < 0.3, f"Normal engagement should score <0.3, got {score}"

    def test_zero_engagement(self):
        """Zero engagement should be mildly suspicious."""
        score = score_engagement_anomaly(likes=0, shares=0, comments=0)
        assert score == 0.3


class TestComputeBotScore:
    """Test the full bot scoring pipeline."""

    def test_obvious_bot(self):
        """Account with all bot signals should score high."""
        result = compute_bot_score(
            account_id="bot_test_001",
            raw_payload={
                "account_created_at": (REF_TIME - timedelta(days=2)).isoformat(),
                "follower_count": 5,
                "following_count": 2000,
                "post_count": 800,
            },
            engagement_counts={"likes": 3, "shares": 700, "comments": 0},
            reference_time=REF_TIME,
        )
        assert isinstance(result, BotScoreResult)
        assert result.bot_likelihood > 0.6, f"Obvious bot should score >0.6, got {result.bot_likelihood}"
        assert result.account_id == "bot_test_001"
        assert "account_age" in result.signals
        assert "follower_ratio" in result.signals

    def test_genuine_account(self):
        """Established account with normal signals should score low."""
        result = compute_bot_score(
            account_id="genuine_001",
            raw_payload={
                "account_created_at": (REF_TIME - timedelta(days=1500)).isoformat(),
                "follower_count": 45000,
                "following_count": 890,
                "post_count": 2100,
            },
            engagement_counts={"likes": 6700, "shares": 1200, "comments": 890},
            reference_time=REF_TIME,
        )
        assert result.bot_likelihood < 0.35, f"Genuine account should score <0.35, got {result.bot_likelihood}"

    def test_result_is_clamped(self):
        """Bot likelihood should always be between 0 and 1."""
        result = compute_bot_score(
            account_id="test",
            raw_payload={
                "account_created_at": "2026-07-20T00:00:00Z",
                "follower_count": 0,
                "following_count": 0,
                "post_count": 0,
            },
            reference_time=REF_TIME,
        )
        assert 0.0 <= result.bot_likelihood <= 1.0

    def test_signals_are_rounded(self):
        """Signal values should be rounded to 4 decimal places."""
        result = compute_bot_score(
            account_id="test",
            raw_payload={
                "account_created_at": "2020-01-01T00:00:00Z",
                "follower_count": 1000,
                "following_count": 500,
                "post_count": 3000,
            },
            reference_time=REF_TIME,
        )
        for signal_name, value in result.signals.items():
            # Check that value has at most 4 decimal places
            assert value == round(value, 4), f"{signal_name} not rounded: {value}"
