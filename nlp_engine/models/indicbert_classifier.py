"""
IndicBERT / MuRIL-based threat classifier for the 4-class taxonomy.

Default model: google/muril-base-cased (freely available, no login needed).
Alternative: ai4bharat/indic-bert (gated — requires HuggingFace login + license).

Both are trained on Indian languages (Gujarati, Hindi, English, etc.) and support
the 4-class threat taxonomy: Inflammatory, IncitementToViolence, FakeNews, Neutral.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# pyrefly: ignore [missing-import]
import torch
# pyrefly: ignore [missing-import]
import torch.nn.functional as F

logger = logging.getLogger(__name__)

THREAT_LABELS = ("Inflammatory", "IncitementToViolence", "FakeNews", "Neutral")
LABEL_TO_ID = {label: i for i, label in enumerate(THREAT_LABELS)}
ID_TO_LABEL = {i: label for i, label in enumerate(THREAT_LABELS)}


@dataclass(frozen=True)
class ClassificationResult:
    """Result of threat classification for a single post."""

    threat_category: str
    threat_confidence: float
    all_scores: dict[str, float]


# Model fallback chain: try each in order until one loads
DEFAULT_MODEL = "google/muril-base-cased"  # Non-gated, freely available
FALLBACK_MODELS = [
    "google/muril-base-cased",       # Google's MuRIL — 17 Indian languages
    "xlm-roberta-base",              # XLM-R — general multilingual fallback
]


class IndicBERTClassifier:
    """
    4-class threat classifier built on MuRIL/IndicBERT.

    In dev mode (no fine-tuned checkpoint), uses the base model with a random head,
    which will produce meaningless predictions — this is expected. After fine-tuning
    with train_indicbert.py, load the checkpoint for real predictions.
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
        """Load model and tokenizer. Tries fallback models if primary fails."""
        if self._loaded:
            return

        # pyrefly: ignore [missing-import]
        from transformers import AutoTokenizer, AutoModelForSequenceClassification

        # Build list of models to try
        models_to_try = [self.model_path]
        for fallback in FALLBACK_MODELS:
            if fallback != self.model_path:
                models_to_try.append(fallback)

        last_error = None
        for model_name in models_to_try:
            try:
                logger.info(f"Trying to load model: {model_name}")
                self._tokenizer = AutoTokenizer.from_pretrained(model_name)
                self._model = AutoModelForSequenceClassification.from_pretrained(
                    model_name,
                    num_labels=self.num_labels,
                    ignore_mismatched_sizes=True,
                )
                self._model.to(self.device)
                self._model.eval()
                self._loaded = True
                self.model_path = model_name  # Track which model actually loaded
                logger.info(f"Model loaded: {model_name} on {self.device}")
                return
            except Exception as e:
                logger.warning(f"Failed to load {model_name}: {e}")
                last_error = e
                continue

        raise RuntimeError(f"All models failed to load. Last error: {last_error}")

    def predict(self, text: str) -> ClassificationResult:
        """
        Classify a single text.

        Args:
            text: Raw post text.

        Returns:
            ClassificationResult with threat_category, confidence, and all scores.
        """
        results = self.predict_batch([text])
        return results[0]

    def predict_batch(self, texts: list[str]) -> list[ClassificationResult]:
        """
        Classify a batch of texts.

        Args:
            texts: List of raw post texts.

        Returns:
            List of ClassificationResult, one per input text.
        """
        if not self._loaded:
            self.load()

        assert self._tokenizer is not None
        assert self._model is not None

        results: list[ClassificationResult] = []

        # Process in mini-batches to avoid OOM
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
        model_name = Path(self.model_path).name if "/" not in self.model_path else self.model_path
        return f"indicbert-{model_name}"

    @property
    def is_loaded(self) -> bool:
        return self._loaded
