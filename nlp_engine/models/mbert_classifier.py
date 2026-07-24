"""
mBERT (bert-base-multilingual-cased) threat classifier.

This is the PS-suggested general-purpose multilingual baseline.
Used for benchmarking against IndicBERT and Sarvam — the PS explicitly
requires that mBERT be evaluated (not skipped) to demonstrate that
Indic-specific models outperform it on local-language content.

Architecture: same as IndicBERTClassifier (sequence classification head)
but uses ``bert-base-multilingual-cased`` as the base model.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import torch
import torch.nn.functional as F

logger = logging.getLogger(__name__)

THREAT_LABELS = ("Inflammatory", "IncitementToViolence", "FakeNews", "Neutral")
LABEL_TO_ID = {label: i for i, label in enumerate(THREAT_LABELS)}
ID_TO_LABEL = {i: label for i, label in enumerate(THREAT_LABELS)}

DEFAULT_MODEL = "bert-base-multilingual-cased"


@dataclass(frozen=True)
class ClassificationResult:
    """Result of threat classification for a single post."""

    threat_category: str
    threat_confidence: float
    all_scores: dict[str, float]


class MBERTClassifier:
    """
    4-class threat classifier built on mBERT (bert-base-multilingual-cased).

    This is the PS-mandated baseline for comparison. mBERT supports 104
    languages including Hindi and Gujarati, but is not specifically optimised
    for Indian languages the way MuRIL/IndicBERT are.

    Expected outcome: lower accuracy on Gujarati/Hindi/Hinglish content
    compared to IndicBERT/MuRIL, validating the choice of Indic-specific models.
    """

    def __init__(
        self,
        model_path: str = DEFAULT_MODEL,
        device: Optional[str] = None,
        num_labels: int = 4,
    ):
        self.model_path = model_path
        self.num_labels = num_labels
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self._model = None
        self._tokenizer = None
        self._loaded = False

    def load(self) -> None:
        """Load mBERT model and tokenizer."""
        if self._loaded:
            return

        from transformers import AutoTokenizer, AutoModelForSequenceClassification

        try:
            logger.info(f"Loading mBERT model: {self.model_path}")
            self._tokenizer = AutoTokenizer.from_pretrained(self.model_path)
            self._model = AutoModelForSequenceClassification.from_pretrained(
                self.model_path,
                num_labels=self.num_labels,
                ignore_mismatched_sizes=True,
            )
            self._model.to(self.device)
            self._model.eval()
            self._loaded = True
            logger.info(f"mBERT loaded on {self.device}")
        except Exception as e:
            logger.error(f"Failed to load mBERT: {e}")
            raise

    def predict(self, text: str) -> ClassificationResult:
        """Classify a single text."""
        results = self.predict_batch([text])
        return results[0]

    def predict_batch(self, texts: list[str]) -> list[ClassificationResult]:
        """Classify a batch of texts."""
        if not self._loaded:
            self.load()

        assert self._tokenizer is not None
        assert self._model is not None

        results: list[ClassificationResult] = []
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
                all_scores = {
                    ID_TO_LABEL[k]: float(scores_tensor[k])
                    for k in range(self.num_labels)
                }
                pred_idx = int(scores_tensor.argmax())
                results.append(
                    ClassificationResult(
                        threat_category=ID_TO_LABEL[pred_idx],
                        threat_confidence=float(scores_tensor[pred_idx]),
                        all_scores=all_scores,
                    )
                )

        return results

    def get_model_version(self) -> str:
        """Return a version string for this model."""
        return f"mbert-{Path(self.model_path).name}"

    @property
    def is_loaded(self) -> bool:
        return self._loaded
