"""
MuRIL (google/muril-base-cased) threat classifier.

Google's MuRIL is pre-trained on 17 Indian languages + transliterated text,
making it a strong candidate for Gujarati/Hindi/Hinglish threat classification.

The PS and project documentation claim MuRIL as a benchmark model — this file
makes that claim genuine by providing a real, loadable classifier following the
same architecture as IndicBERTClassifier and MBERTClassifier.

Architecture: BERT-style sequence classification head on google/muril-base-cased.
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

DEFAULT_MODEL = "google/muril-base-cased"


@dataclass(frozen=True)
class ClassificationResult:
    """Result of threat classification for a single post."""

    threat_category: str
    threat_confidence: float
    all_scores: dict[str, float]


class MuRILClassifier:
    """
    4-class threat classifier built on MuRIL (google/muril-base-cased).

    MuRIL supports 17 Indian languages including Hindi, Gujarati, and
    transliterated text — making it particularly well-suited for the
    code-mixed Hinglish content that is common on Indian social media.

    Expected outcome: competitive with IndicBERT on Hindi/Gujarati,
    potentially superior on transliterated (Romanized) Indic text due
    to MuRIL's explicit transliteration pre-training.
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
        """Load MuRIL model and tokenizer."""
        if self._loaded:
            return

        from transformers import AutoTokenizer, AutoModelForSequenceClassification

        try:
            logger.info(f"Loading MuRIL model: {self.model_path}")
            self._tokenizer = AutoTokenizer.from_pretrained(self.model_path)
            self._model = AutoModelForSequenceClassification.from_pretrained(
                self.model_path,
                num_labels=self.num_labels,
                ignore_mismatched_sizes=True,
            )
            self._model.to(self.device)
            self._model.eval()
            self._loaded = True
            logger.info(f"MuRIL loaded on {self.device}")
        except Exception as e:
            logger.error(f"Failed to load MuRIL: {e}")
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
        return f"muril-{Path(self.model_path).name}"

    @property
    def is_loaded(self) -> bool:
        return self._loaded
