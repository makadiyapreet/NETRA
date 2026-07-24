"""
Heuristic bot-likelihood scorer.

Scores accounts based on metadata signals extracted from raw_payload:
  - account_created_at → account age (newer = more suspicious)
  - follower_count / following_count → follower ratio
  - post_count / account_age → posting frequency
  - Engagement anomalies (high shares, low likes/comments)

Each signal is normalized to 0–1 and combined via weighted sum.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Default signal weights (sum to 1.0)
DEFAULT_WEIGHTS: dict[str, float] = {
    "account_age": 0.30,
    "follower_ratio": 0.25,
    "posting_frequency": 0.25,
    "engagement_anomaly": 0.20,
}


@dataclass(frozen=True)
class BotScoreResult:
    """Result of bot-likelihood scoring for a single account."""

    account_id: str
    bot_likelihood: float  # 0.0 (human) – 1.0 (bot)
    signals: dict[str, float]


def _sigmoid(x: float, midpoint: float = 0.0, steepness: float = 1.0) -> float:
    """Sigmoid function for smooth 0–1 normalization."""
    try:
        return 1.0 / (1.0 + math.exp(-steepness * (x - midpoint)))
    except OverflowError:
        return 0.0 if x < midpoint else 1.0


def score_account_age(
    account_created_at: str | datetime,
    reference_time: Optional[datetime] = None,
) -> float:
    """
    Score based on account age. Newer accounts → higher bot likelihood.

    Scoring curve:
      - < 7 days old → ~0.9
      - < 30 days old → ~0.7
      - < 90 days old → ~0.5
      - > 365 days old → ~0.1
      - > 3 years old → ~0.05

    Args:
        account_created_at: ISO 8601 timestamp or datetime of account creation.
        reference_time: Reference time for age calculation (default: now).

    Returns:
        Score 0.0 (old, trusted) – 1.0 (brand new, suspicious).
    """
    if reference_time is None:
        reference_time = datetime.now(timezone.utc)

    if isinstance(account_created_at, str):
        try:
            created = datetime.fromisoformat(account_created_at.replace("Z", "+00:00"))
        except ValueError:
            return 0.5  # Unknown → moderate suspicion
    else:
        created = account_created_at

    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if reference_time.tzinfo is None:
        reference_time = reference_time.replace(tzinfo=timezone.utc)

    age_days = max((reference_time - created).total_seconds() / 86400, 0)

    # Sigmoid: accounts < 30 days score high, > 365 days score low
    return 1.0 - _sigmoid(age_days, midpoint=90, steepness=0.03)


def score_follower_ratio(
    follower_count: int,
    following_count: int,
) -> float:
    """
    Score based on follower/following ratio.

    Bots typically follow many accounts but have few followers.

    Scoring:
      - following >> followers → high score (bot-like)
      - followers >> following → low score (genuine influencer)
      - balanced → moderate

    Args:
        follower_count: Number of followers.
        following_count: Number of accounts followed.

    Returns:
        Score 0.0 (healthy ratio) – 1.0 (bot-like ratio).
    """
    if following_count == 0 and follower_count == 0:
        return 0.5  # No data

    ratio = following_count / max(follower_count, 1)

    # ratio > 10 is very suspicious, ratio < 0.5 is healthy
    return _sigmoid(ratio, midpoint=3.0, steepness=0.8)


def score_posting_frequency(
    post_count: int,
    account_created_at: str | datetime,
    reference_time: Optional[datetime] = None,
) -> float:
    """
    Score based on posting frequency (posts per day).

    Abnormally high posting frequency suggests automation.

    Scoring:
      - > 50 posts/day → ~0.95
      - > 20 posts/day → ~0.7
      - 5-10 posts/day → ~0.3
      - < 3 posts/day → ~0.1

    Args:
        post_count: Total number of posts.
        account_created_at: When the account was created.
        reference_time: Reference time for calculations.

    Returns:
        Score 0.0 (normal frequency) – 1.0 (bot-like frequency).
    """
    if reference_time is None:
        reference_time = datetime.now(timezone.utc)

    if isinstance(account_created_at, str):
        try:
            created = datetime.fromisoformat(account_created_at.replace("Z", "+00:00"))
        except ValueError:
            return 0.5
    else:
        created = account_created_at

    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if reference_time.tzinfo is None:
        reference_time = reference_time.replace(tzinfo=timezone.utc)

    age_days = max((reference_time - created).total_seconds() / 86400, 1)
    posts_per_day = post_count / age_days

    return _sigmoid(posts_per_day, midpoint=15, steepness=0.2)


def score_engagement_anomaly(
    likes: int,
    shares: int,
    comments: int,
) -> float:
    """
    Score based on engagement pattern anomalies.

    Bot-amplified posts often have:
      - High shares but very low likes/comments (coordinated resharing)
      - Zero or near-zero organic engagement

    Args:
        likes: Number of likes.
        shares: Number of shares/retweets.
        comments: Number of comments.

    Returns:
        Score 0.0 (normal engagement) – 1.0 (anomalous engagement).
    """
    total = likes + shares + comments
    if total == 0:
        return 0.3  # No engagement — mildly suspicious

    share_ratio = shares / max(total, 1)
    organic_ratio = (likes + comments) / max(total, 1)

    # High share ratio with low organic engagement is suspicious
    if share_ratio > 0.8 and organic_ratio < 0.2:
        return 0.85

    if share_ratio > 0.6 and organic_ratio < 0.4:
        return 0.6

    return 0.1  # Normal engagement pattern


def compute_bot_score(
    account_id: str,
    raw_payload: dict[str, Any],
    engagement_counts: Optional[dict[str, int]] = None,
    weights: Optional[dict[str, float]] = None,
    reference_time: Optional[datetime] = None,
) -> BotScoreResult:
    """
    Compute bot-likelihood score for an account.

    Extracts signals from raw_payload and combines them via weighted sum.

    Args:
        account_id: Account identifier.
        raw_payload: Must contain account_created_at, follower_count,
                     following_count, post_count.
        engagement_counts: Optional {likes, shares, comments} for the post.
        weights: Optional signal weights override.
        reference_time: Reference time for age calculations.

    Returns:
        BotScoreResult with overall score and individual signals.
    """
    w = weights or DEFAULT_WEIGHTS

    # Extract signals from raw_payload
    account_created_at = raw_payload.get("account_created_at", "")
    follower_count = int(raw_payload.get("follower_count", 0))
    following_count = int(raw_payload.get("following_count", 0))
    post_count = int(raw_payload.get("post_count", 0))

    # Compute individual signals
    signals: dict[str, float] = {}

    signals["account_age"] = score_account_age(account_created_at, reference_time)
    signals["follower_ratio"] = score_follower_ratio(follower_count, following_count)
    signals["posting_frequency"] = score_posting_frequency(
        post_count, account_created_at, reference_time
    )

    if engagement_counts:
        signals["engagement_anomaly"] = score_engagement_anomaly(
            engagement_counts.get("likes", 0),
            engagement_counts.get("shares", 0),
            engagement_counts.get("comments", 0),
        )
    else:
        signals["engagement_anomaly"] = 0.3  # Neutral if no engagement data

    # Weighted combination
    bot_likelihood = sum(
        w.get(signal_name, 0.0) * score
        for signal_name, score in signals.items()
    )

    # Clamp to [0, 1]
    bot_likelihood = max(0.0, min(1.0, bot_likelihood))

    return BotScoreResult(
        account_id=account_id,
        bot_likelihood=round(bot_likelihood, 4),
        signals={k: round(v, 4) for k, v in signals.items()},
    )
