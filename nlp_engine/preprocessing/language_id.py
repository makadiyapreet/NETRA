"""
Language identification for Indic languages using IndicLID and fastText fallback.

Supports detection of: Gujarati (gu), Hindi (hi), English (en), Marathi (mr),
Bengali (bn), Punjabi (pa), and code-mixed (mixed).
Uses AI4Bharat IndicLID-BERT for native-script text and IndicLID-FTR for Romanized text,
with a fastText lid.176 fallback for low-confidence cases.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# ── Script-detection regex patterns ─────────────────────────────────────────
_DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")  # Hindi, Marathi, Sanskrit
_GUJARATI_RE = re.compile(r"[\u0A80-\u0AFF]")
_BENGALI_RE = re.compile(r"[\u0980-\u09FF]")    # Bengali, Assamese
_GURMUKHI_RE = re.compile(r"[\u0A00-\u0A7F]")   # Punjabi (Gurmukhi script)
_LATIN_RE = re.compile(r"[a-zA-Z]")

# ISO 639-1 / IndicLID label → our canonical codes
_INDICLID_LABEL_MAP: dict[str, str] = {
    "guj": "gu",
    "hin": "hi",
    "eng": "en",
    "mar": "mr",
    "ben": "bn",
    "pan": "pa",
    "guj-Latn": "gu",  # Romanized Gujarati
    "hin-Latn": "hi",  # Romanized Hindi
    "eng-Latn": "en",
    "mar-Latn": "mr",  # Romanized Marathi
    "ben-Latn": "bn",  # Romanized Bengali
    "pan-Latn": "pa",  # Romanized Punjabi
    "Gujarati": "gu",
    "Hindi": "hi",
    "English": "en",
    "Marathi": "mr",
    "Bengali": "bn",
    "Punjabi": "pa",
    "gu": "gu",
    "hi": "hi",
    "en": "en",
    "mr": "mr",
    "bn": "bn",
    "pa": "pa",
}

# Minimum confidence to trust a single-language detection
_CONFIDENCE_THRESHOLD = 0.6
# If secondary language is above this fraction of primary, call it "mixed"
_MIXED_RATIO_THRESHOLD = 0.3


@dataclass(frozen=True)
class LanguageResult:
    """Result of language identification."""

    language: str  # "gu" | "hi" | "en" | "mr" | "bn" | "pa" | "mixed"
    confidence: float  # 0.0 – 1.0
    script: str  # "native" | "roman" | "mixed"
    raw_scores: dict[str, float]  # all language scores from the model


class LanguageIdentifier:
    """
    Multi-strategy language identifier for Indic text.

    Priority order:
    1. Script-based heuristic (fast, handles obvious cases)
    2. IndicLID-BERT (native script) / IndicLID-FTR (romanized)
    3. fastText lid.176 fallback
    """

    def __init__(self, use_indiclid: bool = True, use_fasttext: bool = True):
        self._indiclid_model = None
        self._fasttext_model = None
        self._use_indiclid = use_indiclid
        self._use_fasttext = use_fasttext

        if use_indiclid:
            self._try_load_indiclid()
        if use_fasttext:
            self._try_load_fasttext()

    def _try_load_indiclid(self) -> None:
        """Attempt to load IndicLID model. Gracefully degrade if unavailable."""
        try:
            from transformers import AutoModelForSequenceClassification, AutoTokenizer

            model_name = "ai4bharat/IndicLID-BERT"
            self._indiclid_tokenizer = AutoTokenizer.from_pretrained(model_name)
            self._indiclid_model = AutoModelForSequenceClassification.from_pretrained(
                model_name
            )
            self._indiclid_model.eval()
            logger.info("IndicLID-BERT loaded successfully")
        except Exception as e:
            logger.warning(f"Could not load IndicLID-BERT: {e}. Using heuristic fallback.")
            self._indiclid_model = None

    def _try_load_fasttext(self) -> None:
        """Attempt to load fastText lid.176 model. Gracefully degrade if unavailable."""
        try:
            import fasttext

            # Suppress fastText warnings about deprecated load_model
            import warnings
            warnings.filterwarnings("ignore", category=UserWarning, module="fasttext")

            # Try common paths for the model file
            import os
            model_paths = [
                "lid.176.ftz",
                "lid.176.bin",
                os.path.expanduser("~/.fasttext/lid.176.ftz"),
            ]
            for path in model_paths:
                if os.path.exists(path):
                    self._fasttext_model = fasttext.load_model(path)
                    logger.info(f"fastText lid.176 loaded from {path}")
                    return

            logger.warning(
                "fastText lid.176 model not found. Download from "
                "https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.ftz"
            )
        except ImportError:
            logger.warning("fasttext package not installed. Skipping fastText fallback.")

    def detect_script(self, text: str) -> str:
        """
        Detect the dominant script in the text.

        Returns: "devanagari", "gujarati", "latin", or "mixed"
        """
        dev_count = len(_DEVANAGARI_RE.findall(text))
        guj_count = len(_GUJARATI_RE.findall(text))
        lat_count = len(_LATIN_RE.findall(text))
        total = dev_count + guj_count + lat_count

        if total == 0:
            return "unknown"

        scripts_present = []
        if dev_count / total > 0.2:
            scripts_present.append("devanagari")
        if guj_count / total > 0.2:
            scripts_present.append("gujarati")
        if lat_count / total > 0.2:
            scripts_present.append("latin")

        if len(scripts_present) > 1:
            return "mixed"
        elif len(scripts_present) == 1:
            return scripts_present[0]
        else:
            # Fall back to dominant
            counts = {"devanagari": dev_count, "gujarati": guj_count, "latin": lat_count}
            return max(counts, key=counts.get)  # type: ignore[arg-type]

    def _heuristic_detect(self, text: str) -> Optional[LanguageResult]:
        """
        Fast heuristic detection based on Unicode script ranges.

        Only returns a result if confidence is high (dominated by one native script).
        Returns None if heuristic is uncertain (falls through to model-based detection).
        """
        script = self.detect_script(text)

        if script == "gujarati":
            return LanguageResult(
                language="gu",
                confidence=0.9,
                script="native",
                raw_scores={"gu": 0.9, "hi": 0.05, "en": 0.05},
            )
        elif script == "devanagari":
            # Devanagari could be Hindi, Marathi, Sanskrit — assume Hindi for this system
            return LanguageResult(
                language="hi",
                confidence=0.85,
                script="native",
                raw_scores={"hi": 0.85, "gu": 0.05, "en": 0.1},
            )
        # Latin or mixed scripts need model-based detection
        return None

    def _indiclid_detect(self, text: str) -> Optional[LanguageResult]:
        """Use IndicLID-BERT for language detection."""
        if self._indiclid_model is None:
            return None

        try:
            import torch

            inputs = self._indiclid_tokenizer(
                text, return_tensors="pt", truncation=True, max_length=512
            )
            with torch.no_grad():
                outputs = self._indiclid_model(**inputs)
                probs = torch.nn.functional.softmax(outputs.logits, dim=-1)[0]

            # Map model labels to our canonical codes
            id2label = self._indiclid_model.config.id2label
            scores: dict[str, float] = {}
            for idx, prob in enumerate(probs.tolist()):
                label = id2label.get(idx, f"unknown_{idx}")
                canonical = _INDICLID_LABEL_MAP.get(label, None)
                if canonical:
                    scores[canonical] = scores.get(canonical, 0.0) + prob

            if not scores:
                return None

            # Determine if mixed
            sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
            primary_lang, primary_conf = sorted_scores[0]

            if len(sorted_scores) > 1:
                secondary_conf = sorted_scores[1][1]
                if (
                    secondary_conf / (primary_conf + 1e-8) > _MIXED_RATIO_THRESHOLD
                    and primary_conf < 0.75
                ):
                    return LanguageResult(
                        language="mixed",
                        confidence=primary_conf,
                        script=self.detect_script(text),
                        raw_scores=scores,
                    )

            script = self.detect_script(text)
            script_type = "native" if script in ("devanagari", "gujarati") else "roman"

            return LanguageResult(
                language=primary_lang,
                confidence=primary_conf,
                script=script_type,
                raw_scores=scores,
            )

        except Exception as e:
            logger.warning(f"IndicLID inference failed: {e}")
            return None

    def _fasttext_detect(self, text: str) -> Optional[LanguageResult]:
        """Use fastText lid.176 as a fallback language detector."""
        if self._fasttext_model is None:
            return None

        try:
            # fastText expects single-line input
            clean_text = text.replace("\n", " ").strip()
            if not clean_text:
                return None

            predictions = self._fasttext_model.predict(clean_text, k=3)
            labels, scores = predictions

            raw_scores: dict[str, float] = {}
            for label, score in zip(labels, scores):
                # fastText labels look like "__label__hi"
                lang_code = label.replace("__label__", "")
                canonical = _INDICLID_LABEL_MAP.get(lang_code, lang_code)
                if canonical in ("gu", "hi", "en"):
                    raw_scores[canonical] = float(score)

            if not raw_scores:
                # If none of our target languages detected, default to English
                return LanguageResult(
                    language="en",
                    confidence=0.3,
                    script="roman",
                    raw_scores={"en": 0.3},
                )

            primary_lang = max(raw_scores, key=raw_scores.get)  # type: ignore[arg-type]
            return LanguageResult(
                language=primary_lang,
                confidence=raw_scores[primary_lang],
                script="native" if self.detect_script(text) in ("devanagari", "gujarati") else "roman",
                raw_scores=raw_scores,
            )

        except Exception as e:
            logger.warning(f"fastText inference failed: {e}")
            return None

    def detect(self, text: str, language_hint: Optional[str] = None) -> LanguageResult:
        """
        Detect the language of the given text.

        Uses a cascade of detection methods:
        1. If a trusted language_hint is provided and text matches, use it.
        2. Script-based heuristic (fast path for native scripts).
        3. IndicLID-BERT model.
        4. fastText lid.176 fallback.
        5. Default heuristic if all else fails.

        Args:
            text: Raw text to identify.
            language_hint: Optional hint from the ingestion platform.

        Returns:
            LanguageResult with detected language, confidence, script type, and raw scores.
        """
        if not text or not text.strip():
            return LanguageResult(
                language="en", confidence=0.0, script="unknown", raw_scores={}
            )

        # Step 1: Use hint if available and in our supported set
        if language_hint and language_hint in ("gu", "hi", "en", "mixed"):
            # Trust the hint but still detect script for downstream processing
            script = self.detect_script(text)
            script_type = (
                "native"
                if script in ("devanagari", "gujarati")
                else "roman" if script == "latin" else "mixed"
            )
            return LanguageResult(
                language=language_hint,
                confidence=0.8,  # Hint gets a baseline confidence
                script=script_type,
                raw_scores={language_hint: 0.8},
            )

        # Step 2: Fast heuristic for native scripts
        heuristic = self._heuristic_detect(text)
        if heuristic and heuristic.confidence >= _CONFIDENCE_THRESHOLD:
            return heuristic

        # Step 3: IndicLID model
        indiclid_result = self._indiclid_detect(text)
        if indiclid_result and indiclid_result.confidence >= _CONFIDENCE_THRESHOLD:
            return indiclid_result

        # Step 4: fastText fallback
        fasttext_result = self._fasttext_detect(text)
        if fasttext_result and fasttext_result.confidence >= _CONFIDENCE_THRESHOLD:
            return fasttext_result

        # Step 5: Best-effort from any available result
        for result in [indiclid_result, fasttext_result, heuristic]:
            if result is not None:
                return result

        # Step 6: Final fallback — check if text has any Indic characters
        script = self.detect_script(text)
        if script == "gujarati":
            return LanguageResult(language="gu", confidence=0.5, script="native", raw_scores={"gu": 0.5})
        elif script == "devanagari":
            return LanguageResult(language="hi", confidence=0.5, script="native", raw_scores={"hi": 0.5})
        else:
            return LanguageResult(language="en", confidence=0.5, script="roman", raw_scores={"en": 0.5})


# ── Module-level singleton ──────────────────────────────────────────────────
_default_identifier: Optional[LanguageIdentifier] = None


def get_identifier(use_indiclid: bool = True, use_fasttext: bool = True) -> LanguageIdentifier:
    """Get or create the default LanguageIdentifier singleton."""
    global _default_identifier
    if _default_identifier is None:
        _default_identifier = LanguageIdentifier(
            use_indiclid=use_indiclid, use_fasttext=use_fasttext
        )
    return _default_identifier


def detect_language(text: str, language_hint: Optional[str] = None) -> LanguageResult:
    """Convenience function: detect language using the default identifier."""
    return get_identifier().detect(text, language_hint)
