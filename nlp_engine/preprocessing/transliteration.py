"""
Transliteration module for normalizing Romanized Hindi/Gujarati to native script.

Uses AI4Bharat's transliteration engine (Indic-Xlit) to convert Romanized
(Latin-script) Indic text into Devanagari (Hindi) or Gujarati script.
Handles mixed-script input by preserving English tokens and transliterating
only the Romanized Indic segments.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# Regex patterns for detecting script types
_DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
_GUJARATI_RE = re.compile(r"[\u0A80-\u0AFF]")
_LATIN_WORD_RE = re.compile(r"[a-zA-Z]+")
_NON_ALPHA_RE = re.compile(r"[^a-zA-Z\s]")

# Common English words that should NOT be transliterated
# (expanded list to reduce false transliterations)
_ENGLISH_STOPWORDS: set[str] = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "shall",
    "should", "may", "might", "can", "could", "must", "need",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
    "us", "them", "my", "your", "his", "its", "our", "their",
    "this", "that", "these", "those", "what", "which", "who", "whom",
    "and", "or", "but", "not", "no", "yes", "if", "then", "else",
    "in", "on", "at", "to", "for", "with", "from", "by", "of", "about",
    "up", "out", "off", "over", "under", "between", "through",
    "very", "really", "just", "only", "also", "too", "so", "as",
    "all", "each", "every", "both", "few", "more", "most", "some",
    "any", "many", "much", "other", "another",
    "new", "old", "big", "small", "good", "bad", "great", "little",
    "first", "last", "next", "same", "different",
    "time", "day", "year", "way", "thing", "man", "woman", "child",
    "world", "life", "hand", "part", "place", "case", "week",
    "breaking", "urgent", "alert", "update", "news", "video", "photo",
    "share", "like", "comment", "follow", "subscribe", "retweet",
    "government", "police", "hospital", "school", "city", "country",
    "india", "gujarat", "hindi", "english",
    "http", "https", "www", "com", "org",
}


@dataclass(frozen=True)
class TransliterationResult:
    """Result of transliteration."""

    original: str
    transliterated: str
    language: str  # "hi" | "gu"
    tokens_transliterated: int
    tokens_preserved: int


class Transliterator:
    """
    Transliterates Romanized Hindi/Gujarati text to native script.

    Uses AI4Bharat's XlitEngine for high-quality transliteration.
    Falls back to a no-op if the engine is unavailable.
    """

    def __init__(self):
        self._engines: dict[str, object] = {}
        self._available = False
        self._try_load_engines()

    def _try_load_engines(self) -> None:
        """Attempt to load AI4Bharat transliteration engines."""
        try:
            from ai4bharat.transliteration import XlitEngine

            # Initialize engines for Hindi and Gujarati
            self._engines["hi"] = XlitEngine("hi", beam_width=5, rescore=True)
            self._engines["gu"] = XlitEngine("gu", beam_width=5, rescore=True)
            self._available = True
            logger.info("AI4Bharat transliteration engines loaded (hi, gu)")

        except ImportError:
            logger.warning(
                "ai4bharat-transliteration not installed. "
                "Install with: pip install ai4bharat-transliteration"
            )
        except Exception as e:
            logger.warning(f"Could not load transliteration engines: {e}")

    @property
    def is_available(self) -> bool:
        """Whether the transliteration engine is loaded and ready."""
        return self._available

    def _is_english_word(self, word: str) -> bool:
        """
        Heuristic check if a Latin-script word is English vs Romanized Indic.

        Uses a stopword list and common patterns. Not perfect, but good enough
        for mixed-script handling.
        """
        lower = word.lower()

        # Check stopword list
        if lower in _ENGLISH_STOPWORDS:
            return True

        # Words with common English suffixes
        english_suffixes = ("tion", "ment", "ness", "ing", "ous", "ive", "ful", "less", "able")
        if any(lower.endswith(s) for s in english_suffixes):
            return True

        # Very short words (1-2 chars) that are Latin could be either — preserve them
        if len(word) <= 2:
            return True

        return False

    def _is_native_script(self, text: str) -> bool:
        """Check if text is already in native Indic script."""
        dev_count = len(_DEVANAGARI_RE.findall(text))
        guj_count = len(_GUJARATI_RE.findall(text))
        lat_count = len(_LATIN_WORD_RE.findall(text))

        indic_chars = dev_count + guj_count
        return indic_chars > len(text) * 0.5

    def transliterate_word(self, word: str, lang: str) -> str:
        """
        Transliterate a single Romanized word to native script.

        Args:
            word: A Latin-script word (e.g., "namaste").
            lang: Target language ("hi" or "gu").

        Returns:
            The transliterated word, or the original if transliteration fails.
        """
        if not self._available or lang not in self._engines:
            return word

        if not word or not _LATIN_WORD_RE.match(word):
            return word

        try:
            engine = self._engines[lang]
            result = engine.translit_word(word, topk=1)  # type: ignore[union-attr]

            if isinstance(result, dict) and lang in result:
                candidates = result[lang]
                if candidates:
                    return candidates[0]
            elif isinstance(result, list) and result:
                return result[0]
            elif isinstance(result, str):
                return result

            return word

        except Exception as e:
            logger.debug(f"Transliteration failed for '{word}': {e}")
            return word

    def transliterate(self, text: str, lang: str) -> TransliterationResult:
        """
        Transliterate Romanized text to native script, preserving English tokens.

        For mixed-script text (e.g., Hinglish), only the Romanized Indic words
        are transliterated; English words and punctuation are preserved.

        Args:
            text: Input text, potentially mixed-script.
            lang: Target language for transliteration ("hi" or "gu").

        Returns:
            TransliterationResult with the transliterated text and statistics.
        """
        if not text or not text.strip():
            return TransliterationResult(
                original=text,
                transliterated=text,
                language=lang,
                tokens_transliterated=0,
                tokens_preserved=0,
            )

        # If text is already in native script, return as-is
        if self._is_native_script(text):
            return TransliterationResult(
                original=text,
                transliterated=text,
                language=lang,
                tokens_transliterated=0,
                tokens_preserved=0,
            )

        if not self._available:
            logger.debug("Transliteration engine not available, returning original text")
            return TransliterationResult(
                original=text,
                transliterated=text,
                language=lang,
                tokens_transliterated=0,
                tokens_preserved=0,
            )

        # Tokenize and selectively transliterate
        tokens = re.split(r"(\s+)", text)  # Keep whitespace tokens
        result_tokens: list[str] = []
        transliterated_count = 0
        preserved_count = 0

        for token in tokens:
            # Preserve whitespace
            if not token.strip():
                result_tokens.append(token)
                continue

            # Preserve punctuation-only tokens
            clean = _NON_ALPHA_RE.sub("", token)
            if not clean:
                result_tokens.append(token)
                preserved_count += 1
                continue

            # Check if it's an English word
            if self._is_english_word(clean):
                result_tokens.append(token)
                preserved_count += 1
                continue

            # Check if already in native script
            if _DEVANAGARI_RE.search(token) or _GUJARATI_RE.search(token):
                result_tokens.append(token)
                preserved_count += 1
                continue

            # Transliterate the Romanized Indic word
            # Preserve surrounding punctuation
            prefix = ""
            suffix = ""
            inner = token
            while inner and not inner[0].isalpha():
                prefix += inner[0]
                inner = inner[1:]
            while inner and not inner[-1].isalpha():
                suffix = inner[-1] + suffix
                inner = inner[:-1]

            if inner:
                transliterated = self.transliterate_word(inner, lang)
                result_tokens.append(prefix + transliterated + suffix)
                transliterated_count += 1
            else:
                result_tokens.append(token)
                preserved_count += 1

        return TransliterationResult(
            original=text,
            transliterated="".join(result_tokens),
            language=lang,
            tokens_transliterated=transliterated_count,
            tokens_preserved=preserved_count,
        )


# ── Module-level singleton ──────────────────────────────────────────────────
_default_transliterator: Optional[Transliterator] = None


def get_transliterator() -> Transliterator:
    """Get or create the default Transliterator singleton."""
    global _default_transliterator
    if _default_transliterator is None:
        _default_transliterator = Transliterator()
    return _default_transliterator


def transliterate_to_native(text: str, lang: str) -> str:
    """
    Convenience function: transliterate Romanized text to native script.

    Args:
        text: Input text (potentially Romanized Hindi/Gujarati).
        lang: Target language ("hi" or "gu").

    Returns:
        Transliterated text string.
    """
    result = get_transliterator().transliterate(text, lang)
    return result.transliterated
