"""
Deepfake / AI-generated image detection module.

Extends the multimodal analysis pipeline with a lightweight
deepfake detection pass using a HuggingFace checkpoint.

Usage:
    from bonus_multimodal.deepfake_detector import DeepfakeDetector
    detector = DeepfakeDetector()
    result = detector.detect("/path/to/image.jpg")
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DeepfakeResult:
    """Result of deepfake / AI-generated image detection."""

    is_ai_generated: bool
    confidence: float  # 0.0 – 1.0
    model_name: str
    explanation: str


class DeepfakeDetector:
    """
    Detects AI-generated or manipulated images using a
    HuggingFace image classification model.
    """

    MODEL_NAME = "umm-maybe/AI-image-detector"

    def __init__(self, device: Optional[str] = None):
        self.device = device or "cpu"
        self._pipeline = None
        self._loaded = False

    def load(self) -> None:
        """Load the deepfake detection model."""
        if self._loaded:
            return

        try:
            from transformers import pipeline

            logger.info(f"Loading deepfake detector: {self.MODEL_NAME}")
            self._pipeline = pipeline(
                "image-classification",
                model=self.MODEL_NAME,
                device=0 if self.device == "cuda" else -1,
            )
            self._loaded = True
            logger.info("Deepfake detector loaded successfully")

        except Exception as e:
            logger.warning(f"Failed to load deepfake detector: {e}")
            self._loaded = False

    def detect(self, image_path: str | Path) -> DeepfakeResult:
        """
        Analyze an image for AI-generation indicators.

        Args:
            image_path: Path to the image file.

        Returns:
            DeepfakeResult with detection outcome.
        """
        if not self._loaded:
            self.load()

        if not self._loaded or self._pipeline is None:
            return DeepfakeResult(
                is_ai_generated=False,
                confidence=0.0,
                model_name=self.MODEL_NAME,
                explanation="Deepfake detector model not available",
            )

        try:
            from PIL import Image

            img = Image.open(image_path).convert("RGB")
            results = self._pipeline(img)

            # Parse results — model outputs labels like "artificial" / "human"
            ai_score = 0.0
            for result in results:
                label = result["label"].lower()
                if "artificial" in label or "ai" in label or "fake" in label:
                    ai_score = result["score"]
                    break

            is_ai = ai_score > 0.5

            explanation = (
                f"Image classified as {'AI-generated' if is_ai else 'authentic'} "
                f"with {ai_score:.0%} confidence by {self.MODEL_NAME}."
            )

            return DeepfakeResult(
                is_ai_generated=is_ai,
                confidence=ai_score,
                model_name=self.MODEL_NAME,
                explanation=explanation,
            )

        except Exception as e:
            logger.error(f"Deepfake detection failed: {e}")
            return DeepfakeResult(
                is_ai_generated=False,
                confidence=0.0,
                model_name=self.MODEL_NAME,
                explanation=f"Detection failed: {e}",
            )
