"""
Image-text consistency check using CLIP.

Detects memes where the text content contradicts or is inconsistent with
the image content — a potential indicator of misinformation. Combines OCR
text extraction with CLIP similarity scoring.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ConsistencyResult:
    """Result of image-text consistency check."""

    similarity_score: float  # -1.0 (contradicting) to 1.0 (consistent)
    is_consistent: bool
    explanation: str
    image_description: str  # CLIP's interpretation of the image
    extracted_text: str  # OCR-extracted text from the image


class ImageTextChecker:
    """
    Checks consistency between image content and text using CLIP.

    Workflow:
    1. Extract text from image via OCR
    2. Compute CLIP similarity between the image and the extracted text
    3. Optionally check against the post's caption text
    4. Flag inconsistencies as potential misinformation
    """

    def __init__(self, device: Optional[str] = None):
        self.device = device or "cpu"
        self._model = None
        self._processor = None
        self._tokenizer = None
        self._loaded = False

    def load(self) -> None:
        """Load CLIP model."""
        if self._loaded:
            return

        try:
            import torch
            from transformers import CLIPProcessor, CLIPModel

            model_name = "openai/clip-vit-base-patch32"
            logger.info(f"Loading CLIP model: {model_name}")

            self._model = CLIPModel.from_pretrained(model_name)
            self._processor = CLIPProcessor.from_pretrained(model_name)
            self._model.to(self.device)
            self._model.eval()
            self._loaded = True
            logger.info("CLIP model loaded")

        except Exception as e:
            logger.error(f"Failed to load CLIP model: {e}")
            raise

    def compute_similarity(
        self,
        image_path: str | Path,
        text: str,
    ) -> float:
        """
        Compute CLIP cosine similarity between an image and text.

        Args:
            image_path: Path to the image.
            text: Text to compare against the image.

        Returns:
            Cosine similarity score (higher = more consistent).
        """
        if not self._loaded:
            self.load()

        import torch
        from PIL import Image

        image = Image.open(image_path).convert("RGB")

        # Truncate text for CLIP (max 77 tokens)
        text = text[:200]

        inputs = self._processor(
            text=[text],
            images=image,
            return_tensors="pt",
            padding=True,
            truncation=True,
        )
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self._model(**inputs)
            # CLIP returns logits_per_image and logits_per_text
            similarity = outputs.logits_per_image[0][0].item()

        # Normalize to roughly 0-1 range (CLIP logits are typically 10-30 range)
        normalized = similarity / 100.0
        return max(-1.0, min(1.0, normalized))

    def check_consistency(
        self,
        image_path: str | Path,
        caption_text: Optional[str] = None,
        consistency_threshold: float = 0.15,
    ) -> ConsistencyResult:
        """
        Full consistency check: OCR + CLIP analysis.

        Args:
            image_path: Path to the meme/image.
            caption_text: Optional post caption to also check against.
            consistency_threshold: Below this → flagged as inconsistent.

        Returns:
            ConsistencyResult with similarity score and explanation.
        """
        image_path = Path(image_path)

        if not image_path.exists():
            return ConsistencyResult(
                similarity_score=0.0,
                is_consistent=True,
                explanation="Image file not found.",
                image_description="",
                extracted_text="",
            )

        # Step 1: Extract text from image via OCR
        from bonus_multimodal.ocr_extraction import extract_text

        ocr_result = extract_text(image_path)
        extracted_text = ocr_result.text

        if not extracted_text.strip():
            return ConsistencyResult(
                similarity_score=0.0,
                is_consistent=True,
                explanation="No text detected in image (pure image, not a meme).",
                image_description="",
                extracted_text="",
            )

        # Step 2: Check OCR text against image content via CLIP
        try:
            similarity = self.compute_similarity(image_path, extracted_text)
        except Exception as e:
            logger.warning(f"CLIP similarity failed: {e}")
            similarity = 0.0

        # Step 3: Analyze consistency
        is_consistent = similarity >= consistency_threshold

        if is_consistent:
            explanation = (
                f"Image and text appear consistent (similarity: {similarity:.3f}). "
                f"OCR extracted: '{extracted_text[:100]}...'"
            )
        else:
            explanation = (
                f"POTENTIAL MEME MISINFORMATION: Image content may contradict text overlay "
                f"(similarity: {similarity:.3f}, threshold: {consistency_threshold}). "
                f"OCR text: '{extracted_text[:100]}...'. "
                "Manual review recommended."
            )

        # Step 4: If caption text is provided, also check caption vs image
        if caption_text:
            try:
                caption_sim = self.compute_similarity(image_path, caption_text)
                if caption_sim < consistency_threshold:
                    explanation += (
                        f" Additionally, post caption is inconsistent with image "
                        f"(caption similarity: {caption_sim:.3f})."
                    )
                    is_consistent = False
            except Exception:
                pass

        return ConsistencyResult(
            similarity_score=round(similarity, 4),
            is_consistent=is_consistent,
            explanation=explanation,
            image_description="",  # Would need image captioning for this
            extracted_text=extracted_text,
        )


# ── Module-level convenience ────────────────────────────────────────────────

_default_checker: Optional[ImageTextChecker] = None


def check_meme_consistency(
    image_path: str | Path,
    caption_text: Optional[str] = None,
) -> ConsistencyResult:
    """Convenience function for checking meme consistency."""
    global _default_checker
    if _default_checker is None:
        _default_checker = ImageTextChecker()
    return _default_checker.check_consistency(image_path, caption_text)
