"""
OCR text extraction from meme images.

Primary: Tesseract OCR with Hindi (hin) and Gujarati (guj) language packs.
Secondary (stub): Sarvam Akshar API for higher-quality Indic OCR.
Includes image preprocessing for improved OCR accuracy.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OCRResult:
    """Result of OCR text extraction."""

    text: str
    confidence: float  # 0.0 – 1.0
    language: str  # Detected/requested language
    source: str  # "tesseract" | "sarvam_akshar"


def _preprocess_image(image_path: str | Path):
    """
    Preprocess image for better OCR accuracy.

    Applies: grayscale conversion, contrast enhancement, noise reduction.

    Returns:
        PIL Image object ready for OCR.
    """
    from PIL import Image, ImageEnhance, ImageFilter

    img = Image.open(image_path)

    # Convert to grayscale
    img = img.convert("L")

    # Enhance contrast
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(2.0)

    # Sharpen
    img = img.filter(ImageFilter.SHARPEN)

    # Reduce noise with median filter
    img = img.filter(ImageFilter.MedianFilter(size=3))

    # Resize if too small (OCR works better on larger images)
    min_dim = min(img.size)
    if min_dim < 300:
        scale = 300 / min_dim
        new_size = (int(img.size[0] * scale), int(img.size[1] * scale))
        img = img.resize(new_size, Image.LANCZOS)

    return img


def extract_text_tesseract(
    image_path: str | Path,
    languages: list[str] | None = None,
) -> OCRResult:
    """
    Extract text from an image using Tesseract OCR.

    Requires tesseract-ocr installed with language packs:
        brew install tesseract tesseract-lang  # macOS
        apt install tesseract-ocr tesseract-ocr-hin tesseract-ocr-guj  # Ubuntu

    Args:
        image_path: Path to the image file.
        languages: List of language codes (e.g., ["hin", "guj", "eng"]).
                   Defaults to Hindi + Gujarati + English.

    Returns:
        OCRResult with extracted text and confidence.
    """
    if languages is None:
        languages = ["hin", "guj", "eng"]

    try:
        import pytesseract

        # Preprocess image
        img = _preprocess_image(image_path)

        # Build language string (e.g., "hin+guj+eng")
        lang_str = "+".join(languages)

        # Extract text with confidence data
        data = pytesseract.image_to_data(
            img, lang=lang_str, output_type=pytesseract.Output.DICT
        )

        # Compile text and average confidence
        texts = []
        confidences = []
        for i, conf in enumerate(data["conf"]):
            conf = int(conf)
            if conf > 0:  # Skip items with no confidence
                text = data["text"][i].strip()
                if text:
                    texts.append(text)
                    confidences.append(conf)

        extracted_text = " ".join(texts)
        avg_confidence = sum(confidences) / len(confidences) / 100.0 if confidences else 0.0

        return OCRResult(
            text=extracted_text,
            confidence=round(avg_confidence, 4),
            language=lang_str,
            source="tesseract",
        )

    except ImportError:
        logger.error(
            "pytesseract not installed. Install with: pip install pytesseract\n"
            "Also install Tesseract OCR: brew install tesseract tesseract-lang"
        )
        return OCRResult(text="", confidence=0.0, language="", source="tesseract")

    except Exception as e:
        logger.error(f"Tesseract OCR failed: {e}")
        return OCRResult(text="", confidence=0.0, language="", source="tesseract")


def extract_text_sarvam_akshar(
    image_path: str | Path,
    api_key: Optional[str] = None,
) -> OCRResult:
    """
    Extract text using Sarvam Akshar API (stub).

    Sarvam Akshar is a cloud API that provides high-quality Indic script OCR.
    Requires an API key from https://www.sarvam.ai/.

    This is a stub implementation. To use:
    1. Sign up at https://www.sarvam.ai/
    2. Get an API key
    3. Set SARVAM_AKSHAR_API_KEY environment variable
    4. Install SDK: pip install sarvamai

    Args:
        image_path: Path to the image file.
        api_key: Sarvam API key. Uses env var if not provided.

    Returns:
        OCRResult with extracted text.

    Raises:
        NotImplementedError: Until API key is configured.
    """
    import os

    api_key = api_key or os.getenv("SARVAM_AKSHAR_API_KEY")

    if not api_key:
        raise NotImplementedError(
            "Sarvam Akshar API key not configured. "
            "Set SARVAM_AKSHAR_API_KEY environment variable. "
            "Sign up at https://www.sarvam.ai/ to get an API key."
        )

    try:
        # Stub: actual API call would go here
        # from sarvamai import SarvamAI
        # client = SarvamAI(api_key=api_key)
        # response = client.ocr.extract(file=open(image_path, "rb"))
        # return OCRResult(text=response.text, confidence=response.confidence, ...)

        logger.info("Sarvam Akshar API call would be made here with key.")
        raise NotImplementedError("Sarvam Akshar API integration pending setup.")

    except ImportError:
        logger.error("sarvamai SDK not installed. Install with: pip install sarvamai")
        raise NotImplementedError("sarvamai SDK not installed")


def extract_text(
    image_path: str | Path,
    languages: list[str] | None = None,
    prefer_sarvam: bool = False,
) -> OCRResult:
    """
    Extract text from an image using the best available OCR engine.

    Args:
        image_path: Path to the image file.
        languages: Language codes for Tesseract (e.g., ["hin", "guj"]).
        prefer_sarvam: If True, try Sarvam Akshar first.

    Returns:
        OCRResult with extracted text.
    """
    image_path = Path(image_path)
    if not image_path.exists():
        logger.error(f"Image not found: {image_path}")
        return OCRResult(text="", confidence=0.0, language="", source="none")

    if prefer_sarvam:
        try:
            return extract_text_sarvam_akshar(image_path)
        except NotImplementedError:
            logger.info("Sarvam Akshar not available, falling back to Tesseract")

    return extract_text_tesseract(image_path, languages)
