"""
Sentiment analysis model for Indic social media posts.

Provides parallel sentiment classification (positive/negative/neutral) and
intensity scoring (0.0-1.0). Uses IndicBERT with a sentiment head, with
fallback to a multilingual Twitter-RoBERTa sentiment model.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import torch
import torch.nn.functional as F

logger = logging.getLogger(__name__)

SENTIMENT_LABELS = ("positive", "negative", "neutral")
SENT_LABEL_TO_ID = {label: i for i, label in enumerate(SENTIMENT_LABELS)}
SENT_ID_TO_LABEL = {i: label for i, label in enumerate(SENTIMENT_LABELS)}


@dataclass(frozen=True)
class SentimentResult:
    """Result of sentiment analysis."""

    sentiment: str  # "positive" | "negative" | "neutral"
    sentiment_intensity: float  # 0.0 – 1.0
    all_scores: dict[str, float]


class SentimentModel:
    """
    Sentiment classifier for multilingual/Indic text.

    Primary: Fine-tuned IndicBERT with sentiment head.
    Fallback: cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        device: Optional[str] = None,
    ):
        # Default to multilingual sentiment model (works out-of-the-box, no fine-tuning needed)
        self.model_path = model_path or "cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual"
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self._model = None
        self._tokenizer = None
        self._loaded = False
        self._label_map: dict[int, str] = {}

    def load(self) -> None:
        """Load model and tokenizer."""
        if self._loaded:
            return

        from transformers import AutoTokenizer, AutoModelForSequenceClassification

        logger.info(f"Loading sentiment model from {self.model_path}")

        try:
            self._tokenizer = AutoTokenizer.from_pretrained(self.model_path)
            self._model = AutoModelForSequenceClassification.from_pretrained(
                self.model_path,
                ignore_mismatched_sizes=True,
            )
            self._model.to(self.device)
            self._model.eval()

            # Map model's id2label to our canonical labels
            id2label = getattr(self._model.config, "id2label", {})
            for idx, label in id2label.items():
                label_lower = str(label).lower()
                if "pos" in label_lower:
                    self._label_map[int(idx)] = "positive"
                elif "neg" in label_lower:
                    self._label_map[int(idx)] = "negative"
                elif "neu" in label_lower:
                    self._label_map[int(idx)] = "neutral"

            # If model has exactly 3 labels and mapping incomplete, use positional
            if len(self._label_map) < self._model.config.num_labels:
                num = self._model.config.num_labels
                if num == 3:
                    self._label_map = {0: "negative", 1: "neutral", 2: "positive"}
                else:
                    # Fallback: first = positive, last = negative, middle = neutral
                    self._label_map = {
                        i: SENTIMENT_LABELS[min(i, len(SENTIMENT_LABELS) - 1)]
                        for i in range(num)
                    }

            self._loaded = True
            logger.info(f"Sentiment model loaded on {self.device}")

        except Exception as e:
            logger.error(f"Failed to load sentiment model: {e}")
            raise

    def predict(self, text: str) -> SentimentResult:
        """Classify sentiment of a single text."""
        results = self.predict_batch([text])
        return results[0]

    def predict_batch(self, texts: list[str]) -> list[SentimentResult]:
        """Classify sentiment of a batch of texts."""
        if not self._loaded:
            self.load()

        assert self._tokenizer is not None
        assert self._model is not None

        results: list[SentimentResult] = []
        batch_size = 32

        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i : i + batch_size]

            inputs = self._tokenizer(
                batch_texts,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=512,
            ).to(self.device)

            with torch.no_grad():
                outputs = self._model(**inputs)
                probs = F.softmax(outputs.logits, dim=-1)

            for j in range(len(batch_texts)):
                scores_tensor = probs[j]

                # Aggregate scores into our 3 canonical labels
                canonical_scores: dict[str, float] = {
                    "positive": 0.0,
                    "negative": 0.0,
                    "neutral": 0.0,
                }

                for k in range(scores_tensor.shape[0]):
                    mapped_label = self._label_map.get(k, "neutral")
                    canonical_scores[mapped_label] += float(scores_tensor[k])

                # Predicted sentiment
                pred_sentiment = max(canonical_scores, key=canonical_scores.get)  # type: ignore[arg-type]

                # Intensity: confidence of the predicted sentiment
                intensity = canonical_scores[pred_sentiment]

                results.append(
                    SentimentResult(
                        sentiment=pred_sentiment,
                        sentiment_intensity=round(intensity, 4),
                        all_scores={k: round(v, 4) for k, v in canonical_scores.items()},
                    )
                )

        return results

    @property
    def is_loaded(self) -> bool:
        return self._loaded
