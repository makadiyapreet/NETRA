"""
Uncertainty sampler: routes low-confidence predictions for human review.

Uses entropy-based uncertainty measurement across the 4 threat classes.
In fixture mode, writes uncertain posts to fixtures/uncertain_posts.json.
In production, could push to a Doccano labeling queue.
"""

from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def compute_entropy(scores: dict[str, float]) -> float:
    """
    Compute prediction entropy: -Σ p(c) log p(c).

    Higher entropy = more uncertainty (model is unsure).
    Max entropy for 4 classes ≈ 1.386 (uniform distribution).

    Args:
        scores: Dict mapping class labels to probabilities.

    Returns:
        Entropy value (0.0 = certain, ~1.386 = maximally uncertain for 4 classes).
    """
    entropy = 0.0
    for prob in scores.values():
        if prob > 0:
            entropy -= prob * math.log(prob)
    return entropy


def is_uncertain(
    confidence: float,
    confidence_threshold: float = 0.5,
    entropy_threshold: float = 1.0,
    scores: dict[str, float] | None = None,
) -> bool:
    """
    Determine if a prediction is too uncertain for automatic classification.

    A prediction is uncertain if:
    1. Its confidence is below the threshold, OR
    2. Its entropy is above the entropy threshold (if scores are provided)

    Args:
        confidence: Predicted confidence (0-1).
        confidence_threshold: Below this → uncertain.
        entropy_threshold: Above this → uncertain.
        scores: Optional dict of all class scores for entropy calculation.

    Returns:
        True if the prediction should be routed for human review.
    """
    if confidence < confidence_threshold:
        return True

    if scores:
        ent = compute_entropy(scores)
        if ent > entropy_threshold:
            return True

    return False


def route_uncertain_predictions(
    classifications: list[dict[str, Any]],
    original_posts: list[dict[str, Any]],
    confidence_threshold: float = 0.5,
    output_path: str | Path | None = None,
) -> list[dict[str, Any]]:
    """
    Filter uncertain predictions and write them for human review.

    Args:
        classifications: List of classification output dicts.
        original_posts: List of original post dicts (for including text context).
        confidence_threshold: Confidence below this triggers routing.
        output_path: Path to write uncertain posts JSON. Uses default if None.

    Returns:
        List of uncertain prediction dicts with original post context.
    """
    post_lookup = {p["post_id"]: p for p in original_posts}
    uncertain: list[dict[str, Any]] = []

    for cls in classifications:
        if cls["threat_confidence"] < confidence_threshold:
            post = post_lookup.get(cls["post_id"], {})
            uncertain.append({
                "post_id": cls["post_id"],
                "text": post.get("text", ""),
                "platform": post.get("platform", ""),
                "predicted_category": cls["threat_category"],
                "confidence": cls["threat_confidence"],
                "sentiment": cls["sentiment"],
                "detected_language": cls["detected_language"],
                "reason": (
                    f"Low confidence ({cls['threat_confidence']:.2f} < {confidence_threshold}). "
                    "Routing for human review."
                ),
            })

    if uncertain:
        if output_path is None:
            from nlp_engine.config import get_config
            output_path = get_config().uncertain_posts_path

        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(uncertain, f, indent=2)
        logger.info(
            f"Routed {len(uncertain)} uncertain predictions to {output_path}"
        )

    return uncertain
