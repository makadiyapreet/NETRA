"""
A/B testing router for classifier versions.

Routes a configurable percentage of incoming posts to a candidate model
alongside the primary model, logging both predictions for comparison
without acting on the candidate's output.

Usage:
    from nlp_engine.inference.ab_router import ABRouter
    router = ABRouter(candidate_model="muril", split_ratio=0.1)
    primary, candidate = router.route_and_classify(text)
"""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ABResult:
    """Result from A/B routing."""

    primary_category: str
    primary_confidence: float
    primary_model: str
    candidate_category: Optional[str] = None
    candidate_confidence: Optional[float] = None
    candidate_model: Optional[str] = None
    was_sampled: bool = False


class ABRouter:
    """
    Lightweight A/B testing router for classifier versions.

    Splits a configurable percentage of traffic to a candidate model
    (running in shadow mode — predictions logged but not acted upon).
    """

    def __init__(
        self,
        candidate_model: str = "muril",
        split_ratio: float = 0.1,  # 10% of traffic goes to candidate
    ):
        self.candidate_model = candidate_model
        self.split_ratio = split_ratio
        self._results_log: list[ABResult] = []

    def should_sample(self) -> bool:
        """Determine if this request should be routed to the candidate."""
        return random.random() < self.split_ratio

    def log_result(self, result: ABResult) -> None:
        """Log an A/B test result for later analysis."""
        self._results_log.append(result)

        if result.was_sampled:
            agreement = (
                result.primary_category == result.candidate_category
            )
            logger.info(
                f"A/B test: primary={result.primary_model}→{result.primary_category}"
                f"({result.primary_confidence:.2f}) vs "
                f"candidate={result.candidate_model}→{result.candidate_category}"
                f"({result.candidate_confidence:.2f}) — "
                f"{'AGREE' if agreement else 'DISAGREE'}"
            )

    def get_stats(self) -> dict:
        """Get A/B test statistics."""
        sampled = [r for r in self._results_log if r.was_sampled]
        if not sampled:
            return {"total": 0, "sampled": 0, "agreement_rate": 0}

        agreements = sum(
            1 for r in sampled
            if r.primary_category == r.candidate_category
        )

        return {
            "total": len(self._results_log),
            "sampled": len(sampled),
            "agreement_rate": agreements / len(sampled) if sampled else 0,
            "primary_model": sampled[0].primary_model if sampled else "",
            "candidate_model": self.candidate_model,
            "split_ratio": self.split_ratio,
        }
