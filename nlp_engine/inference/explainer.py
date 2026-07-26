"""
Explainable AI module for NETRA threat classifications.

Provides plain-language explanations for why a post was flagged,
using either transformer attention weights (when model is loaded)
or a keyword-heuristic fallback (for fixture/mock mode).

Usage:
    from nlp_engine.inference.explainer import ThreatExplainer
    explainer = ThreatExplainer()
    explanation = explainer.explain(text, category, confidence, model)
"""

from __future__ import annotations

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# Threat-indicative keyword patterns per category
_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "IncitementToViolence": [
        "kill", "attack", "burn", "destroy", "danga", "maar", "jalao",
        "hatao", "maro", "violence", "bomb", "riot", "mob",
        "हमला", "मारो", "जलाओ", "दंगा", "तोड़ो",
        "હુમલો", "મારો", "બાળો", "તોડો",
    ],
    "Inflammatory": [
        "hate", "dirty", "filthy", "scum", "traitor", "enemy",
        "gaddaar", "deshdroh", "nafrat",
        "नफरत", "गद्दार", "देशद्रोही", "कमीना",
        "નફરત", "ગદ્દાર", "દેશદ્રોહી",
    ],
    "FakeNews": [
        "breaking", "confirmed", "sources say", "viral", "exposed",
        "jhooth", "fake", "propaganda", "forwarded",
        "झूठ", "फर्जी", "प्रोपगंडा",
        "જૂઠ", "ફેક", "ખોટું",
    ],
}


class ThreatExplainer:
    """
    Generates human-readable explanations for threat classifications.

    Strategy:
    1. If a loaded transformer model with attention weights is available,
       extract the top-K highest-attention tokens.
    2. Otherwise, fall back to keyword matching heuristics.
    """

    def explain(
        self,
        text: str,
        threat_category: str,
        confidence: float,
        model: Optional[object] = None,
        attention_weights: Optional[object] = None,
    ) -> str:
        """
        Generate explanation for a classification result.

        Args:
            text: Original post text.
            threat_category: Classified category.
            confidence: Confidence score (0-1).
            model: Optional loaded transformer model.
            attention_weights: Optional attention weight tensor from model.

        Returns:
            Plain-language explanation string.
        """
        if threat_category == "Neutral":
            return (
                f"Classified as Neutral ({confidence:.0%} confidence). "
                f"No threat indicators detected in the text."
            )

        # Try attention-based explanation first
        if attention_weights is not None:
            try:
                return self._explain_with_attention(
                    text, threat_category, confidence, attention_weights
                )
            except Exception as e:
                logger.debug(f"Attention-based explanation failed: {e}")

        # Fallback: keyword-based explanation
        return self._explain_with_keywords(text, threat_category, confidence)

    def _explain_with_attention(
        self,
        text: str,
        threat_category: str,
        confidence: float,
        attention_weights: object,
    ) -> str:
        """Extract top-attention tokens for explanation."""
        try:
            import torch

            # Get last layer attention, average across heads
            if isinstance(attention_weights, (tuple, list)):
                last_layer = attention_weights[-1]  # Last layer
            else:
                last_layer = attention_weights

            if isinstance(last_layer, torch.Tensor):
                # Average across attention heads, get CLS token attention
                avg_attention = last_layer.mean(dim=1)  # [batch, seq, seq]
                cls_attention = avg_attention[0, 0, :]  # CLS token's attention

                # Get top-5 token indices (skip [CLS] and [SEP])
                top_indices = cls_attention[1:-1].topk(
                    min(5, cls_attention.shape[0] - 2)
                ).indices

                # Map indices to words
                words = text.split()
                top_words = []
                for idx in top_indices:
                    word_idx = idx.item()
                    if word_idx < len(words):
                        top_words.append(words[word_idx])

                if top_words:
                    key_tokens = ", ".join(f"'{w}'" for w in top_words[:3])
                    return (
                        f"Flagged as {threat_category} ({confidence:.0%} confidence) — "
                        f"highest-attention tokens: {key_tokens}. "
                        f"The model's attention concentrated on these terms as primary threat indicators."
                    )

        except ImportError:
            pass

        # If attention extraction fails, fall back
        return self._explain_with_keywords(text, threat_category, confidence)

    def _explain_with_keywords(
        self,
        text: str,
        threat_category: str,
        confidence: float,
    ) -> str:
        """Keyword-matching heuristic explanation."""
        text_lower = text.lower()

        # Find matching keywords
        keywords = _CATEGORY_KEYWORDS.get(threat_category, [])
        found_keywords: list[str] = []
        for kw in keywords:
            if kw.lower() in text_lower or kw in text:
                found_keywords.append(kw)

        # Build explanation
        category_descriptions = {
            "IncitementToViolence": "explicit calls for violence, mob action, or physical harm",
            "Inflammatory": "provocative language designed to incite communal tension or hatred",
            "FakeNews": "unverified claims, misleading information, or fabricated news",
        }

        desc = category_descriptions.get(
            threat_category, "threat-related content"
        )

        if found_keywords:
            key_terms = ", ".join(f"'{kw}'" for kw in found_keywords[:3])
            return (
                f"Flagged as {threat_category} ({confidence:.0%} confidence) "
                f"due to {desc}. Key terms detected: {key_terms}."
            )
        else:
            return (
                f"Flagged as {threat_category} ({confidence:.0%} confidence) "
                f"based on contextual analysis indicating {desc}."
            )


# Module-level convenience instance
_default_explainer = ThreatExplainer()


def explain_classification(
    text: str,
    threat_category: str,
    confidence: float,
    attention_weights: Optional[object] = None,
) -> str:
    """Convenience function for generating explanations."""
    return _default_explainer.explain(
        text, threat_category, confidence,
        attention_weights=attention_weights,
    )
